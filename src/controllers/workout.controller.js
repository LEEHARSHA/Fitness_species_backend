const { getDb } = require('../config/mongodb');
const { getExerciseCatalog } = require('../workouts/exercise-library.cjs');
const { generateGymWeeklyPlan } = require('../workouts/gym-workout-program.cjs');

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
      const profile = await db.collection('workoutProfiles').findOne({ userId });

      if (!profile || profile.trainingEnvironment !== 'Gym') {
        return res.status(200).json({
          success: true,
          plan: null,
          code: 'ENVIRONMENT_WORKOUT_UNAVAILABLE',
          message: 'No workout program is available for the selected environment.',
        });
      }

      const restricted = profile.healthConsent === true
        && (
          (profile.healthConditions || []).some((value) => /heart|surgery|recent|pregnan/i.test(value))
          || (profile.injuries || []).some((value) => /rehabilitation|recent surgery|recover/i.test(value))
        );
      if (restricted) {
        return res.status(200).json({
          success: true,
          plan: null,
          code: 'PROFESSIONAL_GUIDANCE_REQUIRED',
          message: 'Professional guidance is required before assigning a training plan.',
        });
      }

      let activePlan = await db.collection('workoutPlans').findOne({
        userId,
        environment: 'Gym',
        status: 'active',
      });

      if (activePlan) {
        const snapshot = activePlan.preferencesSnapshot;
        const preferenceChanged = snapshot && (
          snapshot.fitnessGoal !== profile.fitnessGoal
          || snapshot.trainingEnvironment !== profile.trainingEnvironment
          || snapshot.trainingExperience !== profile.trainingExperience
          || snapshot.trainingDays !== profile.trainingDays
          || snapshot.energyLevel !== profile.energyLevel
          || JSON.stringify(snapshot.availableEquipment || []) !== JSON.stringify(profile.availableEquipment || [])
          || JSON.stringify(snapshot.healthConditions || []) !== JSON.stringify(profile.healthConditions || [])
          || JSON.stringify(snapshot.injuries || []) !== JSON.stringify(profile.injuries || [])
        );
        if (preferenceChanged) {
          activePlan = null;
          return res.status(200).json({
            success: true,
            plan: null,
            code: 'WORKOUT_PREFERENCES_CHANGED',
            message: 'The active workout does not match the saved preferences. No stale plan was returned.',
          });
        }

        const eligibleCatalog = getExerciseCatalog('Gym');
        const eligibleIds = new Set(eligibleCatalog.map((exercise) => exercise.id));
        const assignedExercises = (activePlan.weeklyWorkout?.sessions || [])
          .flatMap((session) => session.exercises || []);
        const hasUnverifiedAssignedExercise = assignedExercises.some((exercise) =>
          !exercise.exerciseId || !eligibleIds.has(exercise.exerciseId));
        if (eligibleCatalog.length === 0 || hasUnverifiedAssignedExercise) {
          activePlan = null;
          return res.status(200).json({
            success: true,
            plan: null,
            code: 'WORKOUT_CONTENT_UNVERIFIED',
            sourceCount: 42,
            availableCount: eligibleCatalog.length,
            message: 'The active plan cannot be published because its exercises no longer pass Gym content verification.',
          });
        }
      }

      if (!activePlan) {
        const catalog = getExerciseCatalog('Gym');
        if (catalog.length === 0) {
          return res.status(200).json({
            success: true,
            plan: null,
            code: 'WORKOUT_CONTENT_UNVERIFIED',
            sourceCount: 42,
            availableCount: 0,
            message: 'The 42-entry Gym program is recorded, but no exercise currently has both verified metadata and an approved instructional image.',
          });
        }
        const history = await db.collection('workoutSessions')
          .find({ userId })
          .sort({ completedAt: -1 })
          .limit(100)
          .toArray();
        const generated = generateGymWeeklyPlan(profile, history, catalog);
        if (generated.plan) {
          const weeklyWorkout = generated.plan;
          const todayIndex = (new Date().getUTCDay() + 6) % 7;
          const todayWorkout = weeklyWorkout.sessions[todayIndex];
          const now = new Date();
          const newPlanDoc = {
            userId,
            firebaseProjectId,
            version: 1,
            status: 'active',
            environment: 'Gym',
            goal: profile.fitnessGoal || '',
            experience: profile.trainingExperience || profile.gymLiftingExperience || '',
            daysPerWeek: profile.trainingDays || 6,
            preferencesSnapshot: profile,
            workout: todayWorkout,
            weeklyWorkout,
            createdAt: now,
            updatedAt: now,
          };
          const insertResult = await db.collection('workoutPlans').insertOne(newPlanDoc);
          newPlanDoc._id = insertResult.insertedId;
          activePlan = newPlanDoc;
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

      if (!profile || profile.trainingEnvironment !== 'Gym') {
        return res.status(409).json({
          success: false,
          code: 'ENVIRONMENT_WORKOUT_UNAVAILABLE',
          message: 'The Gym workout program is only available to users who selected Gym.',
        });
      }

      const catalog = getExerciseCatalog('Gym');
      const history = await db.collection('workoutSessions')
        .find({ userId })
        .sort({ completedAt: -1 })
        .limit(100)
        .toArray();
      const generated = generateGymWeeklyPlan(profile, history, catalog);

      if (generated.error || !generated.plan) {
        return res.status(503).json({
          success: false,
          code: generated.error?.code || 'GENERATION_FAILED',
          sourceCount: 42,
          availableCount: catalog.length,
          message: generated.error?.message || 'Could not generate plan.',
        });
      }

      const weeklyWorkout = generated.plan;
      const todayIndex = (new Date().getUTCDay() + 6) % 7;
      const todayWorkout = weeklyWorkout.sessions[todayIndex];
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
        experience: profile.trainingExperience || profile.gymLiftingExperience || '',
        daysPerWeek: profile.trainingDays || 6,
        preferencesSnapshot: profile,
        workout: todayWorkout,
        weeklyWorkout,
        updatedAt: now,
      };

      if (current) {
        await db.collection('workoutPlans').updateOne(
          { _id: current._id },
          { $set: planData }
        );
      } else {
        await db.collection('workoutPlans').insertOne({ ...planData, createdAt: now });
      }

      const saved = await db.collection('workoutPlans').findOne({
        userId,
        environment: 'Gym',
        status: 'active',
      });

      return res.status(200).json({ success: true, plan: formatPlanResponse(saved || planData) });
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
