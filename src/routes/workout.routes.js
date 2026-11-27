const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  ExerciseImageValidationError,
  getExerciseCatalog,
} = require('../workouts/exercise-library.cjs');
const { getHomeWorkoutCatalog, HOME_WORKOUT_SOURCE_COUNT } = require('../workouts/home-workout-library.cjs');
const { GYM_WORKOUT_SOURCE_COUNT } = require('../workouts/gym-workout-library.cjs');
const { createWorkoutControllers } = require('../controllers/workout.controller');

function createWorkoutRoutes({
  authenticate = requireFirebaseAuth,
  getDb,
} = {}) {
  const router = express.Router();
  const controllers = createWorkoutControllers({ getDb });

  router.get('/exercises', authenticate, (req, res) => {
    try {
      if (String(req.query.environment || '').trim().toLowerCase() === 'home workout') {
        const exercises = getHomeWorkoutCatalog();
        res.status(200).json({
          success: true,
          count: HOME_WORKOUT_SOURCE_COUNT,
          sourceCount: HOME_WORKOUT_SOURCE_COUNT,
          environment: 'Home Workout',
          exercises,
        });
        return;
      }
      if (String(req.query.environment || '').trim().toLowerCase() === 'gym') {
        const exercises = getExerciseCatalog().filter((exercise) =>
          exercise.environments.includes('Gym')
        );
        res.status(200).json({
          success: true,
          count: GYM_WORKOUT_SOURCE_COUNT,
          sourceCount: GYM_WORKOUT_SOURCE_COUNT,
          uniqueExerciseCount: exercises.length,
          environment: 'Gym',
          exercises,
        });
        return;
      }
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
