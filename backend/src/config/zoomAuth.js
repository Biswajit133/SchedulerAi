const https = require('https');

const ZOOM_AUTH_BASE = 'zoom.us';
const SCOPES = 'meeting:write:meeting meeting:read:meeting user:read:user';

function getAuthUrl() {
  const { ZOOM_CLIENT_ID, ZOOM_REDIRECT_URI } = process.env;
  if (!ZOOM_CLIENT_ID || !ZOOM_REDIRECT_URI) {
    throw new Error('Zoom OAuth not configured. Add ZOOM_CLIENT_ID and ZOOM_REDIRECT_URI to .env');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: ZOOM_CLIENT_ID,
    redirect_uri: ZOOM_REDIRECT_URI,
    scope: SCOPES,
  });
  return `https://${ZOOM_AUTH_BASE}/oauth/authorize?${params.toString()}`;
}

async function exchangeCode(code, req) {
  const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_REDIRECT_URI } = process.env;
  const tokens = await _requestToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: ZOOM_REDIRECT_URI,
  }, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET);

  if (req) {
    req.session.zoomTokens = tokens;
    const profile = await _fetchProfile(tokens.access_token);
    req.session.zoomUser = {
      email: profile.email,
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      picture: profile.pic_url || null,
      id: profile.id,
    };
    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
  }

  return tokens;
}

async function refreshTokens(req) {
  const { ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
  const existing = req?.session?.zoomTokens;
  if (!existing?.refresh_token) return null;

  try {
    const tokens = await _requestToken({
      grant_type: 'refresh_token',
      refresh_token: existing.refresh_token,
    }, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET);

    req.session.zoomTokens = tokens;
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

function isAuthenticated(req) {
  return !!(req?.session?.zoomTokens?.access_token);
}

function getSessionUser(req) {
  return req?.session?.zoomUser || null;
}

function disconnect(req) {
  return new Promise((resolve, reject) => {
    if (!req?.session) return resolve();
    delete req.session.zoomTokens;
    delete req.session.zoomUser;
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
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
  getAuthUrl,
  exchangeCode,
  getAccessToken,
  isAuthenticated,
  getSessionUser,
  disconnect,
};
