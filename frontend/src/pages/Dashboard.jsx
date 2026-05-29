import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatInterface from '../components/ChatInterface';
import AgendaCard from '../components/AgendaCard';
import StatsBar from '../components/dashboard/StatsBar';
import ToastContainer from '../components/ui/ToastContainer';
import { AuthAPI, ZoomAuthAPI } from '../services/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [auth, setAuth] = useState({ checked: false, authenticated: false, user: null });
  const [zoom, setZoom] = useState({ authenticated: false, user: null });
  const [error, setError] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [zoomConnecting, setZoomConnecting] = useState(false);
  const [zoomDisconnecting, setZoomDisconnecting] = useState(false);
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const fetchZoomStatus = () => {
    ZoomAuthAPI.getStatus()
      .then((res) => setZoom({ authenticated: res.authenticated, user: res.user }))
      .catch(() => setZoom({ authenticated: false, user: null }));
  };

  useEffect(() => {
    AuthAPI.getMe()
      .then((res) => setAuth({ checked: true, authenticated: res.authenticated, user: res.user }))
      .catch(() => setAuth({ checked: true, authenticated: false, user: null }));

    fetchZoomStatus();

    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      AuthAPI.getMe()
        .then((res) => setAuth({ checked: true, authenticated: res.authenticated, user: res.user }))
        .catch(() => {});
    } else if (params.get('auth') === 'error') {
      const reason = params.get('reason') || 'unknown error';
      showToast(`Google sign-in failed: ${reason}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('zoom_auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      fetchZoomStatus();
      showToast('Zoom connected successfully!', 'success');
    } else if (params.get('zoom_auth') === 'error') {
      const reason = params.get('reason') || 'unknown error';
      showToast(`Zoom sign-in failed: ${reason}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [showToast]);

  const handleLogin = async () => {
    try {
      const res = await AuthAPI.getGoogleAuthUrl();
      window.location.href = res.url;
    } catch {
      showToast('Google OAuth not configured. Add GOOGLE_CLIENT_ID to backend .env', 'error');
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await AuthAPI.logout();
      setAuth({ checked: true, authenticated: false, user: null });
    } catch {
      setAuth({ checked: true, authenticated: false, user: null });
    } finally {
      setLoggingOut(false);
    }
  };

  const handleConnectZoom = async () => {
    setZoomConnecting(true);
    try {
      const res = await ZoomAuthAPI.getAuthUrl();
      window.location.href = res.url;
    } catch {
      showToast('Zoom OAuth not configured. Add ZOOM_CLIENT_ID to backend .env', 'error');
      setZoomConnecting(false);
    }
  };

  const handleDisconnectZoom = async () => {
    setZoomDisconnecting(true);
    try {
      await ZoomAuthAPI.disconnect();
      setZoom({ authenticated: false, user: null });
    } catch {
      setZoom({ authenticated: false, user: null });
    } finally {
      setZoomDisconnecting(false);
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
    return <LoginScreen onLogin={handleLogin} error={error} onDismissError={() => setError(null)} onGoHome={() => navigate('/')} />;
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
            <span className="flex items-center gap-1.5 text-sm text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Calendar connected
            </span>

            {/* Zoom connection */}
            {zoom.authenticated ? (
              <div className="flex items-center gap-2 pl-3 border-l border-slate-700">
                <ZoomIcon className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-blue-400 text-sm hidden sm:block">
                  {zoom.user?.name || zoom.user?.email || 'Zoom connected'}
                </span>
                <button
                  onClick={handleDisconnectZoom}
                  disabled={zoomDisconnecting}
                  title="Disconnect Zoom"
                  className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded-lg
                    hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  {zoomDisconnecting ? '…' : '✕'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectZoom}
                disabled={zoomConnecting}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border
                  border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors
                  disabled:opacity-50 pl-3 border-l border-slate-700 ml-0"
              >
                <ZoomIcon className="w-3.5 h-3.5 shrink-0" />
                {zoomConnecting ? 'Connecting…' : 'Connect Zoom'}
              </button>
            )}
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
              <ChatInterface />
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

function LoginScreen({ onLogin, error, onDismissError, onGoHome }) {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
      <button onClick={onGoHome} className="absolute top-6 left-6 text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1.5 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </button>
      {/* Card */}
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-brand-600 flex items-center justify-center mx-auto shadow-xl shadow-brand-600/30">
            <CalendarIcon className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">SchedulerAI</h1>
            <p className="text-slate-400 text-sm mt-1">
              AI-powered meeting scheduler
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          {[
            ['Schedule meetings with plain English', '💬'],
            ['Checks your Google Calendar availability', '📅'],
            ['Sends invites automatically', '✉️'],
          ].map(([text, icon]) => (
            <div key={text} className="flex items-center gap-3 text-sm text-slate-300">
              <span className="text-base shrink-0">{icon}</span>
              {text}
            </div>
          ))}
        </div>

        {/* Sign in */}
        <div className="space-y-3">
          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100
              text-slate-900 font-semibold py-3 px-4 rounded-xl transition-colors shadow-lg
              text-sm"
          >
            <GoogleIcon />
            Continue with Google
          </button>
          <p className="text-slate-600 text-xs text-center">
            Your data stays in your Google Calendar.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3
            flex items-start justify-between gap-3">
            <p className="text-red-400 text-xs">{error}</p>
            <button onClick={onDismissError} className="text-red-500 shrink-0 text-xs">✕</button>
          </div>
        )}
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ZoomIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 8.25A3.75 3.75 0 018.25 4.5h7.5A3.75 3.75 0 0119.5 8.25v7.5a3.75 3.75 0 01-3.75 3.75h-7.5A3.75 3.75 0 014.5 15.75v-7.5zm10.5 1.125v5.25l3.75 2.25V7.125L15 9.375z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
