const MeetingService = require('../services/MeetingService');
const AgendaService = require('../services/AgendaService');
const MeetingSummaryService = require('../services/MeetingSummaryService');
const CalendarService = require('../services/CalendarService');
const {
  getAuthUrl,
  exchangeCode,
  getAuthenticatedClient,
  isAuthenticated,
  getSessionUser,
  logout,
} = require('../config/googleAuth');
const zoomAuth = require('../config/zoomAuth');
const User = require('../models/User');
const { isDBConnected } = require('../config/database');

// Fills participant_emails from the user's saved contacts.
// Matches by: exact name, first-name only, or contact name containing the participant name.
async function applyContactEmails(meeting, req) {
  const userEmail = req.session?.user?.email;
  if (!userEmail || !isDBConnected()) return meeting;
  if (!meeting.participants?.length) return meeting;

  const dbUser = await User.findOne({ email: userEmail.toLowerCase() }).select('contacts').lean();
  const contacts = dbUser?.contacts ?? [];
  if (!contacts.length) return meeting;

  function findEmail(participantName) {
    const q = participantName.toLowerCase().trim();
    // 1. Exact match
    const exact = contacts.find((c) => c.name.toLowerCase() === q);
    if (exact) return exact.email;
    // 2. Contact's first name matches participant name (e.g. "Subrata" matches "Subrata Singha")
    const firstNameMatch = contacts.find((c) => c.name.toLowerCase().split(/\s+/)[0] === q);
    if (firstNameMatch) return firstNameMatch.email;
    // 3. Participant name is contained in contact name (e.g. "Subrata" in "Dr. Subrata Roy")
    const containsMatch = contacts.find((c) => c.name.toLowerCase().includes(q));
    if (containsMatch) return containsMatch.email;
    return null;
  }

  const resolved = { ...(meeting.participant_emails || {}) };
  for (const name of meeting.participants) {
    if (!resolved[name]) {
      const found = findEmail(name);
      if (found) resolved[name] = found;
    }
  }
  return { ...meeting, participant_emails: resolved };
}

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
      const result = await Promise.all(
        meetings.map(async (m) => {
          const resolved = await applyContactEmails(m, req);
          return { ...resolved, missingFields: MeetingService.findMissingFields(resolved) };
        })
      );

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

      let updated = answers
        ? MeetingService.applyFieldAnswers(meeting, answers)
        : meeting;

      updated = await applyContactEmails(updated, req);
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

      // Accept platform from the meeting object (set by frontend after platform selection)
      const meetingWithPlatform = {
        ...meeting,
        platform: meeting.platform || 'google_meet',
      };

      const authClient = await this._auth(req);
      const zoomAccessToken = meetingWithPlatform.platform === 'zoom'
        ? await zoomAuth.getAccessToken(req)
        : null;
      const event = await MeetingService.createGoogleMeeting(meetingWithPlatform, slot, authClient, zoomAccessToken);
      const invites = await MeetingService.sendInvites(meetingWithPlatform, event);
      const summary = MeetingService.generateSummary(meetingWithPlatform, slot, event);

      MeetingService.saveMeeting({
        meeting: meetingWithPlatform,
        slot,
        event,
        summary,
        platform: meetingWithPlatform.platform,
        meetingLink: event.meetLink || null,
        platformMeetingId: event.platformMeetingId || null,
      });

      res.json({ success: true, summary, event, invites });
    } catch (err) {
      console.error('[schedule]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/meetings/:eventId
  async cancelMeeting(req, res) {
    try {
      const { eventId } = req.params;
      if (!eventId) return res.status(400).json({ error: 'eventId is required' });
      const authClient = await this._auth(req);
      await CalendarService.deleteEvent(eventId, authClient);
      res.json({ success: true });
    } catch (err) {
      console.error('[cancel]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // PATCH /api/meetings/:eventId/reschedule
  async rescheduleMeeting(req, res) {
    try {
      const { eventId } = req.params;
      const { date, startTime, endTime } = req.body;
      if (!eventId || !date || !startTime || !endTime) {
        return res.status(400).json({ error: 'eventId, date, startTime, endTime are required' });
      }
      const authClient = await this._auth(req);
      const tz = process.env.TIMEZONE || 'UTC';
      const updates = {
        start: { dateTime: new Date(`${date}T${startTime}:00`).toISOString(), timeZone: tz },
        end:   { dateTime: new Date(`${date}T${endTime}:00`).toISOString(),   timeZone: tz },
      };
      const result = await CalendarService.updateEvent(eventId, updates, authClient);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[reschedule]', err);
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
  async googleAuth(req, res) {
    try {
      const email = req.session?.user?.email || null;
      const url = await getAuthUrl(email);
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
        return res.redirect(`${frontendUrl}/app?auth=error&reason=${encodeURIComponent(error)}`);
      }
      if (!code) return res.status(400).send('Missing code');
      await exchangeCode(code, req);
      res.redirect(`${frontendUrl}/app?auth=success`);
    } catch (err) {
      console.error('[googleCallback]', err);
      const reason = err.message || 'unknown';
      res.redirect(`${frontendUrl}/app?auth=error&reason=${encodeURIComponent(reason)}`);
    }
  }

  // GET /api/auth/status
  async authStatus(req, res) {
    // Restore tokens from DB if session is empty but email is known
    if (!req.session?.googleTokens && req.session?.user?.email) {
      const { isDBConnected } = require('../config/database');
      const User = require('../models/User');
      if (isDBConnected()) {
        try {
          const dbUser = await User.findOne({ email: req.session.user.email.toLowerCase() }).lean();
          if (dbUser?.googleTokens) req.session.googleTokens = dbUser.googleTokens;
          if (dbUser?.zoomTokens)   req.session.zoomTokens   = dbUser.zoomTokens;
          if (dbUser?.zoomUser)     req.session.zoomUser      = dbUser.zoomUser;
        } catch {}
      }
    }
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

  // ─── Zoom Auth ─────────────────────────────────────────────────────────────

  // GET /api/auth/zoom
  zoomAuth(req, res) {
    try {
      const url = zoomAuth.getAuthUrl();
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/auth/zoom/callback
  async zoomCallback(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    console.log('[zoomCallback] query params received:', JSON.stringify(req.query));
    try {
      const { code, error, error_description } = req.query;
      if (error) {
        const reason = error_description || error;
        console.error('[zoomCallback] Zoom returned error:', error, error_description);
        return res.redirect(`${frontendUrl}/app?zoom_auth=error&reason=${encodeURIComponent(reason)}`);
      }
      if (!code) {
        console.error('[zoomCallback] No code and no error in query. Full query:', req.query);
        return res.redirect(`${frontendUrl}/app?zoom_auth=error&reason=${encodeURIComponent('No authorization code received from Zoom')}`);
      }
      await zoomAuth.exchangeCode(code, req);
      res.redirect(`${frontendUrl}/app?zoom_auth=success`);
    } catch (err) {
      console.error('[zoomCallback] Exception:', err.message);
      res.redirect(`${frontendUrl}/app?zoom_auth=error&reason=${encodeURIComponent(err.message || 'unknown')}`);
    }
  }

  // GET /api/auth/zoom/status
  async zoomStatus(req, res) {
    const googleEmail = req.session?.user?.email;

    // Check DB to get the true Zoom status for the currently logged-in Google user
    if (googleEmail) {
      const { isDBConnected } = require('../config/database');
      const User = require('../models/User');
      if (isDBConnected()) {
        try {
          const dbUser = await User.findOne({ email: googleEmail.toLowerCase() }).lean();
          const authenticated = !!(dbUser?.zoomTokens?.access_token);

          // Sync session with DB so subsequent token operations work correctly
          if (authenticated && !req.session.zoomTokens) {
            req.session.zoomTokens = dbUser.zoomTokens;
            req.session.zoomUser   = dbUser.zoomUser;
            await new Promise((resolve, reject) =>
              req.session.save((err) => (err ? reject(err) : resolve()))
            );
          } else if (!authenticated && req.session.zoomTokens) {
            delete req.session.zoomTokens;
            delete req.session.zoomUser;
            await new Promise((resolve, reject) =>
              req.session.save((err) => (err ? reject(err) : resolve()))
            );
          }

          return res.json({ authenticated, user: dbUser?.zoomUser || null });
        } catch (err) {
          console.warn('[zoomStatus] DB check failed, falling back to session:', err.message);
        }
      }
    }

    // Fallback: session only
    res.json({
      authenticated: zoomAuth.isAuthenticated(req),
      user: zoomAuth.getSessionUser(req),
    });
  }

  // POST /api/auth/zoom/disconnect
  async zoomDisconnect(req, res) {
    try {
      await zoomAuth.disconnect(req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/auth/diagnostics
  async authDiagnostics(req, res) {
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
    try { authUrl = await getAuthUrl(); } catch {}

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
