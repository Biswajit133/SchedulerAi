import { useState, useRef, useEffect } from 'react';
import { MeetingAPI, AgendaAPI, ContactAPI, AuthAPI } from '../services/api';

let _id = 0;
const uid = () => ++_id;

// ─── Phase constants ──────────────────────────────────────────────────────────
const PHASE = {
  IDLE:              'IDLE',
  PICKING:           'PICKING',
  MISSING:           'MISSING',
  CONFIRM:           'CONFIRM',
  PLATFORM:          'PLATFORM',
  SLOTS:             'SLOTS',
  DONE:              'DONE',
  CANCEL_CONFIRM:    'CANCEL_CONFIRM',    // waiting user to confirm cancellation
  RESCHEDULE_TIME:   'RESCHEDULE_TIME',   // waiting user to provide new time
  RESCHEDULE_CONFIRM:'RESCHEDULE_CONFIRM',// waiting user to confirm reschedule
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
    platform: null,
    pendingAction: null, // { type: 'cancel'|'reschedule', event, newDate?, newTime?, newEndTime? }
  });

  const contacts = useRef([]);
  const currentUser = useRef(null);
  const lastMentionedEvent = useRef(null); // last event surfaced to the user via calendar lookup

  useEffect(() => {
    ContactAPI.getContacts().then((r) => { contacts.current = r.contacts || []; }).catch(() => {});
    AuthAPI.getMe().then((r) => { currentUser.current = r.user || r || null; }).catch(() => {});
  }, []);

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

    const t = text.trim().toLowerCase();
    const { phase } = conv.current;

    // Cancel in any active phase
    if (['cancel', 'stop', 'quit', 'exit', 'restart', 'start over', 'reset'].includes(t)) {
      resetConv();
      pushBot("No problem! Let's start fresh. Describe the meeting you'd like to schedule.");
      return;
    }

    // Handle cancel / reschedule intents — allowed from any phase (resets current flow)
    const actionHandled = await tryHandleCancelReschedule(text);
    if (actionHandled) return;

    // Handle calendar lookup questions (async, needs API)
    const calendarHandled = await tryAnswerCalendarQuestion(
      text, pushBot, (v) => setLoading(v),
      (evt) => { lastMentionedEvent.current = evt; },
    );
    if (calendarHandled) {
      // Only re-prompt the pending field if the user is mid-flow and hasn't switched context
      const stillMissing = conv.current.phase === PHASE.MISSING;
      if (stillMissing) {
        const field = conv.current.missing[conv.current.missingIdx];
        if (field) pushBot(`To continue scheduling, I still need: ${field.question}`);
      }
      return;
    }

    // Intelligently answer off-topic questions instead of swallowing them as field values
    const isQuestion = /^(what|who|where|when|why|how|tell me|show me|do you|can you|is there)\b/i.test(text.trim());
    if (isQuestion) {
      const answered = tryAnswerQuestion(text, contacts.current, currentUser.current, pushBot);
      if (answered) {
        // Re-prompt the pending question so the user knows what's still needed
        const field = conv.current.missing[conv.current.missingIdx];
        if (phase === PHASE.MISSING && field) {
          pushBot(`Still need: ${field.question}`);
        }
        return;
      }
      // Could not answer — in active phases, block with a hint; in IDLE/DONE check if scheduling-related
      if (phase !== PHASE.IDLE && phase !== PHASE.DONE) {
        const field = conv.current.missing[conv.current.missingIdx];
        const hint = phase === PHASE.MISSING && field
          ? `I can only help with scheduling. Still waiting for: "${field.question}"\n\nType "cancel" to start over.`
          : 'I can only help you schedule meetings. Type "cancel" to start over.';
        pushBot(hint);
        return;
      }

      // In IDLE/DONE: if the message has no scheduling intent, reply as a scheduling assistant
      const hasSchedulingIntent = /\b(meeting|schedule|call|appointment|book|slot|calendar|zoom|meet|teams|standup|sync|session|interview|review)\b/i.test(text);
      if (!hasSchedulingIntent) {
        pushBot(
          "I'm a scheduling AI assistant — I can only help you create and manage meeting schedules.\n\n" +
          'Try something like:\n' +
          '  • "Schedule a meeting with John tomorrow at 3pm"\n' +
          '  • "Book a 30-min call with the team on Friday"\n' +
          '  • "Urgent sync with Alice about the launch ASAP"'
        );
        return;
      }
    }

    if (phase === PHASE.IDLE || phase === PHASE.DONE) {
      if (phase === PHASE.DONE) resetConv();
      await doExtract(text);
    } else if (phase === PHASE.PICKING) {
      await doPick(text);
    } else if (phase === PHASE.MISSING) {
      await doMissingAnswer(text);
    } else if (phase === PHASE.CONFIRM) {
      await doConfirmAnswer(text);
    } else if (phase === PHASE.PLATFORM) {
      // Accept typed platform choice as well as button clicks
      const t = text.trim().toLowerCase();
      if (t.includes('zoom')) {
        await selectPlatformInternal('zoom');
      } else if (t.includes('google') || t.includes('meet')) {
        await selectPlatformInternal('google_meet');
      } else {
        pushBot('Please choose a platform: type "Google Meet" or "Zoom", or tap one of the buttons above.');
      }
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
    } else if (phase === PHASE.CANCEL_CONFIRM) {
      await doCancelConfirm(text);
    } else if (phase === PHASE.RESCHEDULE_TIME) {
      await doRescheduleTime(text);
    } else if (phase === PHASE.RESCHEDULE_CONFIRM) {
      await doRescheduleConfirm(text);
    }
  }

  // ── Public: slot button click ──────────────────────────────────────────────

  async function selectSlot(slot) {
    if (loading) return;
    pushUser(`${slot.startDisplay} – ${slot.endDisplay}`);
    await doSchedule(slot);
  }

  // ── Public: platform button click ─────────────────────────────────────────

  async function selectPlatform(platform) {
    if (loading) return;
    const label = platform === 'zoom' ? 'Zoom' : 'Google Meet';
    pushUser(label);
    await selectPlatformInternal(platform);
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
      showConfirmSummary(meeting);
    } else {
      conv.current.missing = missing;
      conv.current.missingIdx = 0;
      conv.current.answers = {};
      conv.current.phase = PHASE.MISSING;
      askNextMissing();
    }
  }

  function showConfirmSummary(meeting) {
    conv.current.active = meeting;
    conv.current.phase = PHASE.CONFIRM;
    pushBot(
      `Here are the meeting details:\n\n${formatSummary(meeting)}\n\nReply "confirm" to create the meeting, or tell me what to change.`
    );
  }

  async function doConfirmAnswer(text) {
    const t = text.trim().toLowerCase();
    const CONFIRM_WORDS = ['confirm', 'yes', 'create it', 'schedule it', 'looks good', 'ok', 'sure', 'do it', 'book it', 'y'];

    if (CONFIRM_WORDS.includes(t)) {
      doPlatformSelection(conv.current.active);
      return;
    }

    // Try to parse a field update: "change time to 5pm", "update date to friday", etc.
    const updated = tryApplyInlineChange(conv.current.active, text);
    if (updated) {
      conv.current.active = updated;
      pushBot(
        `Updated meeting details:\n\n${formatSummary(updated)}\n\nReply "confirm" to create the meeting, or tell me what else to change.`
      );
      return;
    }

    pushBot('Reply "confirm" to create the meeting, or tell me what to change (e.g. "change time to 5 PM").');
  }

  function tryApplyInlineChange(meeting, text) {
    const t = text.toLowerCase();
    const updated = { ...meeting };
    let changed = false;

    // Time: "change time to 5pm" / "time: 3:30pm"
    const timeMatch = t.match(/(?:change\s+)?time\s+(?:to\s+)?(.+)/);
    if (timeMatch) {
      const { DateParser } = window.__schedulerUtils__ || {};
      // Use backend-style parsing via the validate endpoint after collection
      // Store raw string; validate endpoint will parse it
      updated._pendingTime = timeMatch[1].trim();
      changed = true;
    }

    // Date: "change date to friday" / "date: tomorrow"
    const dateMatch = t.match(/(?:change\s+)?date\s+(?:to\s+)?(.+)/);
    if (dateMatch) {
      updated._pendingDate = dateMatch[1].trim();
      changed = true;
    }

    // Duration: "change duration to 30 min" / "make it 2 hours"
    const durMatch = t.match(/(?:change\s+)?duration\s+(?:to\s+)?(.+)|make\s+it\s+(.+(?:hour|min|minute))/);
    if (durMatch) {
      updated._pendingDuration = (durMatch[1] || durMatch[2]).trim();
      changed = true;
    }

    // Topic: "change topic to X" / "meeting is about X"
    const topicMatch = t.match(/(?:change\s+)?(?:topic|title|subject)\s+(?:to\s+)?(.+)/);
    if (topicMatch) {
      updated.meeting_title = topicMatch[1].trim();
      changed = true;
    }

    if (!changed) return null;

    // If there are pending raw strings, we need to validate them via the backend.
    // For now surface them as-is and let validate endpoint resolve them on next submit.
    // Apply what we can locally:
    if (updated._pendingTime) {
      updated.time = updated._pendingTime;
      delete updated._pendingTime;
    }
    if (updated._pendingDate) {
      updated.date = updated._pendingDate;
      delete updated._pendingDate;
    }
    if (updated._pendingDuration) {
      updated.duration = updated._pendingDuration;
      delete updated._pendingDuration;
    }

    return updated;
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
      } else {
        showConfirmSummary(res.meeting);
      }
    } catch (e) {
      pushBot(`Error validating details: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ── Platform selection ─────────────────────────────────────────────────────

  function doPlatformSelection(meeting) {
    conv.current.active = meeting;
    conv.current.phase = PHASE.PLATFORM;
    conv.current.platform = null;
    pushBot(
      'Which meeting platform would you prefer?',
      { type: 'platform-selection' }
    );
  }

  async function selectPlatformInternal(platform) {
    conv.current.platform = platform;
    const meeting = { ...conv.current.active, platform };
    conv.current.active = meeting;

    const label = platform === 'zoom' ? 'Zoom' : 'Google Meet';
    pushBot(`${label} selected. Checking calendar availability...`);

    setLoading(true);
    try {
      await proceedToSlots(meeting);
    } catch (e) {
      pushBot(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function proceedToSlots(meeting) {
    if (meeting.date && meeting.time) {
      await doSmartCheck(meeting);
    } else {
      await doLoadSlots(meeting);
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

  // ── Cancel / Reschedule intent detection ─────────────────────────────────

  async function tryHandleCancelReschedule(text) {
    const lower = text.toLowerCase();

    const isCancelIntent = /\b(cancel|delete|remove)\b.*(meeting|call|appointment|standup|sync|session|interview|review)/i.test(lower)
      || /\b(meeting|call|appointment|standup|sync).*(cancel|delete|remove)\b/i.test(lower);

    const isRescheduleIntent = /\b(reschedule|move|change|shift|postpone|delay)\b.*(meeting|call|appointment|standup|sync|session|interview|review)/i.test(lower)
      || /\b(meeting|call|appointment|standup|sync).*(reschedule|move|change|shift)\b/i.test(lower);

    if (!isCancelIntent && !isRescheduleIntent) return false;

    // Abandon any in-progress scheduling flow when user switches to cancel/reschedule
    const currentPhase = conv.current.phase;
    const activeFlowPhases = [PHASE.MISSING, PHASE.CONFIRM, PHASE.PLATFORM, PHASE.SLOTS, PHASE.PICKING];
    if (activeFlowPhases.includes(currentPhase)) {
      resetConv();
    }

    setLoading(true);
    let meetings = [];
    try {
      const res = await AgendaAPI.getToday();
      meetings = (res.meetings || []).filter((m) => m.id); // only real events can be modified
    } catch (e) {
      pushBot(`Couldn't fetch your meetings: ${e.message}`);
      setLoading(false);
      return true;
    } finally {
      setLoading(false);
    }

    if (meetings.length === 0) {
      pushBot("You have no modifiable meetings today. (Only Google Calendar events can be cancelled or rescheduled.)");
      return true;
    }

    // "this meeting" / "it" → use the last event the bot mentioned (e.g. from "your next meeting is X")
    const refersToThis = /\bthis\s+(meeting|call|appointment)\b/i.test(lower);
    if (refersToThis && lastMentionedEvent.current) {
      const remembered = meetings.find((m) => m.id === lastMentionedEvent.current.id) || lastMentionedEvent.current;
      if (isCancelIntent) {
        conv.current.pendingAction = { type: 'cancel', event: remembered };
        conv.current.phase = PHASE.CANCEL_CONFIRM;
        pushBot(`Are you sure you want to cancel **${remembered.title}** at **${remembered.startDisplay}**?\n\nReply "yes" to confirm or "no" to keep it.`);
      } else {
        const parsed = parseNewDateTime(lower, remembered);
        if (parsed) {
          conv.current.pendingAction = { type: 'reschedule', event: remembered, newDate: parsed.newDate, newStartTime: parsed.newStartTime, newEndTime: parsed.newEndTime };
          conv.current.phase = PHASE.RESCHEDULE_CONFIRM;
          pushBot(`I'll reschedule **${remembered.title}** to **${parsed.newDateDisplay}** at **${parsed.newTimeDisplay}**.\n\nReply "confirm" to proceed or "cancel" to abort.`);
        } else {
          conv.current.pendingAction = { type: 'reschedule', event: remembered };
          conv.current.phase = PHASE.RESCHEDULE_TIME;
          pushBot(`When would you like to move **${remembered.title}**? (e.g. "tomorrow 3pm" or "Friday at 2pm")`);
        }
      }
      return true;
    }

    // Generic words that should not trigger a title match on their own
    const GENERIC_TITLE_WORDS = new Set(['meeting', 'call', 'session', 'appointment', 'sync', 'standup', 'interview', 'review', 'chat']);

    // Try to match a specific meeting by title keyword in the user's message
    const matched = meetings.find((m) => {
      const title = m.title.toLowerCase();
      if (lower.includes(title)) return true;
      return title.split(/\s+/).some((w) => w.length > 3 && !GENERIC_TITLE_WORDS.has(w) && lower.includes(w));
    });

    const event = matched || (meetings.length === 1 ? meetings[0] : null);

    if (!event) {
      // Multiple meetings — list them and ask
      const lines = meetings.map((m, i) => `${i + 1}. **${m.title}** — ${m.startDisplay}`).join('\n');
      pushBot(
        `Which meeting would you like to ${isCancelIntent ? 'cancel' : 'reschedule'}?\n\n${lines}\n\nType the number or meeting name.`
      );
      // Store intent so next reply can pick the meeting
      conv.current.pendingAction = { type: isCancelIntent ? 'cancel' : 'reschedule', candidates: meetings };
      conv.current.phase = isCancelIntent ? PHASE.CANCEL_CONFIRM : PHASE.RESCHEDULE_TIME;
      return true;
    }

    if (isCancelIntent) {
      conv.current.pendingAction = { type: 'cancel', event };
      conv.current.phase = PHASE.CANCEL_CONFIRM;
      pushBot(
        `Are you sure you want to cancel **${event.title}** at **${event.startDisplay}**?\n\nReply "yes" to confirm or "no" to keep it.`
      );
    } else {
      // Reschedule — try to parse new time from the same message
      const parsed = parseNewDateTime(lower, event);
      if (parsed) {
        conv.current.pendingAction = {
          type: 'reschedule', event,
          newDate: parsed.newDate, newStartTime: parsed.newStartTime, newEndTime: parsed.newEndTime,
        };
        conv.current.phase = PHASE.RESCHEDULE_CONFIRM;
        pushBot(
          `I'll reschedule **${event.title}** to **${parsed.newDateDisplay}** at **${parsed.newTimeDisplay}**.\n\nReply "confirm" to proceed or "cancel" to abort.`
        );
      } else {
        conv.current.pendingAction = { type: 'reschedule', event };
        conv.current.phase = PHASE.RESCHEDULE_TIME;
        pushBot(`When would you like to move **${event.title}**? (e.g. "tomorrow 3pm" or "Friday at 2pm")`);
      }
    }
    return true;
  }

  // ── Cancel flow ───────────────────────────────────────────────────────────

  async function doCancelConfirm(text) {
    const t = text.trim().toLowerCase();
    const CONFIRM = ['yes', 'confirm', 'ok', 'sure', 'cancel it', 'delete it', 'remove it', 'y'];
    const DENY    = ['no', 'nope', 'n', 'keep it', 'nevermind', 'never mind', 'abort'];

    // If we were waiting for the user to pick from multiple candidates
    if (conv.current.pendingAction?.candidates) {
      const candidates = conv.current.pendingAction.candidates;
      const num = parseInt(t, 10);
      let picked = null;
      if (!isNaN(num) && num >= 1 && num <= candidates.length) {
        picked = candidates[num - 1];
      } else {
        picked = candidates.find((m) => m.title.toLowerCase().includes(t));
      }
      if (!picked) {
        pushBot(`Please type a number (1–${candidates.length}) or the meeting name to select.`);
        return;
      }
      conv.current.pendingAction = { type: 'cancel', event: picked };
      pushBot(`Are you sure you want to cancel **${picked.title}** at **${picked.startDisplay}**?\n\nReply "yes" to confirm or "no" to keep it.`);
      return;
    }

    if (DENY.includes(t)) {
      resetConv();
      pushBot("No problem — your meeting is kept. Let me know if you need anything else.");
      return;
    }

    if (!CONFIRM.includes(t)) {
      pushBot('Reply "yes" to confirm cancellation, or "no" to keep the meeting.');
      return;
    }

    const { pendingAction } = conv.current;
    setLoading(true);
    try {
      await MeetingAPI.cancel(pendingAction.event.id);
      resetConv();
      conv.current.phase = PHASE.DONE;
      pushBot(`Done! **${pendingAction.event.title}** has been cancelled and attendees notified.`);
      pushBot("Would you like to schedule a new meeting? Just describe it.");
    } catch (e) {
      pushBot(`Couldn't cancel the meeting: ${e.message}`);
      resetConv();
    } finally {
      setLoading(false);
    }
  }

  // ── Reschedule flow ───────────────────────────────────────────────────────

  async function doRescheduleTime(text) {
    const { pendingAction } = conv.current;
    const t = text.trim().toLowerCase();

    // If we were waiting for the user to pick from multiple candidates
    if (pendingAction?.candidates) {
      const candidates = pendingAction.candidates;
      const num = parseInt(t, 10);
      let picked = null;
      if (!isNaN(num) && num >= 1 && num <= candidates.length) {
        picked = candidates[num - 1];
      } else {
        picked = candidates.find((m) => m.title.toLowerCase().includes(t));
      }
      if (!picked) {
        pushBot(`Please type a number (1–${candidates.length}) or the meeting name to select.`);
        return;
      }
      conv.current.pendingAction = { type: 'reschedule', event: picked };
      pushBot(`When would you like to move **${picked.title}**? (e.g. "tomorrow 3pm" or "Friday at 2pm")`);
      return;
    }

    // Parse new date + time from user's reply
    const parsed = parseNewDateTime(text, pendingAction.event);
    if (!parsed) {
      pushBot("I couldn't understand that time. Try something like \"tomorrow 3pm\" or \"Friday at 2:30pm\".");
      return;
    }

    const { newDate, newStartTime, newEndTime, newDateDisplay, newTimeDisplay } = parsed;
    conv.current.pendingAction = { ...pendingAction, newDate, newStartTime, newEndTime };
    conv.current.phase = PHASE.RESCHEDULE_CONFIRM;

    pushBot(
      `I'll reschedule **${pendingAction.event.title}** to **${newDateDisplay}** at **${newTimeDisplay}**.\n\nReply "confirm" to proceed or "cancel" to abort.`
    );
  }

  async function doRescheduleConfirm(text) {
    const t = text.trim().toLowerCase();
    const CONFIRM = ['yes', 'confirm', 'ok', 'sure', 'reschedule it', 'move it', 'y'];
    const DENY    = ['no', 'nope', 'n', 'cancel', 'nevermind', 'abort'];

    if (DENY.includes(t)) {
      resetConv();
      pushBot("No problem — the meeting stays as is. Let me know if you need anything else.");
      return;
    }

    if (!CONFIRM.includes(t)) {
      pushBot('Reply "confirm" to reschedule, or "cancel" to abort.');
      return;
    }

    const { pendingAction } = conv.current;
    setLoading(true);
    try {
      await MeetingAPI.reschedule(
        pendingAction.event.id,
        pendingAction.newDate,
        pendingAction.newStartTime,
        pendingAction.newEndTime,
      );
      resetConv();
      conv.current.phase = PHASE.DONE;
      pushBot(
        `Done! **${pendingAction.event.title}** has been rescheduled to **${pendingAction.newDate}** at **${formatTime(pendingAction.newStartTime)}**. Attendees have been notified.`
      );
      pushBot("Would you like to schedule another meeting? Just describe it.");
    } catch (e) {
      pushBot(`Couldn't reschedule the meeting: ${e.message}`);
      resetConv();
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
      platform: null,
      pendingAction: null,
    };
    lastMentionedEvent.current = null;
  }

  function clearChat() {
    resetConv();
    setMessages([WELCOME]);
  }

  return { messages, loading, sendMessage, selectSlot, selectPlatform, confirmDirect, clearChat };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function tryAnswerCalendarQuestion(text, pushBot, setLoading, onEventMentioned = null) {
  const lower = text.toLowerCase();

  // Don't intercept scheduling requests — they just happen to contain "meeting" and "today"
  const isSchedulingRequest = /\b(schedule|book|create|set\s+up|plan|arrange|add|make)\b/i.test(lower);
  if (isSchedulingRequest) return false;

  const isNextMeeting = /next\s+meeting|upcoming\s+meeting|what.*my.*meeting|my.*next\s+meeting/i.test(lower);
  const isTodayMeetings =
    /today['']?s?\s+meeting|meeting.*today|all\s+meeting.*today|provide.*meeting.*today|show.*meeting.*today|meetings?\s+for\s+today/i.test(lower);
  const isUpcoming = /upcoming\s+meetings?|what\s+meetings?\s+(do\s+i|i\s+have)|my\s+meetings?/i.test(lower);

  if (!isNextMeeting && !isTodayMeetings && !isUpcoming) return false;

  setLoading(true);
  try {
    const res = await AgendaAPI.getToday();
    const meetings = res.meetings || [];
    const demo = res.demo;
    const demoNote = demo ? '\n_(Demo data — connect Google Calendar for real events.)_' : '';

    if (meetings.length === 0) {
      pushBot(`You have no meetings scheduled for today.${demoNote}`);
      return true;
    }

    if (isNextMeeting) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const next = meetings.find((m) => {
        const [h, min] = m.startTime.split(':').map(Number);
        return h * 60 + min >= nowMin;
      }) || meetings[0];

      if (onEventMentioned) onEventMentioned(next);
      pushBot(
        `Your next meeting is **${next.title}** at **${next.startDisplay}** – ${next.endDisplay}.${
          next.joinUrl ? `\nJoin: ${next.joinUrl}` : ''
        }${demoNote}`
      );
    } else {
      const lines = meetings.map(
        (m, i) =>
          `${i + 1}. **${m.title}** — ${m.startDisplay} to ${m.endDisplay}${
            m.joinUrl ? ` ([Join](${m.joinUrl}))` : ''
          }`
      );
      pushBot(
        `You have **${meetings.length}** meeting${meetings.length > 1 ? 's' : ''} today:\n\n${lines.join('\n')}${demoNote}`
      );
    }
  } catch (e) {
    pushBot(`Couldn't fetch your meetings: ${e.message}`);
  } finally {
    setLoading(false);
  }
  return true;
}

function tryAnswerQuestion(text, contactList, user, pushBot) {
  const lower = text.toLowerCase();

  // "what is my name" / "who am i"
  if (/\bmy name\b|\bwho am i\b/.test(lower)) {
    const name = user?.name || user?.displayName || user?.email;
    if (name) {
      pushBot(`Your name is ${name}.`);
    } else {
      pushBot("I don't have your name on file. You can update it in your profile settings.");
    }
    return true;
  }

  // "what is my email"
  if (/\bmy email\b/.test(lower)) {
    const email = user?.email;
    if (email) {
      pushBot(`Your email is ${email}.`);
    } else {
      pushBot("I don't have your email on file.");
    }
    return true;
  }

  // "what is <name>'s email" / "what is <name> email"
  const emailMatch = lower.match(/what\s+is\s+(.+?)(?:'s)?\s+email/);
  if (emailMatch) {
    const query = emailMatch[1].trim();
    const found = contactList.find((c) =>
      c.name?.toLowerCase().includes(query) || query.includes(c.name?.toLowerCase())
    );
    if (found) {
      pushBot(`${found.name}'s email is ${found.email}.`);
    } else {
      pushBot(`I don't have an email for "${emailMatch[1].trim()}" in your contacts. You can add contacts in the Contacts section.`);
    }
    return true;
  }

  // "who is <name>" / "tell me about <name>"
  const whoMatch = lower.match(/(?:who is|tell me about)\s+(.+)/);
  if (whoMatch) {
    const query = whoMatch[1].trim();
    const found = contactList.find((c) =>
      c.name?.toLowerCase().includes(query) || query.includes(c.name?.toLowerCase())
    );
    if (found) {
      pushBot(`${found.name} is in your contacts (${found.email}).`);
    } else {
      pushBot(`I don't have "${query}" in your contacts.`);
    }
    return true;
  }

  return false; // couldn't answer
}

// Parses a new date+time from user text, returns structured object or null
function parseNewDateTime(text, existingEvent) {
  const lower = text.toLowerCase();

  // ── Parse date ────────────────────────────────────────────────────────────
  let newDate = null;
  const today = new Date();

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    newDate = d.toISOString().slice(0, 10);
  } else if (/\btoday\b/.test(lower)) {
    newDate = today.toISOString().slice(0, 10);
  } else if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    newDate = d.toISOString().slice(0, 10);
  } else {
    const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (dayMatch) {
      const targetDay = DAYS.indexOf(dayMatch[2]);
      const d = new Date(today);
      let diff = targetDay - d.getDay();
      if (diff <= 0 || dayMatch[1]) diff += 7;
      d.setDate(d.getDate() + diff);
      newDate = d.toISOString().slice(0, 10);
    }
  }

  // ── Parse time ────────────────────────────────────────────────────────────
  let newStartTime = null;
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2] || '0', 10);
    const meridiem = timeMatch[3];
    if (meridiem === 'pm' && h < 12) h += 12;
    if (meridiem === 'am' && h === 12) h = 0;
    if (!meridiem && h < 7) h += 12; // assume PM for ambiguous afternoon hours
    newStartTime = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  if (!newStartTime) return null;

  // Use same date as existing event if no new date parsed
  if (!newDate) newDate = existingEvent?.date || today.toISOString().slice(0, 10);

  // Preserve original duration
  const origDuration = (() => {
    if (!existingEvent?.startTime || !existingEvent?.endTime) return 60;
    const [sh, sm] = existingEvent.startTime.split(':').map(Number);
    const [eh, em] = existingEvent.endTime.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  })();

  const newEndTime = addMinutes(newStartTime, origDuration);

  const dateDisplay = new Date(newDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return { newDate, newStartTime, newEndTime, newDateDisplay: dateDisplay, newTimeDisplay: formatTime(newStartTime) };
}

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

function formatSummary(meeting) {
  const rows = [];
  rows.push(`Topic: ${meeting.meeting_title || '—'}`);
  rows.push(`Date: ${meeting.date ? formatDate(meeting.date) : '—'}`);
  rows.push(`Time: ${meeting.time ? formatTime(meeting.time) : '—'}`);
  rows.push(`Duration: ${meeting.duration ? `${meeting.duration} min` : '—'}`);
  if (meeting.participants?.length) rows.push(`Attendees: ${meeting.participants.join(', ')}`);
  return rows.map((r) => `  ${r}`).join('\n');
}
