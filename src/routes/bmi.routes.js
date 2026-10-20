const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  calculateAndSaveBmi,
  getLatestBmi,
  getBmiHistory
} = require('../controllers/bmi.controller');

const router = express.Router();

router.post('/', requireFirebaseAuth, calculateAndSaveBmi);
router.get('/latest', requireFirebaseAuth, getLatestBmi);
router.get('/history', requireFirebaseAuth, getBmiHistory);

module.exports = router;
