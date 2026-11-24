import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import exerciseLibrary from '../src/workouts/exercise-library.cjs';
import { createApp } from '../src/app.js';

const primaryProject = 'sellerportal-2786c';
const records = { workoutPlans: [] };
let archiveUpdates;

function matches(document, query) {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

const workoutPlans = {
  async findOne(query) {
    return records.workoutPlans.find((record) => matches(record, query)) || null;
  },
  find(query) {
    const results = records.workoutPlans.filter((record) => matches(record, query));
    const cursor = {
      sort() {
        results.sort((left, right) => right.version - left.version);
        return cursor;
      },
      limit() {
        return cursor;
      },
      async next() {
        return results[0] || null;
      },
    };
    return cursor;
  },
  async updateMany(query, update) {
    const matching = records.workoutPlans.filter((record) => matches(record, query));
    archiveUpdates += matching.length;
    for (const record of matching) Object.assign(record, update.$set);
  },
  async insertOne(document) {
    const record = { ...document, _id: new ObjectId() };
    records.workoutPlans.push(record);
    return { insertedId: record._id };
  },
};

function makeApp() {
  return createApp({
    getDb: () => ({ collection: (name) => (name === 'workoutPlans' ? workoutPlans : {}) }),
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => token === 'valid'
      ? {
        uid: 'exercise-image-user',
        aud: primaryProject,
        iss: `https://securetoken.google.com/${primaryProject}`,
      }
      : null,
    primaryFirebaseProjectId: primaryProject,
    supportedFirebaseProjectIds: [primaryProject],
  });
}

test('every published catalog exercise has a unique ID and a loadable original SVG', async () => {
  const app = makeApp();
  const response = await request(app)
    .get('/api/workouts/exercises')
    .set('Authorization', 'Bearer valid');

  assert.equal(response.status, 200);
  const exercises = response.body.exercises;
  assert.equal(exercises.length, 15);
  assert.equal(new Set(exercises.map((exercise) => exercise.id)).size, exercises.length);
  for (const environment of ['Gym', 'Home Workout', 'Calisthenics']) {
    assert.ok(exercises.some((exercise) => exercise.environments.includes(environment)));
  }

  for (const exercise of exercises) {
    assert.ok(exercise.instructions.length > 0);
    assert.match(exercise.assetLicense, /^Original Fitness Species/);
    const image = await request(app).get(exercise.imageUrl);
    assert.equal(image.status, 200, `${exercise.id} image should be served`);
    assert.match(image.headers['content-type'], /^image\/svg\+xml/);
    const svg = image.body.toString('utf8');
    assert.match(svg, new RegExp(`<title[^>]*>${exercise.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
    assert.doesNotMatch(svg, /<image\b/i);
  }
});

test('exercise names are enriched with their matching image and technique instructions', () => {
  const result = exerciseLibrary.enrichWorkoutPlan(null, {
    Monday: {
      exercises: [
        { name: 'Air squat', sets: 3, reps: 12 },
        'Plank',
      ],
    },
  }, 'Home Workout');

  const planned = result.weeklyWorkout.Monday.exercises;
  assert.deepEqual(planned.map((exercise) => exercise.exerciseId), [
    'bodyweight-squat',
    'forearm-plank',
  ]);
  for (const exercise of planned) {
    assert.equal(exercise.imageUrl, `/exercise-images/${exercise.exerciseId}.svg`);
    assert.ok(exercise.instructions.length > 0);
  }
});

test('workout plans reject exercises without matching assets before publishing', async () => {
  records.workoutPlans.length = 0;
  archiveUpdates = 0;
  records.workoutPlans.push({
    _id: new ObjectId(),
    userId: 'exercise-image-user',
    version: 1,
    status: 'active',
    environment: 'Home Workout',
    workout: null,
    weeklyWorkout: { Monday: { exercises: [{ name: 'Air squat' }] } },
  });
  const app = makeApp();
  const rejected = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid')
    .send({
      environment: 'Home Workout',
      weeklyWorkout: {
        Monday: { exercises: [{ name: 'Single-arm kettlebell clean', sets: 3 }] },
      },
    });

  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.code, 'EXERCISE_IMAGE_REQUIRED');
  assert.equal(rejected.body.missingExercises[0].requiredImageAsset, 'exercise-single-arm-kettlebell-clean.svg');
  assert.equal(records.workoutPlans.length, 1);
  assert.equal(records.workoutPlans[0].status, 'active');
  assert.equal(archiveUpdates, 0);

  const published = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid')
    .send({
      environment: 'Home Workout',
      weeklyWorkout: {
        Monday: { exercises: [{ name: 'Air squat', sets: 3 }] },
      },
    });

  assert.equal(published.status, 201);
  const [exercise] = published.body.plan.weeklyWorkout.Monday.exercises;
  assert.equal(exercise.exerciseId, 'bodyweight-squat');
  assert.equal(exercise.imageUrl, '/exercise-images/bodyweight-squat.svg');
  assert.ok(exercise.instructions);
  assert.equal(records.workoutPlans[0].status, 'archived');

  const active = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(active.status, 200);
  assert.equal(
    active.body.plan.weeklyWorkout.Monday.exercises[0].imageUrl,
    '/exercise-images/bodyweight-squat.svg',
  );
});

test('plans cannot use a verified exercise image for the wrong training environment', () => {
  assert.throws(
    () => exerciseLibrary.enrichWorkoutPlan(null, {
      Monday: { exercises: [{ name: 'Lat Pulldown' }] },
    }, 'Home Workout'),
    (error) => error.code === 'EXERCISE_ENVIRONMENT_UNSUPPORTED'
      && error.unsupportedExercises[0].exerciseId === 'lat-pulldown',
  );
});
