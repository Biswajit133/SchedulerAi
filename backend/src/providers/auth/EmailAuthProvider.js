const AuthProvider = require('./AuthProvider');

// Stub — implement with bcrypt + JWT once email/password auth is required.
class EmailAuthProvider extends AuthProvider {
  get id() { return 'email'; }
  get label() { return 'Email & Password'; }
  get available() { return false; }

  async getAuthUrl() {
    // Email auth uses a form submission, not an OAuth redirect.
    throw new Error('Email auth uses a form, not an OAuth URL.');
  }

  async exchangeCode() {
    throw new Error('Email auth is not yet implemented.');
  }

  getProfile() { return null; }

  async refreshToken() { return null; }

  async revokeAccess() {}

  isAuthenticated() { return false; }
}

module.exports = new EmailAuthProvider();
