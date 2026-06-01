const { google } = require('googleapis');

class GooglePeopleService {
  /**
   * Search the authenticated user's Google Contacts for a given name.
   * Returns an array of { name, email } objects (deduplicated by email).
   */
  async searchByName(authClient, participantName) {
    if (!authClient) return [];

    const people = google.people({ version: 'v1', auth: authClient });
    const query = participantName.trim();

    try {
      const res = await people.people.searchContacts({
        query,
        readMask: 'names,emailAddresses',
        pageSize: 10,
      });

      const results = res.data?.results || [];
      const seen = new Set();
      const matches = [];

      for (const r of results) {
        const person = r.person;
        const displayName =
          person.names?.[0]?.displayName || query;
        const emails = person.emailAddresses || [];

        for (const e of emails) {
          const email = e.value?.toLowerCase();
          if (!email || seen.has(email)) continue;
          seen.add(email);
          matches.push({ name: displayName, email });
        }
      }

      return matches;
    } catch (err) {
      // Gracefully degrade — missing scope or API error should not block scheduling
      console.warn('[GooglePeopleService] searchByName failed:', err.message);
      return [];
    }
  }
}

module.exports = new GooglePeopleService();
