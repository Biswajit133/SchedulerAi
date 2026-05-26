const MeetingService = require('../services/MeetingService');
const { getAuthUrl, exchangeCode, isAuthenticated } = require('../config/googleAuth');
const { google } = require('googleapis');

class MeetingController {
  // POST /api/meetings/extract
  async extract(req, res) {
    try {
      const { notes } = req.body;
      if (!notes?.trim()) {
        return res.status(400).json({ error: 'Meeting notes are required' });
      }

      const meetings = await MeetingService.extractMeetingInfo(notes);
      const result = meetings.map((m) => ({
        ...m,
        missingFields: MeetingService.findMissingFields(m),
      }));

      res.json({ success: true, meetings: result });
    } catch (err) {
      console.error('[extract]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // POST /api/meetings/validate
  async validate(req, res) {
    try {
      const { meeting, answers } = req.body;
      if (!meeting) return res.status(400).json({ error: 'meeting is required' });

      const updated = answers
        ? MeetingService.applyFieldAnswers(meeting, answers)
        : meeting;

      const missingFields = MeetingService.findMissingFields(updated);

      res.json({ success: true, meeting: updated, missingFields });
    } catch (err) {
      console.error('[validate]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/meetings/slots?date=YYYY-MM-DD&duration=60
  async getSlots(req, res) {
    try {
      const { date, duration } = req.query;
      if (!date) return res.status(400).json({ error: 'date query param is required' });

      const durationMin = parseInt(duration) || 60;
      const result = await MeetingService.findAvailableSlots(date, durationMin);

      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[getSlots]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // POST /api/meetings/schedule
  async schedule(req, res) {
    try {
      const { meeting, slot } = req.body;
      if (!meeting || !slot) {
        return res.status(400).json({ error: 'meeting and slot are required' });
      }

      const event = await MeetingService.createGoogleMeeting(meeting, slot);
      const invites = await MeetingService.sendInvites(meeting, event);
      const summary = MeetingService.generateSummary(meeting, slot, event);

      MeetingService.saveMeeting({ meeting, slot, event, summary });

      res.json({ success: true, summary, event, invites });
    } catch (err) {
      console.error('[schedule]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/meetings
  async list(req, res) {
    try {
      const meetings = MeetingService.getAllMeetings();
      res.json({ success: true, meetings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  // GET /api/auth/google
  googleAuth(req, res) {
    try {
      const url = getAuthUrl();
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: 'Google OAuth not configured. Check GOOGLE_CLIENT_ID and related env vars.' });
    }
  }

  // GET /api/auth/google/callback
  async googleCallback(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const { code, error } = req.query;
      if (error) {
        console.error('[googleCallback] OAuth error from Google:', error);
        return res.redirect(`${frontendUrl}?auth=error&reason=${encodeURIComponent(error)}`);
      }
      if (!code) return res.status(400).send('Missing code');
      await exchangeCode(code);
      res.redirect(`${frontendUrl}?auth=success`);
    } catch (err) {
      console.error('[googleCallback]', err);
      const reason = err.message || 'unknown';
      res.redirect(`${frontendUrl}?auth=error&reason=${encodeURIComponent(reason)}`);
    }
  }

  // GET /api/auth/status
  authStatus(req, res) {
    res.json({ authenticated: isAuthenticated() });
  }

  // GET /api/auth/diagnostics  — helps debug OAuth setup issues
  authDiagnostics(req, res) {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const secret = process.env.GOOGLE_CLIENT_SECRET || '';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || '';

    const issues = [];
    if (!clientId) issues.push('GOOGLE_CLIENT_ID is missing from .env');
    else if (!clientId.endsWith('.apps.googleusercontent.com'))
      issues.push('GOOGLE_CLIENT_ID looks malformed — should end with .apps.googleusercontent.com');
    if (!secret) issues.push('GOOGLE_CLIENT_SECRET is missing from .env');
    if (!redirectUri) issues.push('GOOGLE_REDIRECT_URI is missing from .env');

    let authUrl = null;
    try { authUrl = getAuthUrl(); } catch {}

    res.json({
      configured: issues.length === 0,
      issues,
      redirectUri,
      clientIdPrefix: clientId ? clientId.split('-')[0] : null,
      authUrl,
      instructions: [
        '1. Go to https://console.cloud.google.com/',
        '2. Select your project → APIs & Services → Credentials',
        `3. Edit your OAuth 2.0 Client ID and add this exact redirect URI: ${redirectUri}`,
        '4. Enable Google Calendar API: APIs & Services → Library → search "Google Calendar API" → Enable',
        '5. If app is in Testing mode: OAuth consent screen → Test users → add your Gmail',
      ],
    });
  }
}

module.exports = new MeetingController();
