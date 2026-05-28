import React, { useState, useEffect, useRef } from 'react';
import { AgendaAPI } from '../services/api';

// ── date helpers ──────────────────────────────────────────────────────────────

function toISO(date) {
  return date.toISOString().split('T')[0];
}

function todayISO() {
  return toISO(new Date());
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toISO(d);
}

// ── main component ────────────────────────────────────────────────────────────

export default function AgendaCard() {
  const today = todayISO();
  const tomorrow = tomorrowISO();

  const [selectedDate, setSelectedDate] = useState(today);
  const [agenda, setAgenda] = useState(null);
  const [loading, setLoading] = useState(false);
  const dateInputRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    setAgenda(null);
    AgendaAPI.getForDate(selectedDate)
      .then((res) => setAgenda(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const activeTab =
    selectedDate === today ? 'today' :
    selectedDate === tomorrow ? 'tomorrow' : 'custom';

  const handleCustomDate = (e) => {
    if (e.target.value) setSelectedDate(e.target.value);
  };

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Agenda</h2>
        {agenda?.demo && (
          <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            Demo
          </span>
        )}
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setSelectedDate(today)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'today'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Today
        </button>
        <button
          onClick={() => setSelectedDate(tomorrow)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            activeTab === 'tomorrow'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          Tomorrow
        </button>
        <button
          onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.click()}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'custom'
              ? 'bg-brand-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          }`}
        >
          <CalendarIcon className="w-3 h-3" />
          {activeTab === 'custom' ? formatShort(selectedDate) : 'Pick date'}
        </button>
        {/* Hidden native date input */}
        <input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          onChange={handleCustomDate}
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {/* Date label */}
      <p className="text-slate-400 text-sm -mt-1">
        {agenda?.dateDisplay || formatShort(selectedDate)}
      </p>

      {/* Body */}
      {loading ? (
        <LoadingSkeleton />
      ) : !agenda ? null : (
        <AgendaBody agenda={agenda} />
      )}
    </div>
  );
}

// ── agenda body ───────────────────────────────────────────────────────────────

function AgendaBody({ agenda }) {
  const { meetings = [], freeSlots = [], upcomingTasks = [] } = agenda;

  return (
    <div className="space-y-5">
      {/* Scheduled meetings */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Scheduled
        </h3>
        {meetings.length === 0 ? (
          <p className="text-slate-500 text-sm">No meetings scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {meetings.map((m, i) => (
              <li
                key={i}
                className="flex items-center gap-3 bg-slate-800/60 rounded-lg px-3 py-2"
              >
                <div className="flex flex-col items-center text-xs text-brand-400 font-mono w-20 shrink-0">
                  <span>{m.startDisplay}</span>
                  {m.endDisplay && (
                    <span className="text-slate-500">↓ {m.endDisplay}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.title}</p>
                  {m.owner && (
                    <p className="text-slate-400 text-xs truncate">Owner: {m.owner}</p>
                  )}
                </div>
                {m.source === 'calendar' && (
                  <span className="text-xs text-slate-500 shrink-0">Cal</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Free slots */}
      {freeSlots.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Free Slots
          </h3>
          <div className="flex flex-wrap gap-2">
            {freeSlots.map((slot, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono"
              >
                {slot.startDisplay} – {slot.endDisplay}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming tasks */}
      {upcomingTasks.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Upcoming
          </h3>
          <ul className="space-y-1.5">
            {upcomingTasks.map((t, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="text-slate-500 text-xs font-mono shrink-0 w-24">{t.dateDisplay}</span>
                <span className="text-slate-300 truncate">{t.title}</span>
                {t.startDisplay !== 'TBD' && (
                  <span className="text-slate-500 text-xs shrink-0">{t.startDisplay}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(d, 10)}`;
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-10 bg-slate-800 rounded" />
      ))}
    </div>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
