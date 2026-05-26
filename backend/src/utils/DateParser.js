const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

class DateParser {
  static getToday() {
    return new Date();
  }

  static toISODate(date) {
    return date.toISOString().split('T')[0];
  }

  static parseRelativeDate(text, referenceDate = new Date()) {
    if (!text) return null;
    const lower = text.toLowerCase().trim();
    const ref = new Date(referenceDate);
    ref.setHours(0, 0, 0, 0);

    if (lower === 'today') return this.toISODate(ref);
    if (lower === 'tomorrow') {
      const d = new Date(ref);
      d.setDate(d.getDate() + 1);
      return this.toISODate(d);
    }
    if (lower === 'day after tomorrow') {
      const d = new Date(ref);
      d.setDate(d.getDate() + 2);
      return this.toISODate(d);
    }
    if (lower === 'next week') {
      const d = new Date(ref);
      d.setDate(d.getDate() + 7);
      return this.toISODate(d);
    }

    const dayIdx = DAYS.indexOf(lower);
    if (dayIdx !== -1) {
      const d = new Date(ref);
      const current = d.getDay();
      let diff = dayIdx - current;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return this.toISODate(d);
    }

    // Already an ISO date
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    // Try parsing natural formats: "May 30", "30 May", "05/30/2025"
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) return this.toISODate(parsed);

    return null;
  }

  static parseTime(text) {
    if (!text) return null;
    const lower = text.toLowerCase().trim();

    // 24h format: "14:30"
    const h24 = lower.match(/^(\d{1,2}):(\d{2})$/);
    if (h24) {
      const h = parseInt(h24[1]);
      const m = parseInt(h24[2]);
      if (h < 24 && m < 60) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // 12h format: "2:30 pm", "10am"
    const h12 = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (h12) {
      let h = parseInt(h12[1]);
      const m = parseInt(h12[2] || '0');
      const meridiem = h12[3];
      if (meridiem === 'pm' && h !== 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    return null;
  }

  static parseDuration(text) {
    if (!text) return null;
    const lower = String(text).toLowerCase().trim();

    const hourMin = lower.match(/(\d+)\s*h(?:our)?s?\s*(?:(\d+)\s*m(?:in)?s?)?/);
    if (hourMin) {
      const h = parseInt(hourMin[1]) || 0;
      const m = parseInt(hourMin[2] || '0') || 0;
      return h * 60 + m;
    }

    const minOnly = lower.match(/(\d+)\s*m(?:in(?:ute)?s?)?/);
    if (minOnly) return parseInt(minOnly[1]);

    const hourOnly = lower.match(/(\d+)\s*h(?:our)?s?/);
    if (hourOnly) return parseInt(hourOnly[1]) * 60;

    const num = parseInt(lower);
    if (!isNaN(num)) return num;

    return null;
  }

  static formatDateDisplay(isoDate) {
    if (!isoDate) return 'TBD';
    const d = new Date(isoDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  static formatTimeDisplay(time24) {
    if (!time24) return 'TBD';
    const [h, m] = time24.split(':').map(Number);
    const meridiem = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${meridiem}`;
  }

  static addMinutes(time24, minutes) {
    const [h, m] = time24.split(':').map(Number);
    const total = h * 60 + m + minutes;
    const nh = Math.floor(total / 60) % 24;
    const nm = total % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }

  static timeToMinutes(time24) {
    const [h, m] = time24.split(':').map(Number);
    return h * 60 + m;
  }

  static minutesToTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

module.exports = DateParser;
