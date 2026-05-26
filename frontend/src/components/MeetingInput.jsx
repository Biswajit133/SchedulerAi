import React, { useState } from 'react';

const EXAMPLE_NOTES = `Need frontend login page tomorrow.
Backend API Friday.
Testing Monday.
Nihal will handle frontend.
Pradeep will verify API.`;

export default function MeetingInput({ onExtract, loading }) {
  const [notes, setNotes] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (notes.trim()) onExtract(notes);
  };

  const handleExample = () => setNotes(EXAMPLE_NOTES);

  return (
    <div className="card animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Meeting Notes</h2>
          <p className="text-slate-400 text-sm mt-1">
            Paste your raw meeting notes and let AI extract all the details.
          </p>
        </div>
        <span className="badge bg-brand-500/20 text-brand-400 border border-brand-500/30">
          AI Powered
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <textarea
            className="input min-h-[180px] resize-y font-mono text-sm leading-relaxed"
            placeholder={`Example:\n${EXAMPLE_NOTES}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
          />
          <span className="absolute bottom-3 right-3 text-xs text-slate-600">
            {notes.length}/5000
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={!notes.trim() || loading || notes.length > 5000}
          >
            {loading ? (
              <>
                <SpinnerIcon />
                Extracting...
              </>
            ) : (
              <>
                <BrainIcon />
                Extract Meetings
              </>
            )}
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={handleExample}
            disabled={loading}
          >
            Load Example
          </button>
          {notes && (
            <button
              type="button"
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
              onClick={() => setNotes('')}
              disabled={loading}
            >
              Clear
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function BrainIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
