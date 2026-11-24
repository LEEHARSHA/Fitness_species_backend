const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  ExerciseImageValidationError,
  getExerciseCatalog,
} = require('../workouts/exercise-library.cjs');
const { createWorkoutControllers } = require('../controllers/workout.controller');

function createWorkoutRoutes({
  authenticate = requireFirebaseAuth,
  getDb,
} = {}) {
  const router = express.Router();
  const controllers = createWorkoutControllers({ getDb });

  router.get('/exercises', authenticate, (_req, res) => {
    try {
      res.status(200).json({ success: true, exercises: getExerciseCatalog() });
    } catch (error) {
      if (!(error instanceof ExerciseImageValidationError)) throw error;
      res.status(503).json({
        success: false,
        code: error.code,
        message: error.message,
        unavailableAssets: error.unavailableAssets,
      });
    }
  });
  router.get('/active', authenticate, controllers.getActiveWorkout);
  router.post('/generate', authenticate, controllers.generateWorkoutPlan);
  router.get('/history', authenticate, controllers.getWorkoutHistory);

  return router;
}

module.exports = { createWorkoutRoutes };
