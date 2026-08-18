const MeetingService = require('../services/MeetingService');
const AgendaService = require('../services/AgendaService');
const MeetingSummaryService = require('../services/MeetingSummaryService');
const CalendarService = require('../services/CalendarService');
const OutlookCalendarService = require('../services/OutlookCalendarService');
const IntegrationService = require('../services/IntegrationService');
const {
  getAuthUrl,
  exchangeCode,
  getAuthenticatedClient,
  isAuthenticated,
  getSessionUser,
  logout,
} = require('../config/googleAuth');
const zoomAuth = require('../config/zoomAuth');
const teamsAuth = require('../config/teamsAuth');
const microsoftSignInAuth = require('../config/microsoftSignInAuth');
const outlookAuth = require('../config/outlookAuth');
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
  // ─── Helpers ───────────────────────────────────────────────────────────────

  async _auth(req) {
    return getAuthenticatedClient(req);
  }

  // Returns { service, client, provider } for the user's active calendar.
  // provider: 'google' | 'outlook' | null
  async _getCalendarContext(req) {
    const userEmail = req.session?.user?.email || req.session?.outlookUser?.email;
    let provider = null;

    if (userEmail && isDBConnected()) {
      try {
        const dbUser = await User.findOne({ email: userEmail.toLowerCase() }).lean();
        provider = IntegrationService.getDefaultCalendarProvider(dbUser);
      } catch (_) {}
    }

    if (provider === 'outlook') {
      const token = await outlookAuth.getAccessToken(req);
      return { service: OutlookCalendarService, client: token, provider: 'outlook' };
    }

    // Default: Google Calendar
    const client = await getAuthenticatedClient(req);
    return { service: CalendarService, client, provider: client ? 'google' : null };
  }

  // Returns { service, client, provider } based on meeting platform, not user preference.
  // Teams → Outlook Calendar; Google Meet / Zoom → Google Calendar.
  async _getCalendarContextForPlatform(req, platform) {
    if (platform === 'teams') {
      const token = await outlookAuth.getAccessToken(req);
      return { service: OutlookCalendarService, client: token, provider: 'outlook' };
    }
    const client = await getAuthenticatedClient(req);
    return { service: CalendarService, client, provider: client ? 'google' : null };
  }

  // Returns tokens/clients for both Google and Outlook so availability can be checked across both.
  async _getBothCalendarClients(req) {
    const [googleClient, outlookToken] = await Promise.allSettled([
      getAuthenticatedClient(req),
      outlookAuth.getAccessToken(req),
    ]);
    return {
      googleClient: googleClient.status === 'fulfilled' ? googleClient.value : null,
      outlookToken: outlookToken.status === 'fulfilled' ? outlookToken.value : null,
    };
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

      const durationMin = parseInt(duration) || 60;
      const { googleClient, outlookToken } = await this._getBothCalendarClients(req);
      const result = await MeetingService.findAvailableSlotsFromBoth(
        date, durationMin, googleClient, CalendarService, outlookToken, OutlookCalendarService
      );

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

      // Resolve timezone: session → DB → client-sent → 'UTC'
      let resolvedTimeZone = req.session?.user?.timezone || null;
      if (!resolvedTimeZone) {
        const userEmail = req.session?.user?.email;
        if (userEmail && isDBConnected()) {
          try {
            const dbUser = await User.findOne({ email: userEmail.toLowerCase() }).select('timezone').lean();
            resolvedTimeZone = dbUser?.timezone || null;
            if (resolvedTimeZone && req.session.user) {
              req.session.user.timezone = resolvedTimeZone;
            }
          } catch (_) {}
        }
      }
      // Last resort: browser timezone sent by the client
      if (!resolvedTimeZone && meeting.clientTimeZone) {
        resolvedTimeZone = meeting.clientTimeZone;
      }
      resolvedTimeZone = resolvedTimeZone || 'UTC';

      // Determine platform: explicit request → user default preference → first connected
      let platform = meeting.platform || null;
      if (!platform && isDBConnected() && req.session?.user?.email) {
        try {
          const dbUser = await User.findOne({ email: req.session.user.email.toLowerCase() }).lean();
          platform = IntegrationService.getDefaultMeetingProvider(dbUser);
        } catch (_) {}
      }
      platform = platform || 'google_meet';

      // Verify the requested provider is actually connected
      if (isDBConnected() && req.session?.user?.email) {
        try {
          const dbUser = await User.findOne({ email: req.session.user.email.toLowerCase() }).lean();
          if (!IntegrationService.isMeetingProviderConnected(dbUser, platform)) {
            return res.status(400).json({
              error: `${platform} is not connected. Please connect it first or choose a different provider.`,
              code: 'PROVIDER_NOT_CONNECTED',
              provider: platform,
            });
          }
        } catch (_) {}
      }

      const meetingWithPlatform = {
        ...meeting,
        platform,
        timeZone: resolvedTimeZone,
      };

      // Route calendar based on platform: Teams → Outlook, Google Meet/Zoom → Google Calendar
      const { service: calService, client: calClient } =
        await this._getCalendarContextForPlatform(req, platform);

      // If the user is authenticated but the calendar client is unavailable, the access token
      // has expired and there is no refresh token in the session — prompt re-auth.
      if (!calClient && isAuthenticated(req) && platform !== 'zoom' && platform !== 'teams') {
        return res.status(401).json({
          error: 'Your Google session has expired. Please sign in with Google again to schedule meetings.',
          code: 'GOOGLE_REAUTH_REQUIRED',
        });
      }

      const zoomAccessToken = platform === 'zoom'
        ? await zoomAuth.getAccessToken(req)
        : null;
      const teamsAccessToken = platform === 'teams'
        ? await teamsAuth.getAccessToken(req)
        : null;
      const event = await MeetingService.createGoogleMeeting(
        meetingWithPlatform, slot, calClient, teamsAccessToken || zoomAccessToken, calService
      );
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
      const { service, client } = await this._getCalendarContext(req);
      await service.deleteEvent(eventId, client);
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
      const { service, client } = await this._getCalendarContext(req);
      const tz = process.env.TIMEZONE || 'UTC';
      const updates = {
        start: { dateTime: new Date(`${date}T${startTime}:00`).toISOString(), timeZone: tz },
        end:   { dateTime: new Date(`${date}T${endTime}:00`).toISOString(),   timeZone: tz },
      };
      const result = await service.updateEvent(eventId, updates, client);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[reschedule]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/meetings/recent?days=7
  async getRecentMeetings(req, res) {
    try {
      const days = parseInt(req.query.days) || 7;
      const { service, client } = await this._getCalendarContext(req);

      let timeZone = req.session?.user?.timezone || null;
      const userEmail = req.session?.user?.email || req.session?.outlookUser?.email;
      if (!timeZone && userEmail && isDBConnected()) {
        try {
          const dbUser = await User.findOne({ email: userEmail.toLowerCase() })
            .select('timezone').lean();
          timeZone = dbUser?.timezone || null;
        } catch (_) {}
      }

      const result = await service.getRecentMeetings(client, timeZone, days);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[recentMeetings]', err);
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

      // Resolve timezone: session → DB → null (falls back to UTC in services)
      const userEmail = req.session?.user?.email || req.session?.outlookUser?.email;
      let timeZone = req.session?.user?.timezone || null;
      if (!timeZone && userEmail && isDBConnected()) {
        try {
          const dbUser = await User.findOne({ email: userEmail.toLowerCase() })
            .select('timezone').lean();
          timeZone = dbUser?.timezone || null;
          if (timeZone && req.session.user) req.session.user.timezone = timeZone;
        } catch (_) {}
      }

      // Fetch from both Google and Outlook calendars and merge
      const { googleClient, outlookToken } = await this._getBothCalendarClients(req);
      const agenda = await AgendaService.getAgendaFromBoth(date || null, googleClient, outlookToken, timeZone);
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
      const durationMin = parseInt(duration) || 60;
      const { googleClient, outlookToken } = await this._getBothCalendarClients(req);
      const result = await MeetingService.smartSuggestSlotsFromBoth(
        date, time, durationMin, googleClient, CalendarService, outlookToken, OutlookCalendarService
      );
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

  // GET /api/auth/microsoft
  microsoftAuth(req, res) {
    try {
      const url = microsoftSignInAuth.getAuthUrl();
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/auth/microsoft/callback
  async microsoftCallback(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const { code, error, error_description } = req.query;
      if (error) {
        const reason = error_description || error;
        return res.redirect(`${frontendUrl}/app?auth=error&reason=${encodeURIComponent(reason)}`);
      }
      if (!code) {
        return res.redirect(`${frontendUrl}/app?auth=error&reason=${encodeURIComponent('No authorization code received from Microsoft')}`);
      }
      await microsoftSignInAuth.exchangeCode(code, req);
      res.redirect(`${frontendUrl}/app?auth=success`);
    } catch (err) {
      console.error('[microsoftCallback]', err.message);
      res.redirect(`${frontendUrl}/app?auth=error&reason=${encodeURIComponent(err.message || 'unknown')}`);
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

    // Backfill timezone from DB if session pre-dates the timezone feature
    if (!user?.timezone && user?.email && isDBConnected()) {
      try {
        const dbUser = await User.findOne({ email: user.email.toLowerCase() }).select('timezone').lean();
        if (dbUser?.timezone) {
          user.timezone = dbUser.timezone;
          req.session.user = { ...req.session.user, timezone: dbUser.timezone };
        }
      } catch (_) {}
    }

    const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const isAdmin = !!(adminEmail && user?.email && user.email.toLowerCase() === adminEmail);

    res.json({ authenticated: true, user: { ...user, isAdmin } });
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

  // ─── Teams Auth ────────────────────────────────────────────────────────────

  // GET /api/auth/teams
  teamsAuth(req, res) {
    try {
      const url = teamsAuth.getAuthUrl();
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/auth/teams/callback
  async teamsCallback(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const { code, error, error_description } = req.query;
      if (error) {
        const reason = error_description || error;
        return res.redirect(`${frontendUrl}/app?teams_auth=error&reason=${encodeURIComponent(reason)}`);
      }
      if (!code) {
        return res.redirect(`${frontendUrl}/app?teams_auth=error&reason=${encodeURIComponent('No authorization code received from Microsoft')}`);
      }
      await teamsAuth.exchangeCode(code, req);
      res.redirect(`${frontendUrl}/app?teams_auth=success`);
    } catch (err) {
      console.error('[teamsCallback] Exception:', err.message);
      res.redirect(`${frontendUrl}/app?teams_auth=error&reason=${encodeURIComponent(err.message || 'unknown')}`);
    }
  }

  // GET /api/auth/teams/status
  async teamsStatus(req, res) {
    const googleEmail = req.session?.user?.email;

    if (googleEmail) {
      const { isDBConnected } = require('../config/database');
      if (isDBConnected()) {
        try {
          const dbUser = await User.findOne({ email: googleEmail.toLowerCase() }).lean();
          const authenticated = !!(dbUser?.teamsTokens?.access_token);

          if (authenticated && !req.session.teamsTokens) {
            req.session.teamsTokens = dbUser.teamsTokens;
            req.session.teamsUser   = dbUser.teamsUser;
            await new Promise((resolve, reject) =>
              req.session.save((err) => (err ? reject(err) : resolve()))
            );
          } else if (!authenticated && req.session.teamsTokens) {
            delete req.session.teamsTokens;
            delete req.session.teamsUser;
            await new Promise((resolve, reject) =>
              req.session.save((err) => (err ? reject(err) : resolve()))
            );
          }

          return res.json({ authenticated, user: dbUser?.teamsUser || null });
        } catch (err) {
          console.warn('[teamsStatus] DB check failed, falling back to session:', err.message);
        }
      }
    }

    res.json({
      authenticated: teamsAuth.isAuthenticated(req),
      user: teamsAuth.getSessionUser(req),
    });
  }

  // POST /api/auth/teams/disconnect
  async teamsDisconnect(req, res) {
    try {
      await teamsAuth.disconnect(req);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/integrations
  async getIntegrations(req, res) {
    const userEmail = req.session?.user?.email;
    if (!userEmail || !isDBConnected()) {
      // Return a minimal summary when not authenticated or DB is offline
      const { CALENDAR_PROVIDERS, MEETING_PROVIDERS } = require('../config/providerRegistry');
      return res.json({
        success: true,
        calendarProviders: CALENDAR_PROVIDERS.map((p) => ({ ...p, connected: false, isDefault: false })),
        meetingProviders: MEETING_PROVIDERS.map((p) => ({ ...p, connected: false, isDefault: false })),
        defaultCalendarProvider: null,
        defaultMeetingProvider: null,
        preferences: {},
      });
    }

    try {
      const dbUser = await User.findOne({ email: userEmail.toLowerCase() }).lean();
      const summary = IntegrationService.getSummary(dbUser);
      res.json({ success: true, ...summary });
    } catch (err) {
      console.error('[getIntegrations]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // PATCH /api/user/preferences
  async updatePreferences(req, res) {
    const userEmail = req.session?.user?.email;
    if (!userEmail) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!isDBConnected()) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    const { defaultCalendarProvider, defaultMeetingProvider, preferredDuration, preferredTimezone } = req.body;

    try {
      const update = {};
      if (defaultCalendarProvider !== undefined) update['preferences.defaultCalendarProvider'] = defaultCalendarProvider;
      if (defaultMeetingProvider  !== undefined) update['preferences.defaultMeetingProvider']  = defaultMeetingProvider;
      if (preferredDuration       !== undefined) update['preferences.preferredDuration']        = preferredDuration;
      if (preferredTimezone       !== undefined) update['preferences.preferredTimezone']         = preferredTimezone;

      const dbUser = await User.findOneAndUpdate(
        { email: userEmail.toLowerCase() },
        { $set: update },
        { new: true, runValidators: true }
      ).lean();

      const summary = IntegrationService.getSummary(dbUser);
      res.json({ success: true, preferences: dbUser?.preferences || {}, ...summary });
    } catch (err) {
      console.error('[updatePreferences]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // ─── Outlook Calendar Auth ─────────────────────────────────────────────────

  // GET /api/auth/outlook
  outlookCalendarAuth(req, res) {
    try {
      const url = outlookAuth.getAuthUrl();
      res.json({ url });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/auth/outlook/callback
  async outlookCalendarCallback(req, res) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    try {
      const { code, error, error_description } = req.query;
      if (error) {
        const reason = error_description || error;
        return res.redirect(`${frontendUrl}/settings?outlook_auth=error&reason=${encodeURIComponent(reason)}`);
      }
      if (!code) {
        return res.redirect(`${frontendUrl}/settings?outlook_auth=error&reason=${encodeURIComponent('No authorization code received from Microsoft')}`);
      }
      await outlookAuth.exchangeCode(code, req);
      res.redirect(`${frontendUrl}/settings?outlook_auth=success`);
    } catch (err) {
      console.error('[outlookCalendarCallback]', err.message);
      res.redirect(`${frontendUrl}/settings?outlook_auth=error&reason=${encodeURIComponent(err.message || 'unknown')}`);
    }
  }

  // GET /api/auth/outlook/status
  async outlookCalendarStatus(req, res) {
    const userEmail =
      req.session?.user?.email ||
      req.session?.outlookUser?.email;

    if (userEmail && isDBConnected()) {
      try {
        const dbUser = await User.findOne({ email: userEmail.toLowerCase() }).lean();
        const authenticated = !!(dbUser?.outlookTokens?.access_token);

        if (authenticated && !req.session.outlookTokens) {
          req.session.outlookTokens = dbUser.outlookTokens;
          req.session.outlookUser   = dbUser.outlookUser;
          await new Promise((resolve, reject) =>
            req.session.save((err) => (err ? reject(err) : resolve()))
          );
        } else if (!authenticated && req.session.outlookTokens) {
          delete req.session.outlookTokens;
          delete req.session.outlookUser;
          await new Promise((resolve, reject) =>
            req.session.save((err) => (err ? reject(err) : resolve()))
          );
        }

        return res.json({ authenticated, user: dbUser?.outlookUser || null });
      } catch (err) {
        console.warn('[outlookCalendarStatus] DB check failed:', err.message);
      }
    }

    res.json({
      authenticated: outlookAuth.isAuthenticated(req),
      user: outlookAuth.getSessionUser(req),
    });
  }

  // POST /api/auth/outlook/disconnect
  async outlookCalendarDisconnect(req, res) {
    try {
      await outlookAuth.disconnect(req);
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
