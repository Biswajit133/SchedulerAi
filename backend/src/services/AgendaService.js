const DateParser = require('../utils/DateParser');
const SlotFinder = require('../utils/SlotFinder');
const CalendarService = require('./CalendarService');

const WORK_START = 7 * 60;   // 7:00 AM
const WORK_END   = 22 * 60;  // 10:00 PM

class AgendaService {
  async getTodayAgenda(authClient) {
    return this.getAgenda(DateParser.toISODate(new Date()), authClient);
  }

  async getAgenda(date, authClient) {
    const target = date || DateParser.toISODate(new Date());
    const { busySlots, demo } = await this._getBusySlots(target, authClient);
    const freeSlots = this._toFreeRanges(busySlots, target);

    return {
      date: target,
      dateDisplay: DateParser.formatDateDisplay(target),
      meetings: this._toMeetingList(busySlots),
      freeSlots,
      upcomingTasks: [],
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

  _toFreeRanges(busySlots, date) {
    const busy = (busySlots || [])
      .filter((s) => s.date === date || !s.date)
      .map((s) => ({
        start: DateParser.timeToMinutes(s.startTime),
        end:   DateParser.timeToMinutes(s.endTime),
      }))
      .sort((a, b) => a.start - b.start);

    const free = [];
    let cursor = WORK_START;

    for (const { start, end } of busy) {
      if (start > cursor) {
        const s = DateParser.minutesToTime(cursor);
        const e = DateParser.minutesToTime(start);
        free.push({
          startTime: s,
          endTime: e,
          startDisplay: DateParser.formatTimeDisplay(s),
          endDisplay: DateParser.formatTimeDisplay(e),
        });
      }
      cursor = Math.max(cursor, end);
    }

    if (cursor < WORK_END) {
      const s = DateParser.minutesToTime(cursor);
      const e = DateParser.minutesToTime(WORK_END);
      free.push({
        startTime: s,
        endTime: e,
        startDisplay: DateParser.formatTimeDisplay(s),
        endDisplay: DateParser.formatTimeDisplay(e),
      });
    }

    return free;
  }

  _toMeetingList(busySlots) {
    return (busySlots || [])
      .filter((s) => s.startTime)
      .map((s) => ({
        id: s.id || null,
        title: s.title || 'Busy',
        startTime: s.startTime,
        endTime: s.endTime,
        startDisplay: DateParser.formatTimeDisplay(s.startTime),
        endDisplay: DateParser.formatTimeDisplay(s.endTime),
        joinUrl: s.joinUrl || null,
        platform: s.platform || null,
        htmlLink: s.htmlLink || null,
        source: 'calendar',
      }))
      .sort((a, b) =>
        DateParser.timeToMinutes(a.startTime) - DateParser.timeToMinutes(b.startTime)
      );
  }
}

module.exports = new AgendaService();
