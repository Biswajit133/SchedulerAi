function validateExtract(req, res, next) {
  const { notes } = req.body;
  if (!notes || typeof notes !== 'string' || !notes.trim()) {
    return res.status(400).json({ error: 'notes must be a non-empty string' });
  }
  if (notes.length > 5000) {
    return res.status(400).json({ error: 'notes must be under 5000 characters' });
  }
  next();
}

function validateSchedule(req, res, next) {
  const { meeting, slot } = req.body;
  if (!meeting || typeof meeting !== 'object') {
    return res.status(400).json({ error: 'meeting object is required' });
  }
  if (!slot || typeof slot !== 'object') {
    return res.status(400).json({ error: 'slot object is required' });
  }
  if (!slot.date || !slot.startTime || !slot.endTime) {
    return res.status(400).json({ error: 'slot must have date, startTime, and endTime' });
  }
  next();
}

function errorHandler(err, req, res, next) {
  console.error('[ErrorHandler]', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { validateExtract, validateSchedule, errorHandler };
