const AuthProvider = require('./AuthProvider');

// Stub — implement once LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET are configured.
class LinkedinAuthProvider extends AuthProvider {
  get id() { return 'linkedin'; }
  get label() { return 'LinkedIn'; }
  get available() { return false; }

  async getAuthUrl() {
    throw new Error('LinkedIn OAuth is not yet configured.');
  }

  async exchangeCode() {
    throw new Error('LinkedIn OAuth is not yet configured.');
  }

  getProfile() { return null; }

  async refreshToken() { return null; }

  async revokeAccess() {}

  isAuthenticated() { return false; }
}

module.exports = new LinkedinAuthProvider();
