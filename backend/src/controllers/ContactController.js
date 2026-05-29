const { isDBConnected } = require('../config/database');
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

      for (const c of unique) {
        const normalizedEmail = c.email.toLowerCase();
        await User.updateOne(
          { email: userEmail },
          { $pull: { contacts: { email: normalizedEmail } } }
        );
        await User.updateOne(
          { email: userEmail },
          { $push: { contacts: { name: c.name.trim(), email: normalizedEmail, savedAt: new Date() } } }
        );
      }

      res.json({ success: true, saved: unique.length });
    } catch (err) {
      console.error('[saveContacts]', err);
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
