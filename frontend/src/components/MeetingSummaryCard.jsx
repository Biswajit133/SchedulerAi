import React from 'react';

const PRIORITY_COLORS = {
  HIGH:   'text-red-400 bg-red-500/10 border-red-500/20',
  MEDIUM: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  LOW:    'text-slate-400 bg-slate-500/10 border-slate-500/20',
};

export default function MeetingSummaryCard({ summary, actionItems = [], decisions = [], loading }) {
  if (loading) {
    return (
      <div className="card animate-pulse space-y-3">
        <div className="h-4 bg-slate-700 rounded w-32" />
        <div className="h-16 bg-slate-800 rounded" />
        <div className="h-4 bg-slate-700 rounded w-24" />
        {[1, 2].map((i) => <div key={i} className="h-8 bg-slate-800 rounded" />)}
      </div>
    );
  }

  if (!summary && actionItems.length === 0) return null;

  return (
    <div className="card space-y-5">
      <h2 className="text-lg font-semibold text-white">AI Meeting Summary</h2>

      {/* Summary paragraph */}
      {summary && (
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
          <p className="text-slate-300 text-sm leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Action items */}
      {actionItems.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Action Items
          </h3>
          <ul className="space-y-2">
            {actionItems.map((item, i) => {
              const priorityClass =
                PRIORITY_COLORS[item.priority?.toUpperCase()] || PRIORITY_COLORS.MEDIUM;
              return (
                <li
                  key={i}
                  className="flex items-start gap-3 bg-slate-800/40 rounded-lg px-3 py-2.5"
                >
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded border font-mono shrink-0 mt-0.5 ${priorityClass}`}
                  >
                    {item.priority || 'MED'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 text-sm">{item.task}</p>
                    <div className="flex gap-4 mt-0.5">
                      {item.owner && (
                        <span className="text-slate-500 text-xs">Owner: {item.owner}</span>
                      )}
                      {item.deadline && (
                        <span className="text-slate-500 text-xs">Due: {item.deadline}</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Key decisions */}
      {decisions.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Key Decisions
          </h3>
          <ul className="space-y-1.5">
            {decisions.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                <span className="text-brand-400 shrink-0 mt-0.5">›</span>
                {d}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
