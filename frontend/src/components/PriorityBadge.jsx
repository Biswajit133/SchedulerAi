import React from 'react';

const CONFIG = {
  HIGH: {
    label: 'High Priority',
    classes: 'bg-red-500/10 text-red-400 border-red-500/30',
    dot: 'bg-red-500',
  },
  MEDIUM: {
    label: 'Medium Priority',
    classes: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500',
  },
  LOW: {
    label: 'Low Priority',
    classes: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    dot: 'bg-slate-500',
  },
};

export default function PriorityBadge({ priority, showLabel = true }) {
  const level = priority?.toUpperCase();
  const config = CONFIG[level] || CONFIG.MEDIUM;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${config.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      {showLabel ? config.label : level || 'MEDIUM'}
    </span>
  );
}
