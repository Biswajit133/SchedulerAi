const https = require('https');
const { isDBConnected } = require('./database');
const User = require('../models/User');
const { windowsToIana } = require('../utils/windowsToIana');

const GRAPH_HOST = 'graph.microsoft.com';
// Include Teams + Calendar scopes so one Microsoft sign-in covers both providers
const SCOPES = [
  'openid', 'profile', 'email', 'offline_access',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Calendars.Read',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/OnlineMeetings.ReadWrite',
  'https://graph.microsoft.com/MailboxSettings.Read',
].join(' ');

function _tenantId() {
  return process.env.TEAMS_TENANT_ID || 'common';
}

function getAuthUrl() {
  const clientId    = process.env.TEAMS_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback';
  if (!clientId) throw new Error('TEAMS_CLIENT_ID not set in .env');

  const params = new URLSearchParams({
    client_id:     clientId,
    response_type: 'code',
    redirect_uri:  redirectUri,
    scope:         SCOPES,
    response_mode: 'query',
  });
  return `https://login.microsoftonline.com/${_tenantId()}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeCode(code, req) {
  const clientId     = process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;
  const redirectUri  = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback';

  const tokens = await _requestToken({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         SCOPES,
  });

  if (req) {
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve()))
    );

    req.session.microsoftTokens = tokens;
    const [profile, mailboxSettings] = await Promise.allSettled([
      _fetchProfile(tokens.access_token),
      _fetchMailboxSettings(tokens.access_token),
    ]);

    const profileData = profile.status === 'fulfilled' ? profile.value : {};
    const timezone = (() => {
      if (mailboxSettings.status !== 'fulfilled') return null;
      return windowsToIana(mailboxSettings.value?.timeZone) || null;
    })();

    const teamsUser = {
      email: profileData.mail || profileData.userPrincipalName,
      name:  profileData.displayName,
      id:    profileData.id,
    };

    req.session.user = {
      email:        teamsUser.email,
      name:         teamsUser.name,
      picture:      null,
      authProvider: 'microsoft',
      timezone,
    };

    // Same tokens cover Teams (OnlineMeetings) + Outlook Calendar (Calendars) scopes
    req.session.teamsTokens   = tokens;
    req.session.teamsUser     = teamsUser;
    req.session.outlookTokens = tokens;
    req.session.outlookUser   = teamsUser;

    if (isDBConnected()) {
      try {
        const dbSet = {
          name: teamsUser.name,
          microsoftTokens: tokens,
          teamsTokens: tokens,
          teamsUser,
          outlookTokens: tokens,
          outlookUser: teamsUser,
        };
        if (timezone) dbSet.timezone = timezone;
        await User.findOneAndUpdate(
          { email: req.session.user.email.toLowerCase() },
          { $set: dbSet },
          { upsert: true }
        );
        console.log('[microsoftSignIn] User upserted in DB:', req.session.user.email, '| tz:', timezone);
      } catch (err) {
        console.error('[microsoftSignIn] DB upsert failed (non-fatal):', err.message);
      }
    }

    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
  }

  return tokens;
}

function isAuthenticated(req) {
  return !!(req?.session?.microsoftTokens?.access_token);
}

function getSessionUser(req) {
  return req?.session?.user || null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _requestToken(params) {
  const body     = new URLSearchParams(params).toString();
  const tenantId = _tenantId();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'login.microsoftonline.com',
      path:     `/${tenantId}/oauth2/v2.0/token`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
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
            reject(new Error(`Microsoft token error (${res.statusCode}): ${parsed.error_description || parsed.error || data}`));
          }
        } catch {
          reject(new Error(`Microsoft token parse error: ${data}`));
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
      method:   'GET',
      headers:  { Authorization: `Bearer ${accessToken}` },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Failed to parse Microsoft response for ${path}`)); }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = { getAuthUrl, exchangeCode, isAuthenticated, getSessionUser };
