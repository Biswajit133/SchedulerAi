const https = require('https');
const { isDBConnected } = require('./database');
const User = require('../models/User');

const GRAPH_HOST = 'graph.microsoft.com';
const SCOPES = [
  'https://graph.microsoft.com/Calendars.Read',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
  'https://graph.microsoft.com/User.Read',
  'offline_access',
].join(' ');

function _tenantId() {
  return process.env.TEAMS_TENANT_ID || 'common';
}

function getAuthUrl() {
  const { TEAMS_CLIENT_ID, TEAMS_REDIRECT_URI } = process.env;
  if (!TEAMS_CLIENT_ID || !TEAMS_REDIRECT_URI) {
    throw new Error('Teams OAuth not configured. Add TEAMS_CLIENT_ID and TEAMS_REDIRECT_URI to .env');
  }
  const params = new URLSearchParams({
    client_id: TEAMS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: TEAMS_REDIRECT_URI,
    scope: SCOPES,
    response_mode: 'query',
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${_tenantId()}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeCode(code, req) {
  const { TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET, TEAMS_REDIRECT_URI } = process.env;
  const tokens = await _requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: TEAMS_REDIRECT_URI,
    client_id: TEAMS_CLIENT_ID,
    client_secret: TEAMS_CLIENT_SECRET,
    scope: SCOPES,
  });

  if (req) {
    req.session.teamsTokens = tokens;
    // Reuse the same token for Outlook Calendar — same Graph API, same token
    req.session.outlookTokens = tokens;
    const profile = await _fetchProfile(tokens.access_token);
    const upn = profile.userPrincipalName || '';
    const isPersonalAccount = /\.(hotmail|live|outlook)\.com$/i.test(upn) ||
      (tokens.id_token || '').includes('"9188040d-6c67-4c5b-b112-36a304b66dad"');
    const msUser = {
      email: profile.mail || upn,
      name: profile.displayName,
      id: profile.id,
      isPersonalAccount,
    };
    req.session.teamsUser = msUser;
    req.session.outlookUser = msUser;

    const googleEmail = req.session?.user?.email;
    if (googleEmail && isDBConnected()) {
      try {
        await User.findOneAndUpdate(
          { email: googleEmail.toLowerCase() },
          { $set: { teamsTokens: tokens, teamsUser: msUser, outlookTokens: tokens, outlookUser: msUser } }
        );
        console.log('[teamsAuth] Teams + Calendar tokens saved to DB for:', googleEmail);
      } catch (err) {
        console.error('[teamsAuth] DB update failed (non-fatal):', err.message);
      }
    }

    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
  }

  return tokens;
}

async function refreshTokens(req) {
  const { TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET } = process.env;
  const existing = req?.session?.teamsTokens;
  if (!existing?.refresh_token) return null;

  try {
    const tokens = await _requestToken({
      grant_type: 'refresh_token',
      refresh_token: existing.refresh_token,
      client_id: TEAMS_CLIENT_ID,
      client_secret: TEAMS_CLIENT_SECRET,
      scope: SCOPES,
    });

    req.session.teamsTokens = tokens;
    req.session.outlookTokens = tokens;

    const googleEmail = req.session?.user?.email;
    if (googleEmail && isDBConnected()) {
      try {
        await User.findOneAndUpdate(
          { email: googleEmail.toLowerCase() },
          { $set: { teamsTokens: tokens, outlookTokens: tokens } }
        );
      } catch {}
    }

    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
    return tokens;
  } catch {
    return null;
  }
}

async function getAccessToken(req) {
  let tokens = req?.session?.teamsTokens;

  if (!tokens?.access_token) {
    const loaded = await loadFromDB(req);
    if (!loaded) return null;
    tokens = req?.session?.teamsTokens;
  }

  if (!tokens?.access_token) return null;

  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    const fresh = await refreshTokens(req);
    return fresh?.access_token || null;
  }

  return tokens.access_token;
}

async function loadFromDB(req) {
  const googleEmail = req?.session?.user?.email;
  if (!googleEmail || !isDBConnected()) return false;
  try {
    const dbUser = await User.findOne({ email: googleEmail.toLowerCase() }).lean();
    if (dbUser?.teamsTokens?.access_token) {
      req.session.teamsTokens = dbUser.teamsTokens;
      req.session.teamsUser   = dbUser.teamsUser;
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
  return !!(req?.session?.teamsTokens?.access_token);
}

function getSessionUser(req) {
  return req?.session?.teamsUser || null;
}

async function disconnect(req) {
  if (!req?.session) return;

  const googleEmail = req.session?.user?.email;
  if (googleEmail && isDBConnected()) {
    try {
      await User.findOneAndUpdate(
        { email: googleEmail.toLowerCase() },
        { $unset: { teamsTokens: '', teamsUser: '', outlookTokens: '', outlookUser: '' } }
      );
    } catch (err) {
      console.error('[teamsAuth] DB disconnect failed (non-fatal):', err.message);
    }
  }

  delete req.session.teamsTokens;
  delete req.session.teamsUser;
  delete req.session.outlookTokens;
  delete req.session.outlookUser;
  await new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _requestToken(params) {
  const body = new URLSearchParams(params).toString();
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
            reject(new Error(`Teams token error (${res.statusCode}): ${parsed.error_description || parsed.error || data}`));
          }
        } catch {
          reject(new Error(`Teams token parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _fetchProfile(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GRAPH_HOST,
      path: '/v1.0/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Failed to parse Teams profile')); }
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
