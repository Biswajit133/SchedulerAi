require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const routes = require('./src/routes/meetingRoutes');
const { errorHandler } = require('./src/middleware/validation');
const { connectDB } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/schedulerai';
app.use(session({
  secret: process.env.SESSION_SECRET || 'schedulerai-dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl,
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    touchAfter: 24 * 3600,  // only update session once per 24h unless data changes
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
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

// ─── Error Handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    const provider = process.env.AI_PROVIDER || 'groq';
    console.log(`\n🚀 SchedulerAI backend running on http://localhost:${PORT}`);
    console.log(`   AI Provider : ${provider.toUpperCase()}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
});

module.exports = app;
