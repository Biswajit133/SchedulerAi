import React, { useState } from 'react';

export default function AvailableSlots({ meeting, availableSlots, busySlots, onSelectSlot, onBack, loading, demo }) {
  const [selected, setSelected] = useState(null);

  const handleConfirm = () => {
    if (selected) onSelectSlot(selected);
  };

  return (
    <div className="animate-slide-up space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Choose a Time Slot</h2>
            <p className="text-slate-400 text-sm">
              {meeting.meeting_title} · {meeting.duration} min
            </p>
          </div>
          <button onClick={onBack} className="btn-secondary text-sm py-2">
            ← Back
          </button>
        </div>

        {demo && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <p className="text-amber-400 text-sm">
              Demo mode — connect Google Calendar for real availability data.
            </p>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Busy slots */}
        <div className="card lg:col-span-1">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            Busy Slots
          </h3>
          {busySlots?.length === 0 ? (
            <p className="text-slate-500 text-sm">No conflicts found</p>
          ) : (
            <div className="space-y-2">
              {busySlots?.map((slot, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 bg-red-500/10
                  border border-red-500/20 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-red-400">
                      {slot.startDisplay || slot.startTime} – {slot.endDisplay || slot.endTime}
                    </p>
                    {slot.title && <p className="text-xs text-slate-500 mt-0.5">{slot.title}</p>}
                  </div>
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available slots */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            Available Slots
            <span className="badge bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {availableSlots?.length || 0} open
            </span>
          </h3>

          {availableSlots?.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">No available slots for this day.</p>
              <p className="text-slate-500 text-sm mt-1">Try a different date.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1">
              {availableSlots?.map((slot, i) => (
                <SlotCard
                  key={i}
                  slot={slot}
                  isSelected={selected?.startTime === slot.startTime}
                  onClick={() => setSelected(slot)}
                />
              ))}
            </div>
          )}

          {selected && (
            <div className="mt-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Selected time</p>
                  <p className="font-semibold text-white">
                    {selected.startDisplay} – {selected.endDisplay}
                  </p>
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <SpinnerIcon />
                      Scheduling...
                    </>
                  ) : (
                    <>
                      <CalendarIcon />
                      Schedule Meeting
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotCard({ slot, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-xl border text-left transition-all duration-200
        ${isSelected
          ? 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-500/25'
          : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-brand-500/50 hover:bg-slate-800'
        }`}
    >
      <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-slate-200'}`}>
        {slot.startDisplay}
      </p>
      <p className={`text-xs mt-0.5 ${isSelected ? 'text-brand-200' : 'text-slate-500'}`}>
        to {slot.endDisplay}
      </p>
    </button>
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

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
