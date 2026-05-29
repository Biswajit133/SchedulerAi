const { v4: uuidv4 } = require('uuid');
const ProviderFactory = require('../providers/ProviderFactory');
const PromptBuilder = require('./PromptBuilder');
const ConflictService = require('./ConflictService');
const CalendarService = require('./CalendarService');
const DateParser = require('../utils/DateParser');
const NaturalLanguageParser = require('./NaturalLanguageParser');
const PriorityService = require('./PriorityService');
const SmartSlotService = require('./SmartSlotService');
const PlatformFactory = require('../meetingPlatforms/PlatformFactory');

class MeetingService {
  constructor() {
    this.ai = ProviderFactory.create();
  }

  // ─── AI Extraction ────────────────────────────────────────────────────────

  async extractMeetingInfo(notes) {
    const prompt = PromptBuilder.extractMeetingInfo(notes);
    const raw = await this.ai.generate(prompt);
    const parsed = this.ai.parseJSON(raw);
    const meetings = (parsed.meetings || []).map((m) => {
      const base = {
        id: m.id || uuidv4(),
        meeting_title: m.meeting_title || null,
        participants: m.participants || [],
        participant_emails: m.participant_emails || {},
        task: m.task || '',
        owner: m.owner || null,
        deadline: m.deadline || null,
        date: m.date || null,
        time: m.time || null,
        duration: m.duration || null,
      };
      // Enrich date/time from NL if AI didn't extract them
      const enriched = NaturalLanguageParser.enrichFromText(base, notes);
      // Annotate priority
      return { ...enriched, priority: PriorityService.detectFromMeeting(enriched) };
    });
    return meetings;
  }

  // ─── Missing Field Detection ───────────────────────────────────────────────

  findMissingFields(meeting) {
    const missing = [];

    if (!meeting.meeting_title) {
      missing.push({
        field: 'meeting_title',
        type: 'text',
        label: 'Meeting topic',
        question: 'What is the meeting about?',
      });
    }

    if (!meeting.participants || meeting.participants.length === 0) {
      missing.push({
        field: 'participants',
        type: 'participants',
        label: 'Meeting participants',
        question: 'Who should be invited? List their names separated by commas, or type "just me" to skip.',
      });
    } else {
      const missingEmails = meeting.participants.filter(
        (name) => !meeting.participant_emails?.[name]
      );
      missingEmails.forEach((name) => {
        missing.push({
          field: `email_${name}`,
          type: 'email',
          label: `Email address for ${name}`,
          question: `What is the email address for ${name}?`,
          participant: name,
        });
      });
    }

    if (!meeting.date) {
      missing.push({
        field: 'date',
        type: 'date',
        label: 'Meeting date',
        question: 'Please provide the meeting date.',
      });
    }

    if (!meeting.time) {
      missing.push({
        field: 'time',
        type: 'time',
        label: 'Meeting time',
        question: 'Please provide the meeting time.',
      });
    }

    if (!meeting.duration) {
      missing.push({
        field: 'duration',
        type: 'duration',
        label: 'Meeting duration',
        question: 'Please provide the meeting duration (e.g. 30 min, 1 hour).',
      });
    }

    return missing;
  }

  applyFieldAnswers(meeting, answers) {
    const updated = { ...meeting, participant_emails: { ...meeting.participant_emails } };

    for (const [field, value] of Object.entries(answers)) {
      if (field === 'meeting_title') {
        updated.meeting_title = value.trim();
      } else if (field === 'participants') {
        const lower = value.toLowerCase().trim();
        if (['just me', 'none', 'no one', 'skip', 'only me'].includes(lower)) {
          updated.participants = [];
        } else {
          updated.participants = value.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
          updated.participants.forEach((name) => {
            if (!updated.participant_emails[name]) updated.participant_emails[name] = null;
          });
        }
      } else if (field.startsWith('email_')) {
        const name = field.replace('email_', '');
        updated.participant_emails[name] = value;
      } else if (field === 'date') {
        updated.date = DateParser.parseRelativeDate(value) || value;
      } else if (field === 'time') {
        updated.time = DateParser.parseTime(value) || value;
      } else if (field === 'duration') {
        updated.duration = DateParser.parseDuration(value) || 60;
      }
    }

    return updated;
  }

  // ─── Calendar + Scheduling ─────────────────────────────────────────────────

  async checkCalendarAvailability(date, durationMinutes, authClient) {
    return ConflictService.getAvailability(date, durationMinutes, authClient);
  }

  async findAvailableSlots(date, durationMinutes, authClient) {
    const { availableSlots, busySlots, demo } = await ConflictService.getAvailability(
      date,
      durationMinutes,
      authClient
    );
    return { availableSlots, busySlots, demo };
  }

  async smartSuggestSlots(date, requestedTime, durationMinutes, authClient) {
    const { busySlots, demo } = await ConflictService.getAvailability(date, durationMinutes, authClient);
    const result = SmartSlotService.checkAndSuggest(requestedTime, busySlots, date, durationMinutes);
    return { ...result, demo };
  }

  async createGoogleMeeting(meeting, slot, authClient, zoomAccessToken) {
    const platform = meeting.platform || 'google_meet';
    const provider = PlatformFactory.create(platform);
    const event = await provider.createMeeting(meeting, slot, authClient, zoomAccessToken);
    return event;
  }

  async sendInvites(meeting, event) {
    // Invites are sent automatically by Google Calendar via sendUpdates:'all'
    // This hook is available for custom email logic if needed
    return {
      sent: Object.values(meeting.participant_emails || {}).filter(Boolean),
      method: event.demo ? 'demo_mode' : 'google_calendar',
    };
  }

  // ─── Confirmation ──────────────────────────────────────────────────────────

  generateSummary(meeting, slot, event) {
    const participants = meeting.participants || [];
    const emails = meeting.participant_emails || {};

    return {
      title: meeting.meeting_title,
      task: meeting.task,
      owner: meeting.owner,
      participants: participants.map((name) => ({
        name,
        email: emails[name] || null,
      })),
      date: slot.date,
      dateDisplay: DateParser.formatDateDisplay(slot.date),
      startTime: slot.startTime,
      endTime: slot.endTime,
      startDisplay: slot.startDisplay,
      endDisplay: slot.endDisplay,
      duration: slot.durationMinutes,
      calendarLink: event.htmlLink || null,
      meetLink: event.meetLink || null,
      platform: event.platform || 'google_meet',
      platformMeetingId: event.platformMeetingId || null,
      demo: event.demo,
      invitesSent: participants.map((n) => emails[n]).filter(Boolean),
    };
  }

  saveMeeting() {
    // Meetings are stored in Google Calendar — no local file storage needed
  }

  getAllMeetings() {
    return [];
  }
}

module.exports = new MeetingService();
