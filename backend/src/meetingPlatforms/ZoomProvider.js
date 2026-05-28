const https = require('https');
const MeetingPlatformProvider = require('./MeetingPlatformProvider');
const CalendarService = require('../services/CalendarService');

class ZoomProvider extends MeetingPlatformProvider {
  async createMeeting(meeting, slot, authClient, zoomAccessToken) {
    if (!zoomAccessToken) {
      throw new Error('Zoom is not connected. Please connect your Zoom account first.');
    }

    const zoomMeeting = await this._createZoomMeeting(zoomAccessToken, meeting, slot);

    const joinUrl = zoomMeeting.join_url;
    const platformMeetingId = String(zoomMeeting.id);

    // Always create a Google Calendar event — Zoom link goes in description
    const event = await CalendarService.createEvent(meeting, slot, authClient, {
      platform: 'zoom',
      meetingLink: joinUrl,
      platformMeetingId,
    });

    return {
      id: event.id,
      htmlLink: event.htmlLink,
      meetLink: joinUrl,
      platform: 'zoom',
      platformMeetingId,
      status: event.status,
      demo: event.demo,
    };
  }

  _createZoomMeeting(token, meeting, slot) {
    const startDateTime = new Date(`${slot.date}T${slot.startTime}:00`).toISOString();

    const body = JSON.stringify({
      topic: meeting.meeting_title,
      type: 2,
      start_time: startDateTime,
      duration: slot.durationMinutes || 60,
      timezone: process.env.TIMEZONE || 'UTC',
      agenda: meeting.task || '',
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: true,
        waiting_room: false,
        mute_upon_entry: false,
      },
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.zoom.us',
        path: '/v2/users/me/meetings',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 201) {
              resolve(parsed);
            } else {
              reject(new Error(`Zoom meeting creation error (${res.statusCode}): ${parsed.message || data}`));
            }
          } catch {
            reject(new Error(`Zoom meeting parse error: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

module.exports = new ZoomProvider();
