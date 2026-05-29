const { google } = require('googleapis');
const { isDBConnected } = require('./database');
const User = require('../models/User');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getAuthUrl(email) {
  const client = createOAuth2Client();
  let prompt = 'consent';

  // Skip consent screen if user already has a stored refresh_token
  if (email && isDBConnected()) {
    try {
      const existing = await User.findOne({ email: email.toLowerCase() }).lean();
      if (existing?.googleTokens?.refresh_token) prompt = 'select_account';
    } catch (err) {
      console.warn('[googleAuth] DB lookup for consent decision failed:', err.message);
    }
  }

  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt,
    ...(email ? { login_hint: email } : {}),
  });
}

async function exchangeCode(code, req) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (req) {
    // Regenerate session to prevent any previous user's data from leaking in
    await new Promise((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve()))
    );

    req.session.googleTokens = tokens;
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data } = await oauth2.userinfo.get();
    req.session.user = {
      email: data.email,
      name: data.name,
      picture: data.picture,
    };

    // Persist to MongoDB
    if (isDBConnected()) {
      try {
        let tokensToSave = tokens;
        // Google only sends refresh_token on first consent — preserve existing one on re-login
        if (!tokens.refresh_token) {
          const existing = await User.findOne({ email: data.email.toLowerCase() }).lean();
          if (existing?.googleTokens?.refresh_token) {
            tokensToSave = { ...tokens, refresh_token: existing.googleTokens.refresh_token };
          }
        }
        await User.findOneAndUpdate(
          { email: data.email.toLowerCase() },
          { $set: { name: data.name, picture: data.picture, googleTokens: tokensToSave } },
          { upsert: true }
        );
        console.log('[googleAuth] User upserted in DB:', data.email);
      } catch (err) {
        console.error('[googleAuth] DB upsert failed (non-fatal):', err.message);
      }
    }

    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );
  }

  return tokens;
}

async function getAuthenticatedClient(req) {
  // 1. Try session tokens (per-user, fastest path)
  const sessionTokens = req?.session?.googleTokens;
  if (sessionTokens) {
    return _buildClient(sessionTokens, async (fresh) => {
      if (req) req.session.googleTokens = fresh;
      if (req?.session?.user?.email && isDBConnected()) {
        try {
          await User.findOneAndUpdate(
            { email: req.session.user.email.toLowerCase() },
            { $set: { googleTokens: fresh } }
          );
        } catch {}
      }
    });
  }

  // 2. Try MongoDB (session may have expired or server restarted)
  if (req?.session?.user?.email && isDBConnected()) {
    try {
      const dbUser = await User.findOne({ email: req.session.user.email.toLowerCase() }).lean();
      if (dbUser?.googleTokens?.access_token) {
        return _buildClient(dbUser.googleTokens, async (fresh) => {
          if (req) req.session.googleTokens = fresh;
          await User.findOneAndUpdate(
            { email: dbUser.email },
            { $set: { googleTokens: fresh } }
          );
        });
      }
    } catch (err) {
      console.warn('[googleAuth] DB token lookup failed:', err.message);
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
  return !!(req?.session?.googleTokens?.access_token);
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
