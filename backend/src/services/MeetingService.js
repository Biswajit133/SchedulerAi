const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const ProviderFactory = require('../providers/ProviderFactory');
const PromptBuilder = require('./PromptBuilder');
const ConflictService = require('./ConflictService');
const CalendarService = require('./CalendarService');
const DateParser = require('../utils/DateParser');

const STORAGE_PATH = path.join(__dirname, '../storage/meetings.json');

class MeetingService {
  constructor() {
    this.ai = ProviderFactory.create();
  }

  // ─── AI Extraction ────────────────────────────────────────────────────────

  async extractMeetingInfo(notes) {
    const prompt = PromptBuilder.extractMeetingInfo(notes);
    const raw = await this.ai.generate(prompt);
    const parsed = this.ai.parseJSON(raw);
    const meetings = (parsed.meetings || []).map((m) => ({
      id: m.id || uuidv4(),
      meeting_title: m.meeting_title || 'Untitled Meeting',
      participants: m.participants || [],
      participant_emails: m.participant_emails || {},
      task: m.task || '',
      owner: m.owner || null,
      deadline: m.deadline || null,
      date: m.date || null,
      time: m.time || null,
      duration: m.duration || 60,
    }));
    return meetings;
  }

  // ─── Missing Field Detection ───────────────────────────────────────────────

  findMissingFields(meeting) {
    const missing = [];

    const missingEmails = (meeting.participants || []).filter(
      (name) => !meeting.participant_emails?.[name]
    );
    if (missingEmails.length > 0) {
      missingEmails.forEach((name) => {
        missing.push({
          field: `email_${name}`,
          type: 'email',
          label: `Email address for ${name}`,
          question: `Please provide the email address for ${name}.`,
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
      if (field.startsWith('email_')) {
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

  async checkCalendarAvailability(date, durationMinutes) {
    return ConflictService.getAvailability(date, durationMinutes);
  }

  async findAvailableSlots(date, durationMinutes) {
    const { availableSlots, busySlots, demo } = await ConflictService.getAvailability(
      date,
      durationMinutes
    );
    return { availableSlots, busySlots, demo };
  }

  async createGoogleMeeting(meeting, slot) {
    const event = await CalendarService.createEvent(meeting, slot);
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
      demo: event.demo,
      invitesSent: participants.map((n) => emails[n]).filter(Boolean),
    };
  }

  // ─── Storage ───────────────────────────────────────────────────────────────

  saveMeeting(meetingData) {
    const all = this._loadAll();
    const record = { ...meetingData, savedAt: new Date().toISOString() };
    all.push(record);
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(all, null, 2));
    return record;
  }

  getAllMeetings() {
    return this._loadAll();
  }

  _loadAll() {
    try {
      if (!fs.existsSync(STORAGE_PATH)) return [];
      return JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
    } catch {
      return [];
    }
  }
}

module.exports = new MeetingService();
