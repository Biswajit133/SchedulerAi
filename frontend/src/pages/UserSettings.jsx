import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthAPI, ZoomAuthAPI, TeamsAuthAPI, OutlookCalAuthAPI, IntegrationAPI } from '../services/api';

// ─── Timezone list ────────────────────────────────────────────────────────────
const TIMEZONES = [
  { value: 'Pacific/Honolulu',    label: '(UTC−10:00) Hawaii' },
  { value: 'America/Anchorage',   label: '(UTC−09:00) Alaska' },
  { value: 'America/Los_Angeles', label: '(UTC−08:00) Pacific Time – US & Canada' },
  { value: 'America/Denver',      label: '(UTC−07:00) Mountain Time – US & Canada' },
  { value: 'America/Chicago',     label: '(UTC−06:00) Central Time – US & Canada' },
  { value: 'America/New_York',    label: '(UTC−05:00) Eastern Time – US & Canada' },
  { value: 'America/Halifax',     label: '(UTC−04:00) Atlantic Time – Canada' },
  { value: 'America/Sao_Paulo',   label: '(UTC−03:00) Brasilia' },
  { value: 'Atlantic/Azores',     label: '(UTC−01:00) Azores' },
  { value: 'Europe/London',       label: '(UTC+00:00) London, Dublin, Lisbon' },
  { value: 'Europe/Paris',        label: '(UTC+01:00) Paris, Berlin, Amsterdam' },
  { value: 'Europe/Helsinki',     label: '(UTC+02:00) Helsinki, Kyiv, Tallinn' },
  { value: 'Europe/Moscow',       label: '(UTC+03:00) Moscow, St. Petersburg' },
  { value: 'Asia/Dubai',          label: '(UTC+04:00) Dubai, Abu Dhabi' },
  { value: 'Asia/Karachi',        label: '(UTC+05:00) Karachi, Islamabad' },
  { value: 'Asia/Kolkata',        label: '(UTC+05:30) Mumbai, New Delhi, Kolkata' },
  { value: 'Asia/Dhaka',          label: '(UTC+06:00) Dhaka, Almaty' },
  { value: 'Asia/Bangkok',        label: '(UTC+07:00) Bangkok, Hanoi, Jakarta' },
  { value: 'Asia/Shanghai',       label: '(UTC+08:00) Beijing, Singapore, Hong Kong' },
  { value: 'Asia/Tokyo',          label: '(UTC+09:00) Tokyo, Seoul, Osaka' },
  { value: 'Australia/Sydney',    label: '(UTC+10:00) Sydney, Melbourne' },
  { value: 'Pacific/Auckland',    label: '(UTC+12:00) Auckland, Wellington' },
];

const DURATIONS = [
  { value: 15,  label: '15 minutes' },
  { value: 30,  label: '30 minutes' },
  { value: 45,  label: '45 minutes' },
  { value: 60,  label: '1 hour' },
  { value: 90,  label: '1.5 hours' },
  { value: 120, label: '2 hours' },
];

// ─── Provider brand colors ────────────────────────────────────────────────────
const MEETING_BRAND = {
  google_meet: { dot: 'bg-teal-500',   badge: 'text-teal-400 border-teal-500/30 bg-teal-500/10' },
  zoom:        { dot: 'bg-blue-500',   badge: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  teams:       { dot: 'bg-indigo-500', badge: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/10' },
  webex:       { dot: 'bg-green-500',  badge: 'text-green-400 border-green-500/30 bg-green-500/10' },
};

const CAL_BRAND = {
  google:  { dot: 'bg-emerald-500', badge: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  outlook: { dot: 'bg-blue-500',    badge: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  apple:   { dot: 'bg-slate-400',   badge: 'text-slate-300 border-slate-500/30 bg-slate-500/10' },
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UserSettings() {
  const navigate = useNavigate();

  const [auth, setAuth]                 = useState({ checked: false, authenticated: false, user: null });
  const [integrations, setIntegrations] = useState(null);
  const [preferences, setPreferences]   = useState({ defaultMeetingProvider: '', preferredDuration: '', preferredTimezone: '' });
  const [savingPrefs, setSavingPrefs]   = useState(false);
  const [connecting, setConnecting]     = useState(null);   // provider id being connected
  const [disconnecting, setDisconnecting] = useState(null);
  const [toast, setToast]               = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Auth check
  useEffect(() => {
    AuthAPI.getMe()
      .then((res) => {
        if (!res.authenticated) navigate('/app');
        else setAuth({ checked: true, authenticated: true, user: res.user });
      })
      .catch(() => navigate('/app'));
  }, [navigate]);

  // Handle OAuth return params (?zoom_auth=success, ?teams_auth=success, etc.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoom_auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Zoom connected successfully!', 'success');
    } else if (params.get('zoom_auth') === 'error') {
      showToast(`Zoom connection failed: ${params.get('reason') || 'unknown'}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('teams_auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Microsoft Teams connected successfully!', 'success');
    } else if (params.get('teams_auth') === 'error') {
      showToast(`Teams connection failed: ${params.get('reason') || 'unknown'}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('outlook_auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      showToast('Outlook Calendar connected successfully!', 'success');
    } else if (params.get('outlook_auth') === 'error') {
      showToast(`Outlook Calendar connection failed: ${params.get('reason') || 'unknown'}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [showToast]);

  const fetchIntegrations = useCallback(() => {
    IntegrationAPI.getConnected()
      .then((res) => {
        setIntegrations(res);
        const prefs = res.preferences || {};
        setPreferences({
          defaultMeetingProvider: prefs.defaultMeetingProvider || res.defaultMeetingProvider || '',
          preferredDuration:      prefs.preferredDuration      ? String(prefs.preferredDuration) : '',
          preferredTimezone:      prefs.preferredTimezone      || Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        });
      })
      .catch(() => showToast('Could not load integrations.', 'error'));
  }, [showToast]);

  useEffect(() => {
    if (auth.checked && auth.authenticated) fetchIntegrations();
  }, [auth.checked, auth.authenticated, fetchIntegrations]);

  const handleConnect = async (providerId) => {
    setConnecting(providerId);
    // Remember to return here after OAuth redirect
    sessionStorage.setItem('authReturnTo', '/settings');
    try {
      if (providerId === 'zoom') {
        const res = await ZoomAuthAPI.getAuthUrl();
        window.location.href = res.url;
      } else if (providerId === 'teams') {
        const res = await TeamsAuthAPI.getAuthUrl();
        window.location.href = res.url;
      } else {
        showToast(`${providerId} OAuth is not yet configured.`, 'info');
        sessionStorage.removeItem('authReturnTo');
        setConnecting(null);
      }
    } catch {
      showToast(`Could not start ${providerId} connection. Check your server config.`, 'error');
      sessionStorage.removeItem('authReturnTo');
      setConnecting(null);
    }
  };

  const handleDisconnect = async (providerId, label) => {
    if (!window.confirm(`Disconnect ${label}? You can reconnect anytime.`)) return;
    setDisconnecting(providerId);
    try {
      if (providerId === 'zoom')  await ZoomAuthAPI.disconnect();
      if (providerId === 'teams') await TeamsAuthAPI.disconnect();
      fetchIntegrations();
      showToast(`${label} disconnected.`, 'success');
    } catch {
      showToast(`Failed to disconnect ${label}.`, 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleReconnectCalendar = () => {
    sessionStorage.setItem('authReturnTo', '/settings');
    AuthAPI.getGoogleAuthUrl()
      .then((res) => { window.location.href = res.url; })
      .catch(() => showToast('Could not start Google reconnect.', 'error'));
  };

  const handleConnectCalendar = async (providerId) => {
    setConnecting(providerId);
    sessionStorage.setItem('authReturnTo', '/settings');
    try {
      if (providerId === 'outlook') {
        const res = await OutlookCalAuthAPI.getAuthUrl();
        window.location.href = res.url;
      } else {
        showToast(`${providerId} calendar OAuth is not yet configured.`, 'info');
        sessionStorage.removeItem('authReturnTo');
        setConnecting(null);
      }
    } catch {
      showToast(`Could not start ${providerId} calendar connection. Check your server config.`, 'error');
      sessionStorage.removeItem('authReturnTo');
      setConnecting(null);
    }
  };

  const handleDisconnectCalendar = async (providerId, label) => {
    if (!window.confirm(`Disconnect ${label}? You can reconnect anytime.`)) return;
    setDisconnecting(providerId);
    try {
      if (providerId === 'outlook') await OutlookCalAuthAPI.disconnect();
      fetchIntegrations();
      showToast(`${label} disconnected.`, 'success');
    } catch {
      showToast(`Failed to disconnect ${label}.`, 'error');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      const payload = {};
      if (preferences.defaultMeetingProvider !== undefined)
        payload.defaultMeetingProvider = preferences.defaultMeetingProvider || null;
      if (preferences.preferredDuration !== '')
        payload.preferredDuration = Number(preferences.preferredDuration);
      if (preferences.preferredTimezone)
        payload.preferredTimezone = preferences.preferredTimezone;
      await IntegrationAPI.updatePreferences(payload);
      showToast('Preferences saved.', 'success');
    } catch {
      showToast('Failed to save preferences.', 'error');
    } finally {
      setSavingPrefs(false);
    }
  };

  if (!auth.checked || !integrations) return <LoadingScreen />;

  const calProviders  = (integrations.calendarProviders || []);
  const meetProviders = (integrations.meetingProviders  || []).filter((p) => p.available);
  const connectedMeet = meetProviders.filter((p) => p.connected);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate('/app')}
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Dashboard
          </button>
          <span className="text-slate-700">/</span>
          <span className="text-white font-semibold text-sm">Settings</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-5">
        {/* Page header */}
        <div>
          <h2 className="text-2xl font-bold text-white">Account & Integrations</h2>
          <p className="text-slate-400 text-sm mt-1">
            Manage your connected calendars, meeting apps, and scheduling preferences.
          </p>
        </div>

        {/* ── Profile ── */}
        <SectionCard icon={UserIcon} title="Profile" subtitle="Your account information">
          <div className="flex items-center gap-4 py-1">
            {auth.user.picture ? (
              <img
                src={auth.user.picture}
                alt={auth.user.name}
                className="w-14 h-14 rounded-full border-2 border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-brand-600/30 border-2 border-brand-500/40
                flex items-center justify-center text-xl font-bold text-brand-300 shrink-0">
                {(auth.user.name || auth.user.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{auth.user.name || 'No name set'}</p>
              <p className="text-slate-400 text-sm truncate">{auth.user.email}</p>
              <span className="inline-flex items-center gap-1.5 mt-1.5 text-xs px-2.5 py-0.5 rounded-full
                border border-slate-600 bg-slate-800/60 text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Signed in with {auth.user.authProvider === 'microsoft' ? 'Microsoft' : 'Google'}
              </span>
            </div>
          </div>
        </SectionCard>

        {/* ── Calendar Connections ── */}
        <SectionCard icon={CalendarIcon} title="Calendar Connections"
          subtitle="Read your availability and create events">
          <div className="space-y-2">
            {calProviders.map((p) => {
              const brand = CAL_BRAND[p.id] || CAL_BRAND.outlook;
              const isGoogleUser = auth.user.authProvider !== 'microsoft';

              if (!p.available) {
                return (
                  <ProviderRow key={p.id}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                      <span className="text-sm text-slate-500">{p.label}</span>
                    </div>
                    <ComingSoonBadge />
                  </ProviderRow>
                );
              }

              if (p.connected) {
                return (
                  <ProviderRow key={p.id} active>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${brand.dot}`} />
                      <span className="text-sm text-white font-medium">{p.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${brand.badge}`}>Connected</span>
                      {p.id === 'google' && isGoogleUser && (
                        <button
                          onClick={handleReconnectCalendar}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                          title="Re-authorize if your calendar access has expired"
                        >
                          Reconnect
                        </button>
                      )}
                      {p.id === 'outlook' && (
                        <button
                          onClick={() => handleDisconnectCalendar('outlook', p.label)}
                          disabled={disconnecting === 'outlook'}
                          className="text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          {disconnecting === 'outlook' ? 'Removing…' : 'Disconnect'}
                        </button>
                      )}
                    </div>
                  </ProviderRow>
                );
              }

              // Not connected, available
              return (
                <ProviderRow key={p.id}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                    <div>
                      <span className="text-sm text-slate-400">{p.label}</span>
                      {p.id === 'google' && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          Sign in with Google to connect this calendar
                        </p>
                      )}
                      {p.id === 'outlook' && (
                        <p className="text-xs text-slate-600 mt-0.5">
                          Read and create events on your Outlook Calendar
                        </p>
                      )}
                    </div>
                  </div>
                  {p.id === 'google' && (
                    <button
                      onClick={handleReconnectCalendar}
                      className="text-xs bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Connect
                    </button>
                  )}
                  {p.id === 'outlook' && (
                    <button
                      onClick={() => handleConnectCalendar('outlook')}
                      disabled={!!connecting}
                      className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {connecting === 'outlook' ? 'Redirecting…' : 'Connect'}
                    </button>
                  )}
                </ProviderRow>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Meeting Platforms ── */}
        <SectionCard icon={VideoIcon} title="Meeting Platforms"
          subtitle="Connect video apps to generate meeting links automatically">
          <div className="space-y-2">
            {meetProviders.map((p) => {
              const brand = MEETING_BRAND[p.id] || MEETING_BRAND.zoom;
              const isConnecting   = connecting    === p.id;
              const isDisconnecting = disconnecting === p.id;
              const busy = !!connecting || !!disconnecting;

              // Google Meet — no OAuth button, piggybacks on Google Calendar
              if (p.id === 'google_meet') {
                return (
                  <ProviderRow key={p.id} active={p.connected}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${p.connected ? brand.dot : 'bg-slate-600'}`} />
                        <span className={`text-sm font-medium ${p.connected ? 'text-white' : 'text-slate-400'}`}>
                          {p.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 ml-4">Auto-enabled with Google Calendar</p>
                    </div>
                    {p.connected
                      ? <span className={`text-xs px-2 py-0.5 rounded-full border ${brand.badge}`}>Active</span>
                      : <span className="text-xs text-slate-600">Requires Google Calendar</span>
                    }
                  </ProviderRow>
                );
              }

              if (p.connected) {
                return (
                  <ProviderRow key={p.id} active>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${brand.dot}`} />
                      <span className="text-sm text-white font-medium">{p.label}</span>
                      {p.description && (
                        <span className="text-xs text-slate-500 hidden sm:inline">— {p.description}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${brand.badge}`}>Connected</span>
                      <button
                        onClick={() => handleDisconnect(p.id, p.label)}
                        disabled={isDisconnecting || busy}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        {isDisconnecting ? 'Removing…' : 'Disconnect'}
                      </button>
                    </div>
                  </ProviderRow>
                );
              }

              return (
                <ProviderRow key={p.id}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                      <span className="text-sm text-slate-400">{p.label}</span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-slate-600 mt-0.5 ml-4">{p.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleConnect(p.id)}
                    disabled={isConnecting || busy}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50
                      ${brand.badge} hover:opacity-80`}
                  >
                    {isConnecting ? 'Redirecting…' : `+ Connect`}
                  </button>
                </ProviderRow>
              );
            })}
          </div>
        </SectionCard>

        {/* ── Preferences ── */}
        <SectionCard icon={SlidersIcon} title="Preferences"
          subtitle="Default values used when scheduling a meeting">
          <div className="space-y-4 pt-1">
            {/* Default meeting provider */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Default meeting platform
              </label>
              <select
                value={preferences.defaultMeetingProvider}
                onChange={(e) => setPreferences((p) => ({ ...p, defaultMeetingProvider: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg
                  px-3 py-2.5 focus:outline-none focus:border-brand-500 transition-colors"
              >
                <option value="">Auto — use first connected platform</option>
                {connectedMeet.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
              {connectedMeet.length === 0 && (
                <p className="text-xs text-slate-600 mt-1">Connect a meeting platform above to set a default.</p>
              )}
            </div>

            {/* Preferred duration */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Preferred meeting duration
              </label>
              <select
                value={preferences.preferredDuration}
                onChange={(e) => setPreferences((p) => ({ ...p, preferredDuration: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg
                  px-3 py-2.5 focus:outline-none focus:border-brand-500 transition-colors"
              >
                <option value="">No preference — let AI decide</option>
                {DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Timezone */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Your timezone
              </label>
              <select
                value={preferences.preferredTimezone}
                onChange={(e) => setPreferences((p) => ({ ...p, preferredTimezone: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-lg
                  px-3 py-2.5 focus:outline-none focus:border-brand-500 transition-colors"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold
                py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 mt-2"
            >
              {savingPrefs ? 'Saving…' : 'Save Preferences'}
            </button>
          </div>
        </SectionCard>

        {/* ── Admin link (admins only) ── */}
        {auth.user?.isAdmin && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4
            flex items-center justify-between gap-4">
            <div>
              <p className="text-amber-300 text-sm font-semibold">Admin Settings</p>
              <p className="text-slate-500 text-xs mt-0.5">
                Enable / disable providers globally for all users
              </p>
            </div>
            <button
              onClick={() => navigate('/admin')}
              className="shrink-0 text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-300
                border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              Open Admin →
            </button>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingScreen() {
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

function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(148, 163, 184, 0.10)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      <div className="px-5 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600/20 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-brand-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm">{title}</h2>
            <p className="text-slate-500 text-xs">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ProviderRow({ children, active }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors
      ${active
        ? 'border-slate-700/60 bg-slate-800/40'
        : 'border-slate-700/30 bg-slate-800/20'
      }`}
    >
      {children}
    </div>
  );
}

function ComingSoonBadge() {
  return (
    <span className="text-xs text-slate-600 border border-slate-700/50 bg-slate-800/40 px-2 py-0.5 rounded-full">
      Coming soon
    </span>
  );
}

function Toast({ message, type }) {
  const style =
    type === 'error'   ? 'bg-red-500/10 border-red-500/30 text-red-400'
    : type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
    : 'bg-slate-800 border-slate-700 text-slate-300';
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border text-sm shadow-xl max-w-xs ${style}`}>
      {message}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ArrowLeftIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function UserIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
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

function SlidersIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
    </svg>
  );
}
