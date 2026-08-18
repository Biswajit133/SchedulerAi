import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatInterface from '../components/ChatInterface';
import AgendaCard from '../components/AgendaCard';
import StatsBar from '../components/dashboard/StatsBar';
import ToastContainer from '../components/ui/ToastContainer';
import SignInCard from '../components/SignInCard';
import { AuthAPI, ZoomAuthAPI, TeamsAuthAPI, IntegrationAPI } from '../services/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState({ checked: false, authenticated: false, user: null });
  const [integrations, setIntegrations] = useState(null); // full summary from GET /api/integrations
  const [error, setError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState(null); // provider id being connected
  const [disconnectingProvider, setDisconnectingProvider] = useState(null);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchIntegrations = useCallback(() => {
    IntegrationAPI.getConnected()
      .then((res) => setIntegrations(res))
      .catch(() => setIntegrations(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    AuthAPI.getMe()
      .then((res) => setAuth({ checked: true, authenticated: res.authenticated, user: res.user }))
      .catch(() => setAuth({ checked: true, authenticated: false, user: null }));
    fetchIntegrations();

    // After any OAuth callback, check if the user came from /settings and redirect back
    const returnTo = sessionStorage.getItem('authReturnTo');

    if (params.get('auth') === 'error') {
      const reason = params.get('reason') || 'unknown error';
      showToast(`Sign-in failed: ${reason}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('zoom_auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      fetchIntegrations();
      if (returnTo) { sessionStorage.removeItem('authReturnTo'); navigate(returnTo); return; }
      showToast('Zoom connected successfully!', 'success');
    } else if (params.get('zoom_auth') === 'error') {
      const reason = params.get('reason') || 'unknown error';
      showToast(`Zoom connection failed: ${reason}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
      if (returnTo) { sessionStorage.removeItem('authReturnTo'); navigate(returnTo); return; }
    } else if (params.get('teams_auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      fetchIntegrations();
      if (returnTo) { sessionStorage.removeItem('authReturnTo'); navigate(returnTo); return; }
      showToast('Microsoft Teams connected successfully!', 'success');
    } else if (params.get('teams_auth') === 'error') {
      const reason = params.get('reason') || 'unknown error';
      showToast(`Teams connection failed: ${reason}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
      if (returnTo) { sessionStorage.removeItem('authReturnTo'); navigate(returnTo); return; }
    }
  }, [showToast, fetchIntegrations, navigate]);

  // Called from LoginScreen — routes to the correct OAuth URL for the chosen provider.
  // Re-throws on failure so LoginScreen can reset its loading state.
  const handleSignIn = async (providerId) => {
    if (providerId === 'google') {
      try {
        const res = await AuthAPI.getGoogleAuthUrl();
        window.location.href = res.url;
      } catch (err) {
        showToast('Could not connect to the sign-in service. Please try again.', 'error');
        throw err;
      }
    } else if (providerId === 'microsoft') {
      try {
        const res = await AuthAPI.getMicrosoftAuthUrl();
        window.location.href = res.url;
      } catch (err) {
        showToast('Could not connect to Microsoft. Please try again.', 'error');
        throw err;
      }
    } else {
      showToast(`${providerId} sign-in is not yet implemented.`, 'info');
      throw new Error('not-implemented');
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await AuthAPI.logout();
      setAuth({ checked: true, authenticated: false, user: null });
      setIntegrations(null);
    } catch {
      setAuth({ checked: true, authenticated: false, user: null });
    } finally {
      setLoggingOut(false);
    }
  };

  // Connect a meeting integration by provider id
  const handleConnect = async (providerId) => {
    setConnectingProvider(providerId);
    try {
      if (providerId === 'zoom') {
        const res = await ZoomAuthAPI.getAuthUrl();
        window.location.href = res.url;
      } else if (providerId === 'teams') {
        const res = await TeamsAuthAPI.getAuthUrl();
        window.location.href = res.url;
      } else {
        showToast(`${providerId} OAuth is not yet implemented.`, 'info');
        setConnectingProvider(null);
      }
    } catch {
      showToast(`${providerId} OAuth not configured.`, 'error');
      setConnectingProvider(null);
    }
  };

  // Disconnect a meeting integration by provider id
  const handleDisconnect = async (providerId) => {
    const label = integrations?.meetingProviders?.find((p) => p.id === providerId)?.label || providerId;
    const confirmed = window.confirm(
      `Disconnect ${label}?\n\nThis will remove your saved tokens. You can reconnect anytime.`
    );
    if (!confirmed) return;

    setDisconnectingProvider(providerId);
    try {
      if (providerId === 'zoom') {
        await ZoomAuthAPI.disconnect();
      } else if (providerId === 'teams') {
        await TeamsAuthAPI.disconnect();
      }
      fetchIntegrations();
    } catch {
      fetchIntegrations();
    } finally {
      setDisconnectingProvider(null);
    }
  };

  if (!auth.checked) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="flex gap-1.5 items-center">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-brand-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!auth.authenticated) {
    return <LoginScreen onSignIn={handleSignIn} error={error} onDismissError={() => setError(null)} onGoHome={() => navigate('/')} />;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* ── Navbar ── */}
      <nav className="shrink-0 border-b border-slate-800 bg-slate-950/90 backdrop-blur z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <CalendarIcon className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">SchedulerAI</span>
          </div>

          {/* User + logout */}
          <div className="flex items-center gap-3">
            {/* Dynamic integration pills */}
            <IntegrationPills
              integrations={integrations}
              connectingProvider={connectingProvider}
              disconnectingProvider={disconnectingProvider}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />

            {auth.user && (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-700">
                {auth.user.picture ? (
                  <img
                    src={auth.user.picture}
                    alt={auth.user.name}
                    className="w-7 h-7 rounded-full border border-slate-600"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-brand-600/30 border border-brand-500/40
                    flex items-center justify-center text-xs font-bold text-brand-300">
                    {(auth.user.name || auth.user.email || '?')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-slate-300 text-sm hidden sm:block truncate max-w-[140px]">
                  {auth.user.name || auth.user.email}
                </span>
              </div>
            )}
            <button
              onClick={() => navigate('/settings')}
              className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg
                bg-slate-800 hover:bg-slate-700 transition-colors"
              title="Account & Integrations"
            >
              Settings
            </button>
            {auth.user?.isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="text-amber-500/80 hover:text-amber-400 text-xs px-3 py-1.5 rounded-lg
                  bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-colors"
                title="Admin Settings"
              >
                Admin
              </button>
            )}
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="text-slate-400 hover:text-white text-xs px-3 py-1.5 rounded-lg
                bg-slate-800 hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Main layout ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
          <StatsBar />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ height: 'calc(100vh - 13rem)' }}>
            <div className="lg:col-span-2 h-full min-h-0">
              <ChatInterface onShowToast={showToast} />
            </div>
            <div className="lg:col-span-1 overflow-y-auto space-y-4 pb-4">
              <AgendaCard />
              <TipsCard />
            </div>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onSignIn, error, onDismissError, onGoHome }) {
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async (providerId) => {
    setSigningIn(true);
    try {
      await onSignIn(providerId);
      // On success, onSignIn sets window.location.href so the page navigates away.
      // Keep spinner active so the button stays locked during the redirect.
    } catch {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
      <button
        onClick={onGoHome}
        className="absolute top-6 left-6 text-slate-500 hover:text-slate-300 text-sm
          flex items-center gap-1.5 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </button>

      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto shadow-xl shadow-brand-600/30">
            <CalendarIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">SchedulerAI</h1>
            <p className="text-slate-400 text-sm mt-1">Sign in to schedule your first meeting</p>
          </div>
        </div>

        {/* Features list */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          {[
            ['Schedule meetings with plain English', '💬'],
            ['Reads your calendar availability live', '📅'],
            ['Sends invites automatically', '✉️'],
            ['Supports Google Meet, Zoom & more', '🎥'],
          ].map(([text, icon]) => (
            <div key={text} className="flex items-center gap-3 text-sm text-slate-300">
              <span className="text-base shrink-0">{icon}</span>
              {text}
            </div>
          ))}
        </div>

        {/* Multi-provider sign-in */}
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wider text-center mb-4 font-semibold">
            Choose sign-in method
          </p>
          <SignInCard onSignIn={handleSignIn} loading={signingIn} />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3
            flex items-start justify-between gap-3">
            <p className="text-red-400 text-xs">{error}</p>
            <button onClick={onDismissError} className="text-red-500 shrink-0 text-xs">✕</button>
          </div>
        )}

        <p className="text-slate-600 text-xs text-center">
          Your calendar data stays in your account. We never store meeting content.
        </p>
      </div>
    </div>
  );
}

// ─── Tips card ────────────────────────────────────────────────────────────────

function TipsCard() {
  const tips = [
    'Say "urgent" or "critical" for high-priority detection',
    '"Tomorrow afternoon" sets the date and time automatically',
    '"Friday evening" resolves to next Friday at 5 PM',
    'Paste raw meeting notes — AI extracts everything',
    'If a slot is busy, AI suggests the nearest alternatives',
  ];

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-white mb-3">Tips</h3>
      <ul className="space-y-2">
        {tips.map((tip, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
            <span className="text-brand-400 shrink-0 mt-0.5">›</span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Integration pills (navbar) ───────────────────────────────────────────────
// Shows a pill for each AVAILABLE meeting provider: connected = full color, else "Connect X" button.
// Unimplemented providers (available: false) are not shown in the navbar.

const PILL_STYLE = {
  google_meet: { color: 'text-teal-400', border: 'border-teal-500/30', dot: 'bg-teal-500' },
  zoom:        { color: 'text-blue-400',  border: 'border-blue-500/30',  dot: 'bg-blue-500' },
  teams:       { color: 'text-indigo-400', border: 'border-indigo-500/30', dot: 'bg-indigo-500' },
  webex:       { color: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-500' },
};

function IntegrationPills({ integrations, connectingProvider, disconnectingProvider, onConnect, onDisconnect }) {
  if (!integrations) return null;

  // Always show the calendar connection status
  const calConnected = integrations.calendarProviders?.some((p) => p.connected);
  const calLabel = integrations.calendarProviders?.find((p) => p.connected)?.label || 'Calendar';

  // Only show available (implemented) meeting providers
  const meetingProviders = (integrations.meetingProviders || []).filter((p) => p.available);

  return (
    <div className="flex items-center gap-2">
      {/* Calendar status pill */}
      {calConnected && (
        <span className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {calLabel}
        </span>
      )}

      <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-700">
        {meetingProviders.map((p) => {
          const s = PILL_STYLE[p.id] || PILL_STYLE.zoom;
          const isConnecting = connectingProvider === p.id;
          const isDisconnecting = disconnectingProvider === p.id;

          if (p.connected) {
            return (
              <div key={p.id} className={`flex items-center gap-1.5 text-xs ${s.color} border ${s.border} px-2 py-1 rounded-full`}>
                <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                <span className="hidden md:inline">{p.label}</span>
                <button
                  onClick={() => onDisconnect(p.id)}
                  disabled={isDisconnecting}
                  title={`Disconnect ${p.label}`}
                  className="ml-0.5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40 leading-none"
                >
                  {isDisconnecting ? '…' : '✕'}
                </button>
              </div>
            );
          }

          // Google Meet doesn't have its own connect button (piggybacks Google Calendar)
          if (p.id === 'google_meet') return null;

          return (
            <button
              key={p.id}
              onClick={() => onConnect(p.id)}
              disabled={!!connectingProvider}
              className={`flex items-center gap-1.5 text-xs ${s.color} border ${s.border}
                px-2.5 py-1 rounded-full hover:bg-slate-800 transition-colors disabled:opacity-50`}
            >
              {isConnecting ? 'Connecting…' : `+ ${p.label}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

