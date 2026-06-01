const { google } = require('googleapis');
const SlotFinder = require('../utils/SlotFinder');
const DateParser = require('../utils/DateParser');

class CalendarService {
  async getEvents(date, authClient, timeZone) {
    if (!authClient) {
      return { events: [], busySlots: SlotFinder.getMockBusySlots(date), demo: true };
    }

    const tz = timeZone || 'UTC';
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    // Compute start/end of day in the user's local timezone → convert to UTC for the API
    const startOfDay = DateParser.localToUTC(date, '00:00', tz).toISOString();
    const endOfDay   = DateParser.localToUTC(date, '23:59', tz).toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: tz,
    });

    const events = response.data.items || [];
    const busySlots = SlotFinder.normalizeBusySlots(events, date);
    return { events, busySlots, demo: false };
  }

  async createEvent(meeting, slot, authClient, platformOptions = {}) {
    const {
      platform = 'google_meet',
      meetingLink = null,
      platformMeetingId = null,
      timeZone = 'UTC',
    } = platformOptions;

    const tz = timeZone;
    const startDateTime = DateParser.localToUTC(slot.date, slot.startTime, tz).toISOString();
    const endDateTime   = DateParser.localToUTC(slot.date, slot.endTime,   tz).toISOString();

    const attendees = Object.entries(meeting.participant_emails || {})
      .filter(([, email]) => email)
      .map(([displayName, email]) => ({ email, displayName }));

    // Build description — for Zoom always embed the join link
    let description = meeting.task || '';
    if (platform === 'zoom' && meetingLink) {
      const zoomSection = [
        'Join Zoom Meeting:',
        meetingLink,
        platformMeetingId ? `Meeting ID: ${platformMeetingId}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      description = description ? `${description}\n\n${zoomSection}` : zoomSection;
    }

    const eventBody = {
      summary: meeting.meeting_title,
      description,
      start: { dateTime: startDateTime, timeZone: tz },
      end: { dateTime: endDateTime, timeZone: tz },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };

    // Only request a Google Meet conference link when platform is google_meet
    if (platform === 'google_meet') {
      eventBody.conferenceData = {
        createRequest: { requestId: `scheduler-${Date.now()}` },
      };
    }

    if (!authClient) {
      return this._createMockEvent(eventBody, platform, meetingLink);
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: eventBody,
      sendUpdates: 'all',
      conferenceDataVersion: platform === 'google_meet' ? 1 : 0,
    });

    return {
      id: response.data.id,
      htmlLink: response.data.htmlLink,
      meetLink: platform === 'google_meet' ? response.data.hangoutLink : meetingLink,
      platform,
      platformMeetingId: platformMeetingId || null,
      status: response.data.status,
      demo: false,
    };
  }

  async deleteEvent(eventId, authClient) {
    if (!authClient) throw new Error('Google Calendar not connected. Please sign in first.');
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
    return { success: true };
  }

  async updateEvent(eventId, updates, authClient) {
    if (!authClient) throw new Error('Google Calendar not connected. Please sign in first.');
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const response = await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      resource: updates,
      sendUpdates: 'all',
    });
    return { success: true, event: response.data };
  }

  async searchAttendees(authClient, participantName) {
    if (!authClient) return [];

    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const query = participantName.trim().toLowerCase();
    const firstName = query.split(/\s+/)[0];

    try {
      const now = new Date();
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: threeMonthsAgo.toISOString(),
        timeMax: now.toISOString(),
        singleEvents: true,
        maxResults: 100,
        fields: 'items(attendees)',
      });

      const events = res.data?.items || [];
      const seen = new Set();
      const matches = [];
      const queryParts = query.split(/\s+/).filter((p) => p.length >= 3);

      for (const event of events) {
        for (const attendee of (event.attendees || [])) {
          const email = attendee.email?.toLowerCase();
          if (!email || seen.has(email)) continue;

          const displayName = (attendee.displayName || '').toLowerCase();
          const emailPrefix = email.split('@')[0];

          // Display-name match: every part of the query (min 3 chars) must appear in displayName,
          // or the full displayName must appear in the query
          const nameMatchByDisplay =
            displayName.length >= 3 && (
              queryParts.every((p) => displayName.includes(p)) ||
              query.includes(displayName)
            );

          // Email-prefix match: only when prefix is meaningful (≥4 chars) and contains firstName
          const nameMatchByEmail =
            firstName.length >= 3 &&
            emailPrefix.length >= 4 &&
            emailPrefix.includes(firstName);

          if (nameMatchByDisplay || nameMatchByEmail) {
            seen.add(email);
            matches.push({ name: attendee.displayName || participantName, email });
          }
        }
      }

      return matches;
    } catch (err) {
      console.warn('[CalendarService] searchAttendees failed:', err.message);
      return [];
    }
  }

  async getRecentMeetings(authClient, timeZone, days = 7) {
    if (!authClient) {
      return { meetings: [], demo: true };
    }

    const tz = timeZone || 'UTC';
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);

    try {
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: start.toISOString(),
        timeMax: now.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        timeZone: tz,
        maxResults: 50,
      });

      const events = response.data.items || [];

      const meetings = events
        .filter((e) => e.start?.dateTime)
        .map((e) => {
          const startDt = new Date(e.start.dateTime);
          const endDt = new Date(e.end?.dateTime || e.start.dateTime);
          const durationMin = Math.round((endDt - startDt) / 60000);

          const attendees = (e.attendees || [])
            .filter((a) => !a.self)
            .map((a) => ({ name: a.displayName || a.email.split('@')[0], email: a.email }));

          const dateStr = startDt.toISOString().slice(0, 10);
          const dateDisplay = startDt.toLocaleDateString('en-US', {
            weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
          });
          const startTimeDisplay = startDt.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz,
          });

          return {
            id: e.id,
            title: e.summary || 'Untitled Meeting',
            date: dateStr,
            dateDisplay,
            startDisplay: startTimeDisplay,
            duration: durationMin,
            attendees,
            participants: attendees.map((a) => a.name),
            participant_emails: Object.fromEntries(attendees.map((a) => [a.name, a.email])),
            htmlLink: e.htmlLink,
          };
        });

      return { meetings, demo: false };
    } catch (err) {
      console.warn('[CalendarService] getRecentMeetings failed:', err.message);
      return { meetings: [], demo: false };
    }
  }

  _createMockEvent(eventBody, platform = 'google_meet', meetingLink = null) {
    return {
      id: `mock-${Date.now()}`,
      htmlLink: null,
      meetLink: platform === 'google_meet' ? null : meetingLink,
      platform,
      platformMeetingId: null,
      status: 'confirmed',
      demo: true,
      summary: eventBody.summary,
    };
  }
}

module.exports = new CalendarService();
