const { Router } = require('express');
const controller = require('../controllers/MeetingController');
const contactController = require('../controllers/ContactController');
const { validateExtract, validateSchedule } = require('../middleware/validation');
const AuthProviderRegistry = require('../providers/auth/AuthProviderRegistry');

const router = Router();

// Meetings
router.post('/meetings/extract', validateExtract, controller.extract.bind(controller));
router.post('/meetings/validate', controller.validate.bind(controller));
router.get('/meetings/slots', controller.getSlots.bind(controller));
router.get('/meetings/suggest', controller.smartSuggest.bind(controller));
router.post('/meetings/summary', controller.getMeetingSummary.bind(controller));
router.post('/meetings/schedule', validateSchedule, controller.schedule.bind(controller));
router.get('/meetings/recent', controller.getRecentMeetings.bind(controller));
router.delete('/meetings/:eventId', controller.cancelMeeting.bind(controller));
router.patch('/meetings/:eventId/reschedule', controller.rescheduleMeeting.bind(controller));
router.get('/meetings', controller.list.bind(controller));

// Agenda
router.get('/agenda/today', controller.getTodayAgenda.bind(controller));

// Auth — static + dynamic provider list
router.get('/auth/providers', (req, res) => {
  res.json({ providers: AuthProviderRegistry.getAll() });
});
router.get('/auth/google', controller.googleAuth.bind(controller));
router.get('/auth/google/callback', controller.googleCallback.bind(controller));
router.get('/auth/microsoft', controller.microsoftAuth.bind(controller));
router.get('/auth/microsoft/callback', controller.microsoftCallback.bind(controller));
router.get('/auth/status', controller.authStatus.bind(controller));
router.get('/auth/me', controller.authMe.bind(controller));
router.post('/auth/logout', controller.authLogout.bind(controller));
router.get('/auth/diagnostics', controller.authDiagnostics.bind(controller));

// Zoom OAuth
router.get('/auth/zoom', controller.zoomAuth.bind(controller));
router.get('/auth/zoom/callback', controller.zoomCallback.bind(controller));
router.get('/auth/zoom/status', controller.zoomStatus.bind(controller));
router.post('/auth/zoom/disconnect', controller.zoomDisconnect.bind(controller));

// Teams OAuth
router.get('/auth/teams', controller.teamsAuth.bind(controller));
router.get('/auth/teams/callback', controller.teamsCallback.bind(controller));
router.get('/auth/teams/status', controller.teamsStatus.bind(controller));
router.post('/auth/teams/disconnect', controller.teamsDisconnect.bind(controller));

// Outlook Calendar OAuth
router.get('/auth/outlook', controller.outlookCalendarAuth.bind(controller));
router.get('/auth/outlook/callback', controller.outlookCalendarCallback.bind(controller));
router.get('/auth/outlook/status', controller.outlookCalendarStatus.bind(controller));
router.post('/auth/outlook/disconnect', controller.outlookCalendarDisconnect.bind(controller));

// Integrations & user preferences
router.get('/integrations', controller.getIntegrations.bind(controller));
router.patch('/user/preferences', controller.updatePreferences.bind(controller));

// Contacts
router.get('/contacts/calendar-search', contactController.searchCalendar.bind(contactController));
router.get('/contacts/google-search',   contactController.searchGoogle.bind(contactController));
router.get('/contacts',               contactController.getContacts.bind(contactController));
router.post('/contacts',              contactController.saveContacts.bind(contactController));
router.delete('/contacts/:email',     contactController.deleteContact.bind(contactController));

// Health
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: process.env.AI_PROVIDER || 'groq',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
