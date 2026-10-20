const { getDb } = require('../config/mongodb');

/**
 * Format internal MongoDB workout plan document to clean public JSON
 */
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

/**
 * @route   GET /api/workouts/active
 * @desc    Get current active workout plan for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getActiveWorkout = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

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

/**
 * @route   POST /api/workouts/generate
 * @desc    Save newly generated workout plan, increment version, mark active, archive previous active
 * @access  Private (Requires Firebase ID Token)
 */
const generateWorkoutPlan = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

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

    // Find latest version number for this user
    const lastPlan = await db
      .collection('workoutPlans')
      .find({ userId: userId })
      .sort({ version: -1 })
      .limit(1)
      .next();

    const nextVersion = lastPlan && typeof lastPlan.version === 'number' ? lastPlan.version + 1 : 1;

    // Archive all current active plans for this user
    await db.collection('workoutPlans').updateMany(
      { userId: userId, status: 'active' },
      {
        $set: {
          status: 'archived',
          updatedAt: new Date()
        }
      }
    );

    // Insert new active plan
    const newPlanDoc = {
      userId: userId,
      version: nextVersion,
      status: 'active',
      environment: environment || preferencesSnapshot?.trainingEnvironment || 'Gym',
      goal: goal || preferencesSnapshot?.fitnessGoal || '',
      experience: experience || preferencesSnapshot?.trainingExperience || '',
      daysPerWeek: daysPerWeek || preferencesSnapshot?.trainingDays || 3,
      preferencesSnapshot: preferencesSnapshot || {},
      workout: workout || null,
      weeklyWorkout: weeklyWorkout || null,
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
    const db = getDb();
    const userId = req.user.uid;

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

module.exports = {
  getActiveWorkout,
  generateWorkoutPlan,
  getWorkoutHistory
};
