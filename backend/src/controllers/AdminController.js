const ProviderSettings  = require('../models/ProviderSettings');
const AuthProviderRegistry = require('../providers/auth/AuthProviderRegistry');
const zoomAuth = require('../config/zoomAuth');
const { CALENDAR_PROVIDERS, MEETING_PROVIDERS } = require('../config/providerRegistry');
const { isDBConnected } = require('../config/database');

// Static defaults — used when DB is unavailable or a provider has no saved record yet.
const AUTH_DEFAULTS = [
  { provider_name: 'google',    provider_type: 'auth',    is_enabled: true  },
  { provider_name: 'microsoft', provider_type: 'auth',    is_enabled: false },
  { provider_name: 'github',    provider_type: 'auth',    is_enabled: false },
  { provider_name: 'linkedin',  provider_type: 'auth',    is_enabled: false },
  { provider_name: 'email',     provider_type: 'auth',    is_enabled: false },
];

const MEETING_DEFAULTS = MEETING_PROVIDERS.map((p) => ({
  provider_name: p.id,
  provider_type: 'meeting',
  is_enabled: p.available,
}));

const CALENDAR_DEFAULTS = CALENDAR_PROVIDERS.map((p) => ({
  provider_name: p.id,
  provider_type: 'calendar',
  is_enabled: p.available,
}));

const ALL_DEFAULTS = [...AUTH_DEFAULTS, ...MEETING_DEFAULTS, ...CALENDAR_DEFAULTS];

/**
 * Seed any missing provider rows into MongoDB on first run.
 * Called once at server startup.
 */
async function seedProviderSettings() {
  if (!isDBConnected()) return;
  try {
    for (const d of ALL_DEFAULTS) {
      await ProviderSettings.findOneAndUpdate(
        { provider_name: d.provider_name },
        {
          $set: { provider_type: d.provider_type },
          // Only seed is_enabled the first time a row is created — an admin's
          // saved toggle must survive server restarts, not get reset to the default.
          $setOnInsert: { is_enabled: d.is_enabled },
        },
        { upsert: true }
      );
    }
    // Push DB settings into the in-memory registry
    const settings = await ProviderSettings.find({ provider_type: 'auth' }).lean();
    AuthProviderRegistry.applySettings(settings);

    // Load any saved Zoom app credentials into the in-memory cache used by zoomAuth.
    const zoomDoc = await ProviderSettings.findOne({ provider_name: 'zoom' }).lean();
    zoomAuth.setCredentials(zoomDoc?.config_json || {});
  } catch (err) {
    console.warn('[AdminController] seedProviderSettings failed (non-fatal):', err.message);
  }
}

// ─── Shape helpers ─────────────────────────────────────────────────────────────

function _authRow(d, dbMap) {
  const db   = dbMap[d.provider_name];
  const authProviders = require('../providers/auth/AuthProviderRegistry').getAll();
  const meta = authProviders.find((p) => p.id === d.provider_name) || {};
  return {
    provider_name: d.provider_name,
    provider_type: 'auth',
    label: meta.label || d.provider_name,
    available: meta.available || false,
    is_enabled: db ? db.is_enabled : d.is_enabled,
    config_json: db?.config_json || {},
  };
}

// Strip secrets before a provider row ever reaches the browser. The frontend
// only needs to know a secret is set (to render a "saved" placeholder), never
// its value — sending it back would also risk silently re-saving a masked
// stand-in over the real one.
function _maskConfig(config_json = {}) {
  if (!('clientSecret' in config_json)) return config_json;
  const { clientSecret, ...rest } = config_json;
  return { ...rest, hasClientSecret: !!clientSecret };
}

function _meetingRow(d, dbMap) {
  const db   = dbMap[d.provider_name];
  const meta = MEETING_PROVIDERS.find((p) => p.id === d.provider_name) || {};
  return {
    provider_name: d.provider_name,
    provider_type: 'meeting',
    label: meta.label || d.provider_name,
    description: meta.description || '',
    available: meta.available || false,
    is_enabled: db ? db.is_enabled : d.is_enabled,
    config_json: _maskConfig(db?.config_json || {}),
  };
}

function _calendarRow(d, dbMap) {
  const db   = dbMap[d.provider_name];
  const meta = CALENDAR_PROVIDERS.find((p) => p.id === d.provider_name) || {};
  return {
    provider_name: d.provider_name,
    provider_type: 'calendar',
    label: meta.label || d.provider_name,
    available: meta.available || false,
    is_enabled: db ? db.is_enabled : d.is_enabled,
    config_json: db?.config_json || {},
  };
}

// ─── Controller ────────────────────────────────────────────────────────────────

class AdminController {
  /**
   * GET /api/admin/providers
   * Returns the full provider catalogue with current enabled states.
   */
  async getProviders(req, res) {
    let dbMap = {};

    if (isDBConnected()) {
      try {
        const docs = await ProviderSettings.find().lean();
        dbMap = Object.fromEntries(docs.map((d) => [d.provider_name, d]));
      } catch (err) {
        console.warn('[AdminController] getProviders DB read failed:', err.message);
      }
    }

    const auth     = AUTH_DEFAULTS.map((d)     => _authRow(d, dbMap));
    const meetings = MEETING_DEFAULTS.map((d)  => _meetingRow(d, dbMap));
    const calendar = CALENDAR_DEFAULTS.map((d) => _calendarRow(d, dbMap));

    // Derive default meeting provider
    const defaultMeeting = dbMap['__defaultMeetingProvider']?.config_json?.value
      || MEETING_PROVIDERS.find((p) => p.available)?.id
      || null;

    res.json({
      success: true,
      authProviders: auth,
      meetingProviders: meetings,
      calendarProviders: calendar,
      defaultMeetingProvider: defaultMeeting,
    });
  }

  /**
   * PATCH /api/admin/providers/:name
   * Toggle a provider on/off and/or save its config (e.g. Zoom app credentials).
   * Body: { is_enabled?: boolean, config_json?: object }
   * config_json is shallow-merged onto whatever is already saved, so partial
   * edits (e.g. rotating just the secret) don't clobber the rest.
   */
  async updateProvider(req, res) {
    const { name } = req.params;
    const { is_enabled, config_json } = req.body;

    if (typeof is_enabled !== 'boolean' && (!config_json || typeof config_json !== 'object')) {
      return res.status(400).json({ error: 'is_enabled (boolean) or config_json (object) is required' });
    }

    if (!isDBConnected()) {
      // Apply in-memory only (won't survive restart)
      if (typeof is_enabled === 'boolean') AuthProviderRegistry.setEnabled(name, is_enabled);
      if (name === 'zoom' && config_json) zoomAuth.setCredentials(config_json);
      return res.json({ success: true, persisted: false });
    }

    try {
      const update = {};
      if (typeof is_enabled === 'boolean') update.is_enabled = is_enabled;

      if (config_json && typeof config_json === 'object') {
        const existing = await ProviderSettings.findOne({ provider_name: name }).lean();
        update.config_json = { ...(existing?.config_json || {}), ...config_json };
      }

      const doc = await ProviderSettings.findOneAndUpdate(
        { provider_name: name },
        { $set: update },
        { new: true, upsert: true }
      ).lean();

      // Sync auth registry
      if (doc.provider_type === 'auth' && typeof is_enabled === 'boolean') {
        AuthProviderRegistry.setEnabled(name, is_enabled);
      }
      // Push saved Zoom app credentials into the live OAuth flow immediately.
      if (name === 'zoom') {
        zoomAuth.setCredentials(doc.config_json || {});
      }

      res.json({ success: true, persisted: true, provider: { ...doc, config_json: _maskConfig(doc.config_json) } });
    } catch (err) {
      console.error('[AdminController] updateProvider failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * PATCH /api/admin/config
   * Update global config values like defaultMeetingProvider.
   * Body: { defaultMeetingProvider: string }
   */
  async updateConfig(req, res) {
    const { defaultMeetingProvider } = req.body;

    if (!isDBConnected()) {
      return res.json({ success: true, persisted: false });
    }

    try {
      if (defaultMeetingProvider !== undefined) {
        await ProviderSettings.findOneAndUpdate(
          { provider_name: '__defaultMeetingProvider', provider_type: 'meeting' },
          { $set: { is_enabled: true, config_json: { value: defaultMeetingProvider } } },
          { upsert: true }
        );
      }
      res.json({ success: true, persisted: true });
    } catch (err) {
      console.error('[AdminController] updateConfig failed:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = { controller: new AdminController(), seedProviderSettings };
