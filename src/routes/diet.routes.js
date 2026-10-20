const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  getActiveDiet,
  generateDietPlan,
  getDietHistory
} = require('../controllers/diet.controller');

const router = express.Router();

router.get('/active', requireFirebaseAuth, getActiveDiet);
router.post('/generate', requireFirebaseAuth, generateDietPlan);
router.get('/history', requireFirebaseAuth, getDietHistory);

module.exports = router;
