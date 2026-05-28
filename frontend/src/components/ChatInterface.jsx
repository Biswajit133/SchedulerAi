import React, { useState, useRef, useEffect } from 'react';
import { useChatFlow } from '../hooks/useChatFlow';
import PriorityBadge from './PriorityBadge';

export default function ChatInterface() {
  const { messages, loading, sendMessage, selectSlot, confirmDirect, clearChat } = useChatFlow();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    sendMessage(text);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-800 px-5 py-3.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-600/20 border border-brand-500/30 flex items-center justify-center">
          <BotIcon className="w-4 h-4 text-brand-400" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold">Scheduler AI</p>
          <p className="text-slate-500 text-xs">AI-powered meeting assistant</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-500 text-xs">Online</span>
          </div>
          <button
            onClick={clearChat}
            disabled={loading}
            title="Clear chat"
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs
              hover:bg-slate-800 px-2 py-1 rounded-lg transition-colors disabled:opacity-40"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} onSelectSlot={selectSlot} onConfirmDirect={confirmDirect} />
        ))}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-slate-800 p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            placeholder="Describe your meeting or answer the question above..."
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3
              text-white placeholder-slate-500 text-sm resize-none
              focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30
              disabled:opacity-50 transition-colors leading-relaxed"
            style={{ minHeight: '48px', maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="btn-primary px-4 py-3 flex items-center gap-2 text-sm shrink-0"
          >
            <SendIcon className="w-4 h-4" />
            Send
          </button>
        </form>
        <p className="text-slate-600 text-xs mt-2 text-center">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ─── Message renderer ─────────────────────────────────────────────────────────

function ChatMessage({ msg, onSelectSlot, onConfirmDirect }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end animate-fade-in">
        <div className="max-w-[75%] bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {msg.text}
        </div>
      </div>
    );
  }

  // Bot message
  return (
    <div className="flex gap-3 items-start animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-brand-600/20 border border-brand-500/30
        flex items-center justify-center shrink-0 mt-0.5">
        <BotIcon className="w-3.5 h-3.5 text-brand-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        {/* Plain text */}
        {msg.text && (
          <div className="bg-slate-800/70 border border-slate-700/40 rounded-2xl rounded-tl-sm
            px-4 py-3 text-sm text-slate-200 whitespace-pre-line leading-relaxed">
            {msg.text}
          </div>
        )}

        {/* Direct confirm (time was specified and is free) */}
        {msg.type === 'direct-confirm' && msg.slot && (
          <DirectConfirmCard slot={msg.slot} demo={msg.demo} onConfirm={onConfirmDirect} />
        )}

        {/* Slot picker */}
        {msg.type === 'slots' && msg.slots?.length > 0 && (
          <SlotPicker slots={msg.slots} demo={msg.demo} onSelect={onSelectSlot} />
        )}

        {/* Meeting list (multi-meeting pick) */}
        {msg.type === 'meeting-list' && msg.meetings?.length > 0 && (
          <MeetingListPicker meetings={msg.meetings} />
        )}

        {/* Scheduled confirmation */}
        {msg.type === 'confirmation' && msg.summary && (
          <ConfirmationCard summary={msg.summary} />
        )}
      </div>
    </div>
  );
}

// ─── Direct confirm card ──────────────────────────────────────────────────────

function DirectConfirmCard({ slot, demo, onConfirm }) {
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
      {demo && (
        <p className="text-amber-400 text-xs">Demo mode — connect Google Calendar for live availability</p>
      )}
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex-1">
          <p className="text-emerald-400 text-sm font-semibold">Time slot is available</p>
          <p className="text-white text-sm mt-0.5">
            {slot.startDisplay} – {slot.endDisplay}
            <span className="text-slate-400 ml-2 text-xs">{slot.durationMinutes} min</span>
          </p>
        </div>
      </div>
      <button
        onClick={() => onConfirm(slot)}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2.5
          text-sm font-semibold transition-colors flex items-center justify-center gap-2"
      >
        <CheckIcon className="w-4 h-4" />
        Confirm & Schedule
      </button>
      <p className="text-slate-600 text-xs text-center">or type "confirm" in the chat</p>
    </div>
  );
}

// ─── Slot picker ──────────────────────────────────────────────────────────────

function SlotPicker({ slots, demo, onSelect }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl overflow-hidden">
      {demo && (
        <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20">
          <p className="text-amber-400 text-xs">
            Demo mode — connect Google Calendar for live availability
          </p>
        </div>
      )}
      <div className="p-2 space-y-1.5">
        {slots.map((slot, i) => (
          <button
            key={i}
            onClick={() => onSelect(slot)}
            className="w-full flex items-center justify-between bg-slate-800 hover:bg-slate-700/70
              border border-slate-700/50 hover:border-brand-500/50 rounded-lg px-4 py-2.5
              transition-all group text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-slate-500 text-xs font-mono w-5 shrink-0">{i + 1}.</span>
              <span className="text-white text-sm font-medium">
                {slot.startDisplay}
              </span>
              <span className="text-slate-400 text-sm">–</span>
              <span className="text-white text-sm font-medium">
                {slot.endDisplay}
              </span>
            </div>
            <span className="text-xs text-slate-500 group-hover:text-brand-400 transition-colors shrink-0">
              {slot.durationMinutes} min
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Meeting list picker ──────────────────────────────────────────────────────

function MeetingListPicker({ meetings }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-2 space-y-1.5">
      {meetings.map((m, i) => (
        <div
          key={i}
          className="flex items-start gap-3 bg-slate-800/80 rounded-lg px-3 py-2.5 border border-slate-700/30"
        >
          <span className="text-brand-400 font-mono text-sm w-5 shrink-0 mt-0.5">{i + 1}.</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white text-sm font-medium truncate">{m.meeting_title}</p>
              {m.priority && <PriorityBadge priority={m.priority} showLabel={false} />}
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              {m.date || 'Date TBD'}{m.time ? ` · ${m.time}` : ''}{m.duration ? ` · ${m.duration} min` : ''}
            </p>
            {m.task && <p className="text-slate-500 text-xs mt-0.5 truncate">{m.task}</p>}
          </div>
        </div>
      ))}
      <p className="text-slate-600 text-xs text-center py-1">Type a number to select</p>
    </div>
  );
}

// ─── Confirmation card ────────────────────────────────────────────────────────

function ConfirmationCard({ summary }) {
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
      {/* Title row */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <p className="text-emerald-400 font-semibold text-sm">Meeting Scheduled</p>
        {summary.demo && (
          <span className="ml-auto text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
            demo
          </span>
        )}
      </div>

      {/* Details */}
      <div className="space-y-1.5 pl-8">
        <p className="text-white font-semibold">{summary.title}</p>
        <p className="text-slate-300 text-sm">{summary.dateDisplay}</p>
        <p className="text-slate-300 text-sm">
          {summary.startDisplay} – {summary.endDisplay}
          <span className="text-slate-500 ml-2 text-xs">{summary.duration} min</span>
        </p>
        {summary.participants?.length > 0 && (
          <p className="text-slate-400 text-sm">
            With: {summary.participants.map((p) => p.name).join(', ')}
          </p>
        )}
        {summary.meetLink && !summary.demo && (
          <a
            href={summary.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-400 text-xs hover:text-brand-300 transition-colors mt-1"
          >
            Join Google Meet →
          </a>
        )}
        {summary.calendarLink && !summary.demo && (
          <a
            href={summary.calendarLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-slate-400 text-xs hover:text-slate-300 transition-colors"
          >
            View in Calendar →
          </a>
        )}
      </div>

      {/* Invites */}
      {summary.invitesSent?.length > 0 && (
        <p className="text-slate-500 text-xs pl-8">
          Invites sent to {summary.invitesSent.length} participant(s)
        </p>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start animate-fade-in">
      <div className="w-7 h-7 rounded-full bg-brand-600/20 border border-brand-500/30
        flex items-center justify-center shrink-0">
        <BotIcon className="w-3.5 h-3.5 text-brand-400" />
      </div>
      <div className="bg-slate-800/70 border border-slate-700/40 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function BotIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v4m0 0H5m4 0h10M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7M9 11h6m-6 4h6" />
    </svg>
  );
}

function SendIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TrashIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
