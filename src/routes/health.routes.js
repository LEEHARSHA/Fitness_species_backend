const express = require('express');
const { checkDB, getDbStatus } = require('../config/mongodb');
const router = express.Router();

router.get('/', async (_req, res) => {
  let ready = false;
  try {
    await checkDB();
    ready = getDbStatus() === 'connected';
  } catch {
    ready = false;
  }

  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ok' : 'not_ready',
    database: { status: ready ? 'connected' : 'disconnected' },
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;