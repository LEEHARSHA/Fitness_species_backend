const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const { createWorkoutControllers } = require('../controllers/workout.controller');
const { z } = require('zod');

const environments = z.enum(['Gym', 'Home Workout', 'Calisthenics']);
const goals = z.enum(['Bulking', 'Cutting', 'Recomposition', 'Body Recomposition', 'Being Fit']);
const healthConditions = z.array(z.string().trim().min(1).max(80)).max(30).optional();
const injuries = z.array(z.string().trim().min(1).max(80)).max(30).optional();

const workoutProfileSchema = z.object({
  trainingEnvironment: environments.optional(),
  fitnessGoal: goals.optional(),
  healthConditions,
  otherHealthCondition: z.string().trim().max(500).optional(),
  injuries,
  otherInjury: z.string().trim().max(500).optional(),
  injuryStatus: z.enum(['Current', 'Historical']).optional(),
  injuryRestrictions: z.string().trim().max(500).optional(),
  injuryClearedToExercise: z.enum([
    'Professional clearance confirmed',
    'Not yet confirmed',
    'Not applicable',
  ]).optional(),
  energyLevel: z.enum(['High', 'Medium', 'Low']).optional(),
  energyUpdateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  onboardingLastCompletedStep: z.number().int().min(0).max(6).optional(),
  healthConsent: z.boolean().optional(),
  workoutProfileCompleted: z.boolean().optional(),
}).strict();

function createWorkoutRoutes({
  authenticate = requireFirebaseAuth,
  getDb,
} = {}) {
  const router = express.Router();
  const controllers = createWorkoutControllers({ getDb });

  router.get('/profile', authenticate, async (req, res, next) => {
    try {
      const userId = req.user.databaseUid || req.user.uid;
      const profile = await getDb().collection('workoutProfiles').findOne({ userId });
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
    try {
      const parsed = workoutProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, message: 'Workout profile data is invalid.' });
        return;
      }
      const userId = req.user.databaseUid || req.user.uid;
      const now = new Date();
      const update = {
        ...parsed.data,
        firebaseProjectId: req.user.firebaseProjectId,
        updatedAt: now,
      };
      await getDb().collection('workoutProfiles').updateOne(
        { userId },
        {
          $set: update,
          $setOnInsert: {
            userId,
            createdAt: now,
            onboardingVersion: 1,
          },
        },
        { upsert: true },
      );
      const profile = await getDb().collection('workoutProfiles').findOne({ userId });
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
      energyLevel: z.enum(['High', 'Medium', 'Low']),
      energyUpdateDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Energy level is invalid.' });
      return;
    }
    try {
      const userId = req.user.databaseUid || req.user.uid;
      await getDb().collection('workoutProfiles').updateOne(
        { userId },
        {
          $set: {
            energyLevel: parsed.data.energyLevel,
            energyUpdateDate: parsed.data.energyUpdateDate,
            updatedAt: new Date(),
          },
        },
      );
      res.status(200).json({ success: true, ...parsed.data });
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

module.exports = { createWorkoutRoutes };
