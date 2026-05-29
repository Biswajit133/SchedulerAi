const DateParser = require('../utils/DateParser');
const SlotFinder = require('../utils/SlotFinder');

class SmartSlotService {
  // Given a requested time that's busy, return nearest available slots sorted by proximity
  suggestNearestSlots(requestedTime, busySlots, date, durationMinutes, limit = 3) {
    // For today, exclude slots that have already passed
    const todayStr = new Date().toISOString().slice(0, 10);
    const minStart = date === todayStr ? SlotFinder.currentMinutes() : null;
    const available = SlotFinder.findAvailableSlots(busySlots, date, durationMinutes || 60, minStart);
    if (available.length === 0) return [];

    const reqMinutes = DateParser.timeToMinutes(requestedTime);

    const sorted = available
      .map((slot) => ({
        ...slot,
        _distance: Math.abs(DateParser.timeToMinutes(slot.startTime) - reqMinutes),
      }))
      .sort((a, b) => a._distance - b._distance)
      .slice(0, limit)
      .map(({ _distance, ...slot }) => slot);

    return sorted;
  }

  // Check if a requested time conflicts and return suggestions if so
  checkAndSuggest(requestedTime, busySlots, date, durationMinutes) {
    const reqStart = DateParser.timeToMinutes(requestedTime);
    const reqEnd = reqStart + (durationMinutes || 60);

    const conflicting = (busySlots || []).filter((slot) => {
      const s = DateParser.timeToMinutes(slot.startTime);
      const e = DateParser.timeToMinutes(slot.endTime);
      return reqStart < e && reqEnd > s;
    });

    if (conflicting.length === 0) {
      return { conflict: false, suggestions: [] };
    }

    const suggestions = this.suggestNearestSlots(requestedTime, busySlots, date, durationMinutes);
    return {
      conflict: true,
      conflictingWith: conflicting,
      message: `Selected slot ${DateParser.formatTimeDisplay(requestedTime)} is unavailable.`,
      suggestions,
    };
  }
}

module.exports = new SmartSlotService();
