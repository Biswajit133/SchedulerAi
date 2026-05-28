const fs = require('fs');
const path = require('path');
const DateParser = require('../utils/DateParser');
const SlotFinder = require('../utils/SlotFinder');
const CalendarService = require('./CalendarService');

const STORAGE_PATH = path.join(__dirname, '../storage/meetings.json');

class AgendaService {
  async getTodayAgenda(authClient) {
    return this.getAgenda(DateParser.toISODate(new Date()), authClient);
  }

  async getAgenda(date, authClient) {
    const target = date || DateParser.toISODate(new Date());
    const { busySlots, demo } = await this._getBusySlots(target, authClient);
    const storedMeetings = this._loadStoredMeetings(target);
    const freeSlots = SlotFinder.findAvailableSlots(busySlots, target, 60);
    const upcomingTasks = this._getUpcomingTasks(target);
    const meetings = this._mergeAndSort(busySlots, storedMeetings, target);

    return {
      date: target,
      dateDisplay: DateParser.formatDateDisplay(target),
      meetings,
      freeSlots: freeSlots.slice(0, 5),
      upcomingTasks,
      demo,
    };
  }

  async _getBusySlots(date, authClient) {
    try {
      const result = await CalendarService.getEvents(date, authClient);
      return { busySlots: result.busySlots || [], demo: result.demo };
    } catch {
      return { busySlots: SlotFinder.getMockBusySlots(date), demo: true };
    }
  }

  _loadStoredMeetings(date) {
    try {
      if (!fs.existsSync(STORAGE_PATH)) return [];
      const all = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
      return all
        .filter((r) => r.meeting?.date === date || r.slot?.date === date)
        .map((r) => ({
          title: r.meeting?.meeting_title || 'Meeting',
          startTime: r.slot?.startTime || r.meeting?.time || null,
          endTime: r.slot?.endTime || null,
          owner: r.meeting?.owner || null,
          task: r.meeting?.task || null,
          source: 'stored',
        }));
    } catch {
      return [];
    }
  }

  _mergeAndSort(busySlots, storedMeetings, date) {
    const fromCalendar = (busySlots || []).map((s) => ({
      title: s.title || 'Busy',
      startTime: s.startTime,
      endTime: s.endTime,
      startDisplay: DateParser.formatTimeDisplay(s.startTime),
      endDisplay: DateParser.formatTimeDisplay(s.endTime),
      source: 'calendar',
    }));

    const fromStorage = storedMeetings.map((s) => ({
      ...s,
      startDisplay: s.startTime ? DateParser.formatTimeDisplay(s.startTime) : 'TBD',
      endDisplay: s.endTime ? DateParser.formatTimeDisplay(s.endTime) : 'TBD',
    }));

    // Deduplicate: prefer calendar entries; skip stored entries that overlap
    const calTimes = new Set(fromCalendar.map((m) => m.startTime));
    const unique = fromStorage.filter((m) => !calTimes.has(m.startTime));

    return [...fromCalendar, ...unique]
      .filter((m) => m.startTime)
      .sort((a, b) =>
        DateParser.timeToMinutes(a.startTime) - DateParser.timeToMinutes(b.startTime)
      );
  }

  _getUpcomingTasks(today) {
    try {
      if (!fs.existsSync(STORAGE_PATH)) return [];
      const all = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
      return all
        .filter((r) => {
          const d = r.meeting?.date || r.slot?.date;
          return d && d > today;
        })
        .sort((a, b) => {
          const da = a.meeting?.date || a.slot?.date || '';
          const db = b.meeting?.date || b.slot?.date || '';
          return da.localeCompare(db);
        })
        .slice(0, 5)
        .map((r) => ({
          title: r.meeting?.meeting_title || 'Meeting',
          date: r.meeting?.date || r.slot?.date,
          dateDisplay: DateParser.formatDateDisplay(r.meeting?.date || r.slot?.date),
          startTime: r.slot?.startTime || r.meeting?.time || null,
          startDisplay: r.slot?.startTime
            ? DateParser.formatTimeDisplay(r.slot.startTime)
            : 'TBD',
          owner: r.meeting?.owner || null,
        }));
    } catch {
      return [];
    }
  }
}

module.exports = new AgendaService();
