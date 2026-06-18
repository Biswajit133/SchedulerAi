import React, { useState, useEffect } from 'react';
import { AuthAPI } from '../services/api';

// Visual config per provider id.
const PROVIDER_CONFIG = {
  google: {
    icon: GoogleIcon,
    label: 'Continue with Google',
    style: {
      bg: 'bg-white hover:bg-slate-100',
      text: 'text-slate-900',
      border: 'border-transparent',
    },
    activeBg: 'bg-white',
  },
  microsoft: {
    icon: MicrosoftIcon,
    label: 'Continue with Microsoft',
    style: {
      bg: 'bg-[#2f2f2f] hover:bg-[#3a3a3a]',
      text: 'text-white',
      border: 'border-slate-600/40',
    },
  },
  github: {
    icon: GithubIcon,
    label: 'Continue with GitHub',
    style: {
      bg: 'bg-[#24292e] hover:bg-[#2f363d]',
      text: 'text-white',
      border: 'border-slate-600/40',
    },
  },
  linkedin: {
    icon: LinkedinIcon,
    label: 'Continue with LinkedIn',
    style: {
      bg: 'bg-[#0077b5] hover:bg-[#006097]',
      text: 'text-white',
      border: 'border-transparent',
    },
  },
  email: {
    icon: EmailIcon,
    label: 'Continue with Email',
    style: {
      bg: 'bg-slate-800 hover:bg-slate-700',
      text: 'text-white',
      border: 'border-slate-600/50',
    },
  },
};

const DISABLED_STYLE = {
  bg: 'bg-slate-800/50',
  text: 'text-slate-500',
  border: 'border-slate-700/40',
};

/**
 * onSignIn(providerId) — called when user clicks an available + enabled provider.
 * Providers are fetched from GET /api/auth/providers so the admin panel controls what's shown.
 */
export default function SignInCard({ onSignIn, loading = false }) {
  const [providers, setProviders] = useState(null);
  const [hovered, setHovered]     = useState(null);

  useEffect(() => {
    AuthAPI.getProviders()
      .then((res) => setProviders(res.providers || []))
      .catch(() => {
        // Fallback: show only Google so the app still works if the endpoint is down.
        setProviders([{ id: 'google', label: 'Google', available: true, enabled: true }]);
      });
  }, []);

  if (!providers) {
    return (
      <div className="flex justify-center py-6">
        <div className="flex gap-1.5 items-center">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {providers.map((p) => {
        const config  = PROVIDER_CONFIG[p.id];
        const isReady = p.available && p.enabled;   // available = implemented, enabled = turned on by admin
        const style   = isReady ? (config?.style || DISABLED_STYLE) : DISABLED_STYLE;
        const Icon    = config?.icon || GenericIcon;
        const label   = config?.label || `Continue with ${p.label}`;

        if (!isReady) {
          return (
            <div
              key={p.id}
              className={`
                w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl
                border ${style.border} ${style.bg} ${style.text}
                text-sm font-medium cursor-not-allowed select-none
              `}
            >
              <Icon />
              <span>{label}</span>
              <span className="ml-auto text-xs bg-slate-700/60 text-slate-500 px-2 py-0.5 rounded-full">
                {!p.available ? 'Coming soon' : 'Disabled'}
              </span>
            </div>
          );
        }

        return (
          <button
            key={p.id}
            onClick={() => !loading && onSignIn(p.id)}
            disabled={loading}
            onMouseEnter={() => setHovered(p.id)}
            onMouseLeave={() => setHovered(null)}
            className={`
              w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl
              border ${style.border} ${style.bg} ${style.text}
              text-sm font-semibold transition-all duration-150 shadow-lg
              disabled:opacity-60 disabled:cursor-not-allowed
            `}
          >
            <Icon />
            {loading && hovered === p.id ? 'Redirecting…' : label}
          </button>
        );
      })}

      <p className="text-slate-600 text-xs text-center pt-1">
        More sign-in options coming soon
      </p>
    </div>
  );
}

// ─── Provider Icons ───────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
      <rect x="2"    y="2"    width="9.5" height="9.5" fill="#F25022" />
      <rect x="12.5" y="2"    width="9.5" height="9.5" fill="#7FBA00" />
      <rect x="2"    y="12.5" width="9.5" height="9.5" fill="#00A4EF" />
      <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  );
}

function LinkedinIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function GenericIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
