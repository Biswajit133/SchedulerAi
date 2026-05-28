import React, { useState } from 'react';

const PLATFORMS = [
  {
    id: 'google_meet',
    label: 'Google Meet',
    description: 'Free, built into Google Calendar',
    icon: GoogleMeetIcon,
    accent: 'from-blue-500/20 to-green-500/20',
    border: 'border-blue-500/30 hover:border-blue-400/60',
    glow: 'hover:shadow-blue-500/10',
    badgeColor: 'text-blue-400',
  },
  {
    id: 'zoom',
    label: 'Zoom',
    description: 'Dedicated Zoom meeting link',
    icon: ZoomIcon,
    accent: 'from-blue-600/20 to-blue-400/20',
    border: 'border-blue-400/30 hover:border-blue-300/60',
    glow: 'hover:shadow-blue-400/10',
    badgeColor: 'text-blue-300',
  },
];

export default function PlatformSelectionCard({ onSelect }) {
  const [hovered, setHovered] = useState(null);

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
          A Google Calendar invite will be sent regardless of choice
        </p>
      </div>

      {/* Platform cards */}
      <div className="p-3 space-y-2">
        {PLATFORMS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              onMouseEnter={() => setHovered(p.id)}
              onMouseLeave={() => setHovered(null)}
              className={`
                w-full flex items-center gap-4 px-4 py-3.5 rounded-xl
                border transition-all duration-200 text-left group relative overflow-hidden
                ${p.border} hover:shadow-lg ${p.glow}
              `}
              style={{
                background:
                  hovered === p.id
                    ? 'rgba(30, 41, 59, 0.9)'
                    : 'rgba(15, 23, 42, 0.5)',
              }}
            >
              {/* Gradient shimmer on hover */}
              <div
                className={`absolute inset-0 bg-gradient-to-r ${p.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none`}
              />

              {/* Icon */}
              <div className="relative shrink-0 w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                <Icon className="w-5 h-5" />
              </div>

              {/* Text */}
              <div className="relative flex-1 min-w-0">
                <p className={`font-semibold text-sm ${p.badgeColor} group-hover:brightness-110 transition-all`}>
                  {p.label}
                </p>
                <p className="text-slate-500 text-xs mt-0.5 group-hover:text-slate-400 transition-colors">
                  {p.description}
                </p>
              </div>

              {/* Arrow */}
              <div className="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <ChevronRightIcon className="w-4 h-4 text-slate-400" />
              </div>
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
      <path d="M21.5 7.5l-3 2.25V9a2.5 2.5 0 00-2.5-2.5H5A2.5 2.5 0 002.5 9v6A2.5 2.5 0 005 17.5h11a2.5 2.5 0 002.5-2.5v-.75l3 2.25V7.5z"
        stroke="none" fill="none" />
      {/* Colorful G-Meet style icon using filled shapes */}
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
