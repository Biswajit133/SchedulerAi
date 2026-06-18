const https = require('https');
const MeetingPlatformProvider = require('./MeetingPlatformProvider');
const OutlookCalendarService = require('../services/OutlookCalendarService');

class TeamsProvider extends MeetingPlatformProvider {
  async createMeeting(meeting, slot, _authClient, teamsAccessToken) {
    const token = typeof teamsAccessToken === 'string' ? teamsAccessToken : null;
    if (!token) {
      throw new Error('Microsoft Teams access token is missing or expired. Please reconnect your Teams account.');
    }

    const timeZone = meeting.timeZone || 'UTC';

    // Step 1: Create the Teams online meeting to get a real join URL.
    // This mirrors how Zoom works: create the meeting first, then attach it to the calendar.
    let teamsJoinUrl = null;
    let teamsMeetingId = null;
    try {
      const onlineMeeting = await _createTeamsOnlineMeeting(token, meeting, slot, timeZone);
      teamsJoinUrl = onlineMeeting.joinUrl || onlineMeeting.joinWebUrl || null;
      teamsMeetingId = onlineMeeting.id || null;
      console.log('[TeamsProvider] Online meeting created, joinUrl:', teamsJoinUrl ? 'OK' : 'null');
    } catch (err) {
      console.warn('[TeamsProvider] Online meeting creation failed, will use calendar isOnlineMeeting fallback:', err.message);
    }

    // Step 2: Create the Outlook Calendar event.
    // If we got a real join URL, pass it so the body includes the link.
    // If not (e.g. personal account / missing OnlineMeetings.ReadWrite), fall back to
    // isOnlineMeeting: true so the Graph API auto-generates one (works for licensed accounts).
    let outlookEvent;
    try {
      outlookEvent = await OutlookCalendarService.createEvent(meeting, slot, token, {
        platform: 'teams',
        meetingLink: teamsJoinUrl,
        platformMeetingId: teamsMeetingId,
        timeZone,
      });
    } catch (err) {
      console.error('[TeamsProvider] Outlook Calendar API error:', err.message);
      _throwFriendlyError(err);
    }

    const finalMeetLink = teamsJoinUrl || outlookEvent.meetLink || null;

    return {
      id: outlookEvent.id,
      htmlLink: outlookEvent.htmlLink,
      meetLink: finalMeetLink,
      platform: 'teams',
      platformMeetingId: teamsMeetingId || outlookEvent.id,
      status: outlookEvent.status || 'confirmed',
      demo: outlookEvent.demo || false,
    };
  }

  async updateMeeting(meetingId, updates, accessToken) {
    const OutlookCalendarService = require('../services/OutlookCalendarService');
    return OutlookCalendarService.updateEvent(meetingId, {
      start: { dateTime: updates.startTime },
      end:   { dateTime: updates.endTime },
      subject: updates.title,
    }, accessToken);
  }

  async cancelMeeting(meetingId, accessToken) {
    const OutlookCalendarService = require('../services/OutlookCalendarService');
    await OutlookCalendarService.deleteEvent(meetingId, accessToken);
    return { success: true };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _createTeamsOnlineMeeting(accessToken, meeting, slot, timeZone) {
  const DateParser = require('../utils/DateParser');
  const tz = timeZone || 'UTC';
  const startDateTime = DateParser.localToUTC(slot.date, slot.startTime, tz).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endDateTime   = DateParser.localToUTC(slot.date, slot.endTime,   tz).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const body = JSON.stringify({
    subject:       meeting.meeting_title,
    startDateTime,
    endDateTime,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path:     '/v1.0/me/onlineMeetings',
      method:   'POST',
      headers: {
        Authorization:   `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Teams onlineMeetings API error (${res.statusCode}): ${parsed.error?.message || data}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Teams onlineMeetings parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _throwFriendlyError(err) {
  const msg = err.message || '';
  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
    throw new Error('Teams access token expired or invalid. Please disconnect Teams and reconnect your account.');
  }
  if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
    throw new Error(
      'Teams meeting creation requires a Microsoft 365 work or school account with Teams enabled. ' +
      'Personal accounts (Outlook.com / Hotmail / Live) are not supported by the Microsoft API.'
    );
  }
  if (msg.includes('423') || msg.toLowerCase().includes('locked')) {
    throw new Error('Your Microsoft account is locked. Please sign in to your Microsoft account and try again.');
  }
  throw new Error(`Teams meeting creation failed: ${msg}`);
}

module.exports = new TeamsProvider();
