import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import exerciseLibrary from '../src/workouts/exercise-library.cjs';
import { createApp } from '../src/app.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildWorkoutProfileUpdate } = require('../src/routes/workout.routes.js');
const {
  generateGymWeeklyPlan,
  getProgramSchedule,
  getSourceInventory,
} = require('../src/workouts/gym-workout-program.cjs');

test('only the exact 42-entry six-day Gym source program is retained', () => {
  const inventory = getSourceInventory();
  const schedule = getProgramSchedule();
  assert.equal(inventory.length, 42);
  assert.deepEqual(schedule.map((day) => day.exerciseCount), [7, 7, 7, 7, 7, 7, 0]);
  assert.deepEqual(schedule.map((day) => day.focus), [
    'Chest + Triceps — Heavy Press Focus',
    'Back + Biceps — Rowing and Width Focus',
    'Legs + Shoulders — Quad Focus',
    'Chest + Triceps — Isolation Focus',
    'Back + Biceps — Cable and Stretch Focus',
    'Legs + Shoulders — Posterior Chain and Rear Delt Focus',
    'Rest or Active Recovery',
  ]);
  assert.equal(new Set(inventory.map((exercise) => exercise.id)).size, 42);
  assert.equal(inventory.every((exercise) => exercise.imageStatus === 'unverified'), true);
  assert.equal(inventory.every((exercise) => exercise.metadataStatus === 'unverified'), true);
});

test('unapproved exercise drafts remain unavailable for workout publication', () => {
  assert.deepEqual(exerciseLibrary.getExerciseCatalog(), []);
  assert.equal(exerciseLibrary.getExerciseAsset('bodyweight-squat'), null);
  const availability = exerciseLibrary.getExerciseAvailability();
  assert.equal(availability.sourceCount, 42);
  assert.equal(availability.availableCount, 0);
  assert.equal(availability.imageFilesPresent, 42);
  assert.equal(availability.approvedImageCount, 0);
  assert.equal(availability.approvedMetadataCount, 0);
  assert.equal(availability.unavailableExercises.length, 42);
  assert.equal(availability.unavailableExercises.every((exercise) => (
    exercise.imageFilePresent
    && exercise.imageAssetPath === `drafts/${exercise.id}.svg`
    && exercise.missingMetadataFields.length === 0
    && exercise.imageReviewStatus === 'pending_visual_review'
    && exercise.metadataReviewStatus === 'pending_professional_review'
    && exercise.missingRequirements.includes('image_license')
    && exercise.missingRequirements.includes('visual_image_review')
    && exercise.missingRequirements.includes('professional_metadata_review')
  )), true);
});

test('beginner plans use low volume and never invent resistance', () => {
  const catalog = getSourceInventory().map((source) => ({
    id: source.id,
    name: source.name,
    imageStatus: 'verified',
    metadataStatus: 'verified',
    imageReviewStatus: 'approved',
    metadataReviewStatus: 'approved',
    imageUrl: `/api/workouts/exercise-images/${source.id}`,
    imageLicense: 'Test fixture license',
    imageSource: 'Test fixture source',
    targetMuscles: ['Target muscle'],
    equipmentRequired: ['Barbell'],
    difficulty: 'beginner',
    startingPosition: 'Stable starting position.',
    executionSteps: ['Perform the controlled movement.'],
    commonMistakes: ['Do not lose control of the movement.'],
    safetyNotes: 'Stop if pain or form loss occurs.',
    rest: '90 seconds',
    gymProgramming: [{ rest: '90 seconds' }],
  }));
  const profile = {
    trainingExperience: 'Beginner',
    trainingDays: 3,
    availableEquipment: ['Barbell'],
    healthConsent: true,
    healthConditions: ['None'],
    injuries: ['None'],
  };
  const generated = generateGymWeeklyPlan(profile, [], catalog);
  assert.ok(generated.plan);
  const monday = generated.plan.sessions[0];
  assert.equal(monday.exercises.length, 4);
  assert.equal(monday.exercises.every((exercise) => Number(exercise.sets) <= 2), true);
  assert.equal(monday.exercises.every((exercise) => exercise.weight === 'Weight not set'), true);
  assert.equal(monday.exercises.some((exercise) => /weighted triceps dips/i.test(exercise.name)), false);
  assert.equal(generated.plan.sessions[1].exercises.length, 0);

  const pendingReviewCatalog = catalog.map((exercise) => ({
    ...exercise,
    imageReviewStatus: 'pending_visual_review',
  }));
  assert.equal(
    generateGymWeeklyPlan(profile, [], pendingReviewCatalog).error.code,
    'WORKOUT_CONTENT_UNVERIFIED',
  );

  const historyBased = generateGymWeeklyPlan(profile, [{
    exercises: [{ exerciseName: 'Flat Barbell Bench Press', weight: '60 kg' }],
  }], catalog);
  assert.equal(historyBased.plan.sessions[0].exercises[0].weight, '60 kg');
});

test('workout profile update has no MongoDB conflicting operator paths', () => {
  const now = new Date('2026-11-28T00:40:00.000Z');
  const update = buildWorkoutProfileUpdate({
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Recomposition',
    healthConditions: ['None'],
    injuries: ['None'],
    energyLevel: 'Medium',
    onboardingVersion: 1,
  }, {
    uid: 'android-gym-user',
    databaseUid: 'project-fitness-species:android-gym-user',
    firebaseProjectId: 'project-fitness-species',
  }, now);

  const setPaths = Object.keys(update.$set);
  const insertPaths = Object.keys(update.$setOnInsert);
  assert.deepEqual(setPaths.filter((path) => insertPaths.includes(path)), []);
  assert.equal(update.$set.trainingEnvironment, 'Gym');
  assert.equal(update.$set.fitnessGoal, 'Recomposition');
  assert.equal(update.$set.updatedAt, now);
  assert.equal(update.$setOnInsert.createdAt, now);
  assert.equal(update.$setOnInsert.firebaseProjectId, 'project-fitness-species');
});

test('Gym API exposes pending source inventory without publishing unverified exercises', async () => {
  const gymProfile = {
    trainingEnvironment: 'Gym',
    trainingExperience: 'Intermediate',
    trainingDays: 6,
    availableEquipment: ['Dumbbells', 'Barbell'],
    healthConsent: true,
    healthConditions: ['None'],
    injuries: ['None'],
  };
  const app = createApp({
    getDb: () => ({
      collection: (name) => {
        const collection = {
          async findOne() {
            return name === 'workoutProfiles' ? gymProfile : null;
          },
          find() {
            return {
              sort() { return this; },
              limit() { return this; },
              async toArray() { return []; },
            };
          },
        };
        return collection;
      },
    }),
    getDbStatus: () => 'connected',
    verifyIdToken: async () => ({
      uid: 'empty-workout-test-user',
      aud: 'sellerportal-2786c',
      iss: 'https://securetoken.google.com/sellerportal-2786c',
    }),
  });

  const catalog = await request(app)
    .get('/api/workouts/exercises')
    .query({ environment: 'Gym' })
    .set('Authorization', 'Bearer valid');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.count, 0);
  assert.equal(catalog.body.sourceCount, 42);
  assert.equal(catalog.body.available, false);
  assert.equal(catalog.body.unavailableExercises.length, 42);
  assert.deepEqual(catalog.body.exercises, []);

  const active = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(active.status, 200);
  assert.equal(active.body.plan, null);

  const homeCatalog = await request(app)
    .get('/api/workouts/exercises')
    .query({ environment: 'Home Workout' })
    .set('Authorization', 'Bearer valid');
  assert.equal(homeCatalog.status, 200);
  assert.equal(homeCatalog.body.sourceCount, 0);

  const generated = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid')
    .send({ environment: 'Gym', exercises: [] });
  assert.equal(generated.status, 503);
  assert.equal(generated.body.code, 'WORKOUT_CONTENT_UNVERIFIED');
  assert.equal(generated.body.sourceCount, 42);
  assert.equal(generated.body.availableCount, 0);
});

test('active Gym plans are withheld when health screening or saved plan preferences are stale', async () => {
  const profile = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Body Recomposition',
    trainingExperience: 'Intermediate',
    trainingDays: 6,
    availableEquipment: ['Barbell', 'Dumbbells'],
    healthConsent: true,
    healthConditions: ['None'],
    injuries: ['None'],
  };
  const activePlan = {
    _id: { toString: () => 'plan-id' },
    userId: 'stale-plan-user',
    version: 1,
    status: 'active',
    environment: 'Gym',
    goal: 'Bulking',
    experience: 'Intermediate',
    daysPerWeek: 6,
    preferencesSnapshot: {
      ...profile,
      fitnessGoal: 'Bulking',
    },
    weeklyWorkout: { sessions: [{ exercises: [{ exerciseId: 'unverified' }] }] },
  };
  const app = createApp({
    getDb: () => ({
      collection: (name) => ({
        async findOne() {
          return name === 'workoutProfiles' ? profile : activePlan;
        },
      }),
    }),
    getDbStatus: () => 'connected',
    verifyIdToken: async () => ({
      uid: 'stale-plan-user',
      aud: 'sellerportal-2786c',
      iss: 'https://securetoken.google.com/sellerportal-2786c',
    }),
  });

  const stalePlan = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(stalePlan.status, 200);
  assert.equal(stalePlan.body.plan, null);
  assert.equal(stalePlan.body.code, 'WORKOUT_PREFERENCES_CHANGED');

  profile.healthConditions = ['Heart Disease'];
  const restrictedPlan = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(restrictedPlan.status, 200);
  assert.equal(restrictedPlan.body.plan, null);
  assert.equal(restrictedPlan.body.code, 'PROFESSIONAL_GUIDANCE_REQUIRED');
});

test('authenticated workout profile is saved and isolated by UID', async () => {
  let storedProfile = null;
  const workoutProfiles = {
    async findOne(query) {
      return storedProfile && storedProfile.userId === query.userId ? storedProfile : null;
    },
    async updateOne(query, update) {
      storedProfile = {
        ...(storedProfile || {}),
        ...update.$set,
        ...update.$setOnInsert,
        userId: query.userId,
      };
      return { matchedCount: 1, upsertedCount: 1 };
    },
  };
  const app = createApp({
    getDb: () => ({
      collection: (name) => name === 'workoutProfiles' ? workoutProfiles : {},
    }),
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => token === 'valid' ? {
      uid: 'onboarding-user',
      aud: 'sellerportal-2786c',
      iss: 'https://securetoken.google.com/sellerportal-2786c',
      firebaseProjectId: 'sellerportal-2786c',
    } : null,
  });

  const saved = await request(app)
    .patch('/api/workouts/profile')
    .set('Authorization', 'Bearer valid')
    .send({
      trainingEnvironment: 'Gym',
      fitnessGoal: 'Recomposition',
      healthConditions: ['None'],
      injuries: ['None'],
      energyLevel: 'Medium',
      workoutProfileCompleted: true,
    });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.profile.trainingEnvironment, 'Gym');
  assert.equal(saved.body.profile.fitnessGoal, 'Recomposition');

  const loaded = await request(app)
    .get('/api/workouts/profile')
    .set('Authorization', 'Bearer valid');
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.profile.trainingEnvironment, 'Gym');

  const invalid = await request(app)
    .patch('/api/workouts/profile')
    .set('Authorization', 'Bearer valid')
    .send({ fitnessGoal: 'Invalid Goal' });
  assert.equal(invalid.status, 400);
});

test('Android Firebase project token can save the exact onboarding case', async () => {
  let storedProfile = null;
  const workoutProfiles = {
    async findOne(query) {
      if (!storedProfile) return null;
      if (storedProfile.userId !== query.userId) return null;
      if (query.firebaseProjectId && storedProfile.firebaseProjectId !== query.firebaseProjectId) return null;
      return storedProfile;
    },
    async updateOne(query, update) {
      storedProfile = {
        ...(storedProfile || {}),
        ...update.$set,
        ...update.$setOnInsert,
        userId: query.userId,
        firebaseProjectId: query.firebaseProjectId,
      };
      return { acknowledged: true, matchedCount: 1, upsertedCount: 1 };
    },
  };
  const app = createApp({
    getDb: () => ({
      collection: (name) => name === 'workoutProfiles' ? workoutProfiles : {},
    }),
    getDbStatus: () => 'connected',
    verifyIdToken: async () => ({
      uid: 'android-gym-user',
      aud: 'project-fitness-species',
      iss: 'https://securetoken.google.com/project-fitness-species',
    }),
    primaryFirebaseProjectId: 'sellerportal-2786c',
    supportedFirebaseProjectIds: ['sellerportal-2786c', 'project-fitness-species'],
  });

  const response = await request(app)
    .patch('/api/workouts/profile')
    .set('Authorization', 'Bearer android-token')
    .send({
      trainingEnvironment: 'Gym',
      fitnessGoal: 'Recomposition',
      healthConditions: ['None'],
      injuries: ['None'],
      energyLevel: 'Medium',
      healthConsent: true,
      workoutProfileCompleted: true,
      onboardingLastCompletedStep: 6,
      onboardingVersion: 1,
      exerciseSafetyStatus: 'No disclosed restrictions',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.profile.trainingEnvironment, 'Gym');
  assert.equal(response.body.profile.fitnessGoal, 'Recomposition');
  assert.equal(response.body.profile.energyLevel, 'Medium');
  assert.equal(response.body.profile.firebaseProjectId, 'project-fitness-species');
});

test('MongoDB profile write failures return categorized diagnostics', async () => {
  const app = createApp({
    getDb: () => ({
      collection: (name) => name === 'workoutProfiles'
        ? {
          async updateOne() {
            const error = new Error('simulated Mongo write failure');
            error.name = 'MongoServerError';
            throw error;
          },
        }
        : {},
    }),
    getDbStatus: () => 'connected',
    verifyIdToken: async () => ({
      uid: 'mongo-failure-user',
      aud: 'project-fitness-species',
      iss: 'https://securetoken.google.com/project-fitness-species',
    }),
    primaryFirebaseProjectId: 'sellerportal-2786c',
    supportedFirebaseProjectIds: ['sellerportal-2786c', 'project-fitness-species'],
  });

  const response = await request(app)
    .patch('/api/workouts/profile')
    .set('Authorization', 'Bearer android-token')
    .set('X-Correlation-Id', 'workout-profile-test')
    .send({
      trainingEnvironment: 'Gym',
      fitnessGoal: 'Recomposition',
      healthConditions: ['None'],
      injuries: ['None'],
      energyLevel: 'Medium',
      workoutProfileCompleted: true,
    });

  assert.equal(response.status, 500);
  assert.equal(response.body.code, 'MONGODB_ERROR');
  assert.equal(response.headers['x-correlation-id'], 'workout-profile-test');
});
