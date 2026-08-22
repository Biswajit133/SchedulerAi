const https = require('https');
const { isDBConnected } = require('./database');
const User = require('../models/User');

const ZOOM_AUTH_BASE = 'zoom.us';
const SCOPES = 'meeting:write:meeting meeting:read:meeting user:read:user';

// Credentials for a Zoom OAuth app, supplied either via Admin Settings (stored
// in MongoDB) or via ZOOM_CLIENT_ID/SECRET/REDIRECT_URI env vars. The DB copy
// takes priority so an admin can plug in their own app without touching .env.
let _dbCredentials = null;

// Called by AdminController on startup and whenever the zoom provider config is saved.
function setCredentials(config = {}) {
  const clientId = config.clientId?.trim();
  const clientSecret = config.clientSecret?.trim();
  const redirectUri = config.redirectUri?.trim();
  _dbCredentials = (clientId && clientSecret) ? { clientId, clientSecret, redirectUri } : null;
}

function _getCredentials() {
  if (_dbCredentials) {
    return {
      clientId: _dbCredentials.clientId,
      clientSecret: _dbCredentials.clientSecret,
      redirectUri: _dbCredentials.redirectUri || process.env.ZOOM_REDIRECT_URI,
    };
  }
  return {
    clientId: process.env.ZOOM_CLIENT_ID,
    clientSecret: process.env.ZOOM_CLIENT_SECRET,
    redirectUri: process.env.ZOOM_REDIRECT_URI,
  };
}

function getAuthUrl() {
  const { clientId, redirectUri } = _getCredentials();
  if (!clientId || !redirectUri) {
    throw new Error('Zoom OAuth not configured. Add your Zoom app credentials in Admin Settings, or set ZOOM_CLIENT_ID/ZOOM_REDIRECT_URI in .env');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
  });
  return `https://${ZOOM_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

async function exchangeCode(code, req) {
  const { clientId, clientSecret, redirectUri } = _getCredentials();
  const tokens = await _requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  }, clientId, clientSecret);

  if (req) {
    req.session.zoomTokens = tokens;
    const profile = await _fetchProfile(tokens.access_token);
    req.session.zoomUser = {
      email: profile.email,
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      picture: profile.pic_url || null,
      id: profile.id,
    };

    // Persist to MongoDB — matched by Google session email
    const googleEmail = req.session?.user?.email;
    if (googleEmail && isDBConnected()) {
      try {
        await User.findOneAndUpdate(
          { email: googleEmail.toLowerCase() },
          { $set: { zoomTokens: tokens, zoomUser: req.session.zoomUser } }
        );
        console.log('[zoomAuth] Zoom tokens saved to DB for:', googleEmail);
      } catch (err) {
        console.error('[zoomAuth] DB update failed (non-fatal):', err.message);
      }
    }

    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
  }

  return tokens;
}

async function refreshTokens(req) {
  const { clientId, clientSecret } = _getCredentials();
  const existing = req?.session?.zoomTokens;
  if (!existing?.refresh_token) return null;

  try {
    const tokens = await _requestToken({
      grant_type: 'refresh_token',
      refresh_token: existing.refresh_token,
    }, clientId, clientSecret);

    req.session.zoomTokens = tokens;

    // Persist refreshed tokens to DB
    const googleEmail = req.session?.user?.email;
    if (googleEmail && isDBConnected()) {
      try {
        await User.findOneAndUpdate(
          { email: googleEmail.toLowerCase() },
          { $set: { zoomTokens: tokens } }
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
  const tokens = req?.session?.zoomTokens;
  if (!tokens?.access_token) return null;

  // Refresh if expiring within 60 seconds
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    const fresh = await refreshTokens(req);
    return fresh?.access_token || null;
  }

  return tokens.access_token;
}

// Restore Zoom tokens from DB into session (call when session is empty)
async function loadFromDB(req) {
  const googleEmail = req?.session?.user?.email;
  if (!googleEmail || !isDBConnected()) return false;
  try {
    const dbUser = await User.findOne({ email: googleEmail.toLowerCase() }).lean();
    if (dbUser?.zoomTokens?.access_token) {
      req.session.zoomTokens = dbUser.zoomTokens;
      req.session.zoomUser   = dbUser.zoomUser;
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
  return !!(req?.session?.zoomTokens?.access_token);
}

function getSessionUser(req) {
  return req?.session?.zoomUser || null;
}

async function disconnect(req) {
  if (!req?.session) return;

  // Clear from MongoDB so old tokens aren't restored on next load
  const googleEmail = req.session?.user?.email;
  if (googleEmail && isDBConnected()) {
    try {
      await User.findOneAndUpdate(
        { email: googleEmail.toLowerCase() },
        { $unset: { zoomTokens: '', zoomUser: '' } }
      );
    } catch (err) {
      console.error('[zoomAuth] DB disconnect failed (non-fatal):', err.message);
    }
  }

  delete req.session.zoomTokens;
  delete req.session.zoomUser;
  await new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _requestToken(params, clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams(params).toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: ZOOM_AUTH_BASE,
      path: '/oauth/token',
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
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
            // Attach expiry timestamp
            parsed.expiry_date = Date.now() + (parsed.expires_in || 3600) * 1000;
            resolve(parsed);
          } else {
            reject(new Error(`Zoom token error (${res.statusCode}): ${parsed.reason || parsed.message || data}`));
          }
        } catch {
          reject(new Error(`Zoom token parse error: ${data}`));
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
      hostname: 'api.zoom.us',
      path: '/v2/users/me',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Failed to parse Zoom profile'));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  setCredentials,
  getAuthUrl,
  exchangeCode,
  getAccessToken,
  loadFromDB,
  isAuthenticated,
  getSessionUser,
  disconnect,
};
