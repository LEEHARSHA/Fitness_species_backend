const { getDb } = require('../config/mongodb');

/**
 * Format internal MongoDB diet plan document to clean public JSON
 */
function formatDietPlanResponse(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    version: doc.version,
    status: doc.status,
    goal: doc.goal || '',
    preferencesSnapshot: doc.preferencesSnapshot || {},
    nutritionTarget: doc.nutritionTarget || {},
    weeklyDietPlan: doc.weeklyDietPlan || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

/**
 * @route   GET /api/diets/active
 * @desc    Get current active diet plan for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getActiveDiet = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const activePlan = await db.collection('dietPlans').findOne({
      userId: userId,
      status: 'active'
    });

    if (!activePlan) {
      return res.status(200).json({
        success: true,
        plan: null,
        message: 'No active diet plan found for user.'
      });
    }

    return res.status(200).json({
      success: true,
      plan: formatDietPlanResponse(activePlan)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/diets/generate
 * @desc    Save new diet plan, increment version, mark active, archive previous active
 * @access  Private (Requires Firebase ID Token)
 */
const generateDietPlan = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const {
      goal,
      preferencesSnapshot,
      nutritionTarget,
      weeklyDietPlan
    } = req.body || {};

    if (!weeklyDietPlan) {
      return res.status(400).json({
        success: false,
        message: 'Diet plan data (weeklyDietPlan) must be provided.'
      });
    }

    // Find latest version number for this user
    const lastPlan = await db
      .collection('dietPlans')
      .find({ userId: userId })
      .sort({ version: -1 })
      .limit(1)
      .next();

    const nextVersion = lastPlan && typeof lastPlan.version === 'number' ? lastPlan.version + 1 : 1;

    // Archive all current active plans for this user
    await db.collection('dietPlans').updateMany(
      { userId: userId, status: 'active' },
      {
        $set: {
          status: 'archived',
          updatedAt: new Date()
        }
      }
    );

    // Insert new active diet plan
    const newPlanDoc = {
      userId: userId,
      version: nextVersion,
      status: 'active',
      goal: goal || preferencesSnapshot?.fitnessGoal || '',
      preferencesSnapshot: preferencesSnapshot || {},
      nutritionTarget: nutritionTarget || {
        calories: weeklyDietPlan.calorieTarget || 0,
        protein: weeklyDietPlan.proteinTarget || 0,
        carbs: weeklyDietPlan.carbsTarget || 0,
        fat: weeklyDietPlan.fatTarget || 0
      },
      weeklyDietPlan: weeklyDietPlan,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const insertResult = await db.collection('dietPlans').insertOne(newPlanDoc);
    newPlanDoc._id = insertResult.insertedId;

    return res.status(201).json({
      success: true,
      plan: formatDietPlanResponse(newPlanDoc)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/diets/history
 * @desc    Get historical diet plans for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getDietHistory = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const historyPlans = await db
      .collection('dietPlans')
      .find({ userId: userId })
      .sort({ version: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: historyPlans.length,
      plans: historyPlans.map(formatDietPlanResponse)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getActiveDiet,
  generateDietPlan,
  getDietHistory
};
