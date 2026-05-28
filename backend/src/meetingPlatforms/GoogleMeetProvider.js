const MeetingPlatformProvider = require('./MeetingPlatformProvider');
const CalendarService = require('../services/CalendarService');

class GoogleMeetProvider extends MeetingPlatformProvider {
  async createMeeting(meeting, slot, authClient) {
    const event = await CalendarService.createEvent(meeting, slot, authClient, {
      platform: 'google_meet',
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
}

module.exports = new GoogleMeetProvider();
