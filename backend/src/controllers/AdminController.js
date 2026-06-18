const ProviderSettings  = require('../models/ProviderSettings');
const AuthProviderRegistry = require('../providers/auth/AuthProviderRegistry');
const { CALENDAR_PROVIDERS, MEETING_PROVIDERS } = require('../config/providerRegistry');
const { isDBConnected } = require('../config/database');

// Static defaults — used when DB is unavailable or a provider has no saved record yet.
const AUTH_DEFAULTS = [
  { provider_name: 'google',    provider_type: 'auth',    is_enabled: true  },
  { provider_name: 'microsoft', provider_type: 'auth',    is_enabled: true  },
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
        { $set: { provider_type: d.provider_type, is_enabled: d.is_enabled } },
        { upsert: true }
      );
    }
    // Push DB settings into the in-memory registry
    const settings = await ProviderSettings.find({ provider_type: 'auth' }).lean();
    AuthProviderRegistry.applySettings(settings);
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
    config_json: db?.config_json || {},
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
   * Toggle a single provider on or off.
   * Body: { is_enabled: boolean }
   */
  async updateProvider(req, res) {
    const { name } = req.params;
    const { is_enabled } = req.body;

    if (typeof is_enabled !== 'boolean') {
      return res.status(400).json({ error: 'is_enabled (boolean) is required' });
    }

    if (!isDBConnected()) {
      // Apply in-memory only (won't survive restart)
      AuthProviderRegistry.setEnabled(name, is_enabled);
      return res.json({ success: true, persisted: false });
    }

    try {
      const doc = await ProviderSettings.findOneAndUpdate(
        { provider_name: name },
        { $set: { is_enabled } },
        { new: true, upsert: true }
      ).lean();

      // Sync auth registry
      if (doc.provider_type === 'auth') {
        AuthProviderRegistry.setEnabled(name, is_enabled);
      }

      res.json({ success: true, persisted: true, provider: doc });
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
