// Static registry of all known calendar and meeting providers.
// Add new providers here — no other file needs to change for discovery to work.

const CALENDAR_PROVIDERS = [
  {
    id: 'google',
    label: 'Google Calendar',
    authKey: 'googleTokens',   // field in User model holding OAuth tokens
    authRoute: '/auth/google',
    available: true,           // OAuth flow is implemented
  },
  {
    id: 'outlook',
    label: 'Microsoft Outlook Calendar',
    authKey: 'outlookTokens',
    authRoute: '/auth/outlook',
    available: true,
  },
  {
    id: 'apple',
    label: 'Apple Calendar',
    authKey: 'appleTokens',
    authRoute: '/auth/apple',
    available: false,
  },
];

const MEETING_PROVIDERS = [
  {
    id: 'google_meet',
    label: 'Google Meet',
    description: 'Free, built into Google Calendar',
    authKey: null,               // piggybacks on Google Calendar token
    requiresCalendar: 'google',  // Google Calendar must be connected
    authRoute: null,
    available: true,
  },
  {
    id: 'zoom',
    label: 'Zoom',
    description: 'Dedicated Zoom meeting link',
    authKey: 'zoomTokens',
    requiresCalendar: null,
    authRoute: '/auth/zoom',
    available: false,
  },
  {
    id: 'teams',
    label: 'Microsoft Teams',
    description: 'Microsoft Teams meeting link',
    authKey: 'teamsTokens',
    requiresCalendar: null,
    authRoute: '/auth/teams',
    available: true,
  },
  {
    id: 'webex',
    label: 'Webex',
    description: 'Cisco Webex meeting link',
    authKey: 'webexTokens',
    requiresCalendar: null,
    authRoute: '/auth/webex',
    available: false,
  },
];

module.exports = { CALENDAR_PROVIDERS, MEETING_PROVIDERS };
