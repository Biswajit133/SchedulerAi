import { useState, useRef, useEffect } from 'react';
import { MeetingAPI, AgendaAPI, ContactAPI, AuthAPI, IntegrationAPI } from '../services/api';

let _id = 0;
const uid = () => ++_id;

// ─── Phase constants ──────────────────────────────────────────────────────────
const PHASE = {
  IDLE:              'IDLE',
  PICKING:           'PICKING',
  EMAIL_CONFIRM:     'EMAIL_CONFIRM',     // confirming / collecting participant emails
  MISSING:           'MISSING',
  CONFIRM:           'CONFIRM',
  PLATFORM:          'PLATFORM',
  SLOTS:             'SLOTS',
  DONE:              'DONE',
  CANCEL_CONFIRM:    'CANCEL_CONFIRM',    // waiting user to confirm cancellation
  RESCHEDULE_TIME:   'RESCHEDULE_TIME',   // waiting user to provide new time
  RESCHEDULE_CONFIRM:'RESCHEDULE_CONFIRM',// waiting user to confirm reschedule
  FOLLOW_UP_SELECT:  'FOLLOW_UP_SELECT',  // user selecting / confirming which meeting to follow up on
  NEEDS_NEW_TIME:    'NEEDS_NEW_TIME',    // active meeting exists but requested time was in the past
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
    pendingSlot: null,   // slot waiting for email collection before scheduling
    emailConfirmQueue: [],  // [{ participantName, foundEmails: [{name,email}] }]
    emailConfirmIdx: 0,
    emailConfirmResult: {}, // name → chosen email
    followUpCandidates: [], // recent meetings to follow up on
    followUpDate: null,     // date parsed from the original follow-up request
    followUpTime: null,     // time parsed from the original follow-up request
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
      const prefHandled = await tryHandleProviderPreference(text);
      if (prefHandled) return;
      const followUpHandled = await tryHandleFollowUp(text);
      if (followUpHandled) return;
      await doExtract(text);
    } else if (phase === PHASE.FOLLOW_UP_SELECT) {
      await doFollowUpSelect(text);
    } else if (phase === PHASE.PICKING) {
      await doPick(text);
    } else if (phase === PHASE.EMAIL_CONFIRM) {
      await doEmailConfirmAnswer(text);
    } else if (phase === PHASE.MISSING) {
      await doMissingAnswer(text);
    } else if (phase === PHASE.CONFIRM) {
      await doConfirmAnswer(text);
    } else if (phase === PHASE.PLATFORM) {
      // Match typed provider name against connected providers
      const matched = await resolveProviderFromText(text.trim());
      if (matched) {
        await selectPlatformInternal(matched.id, matched.label);
      } else {
        pushBot('Please choose a platform from the options above, or type its name (e.g. "Zoom", "Google Meet").');
      }
    } else if (phase === PHASE.SLOTS) {
      const slots = conv.current.slots;
      const t = text.trim().toLowerCase();

      // "confirm" / "yes" / "ok" / "sure" → auto-confirm if exactly one slot
      const isConfirmWord = ['confirm', 'yes', 'ok', 'sure', 'schedule it', 'do it', 'book it', 'y'].includes(t);
      if (isConfirmWord && slots.length === 1) {
        await proceedToSchedule(slots[0]);
        return;
      }

      // Numeric selection
      const num = parseInt(t, 10);
      if (!isNaN(num) && num >= 1 && num <= slots.length) {
        await proceedToSchedule(slots[num - 1]);
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
    } else if (phase === PHASE.NEEDS_NEW_TIME) {
      await doHandleNewTime(text);
    }
  }

  // ── Public: slot button click ──────────────────────────────────────────────

  async function selectSlot(slot) {
    if (loading) return;
    pushUser(`${slot.startDisplay} – ${slot.endDisplay}`);
    await proceedToSchedule(slot);
  }

  // ── Public: platform button click (platformId, platformLabel) ────────────

  async function selectPlatform(platformId, platformLabel) {
    if (loading) return;
    pushUser(platformLabel || platformId);
    await selectPlatformInternal(platformId, platformLabel);
  }

  // ── Phase handlers ─────────────────────────────────────────────────────────

  async function doExtract(text) {
    // Capture any explicit provider request before sending to AI
    const requestedProvider = detectRequestedProvider(text);

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

      // Attach the requested provider so doPlatformSelection can honour it
      const enriched = meetings.map((m) =>
        requestedProvider ? { ...m, _requestedProvider: requestedProvider } : m
      );
      conv.current.meetings = enriched;

      if (enriched.length > 1) {
        conv.current.phase = PHASE.PICKING;
        pushBot(
          `I found ${enriched.length} meetings. Which one would you like to schedule first?`,
          { type: 'meeting-list', meetings: enriched }
        );
      } else {
        await proceedWith(enriched[0]);
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
    // Silently pre-fill emails from local contact cache so the MISSING phase
    // never asks for an email that is already known.
    const enriched = enrichEmailsFromContacts(meeting, contacts.current);
    conv.current.active = enriched;
    proceedToMissing(enriched);
  }

  function proceedToMissing(meeting, overrideMissing) {
    const allMissing = overrideMissing !== undefined ? overrideMissing : (meeting.missingFields || []);
    // Email fields are deferred to after slot selection (handled by proceedToSchedule).
    // Never ask for email before the user has confirmed an available time slot.
    const missing = allMissing.filter((f) => f.type !== 'email');
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

  // ── Email confirmation flow ────────────────────────────────────────────────

  function askNextEmailConfirm() {
    const { emailConfirmQueue, emailConfirmIdx } = conv.current;
    const item = emailConfirmQueue[emailConfirmIdx];
    const { participantName, foundEmails, stage = 'mongo' } = item;

    if (foundEmails.length === 0) {
      if (stage === 'mongo') {
        // No local contacts found — search Google Calendar + People before asking
        searchGoogleForParticipant(item);
        return;
      }
      pushBot(`I couldn't find an email address for **${participantName}**.\n\nPlease provide their email address.`);
    } else if (foundEmails.length === 1) {
      const sourceNote = stage === 'mongo' ? 'your previous meetings' : 'your contacts';
      pushBot(
        `I found **${participantName}** (${foundEmails[0].email}) from ${sourceNote}.\n\nWould you like to use this email address?`,
        { type: 'email-confirm-single', email: foundEmails[0].email, participantName }
      );
    } else {
      const intro = stage === 'google'
        ? `I found additional email addresses for **${participantName}**:`
        : `I found multiple email addresses for **${participantName}**:`;
      const list = foundEmails.map((e, i) => `${i + 1}. ${e.email}`).join('\n');
      pushBot(
        `${intro}\n\n${list}\n\nWhich email would you like to use?`,
        { type: 'email-confirm-multi', emails: foundEmails, participantName }
      );
    }
  }

  async function doEmailConfirmAnswer(text) {
    const s = conv.current;
    const item = s.emailConfirmQueue[s.emailConfirmIdx];
    const { participantName, foundEmails, stage = 'mongo' } = item;
    const t = text.trim().toLowerCase();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const YES       = ['yes', 'y', 'use it', 'correct', 'continue', 'invite him', 'invite her', 'ok', 'sure', 'yep', 'yeah'];
    const NO        = ['no', 'n', 'different email', 'use another', 'not this one', 'other', 'different'];
    const NONE_WORDS = ['none', 'none of these', 'different', 'other', 'other email'];

    let chosenEmail = null;

    if (foundEmails.length === 0) {
      if (!EMAIL_RE.test(text.trim())) {
        pushBot('Please provide a valid email address (e.g., name@example.com).');
        return;
      }
      chosenEmail = text.trim().toLowerCase();

    } else if (foundEmails.length === 1) {
      if (YES.some((w) => t === w || t.startsWith(w))) {
        chosenEmail = foundEmails[0].email;
      } else if (NO.some((w) => t === w || t.startsWith(w))) {
        if (stage === 'mongo') {
          await searchGoogleForParticipant(item);
        } else {
          s.emailConfirmQueue[s.emailConfirmIdx] = { ...item, foundEmails: [], stage: 'manual' };
          pushBot(`Please provide the email address you would like to use for **${participantName}**.`);
        }
        return;
      } else if (EMAIL_RE.test(text.trim())) {
        chosenEmail = text.trim().toLowerCase();
      } else {
        pushBot(`Please reply "yes" to use ${foundEmails[0].email}, or "no" to provide a different one.`);
        return;
      }

    } else {
      const num = parseInt(t, 10);
      if (!isNaN(num) && num >= 1 && num <= foundEmails.length) {
        chosenEmail = foundEmails[num - 1].email;
      } else if (NONE_WORDS.some((w) => t.includes(w))) {
        if (stage === 'mongo') {
          await searchGoogleForParticipant(item);
        } else {
          s.emailConfirmQueue[s.emailConfirmIdx] = { ...item, foundEmails: [], stage: 'manual' };
          pushBot(`Please provide the email address you would like to use for **${participantName}**.`);
        }
        return;
      } else if (EMAIL_RE.test(text.trim())) {
        chosenEmail = text.trim().toLowerCase();
      } else {
        pushBot(`Please type a number (1–${foundEmails.length}) to select an email, or type a new email address.`);
        return;
      }
    }

    await persistEmailAndAdvance(participantName, chosenEmail);
  }

  async function searchGoogleForParticipant(item) {
    const s = conv.current;
    const { participantName, foundEmails: mongoEmails } = item;
    const shownEmails = new Set(mongoEmails.map((e) => e.email.toLowerCase()));

    setLoading(true);
    try {
      const [calRes, googleRes] = await Promise.all([
        ContactAPI.searchCalendar(participantName).catch(() => ({ contacts: [] })),
        ContactAPI.searchGoogle(participantName).catch(() => ({ contacts: [] })),
      ]);

      const combined = [...(calRes.contacts || []), ...(googleRes.contacts || [])];
      const seen = new Set();
      const merged = [];
      for (const c of combined) {
        const key = c.email.toLowerCase();
        if (seen.has(key) || shownEmails.has(key)) continue;
        seen.add(key);
        merged.push({ name: c.name || participantName, email: key });
      }

      if (merged.length > 0) {
        s.emailConfirmQueue[s.emailConfirmIdx] = { ...item, foundEmails: merged, stage: 'google' };
        askNextEmailConfirm();
      } else {
        s.emailConfirmQueue[s.emailConfirmIdx] = { ...item, foundEmails: [], stage: 'manual' };
        pushBot(`I couldn't find an email for **${participantName}**.\n\nPlease provide their email address.`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function persistEmailAndAdvance(participantName, chosenEmail) {
    const s = conv.current;
    s.emailConfirmResult[participantName] = chosenEmail;
    try {
      await ContactAPI.saveContacts([{ name: participantName, email: chosenEmail }]);
      const refreshed = await ContactAPI.getContacts();
      contacts.current = refreshed.contacts || [];
    } catch (_) { /* silent — don't block flow */ }

    s.emailConfirmIdx += 1;

    if (s.emailConfirmIdx < s.emailConfirmQueue.length) {
      askNextEmailConfirm();
      return;
    }

    const updatedMeeting = {
      ...s.active,
      participant_emails: { ...s.active.participant_emails, ...s.emailConfirmResult },
    };
    s.active = updatedMeeting;

    // If we were collecting emails after slot selection, proceed directly to scheduling
    if (s.pendingSlot) {
      const slot = s.pendingSlot;
      s.pendingSlot = null;
      await doSchedule(slot);
      return;
    }

    const remaining = (updatedMeeting.missingFields || []).filter((f) => f.type !== 'email');
    proceedToMissing(updatedMeeting, remaining);
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
    const t = text.toLowerCase().trim();
    const updated = { ...meeting };
    let changed = false;

    // Time: "change time to 5pm" / "time: 3:30pm" / bare "3pm" / "3 pm"
    const timeMatch = t.match(/(?:(?:change\s+)?time\s+(?:to\s+)?|set\s+time\s+(?:to\s+)?)(.+)/)
      || t.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm))$/);
    if (timeMatch) {
      const parsed = parseTimeToHHMM(timeMatch[1].trim());
      if (parsed) {
        updated.time = parsed;
        changed = true;
      }
    }

    // Date: "change date to friday" / "date: tomorrow"
    const dateMatch = t.match(/(?:change\s+)?date\s+(?:to\s+)?(.+)/);
    if (dateMatch) {
      const parsed = parseNewDateTime(dateMatch[1].trim(), meeting);
      if (parsed) {
        updated.date = parsed.newDate;
        changed = true;
      }
    }

    // Duration: "change duration to 30 min" / "make it 2 hours"
    const durMatch = t.match(/(?:change\s+)?duration\s+(?:to\s+)?(.+)|make\s+it\s+(.+(?:hour|min|minute))/);
    if (durMatch) {
      const durStr = (durMatch[1] || durMatch[2]).trim();
      const mins = parseDurationToMinutes(durStr);
      updated.duration = mins;
      changed = true;
    }

    // Topic: "change topic to X" / "meeting is about X"
    const topicMatch = t.match(/(?:change\s+)?(?:topic|title|subject)\s+(?:to\s+)?(.+)/);
    if (topicMatch) {
      updated.meeting_title = topicMatch[1].trim();
      changed = true;
    }

    if (!changed) return null;
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

    // Try to extract answers for remaining missing fields from the same text
    while (s.missingIdx < s.missing.length) {
      const nextField = s.missing[s.missingIdx];
      const extracted = extractFieldFromText(text, nextField.type || nextField.field);
      if (extracted === null) break;
      s.answers = { ...s.answers, [nextField.field]: extracted };
      s.missingIdx += 1;
    }

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

  async function doPlatformSelection(meeting) {
    conv.current.active = meeting;
    conv.current.phase = PHASE.PLATFORM;
    conv.current.platform = null;

    // Fetch the user's connected meeting providers
    setLoading(true);
    let connectedProviders = [];
    let defaultProvider = null;
    try {
      const res = await IntegrationAPI.getConnected();
      connectedProviders = (res.meetingProviders || []).filter((p) => p.connected);
      defaultProvider = res.defaultMeetingProvider || null;
    } catch (_) {
      // API unavailable — assume Google Meet via Google Calendar
      connectedProviders = [{ id: 'google_meet', label: 'Google Meet', description: 'Free, built into Google Calendar', connected: true }];
    } finally {
      setLoading(false);
    }

    if (connectedProviders.length === 0) {
      pushBot(
        'No meeting providers are connected.\n\n' +
        'Please connect Google Calendar, Zoom, or another supported provider from the Integrations settings.'
      );
      conv.current.phase = PHASE.IDLE;
      return;
    }

    // User explicitly requested a specific provider (e.g. "use Zoom")
    const requestedProvider = meeting._requestedProvider || null;
    if (requestedProvider) {
      const match = connectedProviders.find((p) => p.id === requestedProvider);
      if (match) {
        await selectPlatformInternal(match.id, match.label);
        return;
      }
      const providerMeta = connectedProviders.find((p) => p.id === requestedProvider) ||
        { label: requestedProvider };
      pushBot(
        `I couldn't find a connected ${providerMeta.label || requestedProvider} account.\n\n` +
        `Would you like to connect it, or use your default provider instead?`,
        {
          type: 'platform-selection',
          platforms: connectedProviders,
          connectHint: requestedProvider,
        }
      );
      return;
    }

    // Auto-select only when there is exactly one connected provider
    if (connectedProviders.length === 1) {
      const p = connectedProviders[0];
      pushBot(`Using ${p.label} for this meeting.`);
      await selectPlatformInternal(p.id, p.label);
      return;
    }

    // Multiple providers → always ask the user; highlight the default if one is saved
    pushBot(
      `Which platform would you like to use for this meeting?`,
      { type: 'platform-selection', platforms: connectedProviders, defaultProvider }
    );
  }

  async function selectPlatformInternal(platformId, platformLabel) {
    conv.current.platform = platformId;
    const meeting = { ...conv.current.active, platform: platformId };
    conv.current.active = meeting;

    const label = platformLabel || platformId;
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
      const durationMin = parseDurationToMinutes(meeting.duration);

      // Reject slots that are already in the past
      const slotDt = new Date(`${meeting.date}T${meeting.time}:00`);
      if (!isNaN(slotDt.getTime()) && slotDt < new Date()) {
        pushBot(
          `**${formatTime(meeting.time)} on ${formatDate(meeting.date)}** is in the past. Please choose a future time.`
        );
        conv.current.phase = PHASE.NEEDS_NEW_TIME;
        return;
      }

      const res = await MeetingAPI.smartSuggest(meeting.date, meeting.time, durationMin);

      if (!res.conflict) {
        // Requested time is free — build a direct slot and show confirm card
        const endTime = addMinutes(meeting.time, durationMin);
        const slot = {
          date: meeting.date,
          startTime: meeting.time,
          endTime,
          startDisplay: formatTime(meeting.time),
          endDisplay: formatTime(endTime),
          durationMinutes: durationMin,
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
    await proceedToSchedule(slot);
  }

  async function doLoadSlots(meeting) {
    try {
      // Reject dates that are entirely in the past
      const dateEnd = new Date(`${meeting.date}T23:59:59`);
      if (!isNaN(dateEnd.getTime()) && dateEnd < new Date()) {
        pushBot(
          `**${formatDate(meeting.date)}** is in the past. Please choose a future date.`
        );
        conv.current.phase = PHASE.NEEDS_NEW_TIME;
        return;
      }

      const durationMin = parseDurationToMinutes(meeting.duration);
      const res = await MeetingAPI.getSlots(meeting.date, durationMin);
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

  // Collects any missing participant emails THEN schedules. This runs after slot
  // selection so we never ask for emails when the time slot might not be available.
  async function proceedToSchedule(slot) {
    const meeting = conv.current.active;
    const emailQueue = buildEmailConfirmQueue(meeting, contacts.current);
    if (emailQueue.length > 0) {
      conv.current.pendingSlot = slot;
      conv.current.emailConfirmQueue = emailQueue;
      conv.current.emailConfirmIdx = 0;
      conv.current.emailConfirmResult = { ...(meeting.participant_emails || {}) };
      conv.current.phase = PHASE.EMAIL_CONFIRM;
      askNextEmailConfirm();
      return;
    }
    await doSchedule(slot);
  }

  async function doSchedule(slot) {
    setLoading(true);
    try {
      const res = await MeetingAPI.schedule(conv.current.active, slot);
      conv.current.phase = PHASE.DONE;
      conv.current.pendingSlot = null;
      pushBot('', { type: 'confirmation', summary: res.summary });
      pushBot('Would you like to schedule another meeting? Just describe it and I\'ll get started.');
    } catch (e) {
      if (e.code === 'GOOGLE_REAUTH_REQUIRED') {
        pushBot(
          'Your Google session has expired. Please sign in with Google again (use the Sign In button above) and then retry scheduling.'
        );
      } else {
        pushBot(`Scheduling failed: ${e.message}. Please try again.`);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Provider preference handling ───────────────────────────────────────────

  async function tryHandleProviderPreference(text) {
    const lower = text.toLowerCase().trim();

    // "make X my default" / "set X as default" / "use X as default"
    const defaultIntent = /\b(make|set|use)\b.+\b(default|always)\b/i.test(lower)
      || /\bdefault.*(provider|meeting|platform)\b/i.test(lower);

    if (!defaultIntent) return false;

    const providerId = detectRequestedProvider(text);
    if (!providerId) {
      pushBot(
        'Which provider would you like to set as your default? Supported options: Google Meet, Zoom, Teams, Webex.'
      );
      return true;
    }

    setLoading(true);
    try {
      const res = await IntegrationAPI.updatePreferences({ defaultMeetingProvider: providerId });
      const updated = res.meetingProviders?.find((p) => p.id === providerId);
      const label = updated?.label || providerId;
      if (updated?.connected) {
        pushBot(`Done! ${label} is now your default meeting provider. Future meetings will use it automatically.`);
      } else {
        pushBot(
          `${label} has been set as your default provider.\n\n` +
          `Note: ${label} is not currently connected — you'll need to connect it before scheduling.`
        );
      }
    } catch (e) {
      pushBot(`Couldn't update your preference: ${e.message}`);
    } finally {
      setLoading(false);
    }
    return true;
  }

  // ── Follow-up meeting flow ─────────────────────────────────────────────────

  async function tryHandleFollowUp(text) {
    const lower = text.toLowerCase();
    const isFollowUpIntent =
      /\bfollow[- ]?up\b/i.test(lower) ||
      /\b(book|schedule|create|set\s+up)\s+(another|a\s+follow[- ]?up)\b/i.test(lower) ||
      /\bcontinue\s+(this|the)\s+discussion\b/i.test(lower) ||
      /\b(another|next)\s+meeting\s+with\s+(the\s+same|them|same\s+attendees?)\b/i.test(lower);

    if (!isFollowUpIntent) return false;

    setLoading(true);
    let allMeetings = [];
    try {
      const res = await MeetingAPI.getRecent(14);
      allMeetings = res.meetings || [];
    } catch (e) {
      pushBot(`Couldn't fetch recent meetings: ${e.message}`);
      setLoading(false);
      return true;
    } finally {
      setLoading(false);
    }

    if (allMeetings.length === 0) {
      pushBot(
        "I couldn't find any recent meetings to follow up on.\n\n" +
        'Try scheduling a new meeting instead — just describe it and I\'ll help you set it up.'
      );
      return true;
    }

    // Try to narrow by name mentioned in the request ("follow up with Rehan")
    const nameMatch = lower.match(/\bwith\s+([a-z][a-z\s]+?)(?:\s+about|\s+on|\s+regarding|\s+next|$)/i);
    let candidates = allMeetings;
    if (nameMatch) {
      const name = nameMatch[1].trim().toLowerCase();
      const filtered = allMeetings.filter((m) =>
        m.participants.some((p) => p.toLowerCase().includes(name) || name.includes(p.toLowerCase()))
      );
      if (filtered.length > 0) candidates = filtered;
    }

    // Parse date/time from the original request so startFollowUp can pre-fill them.
    // parseNewDateTime requires a time — fall back to date-only parse when no time is given.
    const parsedDT = parseNewDateTime(text, null);
    conv.current.followUpDate = parsedDT?.newDate || parseDateOnlyFromText(text) || null;
    conv.current.followUpTime = parsedDT?.newStartTime || null;

    conv.current.followUpCandidates = candidates;
    conv.current.phase = PHASE.FOLLOW_UP_SELECT;

    if (candidates.length === 1) {
      const m = candidates[0];
      const attendeeList = m.participants.length
        ? m.participants.join(', ')
        : 'No external attendees';
      pushBot(
        `Here's the most recent meeting I found:\n\n` +
        `  **${m.title}**\n` +
        `  With: ${attendeeList}\n` +
        `  Duration: ${m.duration} min\n` +
        `  Date: ${m.dateDisplay} at ${m.startDisplay}\n\n` +
        `Would you like to schedule a follow-up for this meeting? Reply "yes" to continue or "no" to cancel.`
      );
    } else {
      const lines = candidates
        .slice(0, 5)
        .map((m, i) => `${i + 1}. **${m.title}** — ${m.dateDisplay}${m.participants.length ? ` (with ${m.participants.slice(0, 2).join(', ')}${m.participants.length > 2 ? '...' : ''})` : ''}`);
      pushBot(
        `I found ${candidates.length} recent meeting${candidates.length > 1 ? 's' : ''}. Which one would you like to follow up on?\n\n${lines.join('\n')}\n\nType the number or meeting name.`
      );
    }

    return true;
  }

  async function doFollowUpSelect(text) {
    const t = text.trim().toLowerCase();
    const candidates = conv.current.followUpCandidates;

    // Single candidate — user is answering yes/no
    if (candidates.length === 1) {
      const YES = ['yes', 'y', 'sure', 'ok', 'yep', 'yeah', 'confirm', 'do it'];
      const NO  = ['no', 'n', 'nope', 'cancel', 'nevermind', 'never mind', 'abort'];

      if (NO.includes(t)) {
        resetConv();
        pushBot("No problem! Let me know if you'd like to schedule something else.");
        return;
      }

      if (YES.includes(t)) {
        await startFollowUp(candidates[0]);
        return;
      }

      pushBot('Reply "yes" to schedule the follow-up, or "no" to cancel.');
      return;
    }

    // Multiple candidates — user is picking one
    const num = parseInt(t, 10);
    let picked = null;

    if (!isNaN(num) && num >= 1 && num <= candidates.length) {
      picked = candidates[num - 1];
    } else {
      picked = candidates.find((m) => m.title.toLowerCase().includes(t));
    }

    if (!picked) {
      pushBot(`Please type a number (1–${Math.min(candidates.length, 5)}) or the meeting name to select.`);
      return;
    }

    // Show details for the picked meeting and ask to confirm
    conv.current.followUpCandidates = [picked];
    const attendeeList = picked.participants.length ? picked.participants.join(', ') : 'No external attendees';
    pushBot(
      `Here's the meeting I found:\n\n` +
      `  **${picked.title}**\n` +
      `  With: ${attendeeList}\n` +
      `  Duration: ${picked.duration} min\n` +
      `  Date: ${picked.dateDisplay} at ${picked.startDisplay}\n\n` +
      `Would you like to schedule a follow-up for this meeting? Reply "yes" to continue or "no" to cancel.`
    );
  }

  async function startFollowUp(originalMeeting) {
    const prefilledMeeting = {
      meeting_title: `Follow-up: ${originalMeeting.title}`,
      participants: originalMeeting.participants,
      participant_emails: originalMeeting.participant_emails,
      duration: originalMeeting.duration || 60,
      ...(conv.current.followUpDate ? { date: conv.current.followUpDate } : {}),
      ...(conv.current.followUpTime ? { time: conv.current.followUpTime } : {}),
    };

    setLoading(true);
    try {
      const res = await MeetingAPI.validate(prefilledMeeting, {});
      const meeting = res.meeting || prefilledMeeting;
      const missingFields = res.missingFields || [];

      // Reset to a clean slate then wire up the pre-filled meeting
      resetConv();
      conv.current.active = meeting;

      const attendeeDisplay = originalMeeting.participants.join(', ') || 'same attendees';
      const hasDate = !!prefilledMeeting.date;
      const hasTime = !!prefilledMeeting.time;
      const nextStep = hasDate && hasTime
        ? "I'll confirm the details with you next."
        : hasDate
          ? "Just need a time."
          : "Let's set the date and time.";
      pushBot(
        `Starting follow-up for **${originalMeeting.title}** with ${attendeeDisplay}.\n\n${nextStep}`
      );

      proceedToMissing(meeting, missingFields);
    } catch (e) {
      pushBot(`Something went wrong: ${e.message}. Please try again.`);
      resetConv();
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
    const activeFlowPhases = [PHASE.EMAIL_CONFIRM, PHASE.MISSING, PHASE.CONFIRM, PHASE.PLATFORM, PHASE.SLOTS, PHASE.PICKING];
    if (activeFlowPhases.includes(currentPhase)) {
      resetConv();
    }

    const targetDate = parseDateOnlyFromText(lower);
    const dateLabel = targetDate
      ? new Date(targetDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      : 'today';

    setLoading(true);
    let meetings = [];
    try {
      const res = targetDate ? await AgendaAPI.getForDate(targetDate) : await AgendaAPI.getToday();
      meetings = (res.meetings || []).filter((m) => m.id); // only real events can be modified
    } catch (e) {
      pushBot(`Couldn't fetch your meetings: ${e.message}`);
      setLoading(false);
      return true;
    } finally {
      setLoading(false);
    }

    if (meetings.length === 0) {
      pushBot(`You have no modifiable meetings on ${dateLabel}. (Only Google Calendar events can be cancelled or rescheduled.)`);
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

  async function doHandleNewTime(text) {
    const active = conv.current.active;
    const parsed = parseNewDateTime(text, active);

    if (!parsed) {
      pushBot("I couldn't understand that time. Try something like \"4pm\", \"tomorrow 3pm\", or \"Friday at 2:30pm\".");
      return;
    }

    const updatedMeeting = {
      ...active,
      date: parsed.newDate,
      time: parsed.newStartTime,
    };
    conv.current.active = updatedMeeting;

    setLoading(true);
    try {
      await proceedToSlots(updatedMeeting);
    } catch (e) {
      pushBot(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Resolves a typed provider name against connected providers; returns the match or null.
  async function resolveProviderFromText(text) {
    let connectedProviders = [];
    try {
      const res = await IntegrationAPI.getConnected();
      connectedProviders = (res.meetingProviders || []).filter((p) => p.connected);
    } catch (_) {
      connectedProviders = [{ id: 'google_meet', label: 'Google Meet' }];
    }

    const lower = text.toLowerCase();
    for (const { id, keywords } of PROVIDER_KEYWORDS) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return connectedProviders.find((p) => p.id === id) || null;
      }
    }
    // Fallback: match by number (user types "1", "2", etc.)
    const num = parseInt(lower, 10);
    if (!isNaN(num) && num >= 1 && num <= connectedProviders.length) {
      return connectedProviders[num - 1];
    }
    return null;
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
      pendingSlot: null,
      emailConfirmQueue: [],
      emailConfirmIdx: 0,
      emailConfirmResult: {},
      followUpCandidates: [],
      followUpDate: null,
      followUpTime: null,
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

// Provider keyword map — extend this list when new providers are added to the registry
const PROVIDER_KEYWORDS = [
  { id: 'zoom',        keywords: ['zoom'] },
  { id: 'google_meet', keywords: ['google meet', 'gmeet'] },
  { id: 'teams',       keywords: ['teams', 'microsoft teams', 'ms teams'] },
  { id: 'webex',       keywords: ['webex', 'cisco webex'] },
];

// Extracts an explicit provider preference from free-form text.
// Returns the provider id string or null.
// Uses word-boundary matching so "meeting" doesn't match "meet", etc.
function detectRequestedProvider(text) {
  const lower = text.toLowerCase();
  for (const { id, keywords } of PROVIDER_KEYWORDS) {
    if (keywords.some((kw) => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`).test(lower);
    })) return id;
  }
  return null;
}

// Finds all contacts that fuzzy-match a participant name (same logic as backend applyContactEmails)
function findContactsByName(participantName, contactList) {
  const q = participantName.toLowerCase().trim();
  return contactList.filter((c) => {
    const cn = c.name.toLowerCase();
    const firstWord = cn.split(/\s+/)[0];
    return (
      cn === q ||
      firstWord === q ||
      cn.includes(q) ||
      q.includes(firstWord)
    );
  });
}

// Silently pre-fills participant_emails from the local contact cache.
// Single unambiguous match → auto-use. Multiple matches → leave for buildEmailConfirmQueue.
function enrichEmailsFromContacts(meeting, contactList) {
  const participants = meeting.participants || [];
  if (!participants.length) return meeting;
  const emails = { ...(meeting.participant_emails || {}) };
  for (const name of participants) {
    if (emails[name]) continue; // already resolved by backend or previous step
    const matches = findContactsByName(name, contactList);
    if (matches.length === 1) emails[name] = matches[0].email;
  }
  return { ...meeting, participant_emails: emails };
}

// Builds the email confirmation queue using only MongoDB contacts.
// Google Calendar / Google Contacts are searched lazily when the user rejects a MongoDB result.
function buildEmailConfirmQueue(meeting, contactList) {
  const participants = meeting.participants || [];
  if (participants.length === 0) return [];

  const queue = [];
  for (const name of participants) {
    const internalMatches = findContactsByName(name, contactList);
    const alreadyResolved = meeting.participant_emails?.[name];

    const seen = new Set();
    const deduped = [];
    for (const c of internalMatches) {
      const key = c.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push({ name: c.name, email: key });
    }

    if (deduped.length > 0) {
      queue.push({ participantName: name, foundEmails: deduped, stage: 'mongo' });
    } else if (!alreadyResolved) {
      queue.push({ participantName: name, foundEmails: [], stage: 'mongo' });
    }
  }
  return queue;
}

async function tryAnswerCalendarQuestion(text, pushBot, setLoading, onEventMentioned = null) {
  const lower = text.toLowerCase();

  // Don't intercept scheduling or follow-up requests — they happen to contain "meeting" and "today"
  const isSchedulingRequest =
    /\b(schedule|book|create|set\s+up|plan|arrange|add|make)\b/i.test(lower) ||
    // Fuzzy-match common "schedule" typos: scedule, shedule, schedual, etc.
    /\bsc[hk]?[ae]?d[ue]{0,2}l/i.test(lower) ||
    // "need/want/have to [schedule/book/meet]" expresses scheduling intent
    /\b(need|want|have)\s+(to\s+)?(schedule|book|create|meet|set\s+up|scedule|shedule)/i.test(lower) ||
    // bare "need" before a meeting noun is scheduling intent, not a lookup
    /\bneed\s+(a\s+)?(meeting|call|appointment|sync|session)/i.test(lower);
  if (isSchedulingRequest) return false;
  const isFollowUpRequest = /\bfollow[- ]?up\b/i.test(lower);
  if (isFollowUpRequest) return false;

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

// Returns YYYY-MM-DD using local date parts (avoids UTC off-by-one in non-UTC timezones)
function localISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Extracts only a date from free-form text (no time required). Returns YYYY-MM-DD or null.
function parseDateOnlyFromText(text) {
  const lower = text.toLowerCase().replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1');
  const today = new Date();

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1); return localISODate(d);
  }
  if (/\btoday\b/.test(lower)) return localISODate(today);
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 7); return localISODate(d);
  }
  const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const dayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const targetDay = DAYS.indexOf(dayMatch[2]);
    const d = new Date(today);
    let diff = targetDay - d.getDay();
    if (diff <= 0 || dayMatch[1]) diff += 7;
    d.setDate(d.getDate() + diff);
    return localISODate(d);
  }
  const MONTH_MAP = {
    jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
    may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,
    oct:10,october:10,nov:11,november:11,dec:12,december:12,
  };
  const mFmt1 = lower.match(/\b([a-z]+)\s+(\d{1,2})(?:[,\s]+(\d{4}))?\b/);
  if (mFmt1 && MONTH_MAP[mFmt1[1]]) {
    const yr = mFmt1[3] ? parseInt(mFmt1[3]) : today.getFullYear();
    return `${yr}-${String(MONTH_MAP[mFmt1[1]]).padStart(2,'0')}-${String(parseInt(mFmt1[2])).padStart(2,'0')}`;
  }
  const mFmt2 = lower.match(/\b(\d{1,2})\s+([a-z]+)(?:[,\s]+(\d{4}))?\b/);
  if (mFmt2 && MONTH_MAP[mFmt2[2]]) {
    const yr = mFmt2[3] ? parseInt(mFmt2[3]) : today.getFullYear();
    return `${yr}-${String(MONTH_MAP[mFmt2[2]]).padStart(2,'0')}-${String(parseInt(mFmt2[1])).padStart(2,'0')}`;
  }
  return null;
}

// Tries to extract a specific field type from free-form text.
// Returns the extracted value (string/number) or null if not found.
function extractFieldFromText(text, fieldType) {
  const lower = text.toLowerCase().trim();
  if (fieldType === 'duration') {
    const m = lower.match(/\b(\d+(?:\.\d+)?)\s*(h(?:our)?s?|min(?:ute)?s?)\b/);
    if (!m) return null;
    const val = parseFloat(m[1]);
    const unit = m[2];
    return /^h/.test(unit) ? String(Math.round(val * 60)) : String(Math.round(val));
  }
  if (fieldType === 'time') {
    const m = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
    if (!m) return null;
    return parseTimeToHHMM(`${m[1]}${m[2] ? ':' + m[2] : ''} ${m[3]}`);
  }
  return null;
}

// Converts a raw time string like "3 pm", "3:30pm", "15:00" to "HH:MM" or null
function parseTimeToHHMM(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  const m = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] || '0', 10);
  const meridiem = m[3];
  if (meridiem === 'pm' && h < 12) h += 12;
  else if (meridiem === 'am' && h === 12) h = 0;
  else if (!meridiem && h < 7) h += 12; // assume PM for ambiguous small hours
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// Parses a new date+time from user text, returns structured object or null
function parseNewDateTime(text, existingEvent) {
  // Normalise ordinal suffixes: "4th june" → "4 june", "1st" → "1"
  const lower = text.toLowerCase().replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1');

  // ── Parse date ────────────────────────────────────────────────────────────
  let newDate = null;
  const today = new Date();

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    newDate = localISODate(d);
  } else if (/\btoday\b/.test(lower)) {
    newDate = localISODate(today);
  } else if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 7);
    newDate = localISODate(d);
  } else {
    const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dayMatch = lower.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (dayMatch) {
      const targetDay = DAYS.indexOf(dayMatch[2]);
      const d = new Date(today);
      let diff = targetDay - d.getDay();
      if (diff <= 0 || dayMatch[1]) diff += 7;
      d.setDate(d.getDate() + diff);
      newDate = localISODate(d);
    } else {
      // Month-name formats: "june 4", "4 june", "june 4 2026"
      const MONTH_MAP = {
        jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
        may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,
        oct:10,october:10,nov:11,november:11,dec:12,december:12,
      };
      const mFmt1 = lower.match(/\b([a-z]+)\s+(\d{1,2})(?:[,\s]+(\d{4}))?\b/);
      const mFmt2 = lower.match(/\b(\d{1,2})\s+([a-z]+)(?:[,\s]+(\d{4}))?\b/);
      if (mFmt1 && MONTH_MAP[mFmt1[1]]) {
        const yr = mFmt1[3] ? parseInt(mFmt1[3]) : today.getFullYear();
        const mo = String(MONTH_MAP[mFmt1[1]]).padStart(2,'0');
        const dy = String(parseInt(mFmt1[2])).padStart(2,'0');
        newDate = `${yr}-${mo}-${dy}`;
      } else if (mFmt2 && MONTH_MAP[mFmt2[2]]) {
        const yr = mFmt2[3] ? parseInt(mFmt2[3]) : today.getFullYear();
        const mo = String(MONTH_MAP[mFmt2[2]]).padStart(2,'0');
        const dy = String(parseInt(mFmt2[1])).padStart(2,'0');
        newDate = `${yr}-${mo}-${dy}`;
      }
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
  if (!newDate) newDate = existingEvent?.date || localISODate(today);

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

// Converts any duration value to an integer number of minutes.
// Handles: number (30), string int ("30"), HH:MM string ("00:30"), "1 hour", "1.5 hours".
function parseDurationToMinutes(duration) {
  if (duration === null || duration === undefined || duration === '') return 60;
  if (typeof duration === 'number') return Math.max(1, Math.round(duration));
  const str = String(duration).trim();
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + m || 60;
  }
  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (hourMatch) return Math.max(1, Math.round(parseFloat(hourMatch[1]) * 60));
  return parseInt(str, 10) || 60;
}

function addMinutes(time, minutes) {
  if (!time) return '00:00';
  const parts = time.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1] || '0', 10) || 0;
  const mins = parseDurationToMinutes(minutes);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatTime(time) {
  if (!time) return '';
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(isNaN(m) ? 0 : m).padStart(2, '0')} ${period}`;
}

function formatDate(iso) {
  if (!iso) return '';
  // Guard: only append T12:00:00 for valid ISO date strings to avoid "Invalid Date"
  const isISODate = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = isISODate ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (isNaN(d.getTime())) return iso; // return raw string rather than "Invalid Date"
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
