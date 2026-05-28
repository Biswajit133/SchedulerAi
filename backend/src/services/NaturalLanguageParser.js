const DateParser = require('../utils/DateParser');

const TIME_OF_DAY = {
  'morning':   '09:00',
  'afternoon': '13:00',
  'evening':   '17:00',
  'tonight':   '19:00',
  'night':     '19:00',
  'noon':      '12:00',
  'midnight':  '00:00',
};

const DAY_PHRASES = [
  'today', 'tomorrow', 'day after tomorrow',
  'next week', 'next monday', 'next tuesday', 'next wednesday',
  'next thursday', 'next friday', 'next saturday', 'next sunday',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

// Phrases meaning "right now" — resolve to today + current clock time
const NOW_PHRASES = ['right now', 'asap', 'immediately', 'urgent', 'now'];

class NaturalLanguageParser {
  parse(text, referenceDate = new Date()) {
    const lower = text.toLowerCase().trim();
    const result = { date: null, time: null };

    // ── "Now" / ASAP / urgent ────────────────────────────────────────────────
    if (NOW_PHRASES.some((p) => lower.includes(p))) {
      result.date = DateParser.toISODate(referenceDate);
      result.time = this._roundUpToNext15(referenceDate);
      // If text also has an explicit clock time, let the clock-match below override
    }

    // ── Time-of-day phrases ──────────────────────────────────────────────────
    for (const [phrase, time] of Object.entries(TIME_OF_DAY)) {
      if (lower.includes(phrase)) {
        result.time = time;
        break;
      }
    }

    // ── Explicit clock time (e.g. "at 3pm", "at 14:30") ────────────────────
    const clockMatch = lower.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
    if (clockMatch) {
      const parsed = DateParser.parseTime(clockMatch[1].trim());
      if (parsed) result.time = parsed;
    }

    // ── Date phrase ──────────────────────────────────────────────────────────
    if (!result.date) {
      const sortedPhrases = [...DAY_PHRASES].sort((a, b) => b.length - a.length);
      for (const phrase of sortedPhrases) {
        if (lower.includes(phrase)) {
          const dayWord = phrase.startsWith('next ') ? phrase.replace('next ', '') : phrase;
          const resolved = DateParser.parseRelativeDate(dayWord, referenceDate);
          if (resolved) {
            result.date = resolved;
            break;
          }
        }
      }
    }

    // ── Month-name in text: "May 30", "30 May", "May 30 2026" ───────────────
    if (!result.date) {
      const months = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
      // "May 30" or "May 30, 2026"
      const m1 = lower.match(new RegExp(`\\b(${months})\\s+(\\d{1,2})(?:[,\\s]+(\\d{4}))?\\b`));
      if (m1) {
        const frag = m1[3] ? `${m1[1]} ${m1[2]} ${m1[3]}` : `${m1[1]} ${m1[2]}`;
        result.date = DateParser.parseRelativeDate(frag, referenceDate);
      }
      // "30 May" or "30 May 2026"
      if (!result.date) {
        const m2 = lower.match(new RegExp(`\\b(\\d{1,2})\\s+(${months})(?:[,\\s]+(\\d{4}))?\\b`));
        if (m2) {
          const frag = m2[3] ? `${m2[2]} ${m2[1]} ${m2[3]}` : `${m2[2]} ${m2[1]}`;
          result.date = DateParser.parseRelativeDate(frag, referenceDate);
        }
      }
    }

    // ── ISO date fallback ────────────────────────────────────────────────────
    if (!result.date) {
      const isoMatch = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (isoMatch) result.date = isoMatch[1];
    }

    return result;
  }

  enrichFromText(meeting, rawText) {
    if (meeting.date && meeting.time) return meeting;
    const parsed = this.parse(rawText);
    return {
      ...meeting,
      date: meeting.date || parsed.date,
      time: meeting.time || parsed.time,
    };
  }

  // Round current time UP to the next 15-minute boundary, min +5 min buffer
  _roundUpToNext15(now = new Date()) {
    const h = now.getHours();
    const m = now.getMinutes() + 5; // 5-min buffer
    const rounded = Math.ceil(m / 15) * 15;
    const totalMin = h * 60 + rounded;
    const nh = Math.floor(totalMin / 60) % 24;
    const nm = totalMin % 60;
    return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
  }
}

module.exports = new NaturalLanguageParser();
