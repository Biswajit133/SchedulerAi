const { isDBConnected } = require('../config/database');
const { getAuthenticatedClient } = require('../config/googleAuth');
const GooglePeopleService = require('../services/GooglePeopleService');
const CalendarService = require('../services/CalendarService');
const User = require('../models/User');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class ContactController {
  _requireAuth(req, res) {
    const email = req.session?.user?.email;
    if (!email) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return email.toLowerCase();
  }

  _requireDB(res) {
    if (!isDBConnected()) {
      res.status(503).json({ error: 'Database not available' });
      return false;
    }
    return true;
  }

  // GET /api/contacts
  async getContacts(req, res) {
    try {
      const userEmail = this._requireAuth(req, res);
      if (!userEmail) return;
      if (!this._requireDB(res)) return;

      const user = await User.findOne({ email: userEmail }).select('contacts').lean();
      res.json({ success: true, contacts: user?.contacts ?? [] });
    } catch (err) {
      console.error('[getContacts]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // POST /api/contacts  body: { contacts: [{ name, email }] }
  async saveContacts(req, res) {
    try {
      const userEmail = this._requireAuth(req, res);
      if (!userEmail) return;
      if (!this._requireDB(res)) return;

      const { contacts } = req.body;
      if (!Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ error: 'contacts must be a non-empty array' });
      }

      for (const c of contacts) {
        if (!c.name || typeof c.name !== 'string' || !c.name.trim()) {
          return res.status(400).json({ error: 'Each contact must have a name' });
        }
        if (!c.email || !EMAIL_RE.test(c.email)) {
          return res.status(400).json({ error: `Invalid email: ${c.email}` });
        }
      }

      // Dedup by email (last entry wins)
      const unique = [...new Map(contacts.map((c) => [c.email.toLowerCase(), c])).values()];

      const user = await User.findOne({ email: userEmail }).select('contacts');

      for (const c of unique) {
        const normalizedEmail = c.email.toLowerCase();
        const existing = user?.contacts?.find(
          (x) => x.name.toLowerCase().trim() === c.name.toLowerCase().trim()
        );

        if (existing) {
          // Contact exists — update in place, preserving email history
          const updateFields = {
            'contacts.$.email':        normalizedEmail,
            'contacts.$.lastUsedDate': new Date(),
          };
          const pushFields = {};

          if (existing.email !== normalizedEmail && !existing.previousEmails?.includes(existing.email)) {
            pushFields['contacts.$.previousEmails'] = existing.email;
          }

          await User.updateOne(
            { email: userEmail, 'contacts._id': existing._id },
            {
              $set: updateFields,
              $inc: { 'contacts.$.meetingCount': 1 },
              ...(Object.keys(pushFields).length ? { $push: pushFields } : {}),
            }
          );
        } else {
          // New contact — insert
          await User.updateOne(
            { email: userEmail },
            {
              $push: {
                contacts: {
                  name:         c.name.trim(),
                  email:        normalizedEmail,
                  meetingCount: 1,
                  lastUsedDate: new Date(),
                  savedAt:      new Date(),
                },
              },
            }
          );
        }
      }

      res.json({ success: true, saved: unique.length });
    } catch (err) {
      console.error('[saveContacts]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/contacts/calendar-search?name=Harsh
  async searchCalendar(req, res) {
    try {
      const { name } = req.query;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name query parameter is required' });
      }

      const authClient = await getAuthenticatedClient(req);
      if (!authClient) {
        return res.json({ success: true, contacts: [], reason: 'not_authenticated' });
      }

      const contacts = await CalendarService.searchAttendees(authClient, name.trim());
      res.json({ success: true, contacts });
    } catch (err) {
      console.error('[searchCalendar]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // GET /api/contacts/google-search?name=Harsh
  async searchGoogle(req, res) {
    try {
      const { name } = req.query;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'name query parameter is required' });
      }

      const authClient = await getAuthenticatedClient(req);
      if (!authClient) {
        return res.json({ success: true, contacts: [], reason: 'not_authenticated' });
      }

      const contacts = await GooglePeopleService.searchByName(authClient, name.trim());
      res.json({ success: true, contacts });
    } catch (err) {
      console.error('[searchGoogle]', err);
      res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/contacts/:email
  async deleteContact(req, res) {
    try {
      const userEmail = this._requireAuth(req, res);
      if (!userEmail) return;
      if (!this._requireDB(res)) return;

      const targetEmail = decodeURIComponent(req.params.email).toLowerCase();
      await User.updateOne(
        { email: userEmail },
        { $pull: { contacts: { email: targetEmail } } }
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[deleteContact]', err);
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new ContactController();
