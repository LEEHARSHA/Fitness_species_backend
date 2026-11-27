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
    // Validate that $set and $setOnInsert do not have conflicting operator paths
    if (update.$set && update.$setOnInsert) {
      const setKeys = new Set(Object.keys(update.$set));
      const setOnInsertKeys = new Set(Object.keys(update.$setOnInsert));
      for (const key of setOnInsertKeys) {
        if (setKeys.has(key)) {
          const err = new Error(`Updating the path '${key}' would create a conflict at '${key}'`);
          err.code = 40;
          err.codeName = 'ConflictingUpdateOperators';
          throw err;
        }
      }
    }

    let record = this.items().find((item) => matches(item, query));
    if (record) {
      if (update.$set) {
        Object.assign(record, clone(update.$set));
      }
      return { matchedCount: 1, upsertedCount: 0 };
    }
    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };
    record = { ...clone(query), ...clone(update.$setOnInsert), ...clone(update.$set), _id: new ObjectId() };
    this.items().push(record);
    return { matchedCount: 0, upsertedCount: 1 };
  }

  async findOne(query) {
    const record = this.items().find((item) => matches(item, query));
    return record ? clone(record) : null;
  }
}

const claims = {
  primary: {
    uid: 'test-user-1',
    aud: primaryProject,
    iss: `https://securetoken.google.com/${primaryProject}`,
  },
  secondary: {
    uid: 'test-user-1',
    aud: secondaryProject,
    iss: `https://securetoken.google.com/${secondaryProject}`,
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
    patch: (path) => request(app).patch(path).set('Authorization', `Bearer ${token}`),
  };
}

beforeEach(() => {
  records = {};
});

test('PATCH /api/workouts/profile saves profile successfully without MongoDB error 40', async () => {
  const app = makeApp();
  const reproductionPayload = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Recomposition',
    healthConditions: ['None'],
    injuries: ['None'],
    energyLevel: 'Medium',
    onboardingVersion: 1,
    workoutProfileCompleted: true,
  };

  const response = await authorized(app).patch('/api/workouts/profile').send(reproductionPayload);
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.profile.trainingEnvironment, 'Gym');
  assert.equal(response.body.profile.fitnessGoal, 'Recomposition');
  assert.equal(response.body.profile.energyLevel, 'Medium');
  assert.equal(response.body.profile.workoutProfileCompleted, true);
});

test('PATCH /api/workouts/profile normalizes energy and environment, and updates existing profile idempotently', async () => {
  const app = makeApp();

  const firstPayload = {
    trainingEnvironment: 'Home Workouts',
    fitnessGoal: 'Bulking',
    healthConditions: ['None'],
    injuries: ['None'],
    energyLevel: 'Medium Energy',
    onboardingVersion: 1,
  };

  const firstResponse = await authorized(app).patch('/api/workouts/profile').send(firstPayload);
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.body.profile.trainingEnvironment, 'Home Workout');
  assert.equal(firstResponse.body.profile.energyLevel, 'Medium');

  const updatePayload = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Cutting',
    energyLevel: 'High Energy',
  };

  const secondResponse = await authorized(app).patch('/api/workouts/profile').send(updatePayload);
  assert.equal(secondResponse.status, 200);
  assert.equal(secondResponse.body.profile.trainingEnvironment, 'Gym');
  assert.equal(secondResponse.body.profile.fitnessGoal, 'Cutting');
  assert.equal(secondResponse.body.profile.energyLevel, 'High');
});
