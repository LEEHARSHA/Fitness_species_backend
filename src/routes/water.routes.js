const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  getTodayWater,
  logWaterIntake,
  updateTodayWaterTarget,
  getWaterHistory
} = require('../controllers/water.controller');

const router = express.Router();

router.get('/today', requireFirebaseAuth, getTodayWater);
router.post('/log', requireFirebaseAuth, logWaterIntake);
router.patch('/today', requireFirebaseAuth, updateTodayWaterTarget);
router.get('/history', requireFirebaseAuth, getWaterHistory);

module.exports = router;
