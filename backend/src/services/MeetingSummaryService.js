const ProviderFactory = require('../providers/ProviderFactory');
const DateParser = require('../utils/DateParser');

class MeetingSummaryService {
  constructor() {
    this.ai = ProviderFactory.create();
  }

  /**
   * Generate an AI summary for a list of meetings including action items,
   * owners, deadlines, and key decisions.
   */
  async generateBatchSummary(meetings) {
    if (!meetings || meetings.length === 0) {
      return { summary: 'No meetings to summarize.', actionItems: [], decisions: [] };
    }

    const prompt = this._buildPrompt(meetings);
    const raw = await this.ai.generate(prompt);

    try {
      const parsed = this.ai.parseJSON(raw);
      return {
        summary: parsed.summary || '',
        actionItems: parsed.actionItems || [],
        decisions: parsed.decisions || [],
      };
    } catch {
      // Fallback: build a simple summary without AI
      return this._fallbackSummary(meetings);
    }
  }

  /**
   * Generate a quick summary for a single meeting.
   */
  async generateSingleSummary(meeting) {
    return this.generateBatchSummary([meeting]);
  }

  _buildPrompt(meetings) {
    const list = meetings
      .map((m, i) => {
        const date = m.date ? DateParser.formatDateDisplay(m.date) : 'TBD';
        const time = m.time ? DateParser.formatTimeDisplay(m.time) : 'TBD';
        return `${i + 1}. ${m.meeting_title || 'Untitled'} — ${date} at ${time} | Owner: ${m.owner || 'Unassigned'} | Task: ${m.task || 'N/A'}`;
      })
      .join('\n');

    return `You are a professional meeting analyst. Given the following scheduled meetings, generate a structured JSON summary.

MEETINGS:
${list}

Return ONLY valid JSON with this structure (no markdown, no explanation):
{
  "summary": "2-3 sentence executive summary of all planned work",
  "actionItems": [
    { "task": "description", "owner": "name or null", "deadline": "date or null", "priority": "HIGH|MEDIUM|LOW" }
  ],
  "decisions": [
    "Important decision or note from the schedule"
  ]
}

Rules:
- summary should describe the overall work planned
- actionItems should include one entry per distinct task/meeting
- decisions should capture notable scheduling patterns or conflicts
- Keep all text concise and professional`;
  }

  _fallbackSummary(meetings) {
    const titles = meetings.map((m) => m.meeting_title || 'Untitled').join(', ');
    return {
      summary: `${meetings.length} meeting(s) planned: ${titles}.`,
      actionItems: meetings.map((m) => ({
        task: m.task || m.meeting_title || 'Untitled',
        owner: m.owner || null,
        deadline: m.deadline || m.date || null,
        priority: 'MEDIUM',
      })),
      decisions: [],
    };
  }
}

module.exports = new MeetingSummaryService();
