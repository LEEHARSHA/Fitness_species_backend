const { getDb } = require('../config/mongodb');
const {
  ExerciseImageValidationError,
  enrichWorkoutPlan,
} = require('../workouts/exercise-library.cjs');

function sendExerciseImageError(res, error) {
  if (!(error instanceof ExerciseImageValidationError)) return false;
  const status = error.code === 'EXERCISE_IMAGE_UNAVAILABLE' ? 503 : 422;
  res.status(status).json({
    success: false,
    code: error.code,
    message: error.message,
    missingExercises: error.missingExercises,
    unavailableAssets: error.unavailableAssets,
    unsupportedExercises: error.unsupportedExercises,
  });
  return true;
}

function createWorkoutControllers({ getDb: getDatabase = getDb } = {}) {
  function formatPlanResponse(doc) {
    if (!doc) return null;
    const { workout, weeklyWorkout } = enrichWorkoutPlan(
      doc.workout,
      doc.weeklyWorkout,
      doc.environment || 'Gym',
    );
    return {
      id: doc._id.toString(),
      userId: doc.userId,
      version: doc.version,
      status: doc.status,
      environment: doc.environment || 'Gym',
      goal: doc.goal || '',
      experience: doc.experience || '',
      daysPerWeek: doc.daysPerWeek || 3,
      preferencesSnapshot: doc.preferencesSnapshot || {},
      workout,
      weeklyWorkout,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  /**
   * @route   GET /api/workouts/active
   * @desc    Get current active workout plan for authenticated user
   * @access  Private (Requires Firebase ID Token)
   */
  const getActiveWorkout = async (req, res, next) => {
    try {
      const db = getDatabase();
      const userId = req.user.databaseUid || req.user.uid;

      const activePlan = await db.collection('workoutPlans').findOne({
        userId: userId,
        status: 'active'
      });

      if (!activePlan) {
        return res.status(200).json({
          success: true,
          plan: null,
          message: 'No active workout plan found for user.'
        });
      }

      return res.status(200).json({
        success: true,
        plan: formatPlanResponse(activePlan)
      });
    } catch (error) {
      if (sendExerciseImageError(res, error)) return;
      next(error);
    }
  };

  /**
   * @route   POST /api/workouts/generate
   * @desc    Save newly generated workout plan, increment version, mark active, archive previous active
   * @access  Private (Requires Firebase ID Token)
   */
  const generateWorkoutPlan = async (req, res, next) => {
    try {
      const db = getDatabase();
      const userId = req.user.databaseUid || req.user.uid;

      const {
        environment,
        goal,
        experience,
        daysPerWeek,
        preferencesSnapshot,
        workout,
        weeklyWorkout
      } = req.body || {};

      if (!workout && !weeklyWorkout) {
        return res.status(400).json({
          success: false,
          message: 'Workout plan data (workout or weeklyWorkout) must be provided.'
        });
      }

      let enrichedPlan;
      try {
        enrichedPlan = enrichWorkoutPlan(
          workout,
          weeklyWorkout,
          environment || preferencesSnapshot?.trainingEnvironment || 'Gym',
        );
      } catch (error) {
        if (sendExerciseImageError(res, error)) return;
        throw error;
      }

      const lastPlan = await db
        .collection('workoutPlans')
        .find({ userId: userId })
        .sort({ version: -1 })
        .limit(1)
        .next();

      const nextVersion = lastPlan && typeof lastPlan.version === 'number' ? lastPlan.version + 1 : 1;

      await db.collection('workoutPlans').updateMany(
        { userId: userId, status: 'active' },
        {
          $set: {
            status: 'archived',
            updatedAt: new Date()
          }
        }
      );

      const newPlanDoc = {
        userId: userId,
        version: nextVersion,
        status: 'active',
        environment: environment || preferencesSnapshot?.trainingEnvironment || 'Gym',
        goal: goal || preferencesSnapshot?.fitnessGoal || '',
        experience: experience || preferencesSnapshot?.trainingExperience || '',
        daysPerWeek: daysPerWeek || preferencesSnapshot?.trainingDays || 3,
        preferencesSnapshot: preferencesSnapshot || {},
        workout: enrichedPlan.workout,
        weeklyWorkout: enrichedPlan.weeklyWorkout,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const insertResult = await db.collection('workoutPlans').insertOne(newPlanDoc);
      newPlanDoc._id = insertResult.insertedId;

      return res.status(201).json({
        success: true,
        plan: formatPlanResponse(newPlanDoc)
      });
    } catch (error) {
      if (sendExerciseImageError(res, error)) return;
      next(error);
    }
  };

  /**
   * @route   GET /api/workouts/history
   * @desc    Get historical workout plans for authenticated user
   * @access  Private (Requires Firebase ID Token)
   */
  const getWorkoutHistory = async (req, res, next) => {
    try {
      const db = getDatabase();
      const userId = req.user.databaseUid || req.user.uid;

      const historyPlans = await db
        .collection('workoutPlans')
        .find({ userId: userId })
        .sort({ version: -1 })
        .toArray();

      return res.status(200).json({
        success: true,
        count: historyPlans.length,
        plans: historyPlans.map(formatPlanResponse)
      });
    } catch (error) {
      if (sendExerciseImageError(res, error)) return;
      next(error);
    }
  };

  return {
    getActiveWorkout,
    generateWorkoutPlan,
    getWorkoutHistory,
  };
}

module.exports = {
  ...createWorkoutControllers(),
  createWorkoutControllers,
};
