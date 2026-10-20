const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  getActiveWorkout,
  generateWorkoutPlan,
  getWorkoutHistory
} = require('../controllers/workout.controller');

const router = express.Router();

router.get('/active', requireFirebaseAuth, getActiveWorkout);
router.post('/generate', requireFirebaseAuth, generateWorkoutPlan);
router.get('/history', requireFirebaseAuth, getWorkoutHistory);

module.exports = router;
