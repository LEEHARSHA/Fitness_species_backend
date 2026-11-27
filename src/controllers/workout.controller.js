const { getDb } = require('../config/mongodb');

function createWorkoutControllers({ getDb: getDatabase = getDb } = {}) {
  function formatPlanResponse(doc) {
    if (!doc) return null;
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
      workout: doc.workout || null,
      weeklyWorkout: doc.weeklyWorkout || null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

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
      next(error);
    }
  };

  const generateWorkoutPlan = async (req, res, next) => {
    try {
      return res.status(200).json({
        success: false,
        code: 'WORKOUT_LIBRARY_UNAVAILABLE',
        message: "New workout library coming soon. We're preparing a better and more personalized workout experience."
      });
    } catch (error) {
      next(error);
    }
  };

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
