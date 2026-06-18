const DateParser = require('../utils/DateParser');
const SlotFinder = require('../utils/SlotFinder');
const CalendarService = require('./CalendarService');
const OutlookCalendarService = require('./OutlookCalendarService');

const WORK_START = 7 * 60;   // 7:00 AM
const WORK_END   = 22 * 60;  // 10:00 PM

class AgendaService {
  async getTodayAgenda(authClient, timeZone, calendarService = CalendarService) {
    const today = DateParser.toISODate(new Date(), timeZone || null);
    return this.getAgenda(today, authClient, timeZone, calendarService);
  }

  async getAgenda(date, authClient, timeZone, calendarService = CalendarService) {
    const target = date || DateParser.toISODate(new Date(), timeZone || null);
    const { busySlots, demo } = await this._getBusySlots(target, authClient, timeZone, calendarService);
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

  async getAgendaFromBoth(date, googleClient, outlookToken, timeZone) {
    const target = date || DateParser.toISODate(new Date(), timeZone || null);

    const [googleResult, outlookResult] = await Promise.allSettled([
      googleClient
        ? CalendarService.getEvents(target, googleClient, timeZone)
        : Promise.resolve({ busySlots: [], demo: false }),
      outlookToken
        ? OutlookCalendarService.getEvents(target, outlookToken, timeZone)
        : Promise.resolve({ busySlots: [], demo: false }),
    ]);

    const googleSlots = googleResult.status === 'fulfilled' ? (googleResult.value.busySlots || []) : [];
    const outlookSlots = outlookResult.status === 'fulfilled' ? (outlookResult.value.busySlots || []) : [];
    const demo = !googleClient && !outlookToken;

    const busySlots = [
      ...googleSlots.map((s) => ({ ...s, calendarSource: 'google' })),
      ...outlookSlots.map((s) => ({ ...s, calendarSource: 'outlook' })),
    ];

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

  async _getBusySlots(date, authClient, timeZone, calendarService = CalendarService) {
    try {
      const result = await calendarService.getEvents(date, authClient, timeZone);
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
