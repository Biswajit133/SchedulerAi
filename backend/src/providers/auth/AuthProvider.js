/**
 * Base interface for all authentication providers.
 * Concrete implementations must override every method.
 */
class AuthProvider {
  /** Unique provider identifier, e.g. 'google', 'microsoft' */
  get id() { throw new Error(`${this.constructor.name} must implement get id()`); }

  /** Human-readable label */
  get label() { throw new Error(`${this.constructor.name} must implement get label()`); }

  /** Whether the OAuth flow is fully implemented and ready for use */
  get available() { return false; }

  /**
   * Build the OAuth redirect URL.
   * @param {string|null} email - Optional login hint
   * @returns {Promise<string>}
   */
  async getAuthUrl(email) {
    throw new Error(`${this.constructor.name} must implement getAuthUrl()`);
  }

  /**
   * Exchange an OAuth authorization code for tokens, persist them to the session and DB.
   * @param {string} code
   * @param {import('express').Request} req
   * @returns {Promise<object>} token object
   */
  async exchangeCode(code, req) {
    throw new Error(`${this.constructor.name} must implement exchangeCode()`);
  }

  /**
   * Return the authenticated user profile stored in the session.
   * @param {import('express').Request} req
   * @returns {object|null}
   */
  getProfile(req) {
    throw new Error(`${this.constructor.name} must implement getProfile()`);
  }

  /**
   * Refresh the access token if it has expired.
   * @param {import('express').Request} req
   * @returns {Promise<object|null>} refreshed tokens or null
   */
  async refreshToken(req) {
    throw new Error(`${this.constructor.name} must implement refreshToken()`);
  }

  /**
   * Revoke tokens, clear session and DB records.
   * @param {import('express').Request} req
   * @returns {Promise<void>}
   */
  async revokeAccess(req) {
    throw new Error(`${this.constructor.name} must implement revokeAccess()`);
  }

  /**
   * Check whether the user is currently authenticated via this provider.
   * @param {import('express').Request} req
   * @returns {boolean}
   */
  isAuthenticated(req) {
    throw new Error(`${this.constructor.name} must implement isAuthenticated()`);
  }
}

module.exports = AuthProvider;
