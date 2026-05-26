const DateParser = require('./DateParser');

const WORK_START = 9 * 60;   // 9:00 AM
const WORK_END = 18 * 60;    // 6:00 PM
const SLOT_GRANULARITY = 30; // minutes

class SlotFinder {
  static findAvailableSlots(busySlots, date, durationMinutes) {
    const duration = durationMinutes || 60;
    const freeRanges = this._getFreeRanges(busySlots, date);
    const slots = [];

    for (const { start, end } of freeRanges) {
      let cursor = start;
      while (cursor + duration <= end) {
        slots.push({
          date,
          startTime: DateParser.minutesToTime(cursor),
          endTime: DateParser.minutesToTime(cursor + duration),
          startDisplay: DateParser.formatTimeDisplay(DateParser.minutesToTime(cursor)),
          endDisplay: DateParser.formatTimeDisplay(DateParser.minutesToTime(cursor + duration)),
          durationMinutes: duration,
        });
        cursor += SLOT_GRANULARITY;
      }
    }

    return slots;
  }

  static _getFreeRanges(busySlots, date) {
    const busy = (busySlots || [])
      .filter((s) => s.date === date || !s.date)
      .map((s) => ({
        start: DateParser.timeToMinutes(s.startTime),
        end: DateParser.timeToMinutes(s.endTime),
      }))
      .sort((a, b) => a.start - b.start);

    const free = [];
    let cursor = WORK_START;

    for (const { start, end } of busy) {
      if (start > cursor) {
        free.push({ start: cursor, end: start });
      }
      cursor = Math.max(cursor, end);
    }

    if (cursor < WORK_END) {
      free.push({ start: cursor, end: WORK_END });
    }

    return free;
  }

  static normalizeBusySlots(googleEvents, date) {
    return googleEvents
      .filter((event) => event.start && event.end)
      .map((event) => {
        const startDt = new Date(event.start.dateTime || event.start.date);
        const endDt = new Date(event.end.dateTime || event.end.date);
        const eventDate = startDt.toISOString().split('T')[0];
        if (eventDate !== date) return null;
        const startTime = `${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`;
        const endTime = `${String(endDt.getHours()).padStart(2, '0')}:${String(endDt.getMinutes()).padStart(2, '0')}`;
        return { date, startTime, endTime, title: event.summary || 'Busy' };
      })
      .filter(Boolean);
  }

  static getMockBusySlots(date) {
    return [
      { date, startTime: '10:00', endTime: '11:00', title: 'Standup' },
      { date, startTime: '13:00', endTime: '14:00', title: 'Lunch' },
    ];
  }
}

module.exports = SlotFinder;
