const AuthProvider = require('./AuthProvider');
const microsoftSignInAuth = require('../../config/microsoftSignInAuth');

class MicrosoftAuthProvider extends AuthProvider {
  get id() { return 'microsoft'; }
  get label() { return 'Microsoft'; }
  get available() { return false; }

  async getAuthUrl() {
    return microsoftSignInAuth.getAuthUrl();
  }

  async exchangeCode(code, req) {
    return microsoftSignInAuth.exchangeCode(code, req);
  }

  getProfile(req) {
    return microsoftSignInAuth.getSessionUser(req);
  }

  async refreshToken() { return null; }

  async revokeAccess(req) {
    if (req?.session) {
      delete req.session.microsoftTokens;
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
    }
  }

  isAuthenticated(req) {
    return microsoftSignInAuth.isAuthenticated(req);
  }
}

module.exports = new MicrosoftAuthProvider();
