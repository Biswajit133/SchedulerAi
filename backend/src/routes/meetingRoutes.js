const { Router } = require('express');
const controller = require('../controllers/MeetingController');
const { validateExtract, validateSchedule } = require('../middleware/validation');

const router = Router();

// Meetings
router.post('/meetings/extract', validateExtract, controller.extract.bind(controller));
router.post('/meetings/validate', controller.validate.bind(controller));
router.get('/meetings/slots', controller.getSlots.bind(controller));
router.get('/meetings/suggest', controller.smartSuggest.bind(controller));
router.post('/meetings/summary', controller.getMeetingSummary.bind(controller));
router.post('/meetings/schedule', validateSchedule, controller.schedule.bind(controller));
router.get('/meetings', controller.list.bind(controller));

// Agenda
router.get('/agenda/today', controller.getTodayAgenda.bind(controller));

// Auth
router.get('/auth/google', controller.googleAuth.bind(controller));
router.get('/auth/google/callback', controller.googleCallback.bind(controller));
router.get('/auth/status', controller.authStatus.bind(controller));
router.get('/auth/me', controller.authMe.bind(controller));
router.post('/auth/logout', controller.authLogout.bind(controller));
router.get('/auth/diagnostics', controller.authDiagnostics.bind(controller));

// Zoom OAuth
router.get('/auth/zoom', controller.zoomAuth.bind(controller));
router.get('/auth/zoom/callback', controller.zoomCallback.bind(controller));
router.get('/auth/zoom/status', controller.zoomStatus.bind(controller));
router.post('/auth/zoom/disconnect', controller.zoomDisconnect.bind(controller));

// Health
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: process.env.AI_PROVIDER || 'groq',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
