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

  async createEvent(meeting, slot, authClient) {
    const startDateTime = new Date(`${slot.date}T${slot.startTime}:00`).toISOString();
    const endDateTime = new Date(`${slot.date}T${slot.endTime}:00`).toISOString();

    const attendees = Object.entries(meeting.participant_emails || {})
      .filter(([, email]) => email)
      .map(([displayName, email]) => ({ email, displayName }));

    const eventBody = {
      summary: meeting.meeting_title,
      description: meeting.task || '',
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
      conferenceData: {
        createRequest: { requestId: `scheduler-${Date.now()}` },
      },
    };

    if (!authClient) {
      return this._createMockEvent(eventBody);
    }

    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: eventBody,
      sendUpdates: 'all',
      conferenceDataVersion: 1,
    });

    return {
      id: response.data.id,
      htmlLink: response.data.htmlLink,
      meetLink: response.data.hangoutLink,
      status: response.data.status,
      demo: false,
    };
  }

  _createMockEvent(eventBody) {
    return {
      id: `mock-${Date.now()}`,
      htmlLink: null,
      meetLink: null,
      status: 'confirmed',
      demo: true,
      summary: eventBody.summary,
    };
  }
}

module.exports = new CalendarService();
