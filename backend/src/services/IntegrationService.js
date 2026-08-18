const { CALENDAR_PROVIDERS, MEETING_PROVIDERS } = require('../config/providerRegistry');

class IntegrationService {
  // Returns registry entries for calendar providers the user has connected
  getConnectedCalendarProviders(dbUser) {
    return CALENDAR_PROVIDERS.filter((p) => {
      if (!p.authKey) return false;
      return !!(dbUser?.[p.authKey]?.access_token);
    });
  }

  // Returns registry entries for meeting providers the user has connected.
  // Google Meet is considered connected when Google Calendar is connected.
  getConnectedMeetingProviders(dbUser) {
    return MEETING_PROVIDERS.filter((p) => {
      if (p.authKey) {
        return !!(dbUser?.[p.authKey]?.access_token);
      }
      // No separate token — check required calendar provider
      if (p.requiresCalendar) {
        const cal = CALENDAR_PROVIDERS.find((c) => c.id === p.requiresCalendar);
        return cal ? !!(dbUser?.[cal.authKey]?.access_token) : false;
      }
      return false;
    });
  }

  // Returns the user's effective default meeting provider ID.
  // Precedence: saved preference → first connected.
  getDefaultMeetingProvider(dbUser) {
    const saved = dbUser?.preferences?.defaultMeetingProvider;
    const connected = this.getConnectedMeetingProviders(dbUser);
    if (saved && connected.some((p) => p.id === saved)) return saved;
    return connected[0]?.id || null;
  }

  // Returns the user's effective default calendar provider ID.
  getDefaultCalendarProvider(dbUser) {
    const saved = dbUser?.preferences?.defaultCalendarProvider;
    const connected = this.getConnectedCalendarProviders(dbUser);
    if (saved && connected.some((p) => p.id === saved)) return saved;
    return connected[0]?.id || null;
  }

  // Full summary — used by the GET /api/integrations endpoint.
  getSummary(dbUser) {
    const connectedCal = this.getConnectedCalendarProviders(dbUser);
    const connectedMeet = this.getConnectedMeetingProviders(dbUser);
    const defaultCal = this.getDefaultCalendarProvider(dbUser);
    const defaultMeet = this.getDefaultMeetingProvider(dbUser);

    return {
      calendarProviders: CALENDAR_PROVIDERS.map((p) => ({
        id: p.id,
        label: p.label,
        available: p.available,
        authRoute: p.authRoute,
        connected: connectedCal.some((c) => c.id === p.id),
        isDefault: p.id === defaultCal,
      })),
      meetingProviders: MEETING_PROVIDERS.map((p) => {
        const entry = {
          id: p.id,
          label: p.label,
          description: p.description,
          available: p.available,
          authRoute: p.authRoute,
          requiresCalendar: p.requiresCalendar || null,
          connected: connectedMeet.some((c) => c.id === p.id),
          isDefault: p.id === defaultMeet,
        };
        if (p.id === 'teams' && dbUser?.teamsUser?.isPersonalAccount) {
          entry.warning = 'Personal Microsoft accounts cannot create Teams join links. Use a work/school M365 account.';
        }
        return entry;
      }),
      defaultCalendarProvider: defaultCal,
      defaultMeetingProvider: defaultMeet,
      preferences: dbUser?.preferences || {},
    };
  }

  // Returns true if the given meeting provider ID is connected for the user.
  isMeetingProviderConnected(dbUser, providerId) {
    return this.getConnectedMeetingProviders(dbUser).some((p) => p.id === providerId);
  }
}

module.exports = new IntegrationService();
