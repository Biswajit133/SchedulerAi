const HIGH_KEYWORDS = [
  'urgent', 'critical', 'asap', 'emergency', 'production', 'outage',
  'blocker', 'blocking', 'immediately', 'crisis', 'p0', 'p1', 'hotfix',
  'escalate', 'escalated', 'important', 'high priority', 'high-priority',
];

const LOW_KEYWORDS = [
  'testing', 'test', 'standup', 'sync', 'catch-up', 'catchup',
  'brainstorm', 'brainstorming', 'casual', 'informal', 'optional',
  'low priority', 'low-priority', 'p3', 'p4', 'nice to have',
];

class PriorityService {
  /**
   * Detect priority level from meeting title, task, and notes text.
   * Returns 'HIGH' | 'MEDIUM' | 'LOW'
   */
  detect(text) {
    if (!text) return 'MEDIUM';
    const lower = String(text).toLowerCase();

    for (const kw of HIGH_KEYWORDS) {
      if (lower.includes(kw)) return 'HIGH';
    }
    for (const kw of LOW_KEYWORDS) {
      if (lower.includes(kw)) return 'LOW';
    }
    return 'MEDIUM';
  }

  /**
   * Detect priority from a full meeting object (title + task combined).
   */
  detectFromMeeting(meeting) {
    const combined = [
      meeting.meeting_title,
      meeting.task,
      meeting.owner,
    ]
      .filter(Boolean)
      .join(' ');
    return this.detect(combined);
  }

  /**
   * Annotate an array of meetings with a priority field.
   */
  annotateMeetings(meetings) {
    return (meetings || []).map((m) => ({
      ...m,
      priority: m.priority || this.detectFromMeeting(m),
    }));
  }
}

module.exports = new PriorityService();
