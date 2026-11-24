import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';

const primaryProject = 'sellerportal-2786c';
const secondaryProject = 'project-fitness-species';
let records;

function clone(value) {
  if (value instanceof ObjectId) return new ObjectId(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function matches(document, query) {
  return Object.entries(query).every(([key, value]) => document[key] === value);
}

class MemoryCollection {
  constructor(name) {
    this.name = name;
    records[name] ||= [];
  }

  items() {
    return records[this.name];
  }

  async updateOne(query, update, options = {}) {
    let record = this.items().find((item) => matches(item, query));
    if (record) return { matchedCount: 1, upsertedCount: 0 };
    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };
    record = { ...clone(query), ...clone(update.$setOnInsert), _id: new ObjectId() };
    this.items().push(record);
    return { matchedCount: 0, upsertedCount: 1 };
  }

  async findOne(query) {
    const record = this.items().find((item) => matches(item, query));
    return record ? clone(record) : null;
  }

  find(query) {
    let results = this.items().filter((item) => matches(item, query));
    const cursor = {
      sort(specification) {
        results = [...results].sort((left, right) => (
          right.completedAt.getTime() - left.completedAt.getTime()
        ));
        return cursor;
      },
      limit(count) {
        results = results.slice(0, count);
        return cursor;
      },
      async toArray() {
        return clone(results);
      },
    };
    return cursor;
  }
}

const claims = {
  primary: {
    uid: 'shared-user',
    aud: primaryProject,
    iss: `https://securetoken.google.com/${primaryProject}`,
  },
  secondary: {
    uid: 'shared-user',
    aud: secondaryProject,
    iss: `https://securetoken.google.com/${secondaryProject}`,
  },
  other: {
    uid: 'other-user',
    aud: primaryProject,
    iss: `https://securetoken.google.com/${primaryProject}`,
  },
};

function makeApp() {
  const db = { collection: (name) => new MemoryCollection(name) };
  return createApp({
    getDb: () => db,
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => claims[token],
    primaryFirebaseProjectId: primaryProject,
    supportedFirebaseProjectIds: [primaryProject, secondaryProject],
  });
}

function authorized(app, token = 'primary') {
  return {
    get: (path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path) => request(app).post(path).set('Authorization', `Bearer ${token}`),
  };
}

function validSession(sessionId = 'session-1') {
  const completedAtTimestamp = Date.now();
  return {
    sessionId,
    workoutName: 'Strength A',
    split: 'Upper body',
    date: new Date(completedAtTimestamp).toISOString().slice(0, 10),
    startedAtTimestamp: completedAtTimestamp - 30 * 60 * 1000,
    completedAtTimestamp,
    durationMinutes: 30,
    caloriesBurned: 160,
    completedExerciseCount: 1,
    totalExerciseCount: 1,
    exercises: [{
      exerciseName: 'Push-up',
      targetSets: 3,
      completedSets: 3,
      reps: '10',
      weight: 'BW',
      rest: '60s',
    }],
  };
}

beforeEach(() => {
  records = {};
});

test('workout sessions require authentication and every planned set', async () => {
  const app = makeApp();
  const unauthenticated = await request(app).post('/api/workouts/sessions').send(validSession());
  assert.equal(unauthenticated.status, 401);

  const incomplete = validSession();
  incomplete.exercises[0].completedSets = 2;
  const response = await authorized(app).post('/api/workouts/sessions').send(incomplete);
  assert.equal(response.status, 400);
  assert.equal(records.workoutSessions, undefined);

  const invalidDate = validSession('session-invalid-date');
  invalidDate.date = '2026-02-31';
  const invalidDateResponse = await authorized(app).post('/api/workouts/sessions').send(invalidDate);
  assert.equal(invalidDateResponse.status, 400);
});

test('completed workouts are idempotent and isolated by Firebase project and user', async () => {
  const app = makeApp();
  const session = validSession();
  const first = await authorized(app).post('/api/workouts/sessions').send(session);
  const duplicate = await authorized(app).post('/api/workouts/sessions').send(session);
  assert.equal(first.status, 201);
  assert.equal(first.body.created, true);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.created, false);

  await authorized(app, 'secondary').post('/api/workouts/sessions').send(session);
  await authorized(app, 'other').post('/api/workouts/sessions').send(validSession('session-2'));
  assert.equal(records.workoutSessions.length, 3);

  const primaryHistory = await authorized(app).get('/api/workouts/sessions');
  assert.equal(primaryHistory.body.count, 1);
  assert.equal(primaryHistory.body.sessions[0].sessionId, session.sessionId);
  assert.equal((await authorized(app, 'secondary').get('/api/workouts/sessions')).body.count, 1);
  assert.equal((await authorized(app, 'other').get('/api/workouts/sessions')).body.count, 1);
});

test('workout session history validates its requested limit', async () => {
  const app = makeApp();
  const response = await authorized(app).get('/api/workouts/sessions').query({ limit: 101 });
  assert.equal(response.status, 400);
});
