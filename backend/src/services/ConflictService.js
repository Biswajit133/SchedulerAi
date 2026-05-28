const DateParser = require('../utils/DateParser');
const SlotFinder = require('../utils/SlotFinder');
const CalendarService = require('./CalendarService');

class ConflictService {
  async checkConflict(date, startTime, durationMinutes, authClient) {
    const { busySlots } = await CalendarService.getEvents(date, authClient);
    const reqStart = DateParser.timeToMinutes(startTime);
    const reqEnd   = reqStart + (durationMinutes || 60);

    const conflicting = busySlots.filter((slot) => {
      const s = DateParser.timeToMinutes(slot.startTime);
      const e = DateParser.timeToMinutes(slot.endTime);
      return reqStart < e && reqEnd > s;
    });

    return { hasConflict: conflicting.length > 0, conflicting };
  }

  async getAvailability(date, durationMinutes, authClient) {
    const { busySlots, demo } = await CalendarService.getEvents(date, authClient);

    // For today: only show slots from now onward
    const today = DateParser.toISODate(new Date());
    const minStartMinutes = date === today ? SlotFinder.currentMinutes() : null;

    const availableSlots = SlotFinder.findAvailableSlots(
      busySlots, date, durationMinutes || 60, minStartMinutes
    );

    return { date, busySlots, availableSlots, demo };
  }
}

module.exports = new ConflictService();
