const { getDb } = require('../config/mongodb');
const { getExerciseCatalog } = require('../workouts/exercise-library.cjs');
const { generateGymWeeklyPlan } = require('../workouts/gym-workout-program.cjs');

function createWorkoutControllers({ getDb: getDatabase = getDb } = {}) {
  function formatPlanResponse(doc) {
    if (!doc) return null;
    return {
      id: doc._id?.toString?.() || '',
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

  function requiresProfessionalGuidance(profile) {
    const disclosed = (values) => (values || []).filter(
      (value) => !/^(none|no|no injuries?|no medical conditions?|prefer not to disclose|not applicable|n\/a)$/i.test(String(value).trim()),
    );
    const conditions = disclosed(profile.healthConditions);
    const injuries = disclosed(profile.injuries);
    return conditions.some((value) => /heart|cardiac|surgery|recent|pregnan|stroke|uncontrolled/i.test(value))
      || injuries.length > 0;
  }

  async function generateAndSavePlan(db, userId, firebaseProjectId, profile) {
    const catalog = getExerciseCatalog('Gym');
    const history = await db.collection('workoutSessions')
      .find({ userId })
      .sort({ completedAt: -1 })
      .limit(100)
      .toArray();

    const generated = generateGymWeeklyPlan(profile, history, catalog);
    if (!generated.plan || !generated.plan.sessions.some((session) => session.exercises.length > 0)) {
      return {
        error: {
          code: generated.error?.code || 'GENERATION_FAILED',
          message: generated.error?.message || 'No suitable exercises matched the saved workout profile.',
        },
      };
    }

    const weeklyWorkout = generated.plan;
    const todayIndex = (new Date().getUTCDay() + 6) % 7;
    const now = new Date();
    const current = await db.collection('workoutPlans').findOne({
      userId,
      environment: 'Gym',
      status: 'active',
    });
    const planData = {
      userId,
      firebaseProjectId,
      version: (current?.version || 0) + 1,
      status: 'active',
      environment: 'Gym',
      goal: profile.fitnessGoal || '',
      experience: profile.trainingExperience || profile.gymLiftingExperience || 'Beginner',
      daysPerWeek: profile.trainingDays || 3,
      preferencesSnapshot: profile,
      workout: weeklyWorkout.sessions[todayIndex],
      weeklyWorkout,
      updatedAt: now,
    };

    if (current) {
      await db.collection('workoutPlans').updateOne({ _id: current._id }, { $set: planData });
    } else {
      await db.collection('workoutPlans').insertOne({ ...planData, createdAt: now });
    }

    const saved = await db.collection('workoutPlans').findOne({
      userId,
      environment: 'Gym',
      status: 'active',
    });
    if (!saved) {
      return {
        error: {
          code: 'WORKOUT_PLAN_PERSISTENCE_FAILED',
          message: 'The generated workout plan could not be confirmed as saved.',
        },
      };
    }
    return { plan: saved };
  }

  const getActiveWorkout = async (req, res, next) => {
    try {
      const db = getDatabase();
      const userId = req.user.databaseUid || req.user.uid;
      const firebaseProjectId = req.user.firebaseProjectId;
      const profile = await db.collection('workoutProfiles').findOne({ userId });

      if (!profile || String(profile.trainingEnvironment || '').toLowerCase() !== 'gym') {
        return res.status(200).json({
          success: true,
          plan: null,
          message: 'Select Gym in workout preferences to receive a Gym workout plan.',
        });
      }

      if (requiresProfessionalGuidance(profile)) {
        return res.status(409).json({
          success: false,
          code: 'PROFESSIONAL_GUIDANCE_REQUIRED',
          message: 'Professional guidance is required before assigning a training plan.',
        });
      }

      let activePlan = await db.collection('workoutPlans').findOne({
        userId,
        environment: 'Gym',
        status: 'active',
      });

      if (!activePlan || !activePlan.weeklyWorkout || !activePlan.weeklyWorkout.sessions?.some(s => s.exercises?.length > 0)) {
        const generated = await generateAndSavePlan(db, userId, firebaseProjectId, profile);
        if (generated.plan) {
          activePlan = generated.plan;
        }
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
      const db = getDatabase();
      const userId = req.user.databaseUid || req.user.uid;
      const firebaseProjectId = req.user.firebaseProjectId;
      const profile = await db.collection('workoutProfiles').findOne({ userId });

      if (!profile || String(profile.trainingEnvironment || '').toLowerCase() !== 'gym') {
        return res.status(409).json({
          success: false,
          code: 'ENVIRONMENT_WORKOUT_UNAVAILABLE',
          message: 'The Gym workout program is only available to users who selected Gym.',
        });
      }

      if (requiresProfessionalGuidance(profile)) {
        return res.status(409).json({
          success: false,
          code: 'PROFESSIONAL_GUIDANCE_REQUIRED',
          message: 'Professional guidance is required before assigning a training plan.',
        });
      }

      const generated = await generateAndSavePlan(db, userId, firebaseProjectId, profile);
      if (generated.error) {
        return res.status(503).json({
          success: false,
          code: generated.error.code,
          sourceCount: 42,
          availableCount: getExerciseCatalog('Gym').length,
          message: generated.error.message,
        });
      }
      return res.status(200).json({ success: true, plan: formatPlanResponse(generated.plan) });
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
        .find({ userId })
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
