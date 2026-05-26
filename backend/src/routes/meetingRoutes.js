const { Router } = require('express');
const controller = require('../controllers/MeetingController');
const { validateExtract, validateSchedule } = require('../middleware/validation');

const router = Router();

// Meetings
router.post('/meetings/extract', validateExtract, controller.extract.bind(controller));
router.post('/meetings/validate', controller.validate.bind(controller));
router.get('/meetings/slots', controller.getSlots.bind(controller));
router.post('/meetings/schedule', validateSchedule, controller.schedule.bind(controller));
router.get('/meetings', controller.list.bind(controller));

// Auth
router.get('/auth/google', controller.googleAuth.bind(controller));
router.get('/auth/google/callback', controller.googleCallback.bind(controller));
router.get('/auth/status', controller.authStatus.bind(controller));
router.get('/auth/diagnostics', controller.authDiagnostics.bind(controller));

// Health
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    provider: process.env.AI_PROVIDER || 'groq',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
