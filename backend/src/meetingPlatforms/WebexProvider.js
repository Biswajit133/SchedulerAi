const MeetingPlatformProvider = require('./MeetingPlatformProvider');

// Stub — implement once WEBEX_CLIENT_ID / WEBEX_CLIENT_SECRET are configured.
class WebexProvider extends MeetingPlatformProvider {
  async createMeeting() {
    throw new Error('Cisco Webex integration is not yet configured.');
  }

  async updateMeeting() {
    throw new Error('Cisco Webex integration is not yet configured.');
  }

  async cancelMeeting() {
    throw new Error('Cisco Webex integration is not yet configured.');
  }

  async getMeetingDetails() {
    throw new Error('Cisco Webex integration is not yet configured.');
  }
}

module.exports = new WebexProvider();
