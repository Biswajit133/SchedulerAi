/**
 * Base interface for all meeting platform providers.
 * Every concrete provider must implement all four methods.
 */
class MeetingPlatformProvider {
  /**
   * Create a new meeting.
   * @returns {Promise<{id, htmlLink, meetLink, platform, platformMeetingId, status, demo}>}
   */
  async createMeeting(meeting, slot, authClient, accessToken) {
    throw new Error(`${this.constructor.name} must implement createMeeting()`);
  }

  /**
   * Update an existing meeting (reschedule, rename, etc.).
   * @param {string} eventId - Calendar event ID
   * @param {object} updates - Fields to update (start, end, summary, description…)
   * @param {object} authClient - Authenticated calendar client
   * @returns {Promise<object>}
   */
  async updateMeeting(eventId, updates, authClient) {
    throw new Error(`${this.constructor.name} must implement updateMeeting()`);
  }

  /**
   * Cancel / delete a meeting.
   * @param {string} eventId
   * @param {object} authClient
   * @returns {Promise<void>}
   */
  async cancelMeeting(eventId, authClient) {
    throw new Error(`${this.constructor.name} must implement cancelMeeting()`);
  }

  /**
   * Retrieve details for an existing meeting.
   * @param {string} eventId
   * @param {object} authClient
   * @returns {Promise<object>}
   */
  async getMeetingDetails(eventId, authClient) {
    throw new Error(`${this.constructor.name} must implement getMeetingDetails()`);
  }
}

module.exports = MeetingPlatformProvider;
