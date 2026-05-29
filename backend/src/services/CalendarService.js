const { google } = require('googleapis');
const SlotFinder = require('../utils/SlotFinder');

class CalendarService {
  async getEvents(date, authClient) {
    if (!authClient) {
      return { events: [], busySlots: SlotFinder.getMockBusySlots(date), demo: true };
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const startOfDay = new Date(`${date}T00:00:00`).toISOString();
    const endOfDay   = new Date(`${date}T23:59:59`).toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: 'startTime',
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
    } = platformOptions;

    const startDateTime = new Date(`${slot.date}T${slot.startTime}:00`).toISOString();
    const endDateTime = new Date(`${slot.date}T${slot.endTime}:00`).toISOString();

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
      start: { dateTime: startDateTime, timeZone: process.env.TIMEZONE || 'UTC' },
      end: { dateTime: endDateTime, timeZone: process.env.TIMEZONE || 'UTC' },
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
