class MeetingPlatformProvider {
  /**
   * @param {Object} meeting - Meeting object with title, participants, etc.
   * @param {Object} slot    - Slot object with date, startTime, endTime, durationMinutes
   * @param {Object} authClient - Authenticated Google OAuth2 client (may be null in demo mode)
   * @returns {Promise<{id, htmlLink, meetLink, platform, platformMeetingId, status, demo}>}
   */
  async createMeeting(meeting, slot, authClient) {
    throw new Error(`${this.constructor.name} must implement createMeeting()`);
  }
}

module.exports = MeetingPlatformProvider;
