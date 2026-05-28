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

    // Month-name formats: "May 30", "30 May", "May 30 2026", "30 May 2026"
    const MONTH_MAP = {
      jan:1, january:1, feb:2, february:2, mar:3, march:3,
      apr:4, april:4, may:5, jun:6, june:6, jul:7, july:7,
      aug:8, august:8, sep:9, september:9, oct:10, october:10,
      nov:11, november:11, dec:12, december:12,
    };
    // "May 30" or "May 30 2026"
    const mName1 = lower.match(/^([a-z]+)\s+(\d{1,2})(?:[,\s]+(\d{4}))?$/);
    if (mName1 && MONTH_MAP[mName1[1]]) {
      const year = mName1[3] ? parseInt(mName1[3]) : referenceDate.getFullYear();
      return this._buildISO(year, MONTH_MAP[mName1[1]], parseInt(mName1[2]));
    }
    // "30 May" or "30 May 2026"
    const mName2 = lower.match(/^(\d{1,2})\s+([a-z]+)(?:[,\s]+(\d{4}))?$/);
    if (mName2 && MONTH_MAP[mName2[2]]) {
      const year = mName2[3] ? parseInt(mName2[3]) : referenceDate.getFullYear();
      return this._buildISO(year, MONTH_MAP[mName2[2]], parseInt(mName2[1]));
    }

    // MM/DD/YYYY or MM-DD-YYYY with explicit year
    const slash = lower.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (slash) return this._buildISO(parseInt(slash[3]), parseInt(slash[1]), parseInt(slash[2]));

    return null;
  }

  static _buildISO(year, month, day) {
    if (!year || !month || !day) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
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
