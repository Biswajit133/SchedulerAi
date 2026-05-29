const DateParser = require('./DateParser');

const WORK_START = 7 * 60;    // 7:00 AM
const WORK_END   = 22 * 60;   // 10:00 PM
const SLOT_GRANULARITY = 15;  // minutes (finer grain for "now" use-cases)

class SlotFinder {
  /**
   * @param {Array}  busySlots
   * @param {string} date            ISO YYYY-MM-DD
   * @param {number} durationMinutes
   * @param {number|null} minStartMinutes  If set, slots before this minute-of-day are excluded.
   *                                       Pass null (or omit) to use WORK_START.
   */
  static findAvailableSlots(busySlots, date, durationMinutes, minStartMinutes = null) {
    const duration = durationMinutes || 60;
    const startFloor = minStartMinutes !== null
      ? Math.max(WORK_START, minStartMinutes)
      : WORK_START;

    const freeRanges = this._getFreeRanges(busySlots, date, startFloor);
    const slots = [];

    for (const { start, end } of freeRanges) {
      let cursor = start;
      while (cursor + duration <= end) {
        slots.push({
          date,
          startTime: DateParser.minutesToTime(cursor),
          endTime:   DateParser.minutesToTime(cursor + duration),
          startDisplay: DateParser.formatTimeDisplay(DateParser.minutesToTime(cursor)),
          endDisplay:   DateParser.formatTimeDisplay(DateParser.minutesToTime(cursor + duration)),
          durationMinutes: duration,
        });
        cursor += SLOT_GRANULARITY;
      }
    }

    return slots;
  }

  static _getFreeRanges(busySlots, date, startFloor = WORK_START) {
    const busy = (busySlots || [])
      .filter((s) => s.date === date || !s.date)
      .map((s) => ({
        start: DateParser.timeToMinutes(s.startTime),
        end:   DateParser.timeToMinutes(s.endTime),
      }))
      .sort((a, b) => a.start - b.start);

    const free = [];
    let cursor = startFloor;

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
        const endDt   = new Date(event.end.dateTime   || event.end.date);
        // Use LOCAL date (getFullYear/Month/Date), not UTC from toISOString(),
        // so events aren't dropped in UTC+ timezones where toISOString() can
        // give the previous day for early-morning local events.
        const localDate = `${startDt.getFullYear()}-${String(startDt.getMonth() + 1).padStart(2, '0')}-${String(startDt.getDate()).padStart(2, '0')}`;
        if (localDate !== date) return null;
        const startTime = `${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`;
        const endTime   = `${String(endDt.getHours()).padStart(2, '0')}:${String(endDt.getMinutes()).padStart(2, '0')}`;
        // Detect platform and join URL
        let joinUrl = null;
        let platform = null;

        if (event.hangoutLink) {
          joinUrl = event.hangoutLink;
          platform = 'google_meet';
        } else if (event.conferenceData?.entryPoints) {
          const videoEp = event.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video');
          if (videoEp?.uri) {
            joinUrl = videoEp.uri;
            platform = videoEp.uri.includes('zoom.us') ? 'zoom' : 'google_meet';
          }
        }

        if (!joinUrl && event.description) {
          const zoomMatch = event.description.match(/https:\/\/(?:[a-z0-9]+\.)*zoom\.us\/j\/[^\s<"]+/);
          if (zoomMatch) { joinUrl = zoomMatch[0]; platform = 'zoom'; }
          if (!joinUrl) {
            const teamsMatch = event.description.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<"]+/);
            if (teamsMatch) { joinUrl = teamsMatch[0]; platform = 'teams'; }
          }
        }

        return {
          date, startTime, endTime,
          title: event.summary || 'Busy',
          joinUrl,
          platform,
          htmlLink: event.htmlLink || null,
        };
      })
      .filter(Boolean);
  }

  static getMockBusySlots(date) {
    const now = new Date();
    const h   = now.getHours();
    const hh  = (n) => String(n).padStart(2, '0');
    // Put one mock busy slot 1 hour from now so "urgent" testing shows a real conflict
    return [
      { date, startTime: `${hh(h + 1)}:00`, endTime: `${hh(h + 2)}:00`, title: 'Team Standup' },
    ];
  }

  // Returns current time-of-day in minutes
  static currentMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

module.exports = SlotFinder;
