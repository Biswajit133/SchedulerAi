const { Router } = require('express');
const { controller } = require('../controllers/AdminController');

const router = Router();

// Require the user to be authenticated before accessing admin routes.
// In a multi-tenant setup you'd also check an `isAdmin` flag on the user.
function requireAuth(req, res, next) {
  if (!req.session?.user?.email) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

router.use(requireAuth);

router.get('/providers',        controller.getProviders.bind(controller));
router.patch('/providers/:name', controller.updateProvider.bind(controller));
router.patch('/config',         controller.updateConfig.bind(controller));

module.exports = router;
