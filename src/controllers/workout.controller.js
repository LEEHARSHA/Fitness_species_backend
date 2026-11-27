const { getDb } = require('../config/mongodb');
const {
  getExerciseAvailability,
  getExerciseCatalog,
} = require('../workouts/exercise-library.cjs');
const { generateGymWeeklyPlan } = require('../workouts/gym-workout-program.cjs');

function hasNoDisclosedRestrictions(profile) {
  const isNoneOnly = (values) => Array.isArray(values)
    && values.length === 1
    && String(values[0]).trim().toLowerCase() === 'none';
  return profile.healthConsent === true
    && isNoneOnly(profile.healthConditions)
    && isNoneOnly(profile.injuries);
}

function normalizedSet(values) {
  return [...(values || [])].map((value) => String(value).trim().toLowerCase()).sort();
}

function planMatchesProfile(plan, profile) {
  const snapshot = plan.preferencesSnapshot || {};
  const currentExperience = String(profile.trainingExperience || profile.gymLiftingExperience || '').trim().toLowerCase();
  const plannedExperience = String(plan.experience || snapshot.trainingExperience || snapshot.gymLiftingExperience || '').trim().toLowerCase();
  return plan.goal === (profile.fitnessGoal || '')
    && plan.daysPerWeek === profile.trainingDays
    && plannedExperience === currentExperience
    && JSON.stringify(normalizedSet(snapshot.availableEquipment)) === JSON.stringify(normalizedSet(profile.availableEquipment))
    && JSON.stringify(normalizedSet(snapshot.healthConditions)) === JSON.stringify(normalizedSet(profile.healthConditions))
    && JSON.stringify(normalizedSet(snapshot.injuries)) === JSON.stringify(normalizedSet(profile.injuries));
}

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
      const firebaseProjectId = req.user.firebaseProjectId;
      const profile = await db.collection('workoutProfiles').findOne({
        userId,
        firebaseProjectId,
      });

      if (profile?.trainingEnvironment !== 'Gym') {
        return res.status(200).json({
          success: true,
          plan: null,
          message: 'No workout program is available for the selected environment.',
        });
      }

      const experience = String(profile.trainingExperience || profile.gymLiftingExperience || '').trim().toLowerCase();
      if (
        !['beginner', 'intermediate', 'advanced'].includes(experience)
        || !Number.isInteger(profile.trainingDays)
        || profile.trainingDays < 1
        || !Array.isArray(profile.availableEquipment)
        || profile.availableEquipment.length === 0
      ) {
        return res.status(200).json({
          success: true,
          plan: null,
          code: 'WORKOUT_SETUP_REQUIRED',
          message: 'Select your training experience, weekly availability, and equipment before using a Gym plan.',
        });
      }

      if (!hasNoDisclosedRestrictions(profile)) {
        return res.status(200).json({
          success: true,
          plan: null,
          code: 'PROFESSIONAL_GUIDANCE_REQUIRED',
          message: 'Your saved health or injury screening needs professional review before a workout plan can be shown.',
        });
      }

      const activePlan = await db.collection('workoutPlans').findOne({
        userId,
        firebaseProjectId,
        environment: 'Gym',
        status: 'active',
      });

      if (!activePlan) {
        return res.status(200).json({
          success: true,
          plan: null,
          message: 'No active workout plan found for user.'
        });
      }

      if (!planMatchesProfile(activePlan, profile)) {
        return res.status(200).json({
          success: true,
          plan: null,
          code: 'WORKOUT_PREFERENCES_CHANGED',
          message: 'Your saved workout preferences changed. Generate a new plan before continuing.',
        });
      }

      const approvedIds = new Set(getExerciseCatalog().map((exercise) => exercise.id));
      const plannedExercises = [
        ...(activePlan.workout?.exercises || []),
        ...(activePlan.weeklyWorkout?.sessions || []).flatMap((session) => session.exercises || []),
      ];
      if (
        plannedExercises.length === 0
        || plannedExercises.some((exercise) => !approvedIds.has(exercise.exerciseId))
      ) {
        return res.status(200).json({
          success: true,
          plan: null,
          code: 'WORKOUT_CONTENT_UNVERIFIED',
          message: 'The saved plan contains exercise content that is not currently approved.',
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
      const db = getDatabase();
      const userId = req.user.databaseUid || req.user.uid;
      const profile = await db.collection('workoutProfiles').findOne({
        userId,
        firebaseProjectId: req.user.firebaseProjectId,
      });
      if (profile?.trainingEnvironment !== 'Gym') {
        return res.status(409).json({
          success: false,
          code: 'ENVIRONMENT_WORKOUT_UNAVAILABLE',
          message: 'The Gym workout program is only available to users who selected Gym.',
        });
      }

      const availability = getExerciseAvailability();
      const history = await db.collection('workoutSessions')
        .find({ userId, firebaseProjectId: req.user.firebaseProjectId })
        .sort({ completedAt: -1 })
        .limit(100)
        .toArray();
      const generated = generateGymWeeklyPlan(profile, history, getExerciseCatalog());
      if (generated.error) {
        const status = generated.error.code === 'WORKOUT_CONTENT_UNVERIFIED' ? 503 : 409;
        return res.status(status).json({
          success: false,
          ...generated.error,
          sourceCount: availability.sourceCount,
          availableCount: availability.availableCount,
          unavailableCount: availability.unavailableExercises.length,
        });
      }

      const weeklyWorkout = generated.plan;
      const todayIndex = (new Date().getUTCDay() + 6) % 7;
      const todayWorkout = weeklyWorkout.sessions[todayIndex];
      const plans = db.collection('workoutPlans');
      const current = await plans.findOne({
        userId,
        firebaseProjectId: req.user.firebaseProjectId,
        environment: 'Gym',
        status: 'active',
      });
      const now = new Date();
      const planData = {
        userId,
        firebaseProjectId: req.user.firebaseProjectId,
        version: (current?.version || 0) + 1,
        status: 'active',
        environment: 'Gym',
        goal: profile.fitnessGoal || '',
        experience: profile.trainingExperience || profile.gymLiftingExperience || '',
        daysPerWeek: profile.trainingDays,
        preferencesSnapshot: profile,
        workout: todayWorkout,
        weeklyWorkout,
        updatedAt: now,
      };
      if (current) {
        await plans.updateOne(
          { _id: current._id, userId, firebaseProjectId: req.user.firebaseProjectId },
          { $set: planData },
        );
      } else {
        await plans.insertOne({ ...planData, createdAt: now });
      }
      const saved = await plans.findOne({
        userId,
        firebaseProjectId: req.user.firebaseProjectId,
        environment: 'Gym',
        status: 'active',
      });
      if (!saved) throw new Error('Generated workout plan could not be persisted.');
      return res.status(200).json({ success: true, plan: formatPlanResponse(saved) });
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
