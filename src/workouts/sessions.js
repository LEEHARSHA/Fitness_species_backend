import express from 'express';
import { z } from 'zod';
import { requireFirebaseAuth } from '../marketplace/auth.js';

const exerciseSchema = z.object({
  exerciseName: z.string().trim().min(1).max(120),
  targetSets: z.number().int().min(1).max(50),
  completedSets: z.number().int().min(1).max(50),
  reps: z.string().trim().max(80),
  weight: z.string().trim().max(80),
  rest: z.string().trim().max(40),
}).strict();

const sessionSchema = z.object({
  sessionId: z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/),
  workoutName: z.string().trim().min(1).max(120),
  split: z.string().trim().min(1).max(120),
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    }),
  startedAtTimestamp: z.number().int().positive(),
  completedAtTimestamp: z.number().int().positive(),
  durationMinutes: z.number().int().min(1).max(1440),
  caloriesBurned: z.number().int().min(0).max(5000),
  completedExerciseCount: z.number().int().min(1).max(50),
  totalExerciseCount: z.number().int().min(1).max(50),
  exercises: z.array(exerciseSchema).min(1).max(50),
}).strict().superRefine((session, context) => {
  if (session.completedAtTimestamp < session.startedAtTimestamp) {
    context.addIssue({
      code: 'custom',
      path: ['completedAtTimestamp'],
      message: 'Workout completion cannot precede its start.',
    });
  }
  if (
    session.exercises.length !== session.totalExerciseCount
    || session.completedExerciseCount !== session.totalExerciseCount
    || session.exercises.some((exercise) => exercise.completedSets !== exercise.targetSets)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['exercises'],
      message: 'A completed session must include all planned sets for every exercise.',
    });
  }
});

function formatSession(document) {
  return {
    sessionId: document.sessionId,
    workoutName: document.workoutName,
    split: document.split,
    date: document.date,
    startedAtTimestamp: document.startedAt.getTime(),
    completedAtTimestamp: document.completedAt.getTime(),
    durationMinutes: document.durationMinutes,
    caloriesBurned: document.caloriesBurned,
    completedExerciseCount: document.completedExerciseCount,
    totalExerciseCount: document.totalExerciseCount,
    exercises: document.exercises,
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function createWorkoutSessionRoutes(dependencies) {
  const router = express.Router();
  const authenticate = requireFirebaseAuth(
    dependencies.verifyIdToken,
    dependencies.supportedFirebaseProjectIds || [
      dependencies.primaryFirebaseProjectId || process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c',
    ],
  );

  router.post('/sessions', authenticate, asyncRoute(async (req, res) => {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Workout session data is invalid or incomplete.',
      });
      return;
    }

    const session = parsed.data;
    const completedAt = new Date(session.completedAtTimestamp);
    const now = Date.now();
    if (completedAt.getTime() > now + 5 * 60 * 1000 || completedAt.getTime() < now - 366 * 24 * 60 * 60 * 1000) {
      res.status(400).json({
        success: false,
        message: 'Workout completion time is outside the supported range.',
      });
      return;
    }

    const userId = req.user.databaseUid || req.user.uid;
    const filter = { userId, sessionId: session.sessionId };
    const document = {
      ...session,
      userId,
      startedAt: new Date(session.startedAtTimestamp),
      completedAt,
      createdAt: new Date(),
    };

    let created = false;
    const sessions = dependencies.getDb().collection('workoutSessions');
    try {
      const result = await sessions.updateOne(filter, { $setOnInsert: document }, { upsert: true });
      created = result.upsertedCount === 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }

    const savedSession = await sessions.findOne(filter);
    if (!savedSession) throw new Error('Workout session could not be persisted.');
    res.status(created ? 201 : 200).json({
      success: true,
      created,
      session: formatSession(savedSession),
    });
  }));

  router.get('/sessions', authenticate, asyncRoute(async (req, res) => {
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined
      ? 100
      : typeof rawLimit === 'string' && /^\d+$/.test(rawLimit)
        ? Number(rawLimit)
        : Number.NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ success: false, message: 'Limit must be between 1 and 100.' });
      return;
    }

    const sessions = await dependencies.getDb().collection('workoutSessions')
      .find({ userId: req.user.databaseUid || req.user.uid })
      .sort({ completedAt: -1, sessionId: -1 })
      .limit(limit)
      .toArray();
    res.status(200).json({
      success: true,
      count: sessions.length,
      sessions: sessions.map(formatSession),
    });
  }));

  return router;
}
