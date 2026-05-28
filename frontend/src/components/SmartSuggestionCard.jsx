import React from 'react';

export default function SmartSuggestionCard({ conflict, message, suggestions = [], onSelectSlot, loading }) {
  if (loading) {
    return (
      <div className="card animate-pulse space-y-3">
        <div className="h-4 bg-slate-700 rounded w-40" />
        {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-800 rounded" />)}
      </div>
    );
  }

  if (!conflict) return null;

  return (
    <div className="card border-amber-500/30 space-y-4">
      {/* Conflict notice */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <p className="text-amber-400 text-sm font-medium">Slot Unavailable</p>
          <p className="text-slate-400 text-sm mt-0.5">{message}</p>
        </div>
      </div>

      {/* Smart suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Nearest Available Slots
          </p>
          <div className="space-y-2">
            {suggestions.map((slot, i) => (
              <button
                key={i}
                onClick={() => onSelectSlot?.(slot)}
                className="w-full flex items-center justify-between bg-slate-800/60 hover:bg-slate-700/60
                  border border-slate-700/50 hover:border-brand-500/50 rounded-lg px-4 py-3
                  transition-all group text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 group-hover:scale-125 transition-transform" />
                  <span className="text-white text-sm font-mono">
                    {slot.startDisplay} – {slot.endDisplay}
                  </span>
                </div>
                <span className="text-xs text-slate-500 group-hover:text-brand-400 transition-colors">
                  {slot.durationMinutes} min →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
