const GoogleMeetProvider = require('./GoogleMeetProvider');
const ZoomProvider       = require('./ZoomProvider');
const TeamsProvider      = require('./TeamsProvider');
const WebexProvider      = require('./WebexProvider');

const PROVIDERS = {
  google_meet: GoogleMeetProvider,
  zoom:        ZoomProvider,
  teams:       TeamsProvider,
  webex:       WebexProvider,
};

class PlatformFactory {
  /**
   * Return the provider instance for the given platform id.
   * Falls back to GoogleMeetProvider for unknown ids.
   */
  static create(platform) {
    return PROVIDERS[(platform || '').toLowerCase()] || GoogleMeetProvider;
  }

  /** All known provider ids. */
  static ids() {
    return Object.keys(PROVIDERS);
  }
}

module.exports = PlatformFactory;
