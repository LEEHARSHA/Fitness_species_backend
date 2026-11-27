import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import exerciseLibrary from '../src/workouts/exercise-library.cjs';
import { createApp } from '../src/app.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildWorkoutProfileUpdate } = require('../src/routes/workout.routes.js');

test('workout exercise catalog is retired and empty', () => {
  assert.deepEqual(exerciseLibrary.getExerciseCatalog(), []);
  assert.equal(exerciseLibrary.getExerciseAsset('bodyweight-squat'), null);
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

test('workout routes are coming-soon and generation is disabled', async () => {
  const app = createApp({
    getDbStatus: () => 'connected',
    verifyIdToken: async () => ({
      uid: 'empty-workout-test-user',
      aud: 'sellerportal-2786c',
      iss: 'https://securetoken.google.com/sellerportal-2786c',
    }),
  });

  const catalog = await request(app)
    .get('/api/workouts/exercises')
    .set('Authorization', 'Bearer valid');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.count, 0);
  assert.deepEqual(catalog.body.exercises, []);

  const active = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(active.status, 200);
  assert.equal(active.body.plan, null);

  const generated = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid')
    .send({ environment: 'Gym', exercises: [] });
  assert.equal(generated.status, 503);
  assert.equal(generated.body.code, 'WORKOUT_GENERATION_DISABLED');
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
