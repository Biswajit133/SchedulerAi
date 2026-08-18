const mongoose = require('mongoose');

/**
 * Persists admin-managed provider configuration.
 * One document per provider. Defaults are seeded on first admin panel load.
 *
 * provider_type: 'auth' | 'meeting' | 'calendar'
 */
const providerSettingsSchema = new mongoose.Schema(
  {
    provider_name: { type: String, required: true, unique: true, trim: true },
    provider_type: {
      type: String,
      required: true,
      enum: ['auth', 'meeting', 'calendar'],
    },
    is_enabled:  { type: Boolean, default: false },
    config_json: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

module.exports = mongoose.model('ProviderSettings', providerSettingsSchema);
