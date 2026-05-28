import { useState, useRef } from 'react';
import { MeetingAPI } from '../services/api';

let _id = 0;
const uid = () => ++_id;

// ─── Phase constants ──────────────────────────────────────────────────────────
const PHASE = {
  IDLE:    'IDLE',    // waiting for initial input
  PICKING: 'PICKING', // multiple meetings extracted, user picks one
  MISSING: 'MISSING', // collecting missing fields one-by-one
  SLOTS:   'SLOTS',   // showing available slots
  DONE:    'DONE',    // meeting scheduled, offer another
};

const WELCOME = {
  id: uid(),
  role: 'bot',
  type: 'text',
  text:
    'Hi! I\'m your AI scheduling assistant.\n\n' +
    'Describe the meeting you want to schedule in plain English:\n\n' +
    '  • "Schedule a frontend review with John tomorrow afternoon"\n' +
    '  • "API meeting Friday at 2pm, 30 minutes"\n' +
    '  • "Urgent production fix with the backend team ASAP"\n\n' +
    'Or paste your meeting notes and I\'ll extract everything for you.',
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatFlow() {
  const [messages, setMessages] = useState([WELCOME]);
  const [loading, setLoading] = useState(false);

  // All mutable conversation state lives in a ref — never stale in async callbacks
  const conv = useRef({
    phase: PHASE.IDLE,
    meetings: [],
    active: null,
    missing: [],
    missingIdx: 0,
    answers: {},
    slots: [],
  });

  // ── Message helpers ────────────────────────────────────────────────────────

  function pushBot(text, extra = {}) {
    setMessages((p) => [...p, { id: uid(), role: 'bot', type: 'text', text, ...extra }]);
  }

  function pushUser(text) {
    setMessages((p) => [...p, { id: uid(), role: 'user', type: 'text', text }]);
  }

  // ── Public: handle user text input ────────────────────────────────────────

  async function sendMessage(text) {
    if (loading || !text.trim()) return;
    pushUser(text);

    const { phase } = conv.current;

    if (phase === PHASE.IDLE || phase === PHASE.DONE) {
      if (phase === PHASE.DONE) resetConv();
      await doExtract(text);
    } else if (phase === PHASE.PICKING) {
      await doPick(text);
    } else if (phase === PHASE.MISSING) {
      await doMissingAnswer(text);
    } else if (phase === PHASE.SLOTS) {
      const slots = conv.current.slots;
      const t = text.trim().toLowerCase();

      // "confirm" / "yes" / "ok" / "sure" → auto-confirm if exactly one slot
      const isConfirmWord = ['confirm', 'yes', 'ok', 'sure', 'schedule it', 'do it', 'book it', 'y'].includes(t);
      if (isConfirmWord && slots.length === 1) {
        await doSchedule(slots[0]);
        return;
      }

      // Numeric selection
      const num = parseInt(t, 10);
      if (!isNaN(num) && num >= 1 && num <= slots.length) {
        await doSchedule(slots[num - 1]);
      } else {
        const hint = slots.length === 1
          ? 'Type "confirm" or tap the button above to schedule it.'
          : `Type a number 1–${slots.length} to pick a slot, or tap one of the buttons above.`;
        pushBot(hint);
      }
    }
  }

  // ── Public: slot button click ──────────────────────────────────────────────

  async function selectSlot(slot) {
    if (loading) return;
    pushUser(`${slot.startDisplay} – ${slot.endDisplay}`);
    await doSchedule(slot);
  }

  // ── Phase handlers ─────────────────────────────────────────────────────────

  async function doExtract(text) {
    setLoading(true);
    try {
      const res = await MeetingAPI.extract(text);
      const meetings = res.meetings || [];
      conv.current.meetings = meetings;

      if (meetings.length === 0) {
        pushBot(
          "I couldn't find any meeting details in that message.\n\n" +
          'Try something like: "Meeting with Alice about the API on Friday at 3pm"'
        );
        return;
      }

      if (meetings.length > 1) {
        conv.current.phase = PHASE.PICKING;
        pushBot(
          `I found ${meetings.length} meetings. Which one would you like to schedule first?`,
          { type: 'meeting-list', meetings }
        );
      } else {
        await proceedWith(meetings[0]);
      }
    } catch (e) {
      pushBot(`Something went wrong: ${e.message}. Please try again.`);
    } finally {
      setLoading(false);
    }
  }

  async function doPick(text) {
    const { meetings } = conv.current;
    const num = parseInt(text.trim(), 10);
    let picked = null;

    if (!isNaN(num) && num >= 1 && num <= meetings.length) {
      picked = meetings[num - 1];
    } else {
      const lower = text.toLowerCase();
      picked = meetings.find((m) => m.meeting_title?.toLowerCase().includes(lower));
    }

    if (!picked) {
      pushBot(`Please type a number between 1 and ${meetings.length} to select a meeting.`);
      return;
    }

    setLoading(true);
    try {
      await proceedWith(picked);
    } finally {
      setLoading(false);
    }
  }

  async function proceedWith(meeting) {
    conv.current.active = meeting;
    const missing = meeting.missingFields || [];

    if (missing.length === 0) {
      if (meeting.date && meeting.time) {
        pushBot(
          `All set for "${meeting.meeting_title}".\n\n${formatInfo(meeting)}\n\nChecking if ${meeting.time} is available...`
        );
        await doSmartCheck(meeting);
      } else {
        pushBot(
          `All set for "${meeting.meeting_title}".\n\n${formatInfo(meeting)}\n\nChecking availability...`
        );
        await doLoadSlots(meeting);
      }
    } else {
      conv.current.missing = missing;
      conv.current.missingIdx = 0;
      conv.current.answers = {};
      conv.current.phase = PHASE.MISSING;

      pushBot(`Got it — "${meeting.meeting_title}".\n\n${formatInfo(meeting)}\n\nI just need a few more details.`);
      askNextMissing();
    }
  }

  function askNextMissing() {
    const { missing, missingIdx } = conv.current;
    if (missingIdx >= missing.length) return;
    const field = missing[missingIdx];
    pushBot(field.question, { type: 'question', fieldType: field.type });
  }

  async function doMissingAnswer(text) {
    const s = conv.current;
    const field = s.missing[s.missingIdx];
    s.answers = { ...s.answers, [field.field]: text };
    s.missingIdx += 1;

    if (s.missingIdx < s.missing.length) {
      askNextMissing();
      return;
    }

    // All answers collected — validate
    setLoading(true);
    try {
      const res = await MeetingAPI.validate(s.active, s.answers);
      s.active = res.meeting;

      if (res.missingFields?.length > 0) {
        s.missing = res.missingFields;
        s.missingIdx = 0;
        s.answers = {};
        pushBot('Almost there — just a couple more details needed.');
        askNextMissing();
      } else if (res.meeting.date && res.meeting.time) {
        pushBot('All details collected. Checking if that time is available...');
        await doSmartCheck(res.meeting);
      } else {
        pushBot('All details collected. Checking availability...');
        await doLoadSlots(res.meeting);
      }
    } catch (e) {
      pushBot(`Error validating details: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function doSmartCheck(meeting) {
    try {
      const res = await MeetingAPI.smartSuggest(meeting.date, meeting.time, meeting.duration);

      if (!res.conflict) {
        // Requested time is free — build a direct slot and show confirm card
        const endTime = addMinutes(meeting.time, meeting.duration || 60);
        const slot = {
          date: meeting.date,
          startTime: meeting.time,
          endTime,
          startDisplay: formatTime(meeting.time),
          endDisplay: formatTime(endTime),
          durationMinutes: meeting.duration || 60,
        };
        conv.current.slots = [slot];
        conv.current.phase = PHASE.SLOTS;
        pushBot(
          `${formatTime(meeting.time)} is free on ${formatDate(meeting.date)}. Confirm to schedule?`,
          { type: 'direct-confirm', slot, demo: res.demo }
        );
      } else {
        // Conflict — show nearest alternatives
        const suggestions = res.suggestions || [];
        conv.current.slots = suggestions;
        conv.current.phase = PHASE.SLOTS;

        if (suggestions.length === 0) {
          pushBot(
            `${formatTime(meeting.time)} is taken and no nearby slots are available on ${formatDate(meeting.date)}.\n\nTry a different date?`
          );
          conv.current.phase = PHASE.IDLE;
        } else {
          pushBot(
            `${formatTime(meeting.time)} is taken. Here are the nearest available times:`,
            { type: 'slots', slots: suggestions, demo: res.demo }
          );
        }
      }
    } catch (e) {
      pushBot(`Error checking availability: ${e.message}`);
    }
  }

  async function confirmDirect(slot) {
    if (loading) return;
    pushUser(`Confirm ${slot.startDisplay} – ${slot.endDisplay}`);
    await doSchedule(slot);
  }

  async function doLoadSlots(meeting) {
    try {
      const res = await MeetingAPI.getSlots(meeting.date, meeting.duration);
      const slots = res.availableSlots || [];
      conv.current.slots = slots;
      conv.current.phase = PHASE.SLOTS;

      if (slots.length === 0) {
        pushBot(
          `No available slots found for ${formatDate(meeting.date)}.\n\nWould you like to try a different date? Just tell me the new date and I'll check again.`
        );
        conv.current.phase = PHASE.IDLE;
      } else {
        pushBot(
          `Here are the open slots for ${formatDate(meeting.date)}:`,
          { type: 'slots', slots, demo: res.demo }
        );
      }
    } catch (e) {
      pushBot(`Error checking availability: ${e.message}`);
    }
  }

  async function doSchedule(slot) {
    setLoading(true);
    try {
      const res = await MeetingAPI.schedule(conv.current.active, slot);
      conv.current.phase = PHASE.DONE;
      pushBot('', { type: 'confirmation', summary: res.summary });
      pushBot('Would you like to schedule another meeting? Just describe it and I\'ll get started.');
    } catch (e) {
      pushBot(`Scheduling failed: ${e.message}. Please try again.`);
    } finally {
      setLoading(false);
    }
  }

  function resetConv() {
    conv.current = {
      phase: PHASE.IDLE,
      meetings: [],
      active: null,
      missing: [],
      missingIdx: 0,
      answers: {},
      slots: [],
    };
  }

  function clearChat() {
    resetConv();
    setMessages([WELCOME]);
  }

  return { messages, loading, sendMessage, selectSlot, confirmDirect, clearChat };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatTime(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatInfo(meeting) {
  const rows = [];
  if (meeting.task)               rows.push(`Task: ${meeting.task}`);
  if (meeting.participants?.length) rows.push(`With: ${meeting.participants.join(', ')}`);
  if (meeting.date)               rows.push(`Date: ${formatDate(meeting.date)}`);
  if (meeting.time)               rows.push(`Time: ${formatTime(meeting.time)}`);
  if (meeting.duration)           rows.push(`Duration: ${meeting.duration} min`);
  if (meeting.owner)              rows.push(`Owner: ${meeting.owner}`);
  if (meeting.priority)           rows.push(`Priority: ${meeting.priority}`);
  return rows.map((r) => `  ${r}`).join('\n');
}
