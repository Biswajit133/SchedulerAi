const AuthProvider = require('./AuthProvider');

// Stub — implement once GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are configured.
class GithubAuthProvider extends AuthProvider {
  get id() { return 'github'; }
  get label() { return 'GitHub'; }
  get available() { return false; }

  async getAuthUrl() {
    throw new Error('GitHub OAuth is not yet configured.');
  }

  async exchangeCode() {
    throw new Error('GitHub OAuth is not yet configured.');
  }

  getProfile() { return null; }

  async refreshToken() { return null; }

  async revokeAccess() {}

  isAuthenticated() { return false; }
}

module.exports = new GithubAuthProvider();
