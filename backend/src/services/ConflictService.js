const DateParser = require('../utils/DateParser');
const SlotFinder = require('../utils/SlotFinder');
const CalendarService = require('./CalendarService');

class ConflictService {
  async checkConflict(date, startTime, durationMinutes, authClient, calendarService = CalendarService) {
    const { busySlots } = await calendarService.getEvents(date, authClient);
    const reqStart = DateParser.timeToMinutes(startTime);
    const reqEnd   = reqStart + (durationMinutes || 60);

    const conflicting = busySlots.filter((slot) => {
      const s = DateParser.timeToMinutes(slot.startTime);
      const e = DateParser.timeToMinutes(slot.endTime);
      return reqStart < e && reqEnd > s;
    });

    return { hasConflict: conflicting.length > 0, conflicting };
  }

  async getAvailability(date, durationMinutes, authClient, calendarService = CalendarService) {
    const { busySlots, demo } = await calendarService.getEvents(date, authClient);

    // For today: only show slots from now onward
    const today = DateParser.toISODate(new Date());
    const minStartMinutes = date === today ? SlotFinder.currentMinutes() : null;

    const availableSlots = SlotFinder.findAvailableSlots(
      busySlots, date, durationMinutes || 60, minStartMinutes
    );

    return { date, busySlots, availableSlots, demo };
  }

  // Check availability across both Google Calendar and Outlook Calendar simultaneously.
  // Busy slots from both are merged so a slot free in only one calendar is still shown as busy.
  async getAvailabilityFromBoth(date, durationMinutes, googleClient, googleService, outlookToken, outlookService) {
    const [googleResult, outlookResult] = await Promise.allSettled([
      googleClient
        ? googleService.getEvents(date, googleClient)
        : Promise.resolve({ busySlots: [], demo: true }),
      outlookToken
        ? outlookService.getEvents(date, outlookToken)
        : Promise.resolve({ busySlots: [], demo: true }),
    ]);

    const { busySlots: gBusy = [], demo: gDemo = true } =
      googleResult.status === 'fulfilled' ? googleResult.value : {};
    const { busySlots: oBusy = [], demo: oDemo = true } =
      outlookResult.status === 'fulfilled' ? outlookResult.value : {};

    const allBusySlots = [...gBusy, ...oBusy];
    // Only demo mode if both calendars returned demo data (i.e. neither is authenticated)
    const demo = gDemo && oDemo;

    const today = DateParser.toISODate(new Date());
    const minStartMinutes = date === today ? SlotFinder.currentMinutes() : null;

    const availableSlots = SlotFinder.findAvailableSlots(
      allBusySlots, date, durationMinutes || 60, minStartMinutes
    );

    return { date, busySlots: allBusySlots, availableSlots, demo };
  }
}

module.exports = new ConflictService();
