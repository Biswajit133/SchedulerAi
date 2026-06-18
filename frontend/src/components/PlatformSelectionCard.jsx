import React, { useState } from 'react';

// Visual config per provider id — extend when new providers are added
const PROVIDER_STYLE = {
  google_meet: {
    accent: 'from-teal-500/20 to-green-500/20',
    border: 'border-teal-500/30 hover:border-teal-400/60',
    glow: 'hover:shadow-teal-500/10',
    badgeColor: 'text-teal-400',
    icon: GoogleMeetIcon,
  },
  zoom: {
    accent: 'from-blue-600/20 to-blue-400/20',
    border: 'border-blue-400/30 hover:border-blue-300/60',
    glow: 'hover:shadow-blue-400/10',
    badgeColor: 'text-blue-300',
    icon: ZoomIcon,
  },
  teams: {
    accent: 'from-indigo-500/20 to-violet-500/20',
    border: 'border-indigo-400/30 hover:border-indigo-300/60',
    glow: 'hover:shadow-indigo-400/10',
    badgeColor: 'text-indigo-300',
    icon: TeamsIcon,
  },
  webex: {
    accent: 'from-green-600/20 to-emerald-500/20',
    border: 'border-green-400/30 hover:border-green-300/60',
    glow: 'hover:shadow-green-400/10',
    badgeColor: 'text-green-300',
    icon: WebexIcon,
  },
};

const DEFAULT_STYLE = {
  accent: 'from-slate-600/20 to-slate-500/20',
  border: 'border-slate-500/30 hover:border-slate-400/60',
  glow: 'hover:shadow-slate-400/10',
  badgeColor: 'text-slate-300',
  icon: GenericVideoIcon,
};

// platforms: array of { id, label, description, connected }
// defaultProvider: id of the user's saved default provider (shown as a badge)
// onSelect: (platformId, platformLabel) => void
export default function PlatformSelectionCard({ platforms = [], defaultProvider = null, onSelect }) {
  const [hovered, setHovered] = useState(null);

  // Show connected providers first, then default at top among connected
  const sorted = [...platforms].sort((a, b) => {
    if (a.connected !== b.connected) return b.connected ? 1 : -1;
    if (a.id === defaultProvider) return -1;
    if (b.id === defaultProvider) return 1;
    return 0;
  });

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center">
            <VideoIcon className="w-3 h-3 text-brand-400" />
          </div>
          <p className="text-slate-200 text-sm font-semibold">Choose Meeting Platform</p>
        </div>
        <p className="text-slate-500 text-xs mt-0.5 pl-7">
          Select a connected provider below
        </p>
      </div>

      {/* Platform cards */}
      <div className="p-3 space-y-2">
        {sorted.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-4">
            No meeting providers connected yet.
          </p>
        )}
        {sorted.map((p) => {
          const style = PROVIDER_STYLE[p.id] || DEFAULT_STYLE;
          const Icon = style.icon;
          const disabled = !p.connected;

          return (
            <button
              key={p.id}
              onClick={() => !disabled && onSelect(p.id, p.label)}
              onMouseEnter={() => !disabled && setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              disabled={disabled}
              className={`
                w-full flex items-center gap-4 px-4 py-3.5 rounded-xl
                border transition-all duration-200 text-left group relative overflow-hidden
                ${disabled
                  ? 'opacity-40 cursor-not-allowed border-slate-700/40'
                  : `${style.border} hover:shadow-lg ${style.glow} cursor-pointer`}
              `}
              style={{
                background:
                  !disabled && hovered === p.id
                    ? 'rgba(30, 41, 59, 0.9)'
                    : 'rgba(15, 23, 42, 0.5)',
              }}
            >
              {/* Gradient shimmer on hover */}
              {!disabled && (
                <div
                  className={`absolute inset-0 bg-gradient-to-r ${style.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none`}
                />
              )}

              {/* Icon */}
              <div className="relative shrink-0 w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                <Icon className="w-5 h-5" />
              </div>

              {/* Text */}
              <div className="relative flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-semibold text-sm ${disabled ? 'text-slate-500' : style.badgeColor} group-hover:brightness-110 transition-all`}>
                    {p.label}
                  </p>
                  {!disabled && p.id === defaultProvider && (
                    <span className="text-xs bg-brand-500/20 text-brand-400 border border-brand-500/30 px-1.5 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                  {disabled && (
                    <span className="text-xs bg-slate-700/60 text-slate-500 px-1.5 py-0.5 rounded-full">
                      Not connected
                    </span>
                  )}
                  {!disabled && p.warning && (
                    <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded-full">
                      Personal account
                    </span>
                  )}
                </div>
                {p.warning ? (
                  <p className="text-yellow-500/70 text-xs mt-0.5">{p.warning}</p>
                ) : p.description ? (
                  <p className="text-slate-500 text-xs mt-0.5 group-hover:text-slate-400 transition-colors">
                    {p.description}
                  </p>
                ) : null}
              </div>

              {/* Arrow */}
              {!disabled && (
                <div className="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <ChevronRightIcon className="w-4 h-4 text-slate-400" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-slate-600 text-xs text-center pb-3">Click to select a platform</p>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function VideoIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
}

function ChevronRightIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function GoogleMeetIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="8" width="14" height="8" rx="2" fill="#00897B" opacity="0.9" />
      <path d="M16 10.5l5-3.5v10l-5-3.5V10.5z" fill="#00BCD4" opacity="0.9" />
      <circle cx="9" cy="12" r="2.2" fill="white" opacity="0.9" />
    </svg>
  );
}

function ZoomIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="12" rx="3" fill="#2D8CFF" opacity="0.9" />
      <path d="M14 9.5v5l4.5-2.5L14 9.5z" fill="white" opacity="0.95" />
      <rect x="5" y="10.5" width="7" height="3" rx="1" fill="white" opacity="0.95" />
    </svg>
  );
}

function TeamsIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="5" width="20" height="14" rx="3" fill="#5059C9" opacity="0.9" />
      <circle cx="15" cy="9" r="2" fill="white" opacity="0.8" />
      <rect x="10" y="12" width="10" height="4" rx="1" fill="white" opacity="0.8" />
      <circle cx="7" cy="10" r="2.5" fill="#7B83EB" opacity="0.95" />
      <rect x="3" y="13" width="8" height="4" rx="1" fill="white" opacity="0.9" />
    </svg>
  );
}

function WebexIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="6" width="20" height="12" rx="3" fill="#00BEF2" opacity="0.9" />
      <text x="5" y="16" fontSize="8" fontWeight="bold" fill="white" opacity="0.95">Webex</text>
    </svg>
  );
}

function GenericVideoIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  );
}
