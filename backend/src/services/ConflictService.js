const DateParser = require('../utils/DateParser');
const SlotFinder = require('../utils/SlotFinder');
const CalendarService = require('./CalendarService');

class ConflictService {
  async checkConflict(date, startTime, durationMinutes) {
    const { busySlots } = await CalendarService.getEvents(date);
    const reqStart = DateParser.timeToMinutes(startTime);
    const reqEnd = reqStart + (durationMinutes || 60);

    const conflicting = busySlots.filter((slot) => {
      const slotStart = DateParser.timeToMinutes(slot.startTime);
      const slotEnd = DateParser.timeToMinutes(slot.endTime);
      return reqStart < slotEnd && reqEnd > slotStart;
    });

    return {
      hasConflict: conflicting.length > 0,
      conflicting,
    };
  }

  async getAvailability(date, durationMinutes) {
    const { busySlots, demo } = await CalendarService.getEvents(date);
    const availableSlots = SlotFinder.findAvailableSlots(busySlots, date, durationMinutes || 60);

    return {
      date,
      busySlots,
      availableSlots,
      demo,
    };
  }
}

module.exports = new ConflictService();
