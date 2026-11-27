import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import exerciseLibrary from '../src/workouts/exercise-library.cjs';
import { createApp } from '../src/app.js';

test('workout exercise catalog is retired and empty', () => {
  assert.deepEqual(exerciseLibrary.getExerciseCatalog(), []);
  assert.equal(exerciseLibrary.getExerciseAsset('bodyweight-squat'), null);
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
