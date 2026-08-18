const AuthProvider = require('./AuthProvider');
const googleAuth = require('../../config/googleAuth');

class GoogleAuthProvider extends AuthProvider {
  get id() { return 'google'; }
  get label() { return 'Google'; }
  get available() { return true; }

  async getAuthUrl(email) {
    return googleAuth.getAuthUrl(email);
  }

  async exchangeCode(code, req) {
    return googleAuth.exchangeCode(code, req);
  }

  getProfile(req) {
    return googleAuth.getSessionUser(req);
  }

  async refreshToken(req) {
    // googleAuth._buildClient handles refresh transparently inside getAuthenticatedClient
    return googleAuth.getAuthenticatedClient(req);
  }

  async revokeAccess(req) {
    return googleAuth.logout(req);
  }

  isAuthenticated(req) {
    return googleAuth.isAuthenticated(req);
  }
}

module.exports = new GoogleAuthProvider();
