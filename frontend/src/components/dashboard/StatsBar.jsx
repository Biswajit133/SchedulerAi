import React, { useState, useEffect } from 'react';
import { AgendaAPI } from '../../services/api';

function parseEventTime(e) {
  // API returns startTime like "14:00"; fall back to e.start for ISO strings
  const raw = e.start || e.startTime;
  if (!raw) return null;
  if (raw.includes('T') || raw.includes('-')) return new Date(raw);
  // "HH:MM" — combine with today's date
  const [h, m] = raw.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function getNextMeetingCountdown(events) {
  if (!events || events.length === 0) return null;
  const now = new Date();
  const upcoming = events
    .map((e) => ({ event: e, time: parseEventTime(e) }))
    .filter(({ time }) => time && time > now)
    .sort((a, b) => a.time - b.time);
  if (!upcoming.length) return null;
  return upcoming[0];
}

function formatCountdown(targetTime) {
  const now = new Date();
  const diffMs = targetTime - now;
  if (diffMs <= 0) return 'Starting now';
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  if (diffMin < 60) return `in ${diffMin}m`;
  const mins = diffMin % 60;
  return mins > 0 ? `in ${diffHr}h ${mins}m` : `in ${diffHr}h`;
}

export default function StatsBar() {
  const [stats, setStats] = useState({ meetingCount: 0, nextMeeting: null, loading: true });
  const [, setTick] = useState(0);

  useEffect(() => {
    AgendaAPI.getToday()
      .then((data) => {
        const events = data?.events || data?.meetings || [];
        const meetingCount = events.length;
        const nextMeeting = getNextMeetingCountdown(events);
        setStats({ meetingCount, nextMeeting, loading: false });
      })
      .catch(() => setStats({ meetingCount: 0, nextMeeting: null, loading: false }));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const hoursSaved = (stats.meetingCount * 0.4).toFixed(1);
  const nextLabel = stats.nextMeeting
    ? formatCountdown(stats.nextMeeting.time)
    : 'None today';
  const nextTitle = stats.nextMeeting?.event?.title || stats.nextMeeting?.event?.summary || '';

  if (stats.loading) {
    return (
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {/* Meetings this week */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-brand-600/20 flex items-center justify-center shrink-0">
          <CalendarStatIcon className="w-5 h-5 text-brand-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white leading-none">{stats.meetingCount}</p>
          <p className="text-xs text-slate-400 mt-1">Meetings today</p>
        </div>
      </div>

      {/* Hours saved */}
      <div className="hidden bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
          <ClockIcon className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-emerald-400 leading-none">~{hoursSaved}h</p>
          <p className="text-xs text-slate-400 mt-1">Saved vs manual</p>
        </div>
      </div>

      {/* Next meeting */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
          <LightningIcon className="w-5 h-5 text-amber-400" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-amber-400 leading-none">{nextLabel}</p>
          {nextTitle && (
            <p className="text-xs text-slate-400 mt-1 truncate max-w-[120px]">{nextTitle}</p>
          )}
          {!nextTitle && <p className="text-xs text-slate-400 mt-1">Next meeting</p>}
        </div>
      </div>
    </div>
  );
}

function CalendarStatIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ClockIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LightningIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
