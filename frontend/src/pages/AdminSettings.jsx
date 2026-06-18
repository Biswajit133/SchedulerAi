import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminAPI, AuthAPI } from '../services/api';

// ─── Icon components ──────────────────────────────────────────────────────────

function ArrowLeftIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ShieldIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function VideoIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
}

function CalendarIcon2({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-200 ease-in-out focus:outline-none
        ${checked ? 'bg-brand-500' : 'bg-slate-700'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow
          transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
}

// ─── Provider row ──────────────────────────────────────────────────────────────

function ProviderRow({ provider, saving, onToggle, isDefault, onSetDefault, showDefault }) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-colors
        ${provider.is_enabled
          ? 'border-brand-500/20 bg-brand-500/5'
          : 'border-slate-700/40 bg-slate-800/30'
        }
      `}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${provider.available ? 'bg-emerald-500' : 'bg-slate-600'}`} />
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${provider.is_enabled ? 'text-white' : 'text-slate-400'}`}>
            {provider.label}
          </p>
          {provider.description && (
            <p className="text-xs text-slate-500 truncate">{provider.description}</p>
          )}
          {!provider.available && (
            <span className="text-xs text-amber-500/80">Implementation pending</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {showDefault && provider.is_enabled && provider.available && (
          <button
            onClick={() => onSetDefault(provider.provider_name)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              isDefault
                ? 'border-brand-500/50 text-brand-400 bg-brand-500/10'
                : 'border-slate-600/50 text-slate-500 hover:text-slate-300 hover:border-slate-500'
            }`}
          >
            {isDefault ? 'Default' : 'Set default'}
          </button>
        )}
        <Toggle
          checked={provider.is_enabled}
          onChange={(v) => onToggle(provider.provider_name, v)}
          disabled={saving === provider.provider_name}
        />
      </div>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(148, 163, 184, 0.10)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center">
            <Icon className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">{title}</h2>
            <p className="text-slate-500 text-xs">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, type }) {
  const bg = type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400'
    : type === 'success'     ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
    : 'bg-slate-800 border-slate-700 text-slate-300';
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border text-sm shadow-xl ${bg}`}>
      {message}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const navigate = useNavigate();

  const [config, setConfig]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(null);  // provider_name being saved
  const [toast, setToast]       = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Ensure user is logged in
  useEffect(() => {
    AuthAPI.getMe()
      .then((res) => {
        if (!res.authenticated) navigate('/app');
        else setAuthChecked(true);
      })
      .catch(() => navigate('/app'));
  }, [navigate]);

  const fetchConfig = useCallback(() => {
    setLoading(true);
    AdminAPI.getProviders()
      .then((res) => setConfig(res))
      .catch(() => showToast('Failed to load provider settings', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (authChecked) fetchConfig();
  }, [authChecked, fetchConfig]);

  const handleToggle = async (providerName, enabled) => {
    setSaving(providerName);
    try {
      await AdminAPI.updateProvider(providerName, enabled);
      setConfig((prev) => {
        if (!prev) return prev;
        const update = (arr) =>
          arr.map((p) => p.provider_name === providerName ? { ...p, is_enabled: enabled } : p);
        return {
          ...prev,
          authProviders:    update(prev.authProviders    || []),
          meetingProviders: update(prev.meetingProviders || []),
          calendarProviders: update(prev.calendarProviders || []),
        };
      });
      showToast(`${providerName} ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch {
      showToast(`Failed to update ${providerName}`, 'error');
    } finally {
      setSaving(null);
    }
  };

  const handleSetDefault = async (providerName) => {
    setSaving('__default');
    try {
      await AdminAPI.updateConfig({ defaultMeetingProvider: providerName });
      setConfig((prev) => prev ? { ...prev, defaultMeetingProvider: providerName } : prev);
      showToast(`Default meeting provider set to ${providerName}`, 'success');
    } catch {
      showToast('Failed to update default provider', 'error');
    } finally {
      setSaving(null);
    }
  };

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex gap-1.5 items-center">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-brand-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate('/app')}
            className="text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Dashboard
          </button>
          <span className="text-slate-700">/</span>
          <h1 className="text-white font-semibold text-sm">Admin Settings</h1>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Page header */}
        <div>
          <h2 className="text-2xl font-bold text-white">Provider Configuration</h2>
          <p className="text-slate-400 text-sm mt-1">
            Enable or disable authentication and meeting providers. Changes take effect immediately
            without restarting the server.
          </p>
        </div>

        {/* Auth providers */}
        <SectionCard
          icon={ShieldIcon}
          title="Authentication Providers"
          subtitle="Control which sign-in methods are available on the login page"
        >
          {(config?.authProviders || []).map((p) => (
            <ProviderRow
              key={p.provider_name}
              provider={p}
              saving={saving}
              onToggle={handleToggle}
              showDefault={false}
            />
          ))}
        </SectionCard>

        {/* Meeting providers */}
        <SectionCard
          icon={VideoIcon}
          title="Meeting Providers"
          subtitle="Choose which video conferencing platforms users can schedule with"
        >
          {(config?.meetingProviders || []).map((p) => (
            <ProviderRow
              key={p.provider_name}
              provider={p}
              saving={saving}
              onToggle={handleToggle}
              showDefault
              isDefault={config?.defaultMeetingProvider === p.provider_name}
              onSetDefault={handleSetDefault}
            />
          ))}
        </SectionCard>

        {/* Calendar providers */}
        <SectionCard
          icon={CalendarIcon2}
          title="Calendar Providers"
          subtitle="Calendar integrations for reading availability and creating events"
        >
          {(config?.calendarProviders || []).map((p) => (
            <ProviderRow
              key={p.provider_name}
              provider={p}
              saving={saving}
              onToggle={handleToggle}
              showDefault={false}
            />
          ))}
        </SectionCard>

        {/* Implementation guide */}
        <div className="rounded-2xl border border-slate-700/40 bg-slate-900/50 p-5">
          <h3 className="text-white font-semibold text-sm mb-3">Adding a New Provider</h3>
          <ol className="space-y-2 text-xs text-slate-400 list-decimal list-inside">
            <li>
              Create <code className="text-brand-300 bg-slate-800 px-1 rounded">backend/src/providers/auth/YourProvider.js</code> extending <code className="text-brand-300 bg-slate-800 px-1 rounded">AuthProvider</code>
            </li>
            <li>
              Register it in <code className="text-brand-300 bg-slate-800 px-1 rounded">AuthProviderRegistry.js</code> with <code className="text-brand-300 bg-slate-800 px-1 rounded">available: true</code>
            </li>
            <li>
              Add the OAuth callback route in <code className="text-brand-300 bg-slate-800 px-1 rounded">meetingRoutes.js</code>
            </li>
            <li>Enable the provider here — no other changes needed</li>
          </ol>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
