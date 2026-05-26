const DateParser = require('../utils/DateParser');

class PromptBuilder {
  static extractMeetingInfo(notes) {
    const today = DateParser.toISODate(new Date());
    const todayDisplay = DateParser.formatDateDisplay(today);

    return `You are a precise meeting scheduler AI. Extract all meeting/task information from the notes below.

Today is ${todayDisplay} (${today}).

NOTES:
"""
${notes}
"""

Parse relative dates relative to today:
- "tomorrow" = ${DateParser.toISODate((() => { const d = new Date(); d.setDate(d.getDate()+1); return d; })())}
- "Monday/Tuesday/.../Sunday" = the NEXT occurrence of that weekday
- "next week" = 7 days from today
- "Friday" = the next upcoming Friday

Return ONLY a valid JSON object with this exact structure. No markdown, no explanation:
{
  "meetings": [
    {
      "id": "unique-id-1",
      "meeting_title": "string (concise title)",
      "participants": ["Full Name 1", "Full Name 2"],
      "participant_emails": {"Full Name 1": null, "Full Name 2": null},
      "task": "string (what needs to be done)",
      "owner": "string (person responsible, or null)",
      "deadline": "YYYY-MM-DD or null",
      "date": "YYYY-MM-DD or null",
      "time": "HH:MM (24h) or null",
      "duration": 60
    }
  ]
}

Rules:
- Extract EACH separate task/meeting as its own entry
- Set participant_emails values to null if not mentioned
- Convert all relative dates to absolute YYYY-MM-DD format
- Default duration to 60 if not specified
- meeting_title should be descriptive (e.g. "Frontend Login Page Development")
- owner is the person assigned to do the task`;
  }

  static generateMeetingSummary(meeting) {
    return `Summarize this scheduled meeting in a professional, friendly single paragraph:

Meeting: ${meeting.meeting_title}
Date: ${DateParser.formatDateDisplay(meeting.date)}
Time: ${DateParser.formatTimeDisplay(meeting.time)} - ${DateParser.formatTimeDisplay(DateParser.addMinutes(meeting.time, meeting.duration))}
Duration: ${meeting.duration} minutes
Participants: ${(meeting.participants || []).join(', ')}
Task: ${meeting.task}
Owner: ${meeting.owner || 'Not assigned'}

Return only the summary paragraph, no JSON.`;
  }
}

module.exports = PromptBuilder;
