const MeetingService = require('../services/MeetingService');
const AgendaService = require('../services/AgendaService');
const MeetingSummaryService = require('../services/MeetingSummaryService');
const {
  getAuthUrl,
  exchangeCode,
  getAuthenticatedClient,
  isAuthenticated,
  getSessionUser,
  logout,
} = require('../config/googleAuth');

class MeetingController {
  // ─── Helper: resolve auth client for this request ─────────────────────────

  async _auth(req) {
    return getAuthenticatedClient(req);
  }

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

      const authClient = await this._auth(req);
      const durationMin = parseInt(duration) || 60;
      const result = await MeetingService.findAvailableSlots(date, durationMin, authClient);

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

      const authClient = await this._auth(req);
      const event = await MeetingService.createGoogleMeeting(meeting, slot, authClient);
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

  // GET /api/agenda/today?date=YYYY-MM-DD
  async getTodayAgenda(req, res) {
    try {
      const { date } = req.query;
      const authClient = await this._auth(req);
      const agenda = await AgendaService.getAgenda(date || null, authClient);
      res.json({ success: true, ...agenda });
    } catch (err) {
      console.error('[agenda]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // POST /api/meetings/summary
  async getMeetingSummary(req, res) {
    try {
      const { meetings } = req.body;
      if (!meetings || !Array.isArray(meetings)) {
        return res.status(400).json({ error: 'meetings array is required' });
      }
      const summary = await MeetingSummaryService.generateBatchSummary(meetings);
      res.json({ success: true, ...summary });
    } catch (err) {
      console.error('[summary]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/meetings/suggest?date=YYYY-MM-DD&time=HH:MM&duration=60
  async smartSuggest(req, res) {
    try {
      const { date, time, duration } = req.query;
      if (!date || !time) {
        return res.status(400).json({ error: 'date and time query params are required' });
      }
      const authClient = await this._auth(req);
      const durationMin = parseInt(duration) || 60;
      const result = await MeetingService.smartSuggestSlots(date, time, durationMin, authClient);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[suggest]', err);
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
        return res.redirect(`${frontendUrl}?auth=error&reason=${encodeURIComponent(error)}`);
      }
      if (!code) return res.status(400).send('Missing code');
      await exchangeCode(code, req);
      res.redirect(`${frontendUrl}?auth=success`);
    } catch (err) {
      console.error('[googleCallback]', err);
      const reason = err.message || 'unknown';
      res.redirect(`${frontendUrl}?auth=error&reason=${encodeURIComponent(reason)}`);
    }
  }

  // GET /api/auth/status
  authStatus(req, res) {
    const authenticated = isAuthenticated(req);
    const user = getSessionUser(req);
    res.json({ authenticated, user });
  }

  // GET /api/auth/me
  async authMe(req, res) {
    const authenticated = isAuthenticated(req);
    if (!authenticated) {
      return res.json({ authenticated: false, user: null });
    }
    const user = getSessionUser(req);
    res.json({ authenticated: true, user });
  }

  // POST /api/auth/logout
  async authLogout(req, res) {
    try {
      await logout(req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/auth/diagnostics
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
    });
  }
}

module.exports = new MeetingController();
