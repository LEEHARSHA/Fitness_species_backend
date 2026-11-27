const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const { createWorkoutControllers } = require('../controllers/workout.controller');
const { z } = require('zod');

const environments = z.enum(['Gym', 'Home Workout', 'Home Workouts', 'Home', 'Calisthenics']);
const goals = z.enum(['Bulking', 'Cutting', 'Recomposition', 'Body Recomposition', 'Being Fit']);
const energyLevels = z.enum(['High', 'Medium', 'Low']);

const healthConditions = z.array(z.string().trim().min(1).max(120)).max(50).optional();
const injuries = z.array(z.string().trim().min(1).max(120)).max(50).optional();

const workoutProfileSchema = z.object({
  trainingEnvironment: environments.optional(),
  fitnessGoal: goals.optional(),
  trainingExperience: z.string().trim().max(100).optional(),
  trainingDays: z.number().int().min(1).max(7).optional(),
  healthConditions,
  otherHealthCondition: z.string().trim().max(500).optional(),
  injuries,
  otherInjury: z.string().trim().max(500).optional(),
  injuryStatus: z.string().trim().max(100).optional(),
  injuryRestrictions: z.string().trim().max(500).optional(),
  injuryClearedToExercise: z.string().trim().max(100).optional(),
  availableEquipment: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  energyLevel: energyLevels.optional(),
  energyUpdateDate: z.string().optional(),
  onboardingLastCompletedStep: z.number().int().min(0).max(10).optional(),
  healthConsent: z.boolean().optional(),
  workoutProfileCompleted: z.boolean().optional(),
  calisthenicsPushupAbility: z.string().optional(),
  calisthenicsPullupAbility: z.string().optional(),
  calisthenicsLowerBodyAbility: z.string().optional(),
  preferredSessionDuration: z.string().optional(),
  calisthenicsSkillsInterested: z.array(z.string()).optional(),
  homePushupAbility: z.string().optional(),
  homeLowerBodyAbility: z.string().optional(),
  gymLiftingExperience: z.string().optional(),
  gymStrengthHistory: z.string().optional(),
  gymRecoveryStatus: z.string().optional(),
  lastUpdated: z.number().optional(),
  exerciseSafetyStatus: z.string().optional(),
  onboardingVersion: z.number().int().min(1).max(100).optional(),
  onboardingCompletedAt: z.union([z.string(), z.number(), z.date()]).optional(),
}).strict();

function normalizeEnvironment(value) {
  if (!value) return value;
  const str = String(value).trim();
  if (str.toLowerCase() === 'home workouts' || str.toLowerCase() === 'home') return 'Home Workout';
  if (str.toLowerCase() === 'gym') return 'Gym';
  if (str.toLowerCase() === 'calisthenics') return 'Calisthenics';
  return str;
}

function normalizeEnergyLevel(value) {
  if (!value) return value;
  const str = String(value).trim();
  if (str.toLowerCase().startsWith('high')) return 'High';
  if (str.toLowerCase().startsWith('medium') || str.toLowerCase().startsWith('med')) return 'Medium';
  if (str.toLowerCase().startsWith('low')) return 'Low';
  return str;
}

function buildWorkoutProfileUpdate(parsedProfile, reqUser, now) {
  const immutable = new Set([
    'userId',
    'firebaseUid',
    'firebaseProjectId',
    'createdAt',
    '_id',
  ]);
  const profileData = Object.fromEntries(
    Object.entries(parsedProfile).filter(([key]) => !immutable.has(key)),
  );
  if (!profileData.onboardingVersion) {
    profileData.onboardingVersion = 1;
  }
  profileData.updatedAt = now;

  return {
    $set: profileData,
    $setOnInsert: {
      userId: reqUser.databaseUid || reqUser.uid,
      firebaseUid: reqUser.uid,
      firebaseProjectId: reqUser.firebaseProjectId,
      createdAt: now,
    },
  };
}

function createWorkoutRoutes({
  authenticate = requireFirebaseAuth,
  getDb,
} = {}) {
  const router = express.Router();
  const controllers = createWorkoutControllers({ getDb });

  router.get('/profile', authenticate, async (req, res, next) => {
    try {
      const userId = req.user.databaseUid || req.user.uid;
      const profile = await getDb().collection('workoutProfiles').findOne({
        userId,
        firebaseProjectId: req.user.firebaseProjectId,
      });
      res.status(200).json({
        success: true,
        profile: profile ? {
          ...profile,
          _id: undefined,
          userId: undefined,
        } : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/profile', authenticate, async (req, res, next) => {
    const correlationId = req.correlationId || req.headers['x-correlation-id'] || `req-${Date.now()}`;
    try {
      const parsed = workoutProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        console.warn(`[${correlationId}] PATCH /api/workouts/profile validation failed:`, parsed.error.issues);
        res.status(400).json({
          success: false,
          code: 'WORKOUT_PROFILE_INVALID',
          message: 'Workout profile data is invalid.',
          details: parsed.error.issues,
        });
        return;
      }
      const userId = req.user.databaseUid || req.user.uid;
      const now = new Date();

      const profileData = { ...parsed.data };
      if (profileData.trainingEnvironment) {
        profileData.trainingEnvironment = normalizeEnvironment(profileData.trainingEnvironment);
      }
      if (profileData.energyLevel) {
        profileData.energyLevel = normalizeEnergyLevel(profileData.energyLevel);
      }

      const update = buildWorkoutProfileUpdate(profileData, req.user, now);

      await getDb().collection('workoutProfiles').updateOne(
        { userId, firebaseProjectId: req.user.firebaseProjectId },
        update,
        { upsert: true },
      );

      const profile = await getDb().collection('workoutProfiles').findOne({
        userId,
        firebaseProjectId: req.user.firebaseProjectId,
      });
      if (!profile) {
        res.status(500).json({
          success: false,
          code: 'WORKOUT_PROFILE_PERSISTENCE_FAILED',
          correlationId,
          message: 'Workout profile persistence could not be confirmed.',
        });
        return;
      }
      res.status(200).json({
        success: true,
        profile: profile ? { ...profile, _id: undefined, userId: undefined } : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/energy', authenticate, async (req, res, next) => {
    const parsed = z.object({
      energyLevel: z.string(),
      energyUpdateDate: z.string().optional(),
    }).passthrough().safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Energy level is invalid.' });
      return;
    }

    try {
      const userId = req.user.databaseUid || req.user.uid;
      const energyLevel = normalizeEnergyLevel(parsed.data.energyLevel);
      const energyUpdateDate = parsed.data.energyUpdateDate || new Date().toISOString().split('T')[0];

      await getDb().collection('workoutProfiles').updateOne(
        { userId, firebaseProjectId: req.user.firebaseProjectId },
        {
          $set: {
            energyLevel,
            energyUpdateDate,
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      res.status(200).json({ success: true, energyLevel, energyUpdateDate });
    } catch (error) {
      next(error);
    }
  });

  router.get('/exercises', authenticate, (req, res) => {
    res.status(200).json({
      success: true,
      count: 0,
      sourceCount: 0,
      exercises: [],
      message: 'New workouts coming soon.',
    });
  });

  router.get('/active', authenticate, (_req, res) => {
    res.status(200).json({
      success: true,
      plan: null,
      message: 'New workouts coming soon.',
    });
  });

  router.post('/generate', authenticate, (_req, res) => {
    res.status(503).json({
      success: false,
      code: 'WORKOUT_GENERATION_DISABLED',
      message: 'New workouts coming soon.',
    });
  });

  router.get('/history', authenticate, controllers.getWorkoutHistory);

  return router;
}

module.exports = { createWorkoutRoutes, buildWorkoutProfileUpdate };
