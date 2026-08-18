require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const routes = require('./src/routes/meetingRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const { errorHandler } = require('./src/middleware/validation');
const { connectDB } = require('./src/config/database');
const { seedProviderSettings } = require('./src/controllers/AdminController');

// Mongo connectivity issues (bad URI, IP not whitelisted, transient network
// errors) should degrade the app, not kill the process — several internal
// operations in connect-mongo/mongoose reject outside of any listener we
// control, so this is the backstop for those.
process.on('unhandledRejection', (err) => {
  console.error('[UnhandledRejection] (non-fatal):', err?.message || err);
});

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Render/Vercel's reverse proxy so express-session sees the connection
// as secure (required for `cookie.secure: true` in production).
app.set('trust proxy', 1);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/schedulerai';
const sessionStore = MongoStore.create({
  mongoUrl,
  ttl: 7 * 24 * 60 * 60, // 7 days in seconds
  touchAfter: 24 * 3600,  // only update session once per 24h unless data changes
});
// connect-mongo emits 'error' on connection issues; an EventEmitter 'error'
// with no listener crashes the process, so this must be handled.
sessionStore.on('error', (err) => {
  console.error('[SessionStore] MongoDB session store error (non-fatal):', err.message);
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'schedulerai-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    // Frontend (Vercel) and backend (Render) are different domains, so the
    // session cookie is cross-site — 'none' is required for the browser to
    // send it back on API calls. Cross-site cookies also require `secure`,
    // which is already forced on in production above.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Request logger in dev
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);
app.use('/api/admin', adminRoutes);

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
connectDB().then(async () => {
  await seedProviderSettings();
  app.listen(PORT, () => {
    const provider = process.env.AI_PROVIDER || 'groq';
    console.log(`\n🚀 SchedulerAI backend running on http://localhost:${PORT}`);
    console.log(`   AI Provider : ${provider.toUpperCase()}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
});

module.exports = app;
