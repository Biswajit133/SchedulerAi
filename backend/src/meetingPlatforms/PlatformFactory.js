const GoogleMeetProvider = require('./GoogleMeetProvider');
const ZoomProvider = require('./ZoomProvider');

class PlatformFactory {
  static create(platform) {
    switch ((platform || '').toLowerCase()) {
      case 'zoom':
        return ZoomProvider;
      case 'google_meet':
      default:
        return GoogleMeetProvider;
    }
  }
}

module.exports = PlatformFactory;
