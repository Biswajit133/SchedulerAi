const https = require('https');
const { isDBConnected } = require('./database');
const User = require('../models/User');
const { windowsToIana } = require('../utils/windowsToIana');

const GRAPH_HOST = 'graph.microsoft.com';
// Calendar scopes — separate from Teams (OnlineMeetings) scopes
const SCOPES = [
  'https://graph.microsoft.com/Calendars.Read',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
].join(' ');

function _tenantId() {
  return process.env.OUTLOOK_TENANT_ID || process.env.TEAMS_TENANT_ID || 'common';
}

function getAuthUrl() {
  const clientId = process.env.OUTLOOK_CLIENT_ID || process.env.TEAMS_CLIENT_ID;
  const redirectUri = process.env.OUTLOOK_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error(
      'Outlook Calendar OAuth not configured. Add OUTLOOK_CLIENT_ID and OUTLOOK_REDIRECT_URI to .env'
    );
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${_tenantId()}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeCode(code, req) {
  const clientId     = process.env.OUTLOOK_CLIENT_ID     || process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.TEAMS_CLIENT_SECRET;
  const redirectUri  = process.env.OUTLOOK_REDIRECT_URI;

  const tokens = await _requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    scope: SCOPES,
  });

  if (req) {
    req.session.outlookTokens = tokens;
    const [profileResult, mailboxResult] = await Promise.allSettled([
      _fetchProfile(tokens.access_token),
      _fetchMailboxSettings(tokens.access_token),
    ]);

    const profile = profileResult.status === 'fulfilled' ? profileResult.value : {};
    const timezone = (() => {
      if (mailboxResult.status !== 'fulfilled') return null;
      return windowsToIana(mailboxResult.value?.timeZone) || null;
    })();

    req.session.outlookUser = {
      email: profile.mail || profile.userPrincipalName,
      name:  profile.displayName,
      id:    profile.id,
    };

    // Backfill timezone into the signed-in user session if not already set
    if (timezone && req.session.user && !req.session.user.timezone) {
      req.session.user.timezone = timezone;
    }

    const userEmail = req.session?.user?.email || req.session?.outlookUser?.email;
    if (userEmail && isDBConnected()) {
      try {
        const dbSet = {
          outlookTokens: tokens,
          outlookUser: req.session.outlookUser,
        };
        if (timezone) dbSet.timezone = timezone;
        await User.findOneAndUpdate(
          { email: userEmail.toLowerCase() },
          { $set: dbSet },
          { upsert: true }
        );
        console.log('[outlookAuth] Outlook tokens saved to DB for:', userEmail, '| tz:', timezone);
      } catch (err) {
        console.error('[outlookAuth] DB update failed (non-fatal):', err.message);
      }
    }

    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
  }

  return tokens;
}

async function refreshTokens(req) {
  const clientId     = process.env.OUTLOOK_CLIENT_ID     || process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.TEAMS_CLIENT_SECRET;
  const existing     = req?.session?.outlookTokens;
  if (!existing?.refresh_token) return null;

  try {
    const tokens = await _requestToken({
      grant_type: 'refresh_token',
      refresh_token: existing.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      scope: SCOPES,
    });

    req.session.outlookTokens = tokens;

    const userEmail = req.session?.user?.email || req.session?.outlookUser?.email;
    if (userEmail && isDBConnected()) {
      try {
        await User.findOneAndUpdate(
          { email: userEmail.toLowerCase() },
          { $set: { outlookTokens: tokens } }
        );
      } catch {}
    }

    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    return tokens;
  } catch (err) {
    console.error('[outlookAuth] Token refresh failed:', err.message);
    return null;
  }
}

async function getAccessToken(req) {
  let tokens = req?.session?.outlookTokens;

  // Try loading from DB if session is empty
  if (!tokens?.access_token) {
    const loaded = await loadFromDB(req);
    if (!loaded) return null;
    tokens = req?.session?.outlookTokens;
  }

  if (!tokens?.access_token) return null;

  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    const fresh = await refreshTokens(req);
    return fresh?.access_token || null;
  }

  return tokens.access_token;
}

async function loadFromDB(req) {
  const userEmail =
    req?.session?.user?.email ||
    req?.session?.outlookUser?.email ||
    req?.session?.microsoftUser?.email;
  if (!userEmail || !isDBConnected()) return false;
  try {
    const dbUser = await User.findOne({ email: userEmail.toLowerCase() }).lean();
    if (dbUser?.outlookTokens?.access_token) {
      req.session.outlookTokens = dbUser.outlookTokens;
      req.session.outlookUser   = dbUser.outlookUser || req.session.outlookUser;
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isAuthenticated(req) {
  return !!(req?.session?.outlookTokens?.access_token);
}

function getSessionUser(req) {
  return req?.session?.outlookUser || null;
}

async function disconnect(req) {
  if (!req?.session) return;

  const userEmail = req.session?.user?.email || req.session?.outlookUser?.email;
  if (userEmail && isDBConnected()) {
    try {
      await User.findOneAndUpdate(
        { email: userEmail.toLowerCase() },
        { $unset: { outlookTokens: '', outlookUser: '' } }
      );
    } catch (err) {
      console.error('[outlookAuth] DB disconnect failed (non-fatal):', err.message);
    }
  }

  delete req.session.outlookTokens;
  delete req.session.outlookUser;
  await new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _requestToken(params) {
  const body     = new URLSearchParams(params).toString();
  const tenantId = _tenantId();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 200 && parsed.access_token) {
            parsed.expiry_date = Date.now() + (parsed.expires_in || 3600) * 1000;
            resolve(parsed);
          } else {
            reject(new Error(
              `Outlook token error (${res.statusCode}): ${parsed.error_description || parsed.error || data}`
            ));
          }
        } catch {
          reject(new Error(`Outlook token parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _fetchProfile(accessToken) {
  return _graphGet('/v1.0/me', accessToken);
}

function _fetchMailboxSettings(accessToken) {
  return _graphGet('/v1.0/me/mailboxSettings', accessToken);
}

function _graphGet(path, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GRAPH_HOST,
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Failed to parse Outlook response for ${path}`)); }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getAccessToken,
  loadFromDB,
  isAuthenticated,
  getSessionUser,
  disconnect,
};
