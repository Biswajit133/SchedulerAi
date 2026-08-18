const MeetingPlatformProvider = require('./MeetingPlatformProvider');
const CalendarService = require('../services/CalendarService');

class GoogleMeetProvider extends MeetingPlatformProvider {
  async createMeeting(meeting, slot, authClient, _unused, calendarService = CalendarService) {
    const event = await calendarService.createEvent(meeting, slot, authClient, {
      platform: 'google_meet',
      timeZone: meeting.timeZone || 'UTC',
    });

    return {
      id: event.id,
      htmlLink: event.htmlLink,
      meetLink: event.meetLink,
      platform: 'google_meet',
      platformMeetingId: null,
      status: event.status,
      demo: event.demo,
    };
  }

  async updateMeeting(eventId, updates, authClient) {
    return CalendarService.updateEvent(eventId, updates, authClient);
  }

  async cancelMeeting(eventId, authClient) {
    return CalendarService.deleteEvent(eventId, authClient);
  }

  async getMeetingDetails(eventId, authClient) {
    return CalendarService.getEvent(eventId, authClient);
  }
}

module.exports = new GoogleMeetProvider();
