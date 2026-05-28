const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Legacy single-user token file (kept as fallback for dev convenience)
const TOKEN_PATH = path.join(__dirname, '../storage/google_tokens.json');

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getAuthUrl() {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function exchangeCode(code, req) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (req) {
    // Per-user: store in session
    req.session.googleTokens = tokens;
    // Fetch user profile
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    req.session.user = {
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
  } else {
    // Fallback: write to file (single-user dev mode)
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  }

  return tokens;
}

async function getAuthenticatedClient(req) {
  // 1. Try session tokens (per-user)
  const sessionTokens = req?.session?.googleTokens;
  if (sessionTokens) {
    return _buildClient(sessionTokens, async (fresh) => {
      if (req) req.session.googleTokens = fresh;
    });
  }

  // 2. Fallback: file-based token (single-user dev mode)
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const fileTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      return _buildClient(fileTokens, (fresh) => {
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(fresh, null, 2));
      });
    } catch {
      return null;
    }
  }

  return null;
}

async function _buildClient(tokens, onRefresh) {
  const client = createOAuth2Client();
  client.setCredentials(tokens);

  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    try {
      const { credentials } = await client.refreshAccessToken();
      await onRefresh(credentials);
      client.setCredentials(credentials);
    } catch (err) {
      console.error('[googleAuth] Token refresh failed:', err.message);
      return null;
    }
  }

  return client;
}

function isAuthenticated(req) {
  if (req?.session?.googleTokens?.access_token) return true;
  // Fallback: file
  try {
    if (!fs.existsSync(TOKEN_PATH)) return false;
    const t = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    return !!(t && t.access_token);
  } catch {
    return false;
  }
}

function getSessionUser(req) {
  return req?.session?.user || null;
}

function logout(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getAuthenticatedClient,
  isAuthenticated,
  getSessionUser,
  logout,
};
