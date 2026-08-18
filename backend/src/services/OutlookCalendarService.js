const https = require('https');
const SlotFinder = require('../utils/SlotFinder');
const DateParser = require('../utils/DateParser');

const GRAPH_HOST = 'graph.microsoft.com';

class OutlookCalendarService {
  async getEvents(date, accessToken, timeZone) {
    if (!accessToken) {
      return { events: [], busySlots: SlotFinder.getMockBusySlots(date), demo: true };
    }

    const tz = timeZone || 'UTC';
    const startOfDay = DateParser.localToUTC(date, '00:00', tz).toISOString();
    const endOfDay   = DateParser.localToUTC(date, '23:59', tz).toISOString();

    const path =
      `/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startOfDay)}` +
      `&endDateTime=${encodeURIComponent(endOfDay)}` +
      `&$select=id,subject,start,end,bodyPreview,webLink,onlineMeeting,onlineMeetingProvider` +
      `&$orderby=${encodeURIComponent('start/dateTime asc')}`;

    const data = await _graphGet(path, accessToken);
    const graphEvents = data.value || [];

    // Normalize Graph API events to Google-Calendar-like shape for SlotFinder
    const normalizedEvents = graphEvents.map((e) => ({
      id: e.id,
      summary: e.subject || 'Busy',
      start:   { dateTime: _ensureZ(e.start?.dateTime) },
      end:     { dateTime: _ensureZ(e.end?.dateTime)   },
      htmlLink: e.webLink || null,
      hangoutLink: null,
      description: e.bodyPreview || '',
      // Surface Teams join URL for the busy-slot metadata
      _teamsJoinUrl: e.onlineMeeting?.joinUrl || null,
    }));

    const busySlots = SlotFinder.normalizeBusySlots(normalizedEvents, date);

    // Attach Teams join URLs by event ID (index-based mapping breaks when events are filtered by date)
    const teamsJoinUrlById = {};
    normalizedEvents.forEach((e) => {
      if (e.id && e._teamsJoinUrl) teamsJoinUrlById[e.id] = e._teamsJoinUrl;
    });
    busySlots.forEach((slot) => {
      if (!slot.joinUrl && slot.id && teamsJoinUrlById[slot.id]) {
        slot.joinUrl = teamsJoinUrlById[slot.id];
        slot.platform = 'teams';
      }
    });

    return { events: graphEvents, busySlots, demo: false };
  }

  async createEvent(meeting, slot, accessToken, platformOptions = {}) {
    const {
      platform     = 'teams',
      meetingLink  = null,
      platformMeetingId = null,
      timeZone     = 'UTC',
      isOnlineMeeting = false,
    } = platformOptions;

    const tz = timeZone;
    const startDateTime = DateParser.localToUTC(slot.date, slot.startTime, tz).toISOString();
    const endDateTime   = DateParser.localToUTC(slot.date, slot.endTime,   tz).toISOString();

    const attendees = Object.entries(meeting.participant_emails || {})
      .filter(([, email]) => email)
      .map(([displayName, email]) => ({
        emailAddress: { address: email, name: displayName },
        type: 'required',
      }));

    let bodyContent = meeting.task || '';
    if (meetingLink) {
      let linkLabel;
      if (platform === 'zoom')  linkLabel = 'Join Zoom Meeting:';
      else if (platform === 'teams') linkLabel = 'Join Microsoft Teams Meeting:';
      else linkLabel = 'Join Meeting:';
      const linkSection = [
        linkLabel,
        meetingLink,
        platformMeetingId ? `Meeting ID: ${platformMeetingId}` : '',
      ].filter(Boolean).join('\n');
      bodyContent = bodyContent ? `${bodyContent}\n\n${linkSection}` : linkSection;
    }

    const eventBody = {
      subject: meeting.meeting_title,
      body: { contentType: 'text', content: bodyContent },
      start: { dateTime: _stripMs(startDateTime), timeZone: 'UTC' },
      end:   { dateTime: _stripMs(endDateTime),   timeZone: 'UTC' },
      attendees,
      isReminderOn: true,
      reminderMinutesBeforeStart: 15,
    };

    // When no external join URL is supplied, ask Graph API to auto-create a Teams meeting.
    // When we already have a join URL (from /me/onlineMeetings), skip this to avoid
    // creating a duplicate second Teams meeting for the same calendar event.
    if (platform === 'teams' && !meetingLink) {
      eventBody.isOnlineMeeting = true;
      eventBody.onlineMeetingProvider = 'teamsForBusiness';
    }

    if (!accessToken) {
      return this._createMockEvent(meeting, platform, meetingLink);
    }

    const created = await _graphPost('/v1.0/me/events', eventBody, accessToken);

    return {
      id:               created.id,
      htmlLink:         created.webLink || null,
      meetLink:         created.onlineMeeting?.joinUrl || meetingLink || null,
      platform,
      platformMeetingId: platformMeetingId || null,
      status:           'confirmed',
      demo:             false,
    };
  }

  async deleteEvent(eventId, accessToken) {
    if (!accessToken) throw new Error('Outlook Calendar not connected. Please connect it first.');
    await _graphDelete(`/v1.0/me/events/${encodeURIComponent(eventId)}`, accessToken);
    return { success: true };
  }

  async updateEvent(eventId, updates, accessToken) {
    if (!accessToken) throw new Error('Outlook Calendar not connected. Please connect it first.');

    // Convert Google-Calendar-style update to Graph API format
    const body = {};
    if (updates.start?.dateTime) {
      body.start = { dateTime: _stripMs(updates.start.dateTime), timeZone: 'UTC' };
    }
    if (updates.end?.dateTime) {
      body.end = { dateTime: _stripMs(updates.end.dateTime), timeZone: 'UTC' };
    }
    if (updates.summary) body.subject = updates.summary;
    if (updates.description) body.body = { contentType: 'text', content: updates.description };

    const updated = await _graphPatch(
      `/v1.0/me/events/${encodeURIComponent(eventId)}`,
      body,
      accessToken
    );
    return { success: true, event: updated };
  }

  async getEvent(eventId, accessToken) {
    if (!accessToken) throw new Error('Outlook Calendar not connected. Please connect it first.');
    return _graphGet(`/v1.0/me/events/${encodeURIComponent(eventId)}`, accessToken);
  }

  async getRecentMeetings(accessToken, timeZone, days = 7) {
    if (!accessToken) {
      return { meetings: [], demo: true };
    }

    const tz  = timeZone || 'UTC';
    const now  = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);

    const path =
      `/v1.0/me/calendarView?startDateTime=${encodeURIComponent(start.toISOString())}` +
      `&endDateTime=${encodeURIComponent(now.toISOString())}` +
      `&$select=id,subject,start,end,attendees,webLink` +
      `&$orderby=start/dateTime asc&$top=50`;

    try {
      const data        = await _graphGet(path, accessToken);
      const graphEvents = (data.value || []).filter((e) => e.start?.dateTime);

      const meetings = graphEvents.map((e) => {
        const startDt = new Date(_ensureZ(e.start.dateTime));
        const endDt   = new Date(_ensureZ(e.end?.dateTime || e.start.dateTime));
        const durationMin = Math.round((endDt - startDt) / 60000);

        const attendees = (e.attendees || [])
          .filter((a) => a.type !== 'organizer' && a.emailAddress?.address)
          .map((a) => ({
            name:  a.emailAddress.name || a.emailAddress.address.split('@')[0],
            email: a.emailAddress.address,
          }));

        const dateStr = startDt.toISOString().slice(0, 10);
        const dateDisplay = startDt.toLocaleDateString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', timeZone: tz,
        });
        const startTimeDisplay = startDt.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: true, timeZone: tz,
        });

        return {
          id:               e.id,
          title:            e.subject || 'Untitled Meeting',
          date:             dateStr,
          dateDisplay,
          startDisplay:     startTimeDisplay,
          duration:         durationMin,
          attendees,
          participants:     attendees.map((a) => a.name),
          participant_emails: Object.fromEntries(attendees.map((a) => [a.name, a.email])),
          htmlLink:         e.webLink || null,
        };
      });

      return { meetings, demo: false };
    } catch (err) {
      console.warn('[OutlookCalendarService] getRecentMeetings failed:', err.message);
      return { meetings: [], demo: false };
    }
  }

  _createMockEvent(meeting, platform = 'teams', meetingLink = null) {
    return {
      id:               `mock-outlook-${Date.now()}`,
      htmlLink:         null,
      meetLink:         meetingLink,
      platform,
      platformMeetingId: null,
      status:           'confirmed',
      demo:             true,
      summary:          meeting.meeting_title,
    };
  }
}

// ── Graph API helpers ─────────────────────────────────────────────────────────

function _graphGet(path, accessToken) {
  return _graphRequest('GET', path, null, accessToken);
}

function _graphPost(path, body, accessToken) {
  return _graphRequest('POST', path, body, accessToken);
}

function _graphPatch(path, body, accessToken) {
  return _graphRequest('PATCH', path, body, accessToken);
}

function _graphDelete(path, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GRAPH_HOST,
      path,
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    };
    const req = https.request(options, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode === 204 || res.statusCode === 200) resolve({ success: true });
        else reject(new Error(`Graph DELETE error: ${res.statusCode}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function _graphRequest(method, path, bodyObj, accessToken) {
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : null;
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GRAPH_HOST,
      path,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode === 204) return resolve({});
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(
              `Graph API error (${res.statusCode}): ${parsed.error?.message || data}`
            ));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Graph API parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Ensure an ISO datetime string ends with 'Z' (UTC marker)
function _ensureZ(dt) {
  if (!dt) return dt;
  return dt.endsWith('Z') ? dt : dt + 'Z';
}

// Strip milliseconds for Graph API (it accepts "2021-01-01T09:00:00Z" but not ".000Z")
function _stripMs(isoStr) {
  if (!isoStr) return isoStr;
  return isoStr.replace(/\.\d{3}Z$/, 'Z');
}

module.exports = new OutlookCalendarService();
