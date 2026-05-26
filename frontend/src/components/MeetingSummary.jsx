import React from 'react';

export default function MeetingSummary({ meetings, onSelectMeeting }) {
  if (!meetings?.length) return null;

  return (
    <div className="animate-slide-up space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          Extracted Meetings
          <span className="ml-2 badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {meetings.length} found
          </span>
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {meetings.map((m) => (
          <MeetingCard key={m.id} meeting={m} onSelect={onSelectMeeting} />
        ))}
      </div>
    </div>
  );
}

function MeetingCard({ meeting, onSelect }) {
  const hasIssues = meeting.missingFields?.length > 0;

  return (
    <div className={`card hover:border-brand-500/50 transition-all duration-200 cursor-pointer group
      ${hasIssues ? 'border-amber-500/30' : 'border-emerald-500/20'}`}
      onClick={() => onSelect(meeting)}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-white text-base leading-snug group-hover:text-brand-400 transition-colors">
          {meeting.meeting_title}
        </h3>
        {hasIssues ? (
          <span className="badge bg-amber-500/20 text-amber-400 border border-amber-500/30 ml-2 shrink-0">
            {meeting.missingFields.length} missing
          </span>
        ) : (
          <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 ml-2 shrink-0">
            Ready
          </span>
        )}
      </div>

      <div className="space-y-2 text-sm">
        {meeting.task && (
          <Row icon="task" label="Task" value={meeting.task} />
        )}
        {meeting.owner && (
          <Row icon="owner" label="Owner" value={meeting.owner} />
        )}
        {meeting.participants?.length > 0 && (
          <Row icon="people" label="Participants" value={meeting.participants.join(', ')} />
        )}
        <Row icon="date" label="Date"
          value={meeting.date || <span className="text-amber-400">Not specified</span>} />
        <Row icon="time" label="Time"
          value={meeting.time || <span className="text-amber-400">Not specified</span>} />
        <Row icon="duration" label="Duration"
          value={meeting.duration ? `${meeting.duration} min` : <span className="text-amber-400">Not specified</span>} />
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {hasIssues ? `Complete ${meeting.missingFields.length} missing field(s)` : 'Click to schedule'}
        </span>
        <svg className="w-4 h-4 text-slate-500 group-hover:text-brand-400 transition-colors"
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-500 text-xs uppercase tracking-wide w-20 shrink-0 mt-0.5">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}
