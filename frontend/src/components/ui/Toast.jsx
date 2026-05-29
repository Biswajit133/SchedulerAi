import React, { useEffect, useState } from 'react';

const TYPE_STYLES = {
  success: 'border-l-4 border-emerald-500 text-emerald-300',
  error:   'border-l-4 border-red-500 text-red-300',
  warning: 'border-l-4 border-amber-500 text-amber-300',
  info:    'border-l-4 border-brand-500 text-brand-300',
};

const ICONS = {
  success: (
    <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4 shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  info: (
    <svg className="w-4 h-4 shrink-0 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
    </svg>
  ),
};

export default function Toast({ id, message, type = 'info', onRemove }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onRemove(id), 300);
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl
        bg-slate-800 border border-slate-700 min-w-[280px] max-w-sm
        transition-all duration-300 ${TYPE_STYLES[type]}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      {ICONS[type]}
      <p className="text-sm text-slate-200 flex-1 leading-snug">{message}</p>
      <button
        onClick={handleClose}
        className="text-slate-500 hover:text-slate-300 transition-colors shrink-0 ml-1"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
