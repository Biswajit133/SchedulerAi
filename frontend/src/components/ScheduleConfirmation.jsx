import React from 'react';

export default function ScheduleConfirmation({ summary, onScheduleAnother }) {
  if (!summary) return null;

  return (
    <div className="animate-slide-up max-w-lg mx-auto">
      {/* Success header */}
      <div className="card border-emerald-500/30 mb-6 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30
            flex items-center justify-center">
            <CheckIcon />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Meeting Scheduled!</h2>
        <p className="text-slate-400">
          {summary.demo
            ? 'Saved in demo mode. Connect Google Calendar to send real invites.'
            : 'Google Calendar invite sent to all participants.'}
        </p>
      </div>

      {/* Details */}
      <div className="card space-y-4">
        <DetailRow label="Title" value={summary.title} highlight />

        <DetailRow
          label="Date"
          value={summary.dateDisplay || summary.date}
          icon={<CalendarIcon />}
        />

        <DetailRow
          label="Time"
          value={`${summary.startDisplay} – ${summary.endDisplay}`}
          icon={<ClockIcon />}
        />

        <DetailRow
          label="Duration"
          value={`${summary.duration} minutes`}
          icon={<ClockIcon />}
        />

        {summary.task && (
          <DetailRow label="Task" value={summary.task} />
        )}

        {summary.owner && (
          <DetailRow label="Owner" value={summary.owner} icon={<PersonIcon />} />
        )}

        {summary.participants?.length > 0 && (
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Participants</p>
            <div className="space-y-1.5">
              {summary.participants.map((p, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-800/50
                  rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-slate-200">{p.name}</span>
                  {p.email ? (
                    <span className="text-xs text-slate-400">{p.email}</span>
                  ) : (
                    <span className="text-xs text-slate-600">No email</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invite status */}
        {summary.invitesSent?.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20
            rounded-xl">
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            <p className="text-emerald-400 text-sm">
              Google Calendar invites sent to {summary.invitesSent.length} participant(s)
            </p>
          </div>
        )}

        {/* Links */}
        {(summary.calendarLink || summary.meetLink) && (
          <div className="flex gap-3 pt-2">
            {summary.calendarLink && (
              <a href={summary.calendarLink} target="_blank" rel="noopener noreferrer"
                className="btn-secondary text-sm flex items-center gap-2 flex-1 justify-center">
                <CalendarIcon />
                View in Calendar
              </a>
            )}
            {summary.meetLink && (
              <a href={summary.meetLink} target="_blank" rel="noopener noreferrer"
                className="btn-primary text-sm flex items-center gap-2 flex-1 justify-center">
                <VideoIcon />
                Join Meeting
              </a>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <button onClick={onScheduleAnother} className="btn-secondary w-full">
          Schedule Another Meeting
        </button>
      </div>
    </div>
  );
}

function DetailRow({ label, value, icon, highlight }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <span className="text-brand-400 mt-0.5 shrink-0">{icon}</span>}
      <div className="flex-1">
        <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`mt-0.5 ${highlight ? 'text-lg font-bold text-white' : 'text-slate-200'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}
