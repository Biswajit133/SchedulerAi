/**
 * AuthProviderRegistry — central directory of all auth providers.
 *
 * - Registers providers at startup (static default config).
 * - Admin can override is_enabled per provider via ProviderSettings in MongoDB.
 * - The registry is the only place the rest of the app should import auth providers from;
 *   no business logic file should import a concrete provider directly.
 */

const googleProvider    = require('./GoogleAuthProvider');
const microsoftProvider = require('./MicrosoftAuthProvider');
const githubProvider    = require('./GithubAuthProvider');
const linkedinProvider  = require('./LinkedinAuthProvider');
const emailProvider     = require('./EmailAuthProvider');

// Default enabled state — overridden by ProviderSettings in DB when available.
const DEFAULT_ENABLED = {
  google:    true,
  microsoft: false,
  github:    false,
  linkedin:  false,
  email:     false,
};

// Ordered list — drives the sign-in page order.
const ALL_PROVIDERS = [
  googleProvider,
  microsoftProvider,
  githubProvider,
  linkedinProvider,
  emailProvider,
];

class AuthProviderRegistry {
  constructor() {
    // Runtime-overridable enabled map (loaded from DB by AdminController on startup).
    this._enabled = { ...DEFAULT_ENABLED };
  }

  /** Apply DB overrides. Called once at server start and after admin saves. */
  applySettings(settingsArray = []) {
    for (const s of settingsArray) {
      if (s.provider_name in this._enabled) {
        this._enabled[s.provider_name] = s.is_enabled;
      }
    }
  }

  /** All registered providers (enabled or not) — used by the admin panel. */
  getAll() {
    return ALL_PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      available: p.available,
      enabled: this._enabled[p.id] ?? false,
    }));
  }

  /** Only providers that are enabled AND available — used by the login page. */
  getEnabled() {
    return ALL_PROVIDERS.filter(
      (p) => p.available && (this._enabled[p.id] ?? false)
    );
  }

  /** Look up a provider by id. Returns null if not found or not enabled. */
  get(id) {
    const p = ALL_PROVIDERS.find((p) => p.id === id);
    if (!p) return null;
    if (!p.available || !this._enabled[p.id]) return null;
    return p;
  }

  /** Enable or disable a provider at runtime. */
  setEnabled(id, enabled) {
    if (id in this._enabled) {
      this._enabled[id] = Boolean(enabled);
    }
  }
}

module.exports = new AuthProviderRegistry();
