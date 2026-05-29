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
              <MeetingItem key={i} meeting={m} />
            ))}
          </ul>
        )}
      </section>

      {/* Free slots */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
          Free Time
          {freeSlots.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-xs font-mono normal-case tracking-normal">
              {freeSlots.length} {freeSlots.length === 1 ? 'block' : 'blocks'}
            </span>
          )}
        </h3>
        {meetings.length === 0 ? (
          <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <div>
              <p className="text-emerald-300 text-sm font-medium">All day free</p>
              <p className="text-emerald-500/80 text-xs font-mono mt-0.5">7:00 AM – 10:00 PM</p>
            </div>
          </div>
        ) : freeSlots.length === 0 ? (
          <p className="text-slate-500 text-sm">No free time remaining.</p>
        ) : (
          <div className="space-y-1.5">
            {freeSlots.map((slot, i) => {
              const startMin = timeToMin(slot.startTime);
              const endMin   = timeToMin(slot.endTime);
              const dur      = endMin - startMin;
              const durLabel = dur >= 60
                ? `${Math.floor(dur / 60)}h${dur % 60 ? ` ${dur % 60}m` : ''}`
                : `${dur}m`;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-emerald-300 text-sm font-mono">
                      {slot.startDisplay} – {slot.endDisplay}
                    </span>
                  </div>
                  <span className="text-emerald-500/80 text-xs font-medium shrink-0">{durLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

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

// ── meeting item ──────────────────────────────────────────────────────────────

const PLATFORM_META = {
  google_meet: {
    label: 'Google Meet',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    ),
  },
  zoom: {
    label: 'Zoom',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    ),
  },
  teams: {
    label: 'Teams',
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    icon: (
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/>
      </svg>
    ),
  },
};

function MeetingItem({ meeting: m }) {
  const meta = m.platform ? PLATFORM_META[m.platform] : null;
  const joinTarget = m.joinUrl || m.htmlLink;

  const inner = (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors
      ${joinTarget
        ? 'bg-slate-800/60 hover:bg-slate-700/70 cursor-pointer group'
        : 'bg-slate-800/60'
      }`}
    >
      {/* Time */}
      <div className="flex flex-col items-center text-xs text-brand-400 font-mono w-20 shrink-0">
        <span>{m.startDisplay}</span>
        {m.endDisplay && <span className="text-slate-500">↓ {m.endDisplay}</span>}
      </div>

      {/* Title + platform */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${joinTarget ? 'text-white group-hover:text-brand-300' : 'text-white'}`}>
          {m.title}
        </p>
        {meta && (
          <span className={`inline-flex items-center gap-1 mt-0.5 text-xs px-1.5 py-0.5 rounded border ${meta.color}`}>
            {meta.icon}
            {meta.label}
          </span>
        )}
      </div>

      {/* Join button */}
      {joinTarget && (
        <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-brand-400 group-hover:text-brand-300 border border-brand-500/30 group-hover:border-brand-400/50 rounded-lg px-2 py-1 transition-colors">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
          Join
        </span>
      )}
    </div>
  );

  if (joinTarget) {
    return (
      <li>
        <a href={joinTarget} target="_blank" rel="noopener noreferrer" className="block no-underline">
          {inner}
        </a>
      </li>
    );
  }
  return <li>{inner}</li>;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

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
