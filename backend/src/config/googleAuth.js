const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '../storage/google_tokens.json');
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

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

async function exchangeCode(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  saveTokens(tokens);
  return tokens;
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function loadTokens() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function getAuthenticatedClient() {
  const tokens = loadTokens();
  if (!tokens) return null;

  const client = createOAuth2Client();
  client.setCredentials(tokens);

  // Auto-refresh if expiry approaching
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    try {
      const { credentials } = await client.refreshAccessToken();
      saveTokens(credentials);
      client.setCredentials(credentials);
    } catch (err) {
      console.error('Token refresh failed:', err.message);
      return null;
    }
  }

  return client;
}

function isAuthenticated() {
  const tokens = loadTokens();
  return !!(tokens && tokens.access_token);
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getAuthenticatedClient,
  isAuthenticated,
};
