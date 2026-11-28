import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import exerciseLibrary from '../src/workouts/exercise-library.cjs';
import { createApp } from '../src/app.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildWorkoutProfileUpdate } = require('../src/routes/workout.routes.js');
const { evaluateWorkoutSafety } = require('../src/workouts/workout-safety.cjs');
const {
  generateGymWeeklyPlan,
  getProgramSchedule,
  getSourceInventory,
} = require('../src/workouts/gym-workout-program.cjs');

test('the exact 42-entry six-day Gym source program retains canonical exercise IDs', () => {
  const inventory = getSourceInventory();
  const schedule = getProgramSchedule();
  assert.equal(inventory.length, 42);
  assert.deepEqual(schedule.map((day) => day.exerciseCount), [7, 7, 7, 7, 7, 7, 0]);
  assert.deepEqual(schedule.map((day) => day.focus), [
    'Chest + Triceps',
    'Back + Biceps',
    'Legs + Shoulders',
    'Chest + Triceps — Different variations',
    'Back + Biceps — Different variations',
    'Legs + Shoulders — Different variations',
    'Rest or Active Recovery',
  ]);
  assert.equal(new Set(inventory.map((exercise) => exercise.id)).size, 42);
  assert.equal(inventory.every((exercise) => /^[a-z0-9-]+$/.test(exercise.id)), true);
});

test('exercise availability is independent of optional image availability', () => {
  const catalog = exerciseLibrary.getExerciseCatalog('Gym');
  assert.equal(catalog.length, 42);
  assert.equal(exerciseLibrary.getExerciseAsset('bodyweight-squat'), null);
  const availability = exerciseLibrary.getExerciseAvailability();
  assert.equal(availability.sourceCount, 42);
  assert.equal(availability.availableCount, 42);
  assert.ok(availability.imageFilesPresent > 0);
  assert.ok(availability.imageFilesPresent < 42);
  assert.equal(availability.unavailableExercises.length, 0);
  assert.equal(exerciseLibrary.getExerciseCatalog('Home Workout').length, 0);
});

test('all 42 source entries have complete metadata and only available image URLs', () => {
  const inventory = getSourceInventory();
  const records = exerciseLibrary.getExerciseCatalog('Gym');
  assert.equal(records.length, 42);
  assert.deepEqual(records.map(({ id }) => id), inventory.map(({ id }) => id));
  assert.equal(records.every((record, index) => (
    record.name === inventory[index].name
    && record.day === inventory[index].day
    && record.dayIndex === inventory[index].dayIndex
    && record.targetMuscles.length > 0
    && Array.isArray(record.secondaryMuscles)
    && record.equipmentRequired.length > 0
    && record.executionSteps.length > 0
    && record.breathing.length > 0
    && record.imageAvailable === Boolean(record.imageUrl)
    && !Object.hasOwn(record, 'imageLicense')
    && !Object.hasOwn(record, 'imageSource')
  )), true);
});

test('beginner programming follows the Gym split on three recovery-spaced days', () => {
  const catalog = exerciseLibrary.getExerciseCatalog('Gym').map(({ imageUrl, ...exercise }) => exercise);
  const profile = {
    fitnessGoal: 'Recomposition',
    trainingExperience: 'Beginner',
    trainingDays: 3,
    availableEquipment: ['Suitable gym equipment available'],
    energyLevel: 'Medium',
    healthConsent: true,
    healthConditions: ['None'],
    healthConditionStatus: 'Stable',
    healthConditionRestrictions: '',
    healthConditionClearedToExercise: 'Not applicable',
    injuries: ['None'],
  };
  const generated = generateGymWeeklyPlan(profile, [], catalog);
  assert.ok(generated.plan);
  const monday = generated.plan.sessions[0];
  assert.equal(monday.exercises.length, 4);
  assert.equal(monday.exercises.every((exercise) => Number(exercise.sets) <= 2), true);
  assert.equal(monday.exercises.every((exercise) => exercise.weight === ''), true);
  assert.equal(monday.exercises.some((exercise) => /weighted triceps dips/i.test(exercise.name)), false);
  assert.equal(generated.plan.sessions[1].exercises.length, 0);
  assert.equal(generated.plan.sessions[2].exercises.length, 4);
  assert.equal(generated.plan.sessions[3].exercises.length, 0);
  assert.equal(generated.plan.sessions[4].exercises.length, 4);
  assert.equal(generated.plan.sessions[5].exercises.length, 0);
  assert.deepEqual(
    generated.plan.sessions.filter((session) => session.exercises.length > 0).map((session) => session.split),
    ['Chest + Triceps', 'Legs + Shoulders', 'Back + Biceps — Different variations'],
  );
  assert.equal(generated.plan.sessions.flatMap((session) => session.exercises).length, 12);
  const historyBased = generateGymWeeklyPlan(profile, [{
    exercises: [{ exerciseName: 'Barbell Bench Press', weight: '40 kg' }],
  }], catalog);
  assert.equal(historyBased.plan.sessions[0].exercises[0].weight, '40 kg');
});

test('one- and two-day schedules use balanced full-body sessions instead of dropping muscle groups', () => {
  const catalog = exerciseLibrary.getExerciseCatalog('Gym');
  const profile = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Recomposition',
    trainingExperience: 'Beginner',
    availableEquipment: ['Suitable gym equipment available'],
    energyLevel: 'Medium',
    healthConditions: ['None'],
    injuries: ['None'],
  };
  const oneDay = generateGymWeeklyPlan({ ...profile, trainingDays: 1 }, [], catalog).plan;
  assert.equal(oneDay.sessions[0].split, 'Full Body A');
  assert.equal(oneDay.sessions[0].exercises.length, 4);
  assert.equal(oneDay.sessions.flatMap((session) => session.exercises).length, 4);

  const twoDays = generateGymWeeklyPlan({ ...profile, trainingDays: 2 }, [], catalog).plan;
  assert.deepEqual(
    twoDays.sessions.filter((session) => session.exercises.length > 0).map((session) => session.split),
    ['Full Body A', 'Full Body B'],
  );
  assert.equal(twoDays.sessions[0].exercises.length, 4);
  assert.equal(twoDays.sessions[3].exercises.length, 4);
});

test('condition-aware screening combines restrictions without blocking stable conditions', () => {
  const catalog = exerciseLibrary.getExerciseCatalog('Gym');
  const base = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Recomposition',
    trainingExperience: 'Intermediate',
    trainingDays: 6,
    availableEquipment: ['Suitable gym equipment available'],
    energyLevel: 'Medium',
  };
  const cases = [
    { healthConditions: ['Obesity'], injuries: ['None'] },
    { healthConditions: ['Type 2 Diabetes'], healthConditionStatus: 'Stable', injuries: ['None'] },
    { healthConditions: ['High Blood Pressure'], healthConditionStatus: 'Stable', injuries: ['None'] },
    { healthConditions: ['PCOS'], injuries: ['None'] },
    { healthConditions: ['None'], injuries: ['Shoulder Injury'], injuryStatus: 'Historical' },
  ];

  for (const health of cases) {
    const result = generateGymWeeklyPlan({ ...base, trainingDays: 3, ...health }, [], catalog);
    assert.ok(result.plan, JSON.stringify(health));
    assert.ok(result.plan.sessions.flatMap((session) => session.exercises).length > 0);
  }

  const kneeProfile = {
    ...base,
    healthConditions: ['Knee Pain'],
    healthConditionStatus: 'Stable',
    healthConditionRestrictions: 'Avoid deep knee flexion',
    injuries: ['None'],
  };
  const kneePlan = generateGymWeeklyPlan(kneeProfile, [], catalog).plan;
  const kneeExercises = kneePlan.sessions.flatMap((session) => session.exercises);
  assert.ok(kneeExercises.length > 0);
  assert.ok(kneePlan.sessions.filter((session) => session.exercises.length > 0).length <= 3);
  assert.equal(kneeExercises.some((exercise) => /squat|lunge|leg press|leg extension/i.test(exercise.name)), false);

  const backProfile = {
    ...base,
    healthConditions: ['None'],
    injuries: ['Low Back Pain'],
    injuryStatus: 'Current',
    injuryRestrictions: 'Avoid deadlift and bent-over rowing',
  };
  const backPlan = generateGymWeeklyPlan(backProfile, [], catalog).plan;
  const backExercises = backPlan.sessions.flatMap((session) => session.exercises);
  assert.ok(backExercises.length > 0);
  assert.ok(backPlan.sessions.filter((session) => session.exercises.length > 0).length <= 3);
  assert.equal(backExercises.some((exercise) => /deadlift|bent-over row|t-bar row|one-arm dumbbell row/i.test(exercise.name)), false);

  const combinedPlan = generateGymWeeklyPlan({
    ...kneeProfile,
    healthConditions: ['Knee Pain', 'Shoulder Injury'],
    healthConditionRestrictions: 'Avoid deep knee flexion and overhead pressing',
  }, [], catalog).plan;
  const combinedExercises = combinedPlan.sessions.flatMap((session) => session.exercises);
  assert.ok(combinedExercises.length > 0);
  assert.equal(combinedExercises.some((exercise) => /squat|lunge|leg press|leg extension|press|fly|raise|dip/i.test(exercise.name)), false);

  const conditionAndInjuryPlan = generateGymWeeklyPlan({
    ...base,
    healthConditions: ['Type 2 Diabetes'],
    healthConditionStatus: 'Stable',
    injuries: ['Low Back Pain'],
    injuryStatus: 'Current',
    injuryRestrictions: 'Avoid deadlift and bent-over rowing',
  }, [], catalog).plan;
  assert.ok(conditionAndInjuryPlan.sessions.flatMap((session) => session.exercises).length > 0);
  assert.equal(conditionAndInjuryPlan.sessions.flatMap((session) => session.exercises)
    .some((exercise) => /deadlift|bent-over row|t-bar row|one-arm dumbbell row/i.test(exercise.name)), false);
});

test('screening distinguishes missing information from conditions requiring clearance', () => {
  const missingInjuryInfo = evaluateWorkoutSafety({
    healthConditions: ['None'],
    injuries: ['Knee Pain'],
  });
  assert.equal(missingInjuryInfo.state, 'screening_required');
  assert.equal(missingInjuryInfo.code, 'INJURY_SCREENING_REQUIRED');

  const recentSurgery = evaluateWorkoutSafety({
    healthConditions: ['Recent Surgery'],
    healthConditionStatus: 'Stable',
    injuries: ['None'],
  });
  assert.equal(recentSurgery.state, 'clearance_required');
  assert.equal(recentSurgery.code, 'PROFESSIONAL_CLEARANCE_REQUIRED');

  const clearedRehab = evaluateWorkoutSafety({
    healthConditions: ['None'],
    injuries: ['ACL Rehabilitation'],
    injuryStatus: 'Current',
    injuryRestrictions: 'Avoid knee flexion beyond prescribed limit',
    injuryClearedToExercise: 'Professional clearance confirmed',
  });
  assert.equal(clearedRehab.state, 'ready');
  assert.ok(clearedRehab.restrictions.includes('knee'));

  const rehabilitationPlan = generateGymWeeklyPlan({
    trainingExperience: 'Beginner',
    trainingDays: 6,
    energyLevel: 'Medium',
    availableEquipment: ['Suitable gym equipment available'],
    healthConditions: ['None'],
    injuries: ['ACL Rehabilitation'],
    injuryStatus: 'Active Rehabilitation',
    injuryRestrictions: 'Avoid knee flexion beyond the prescribed limit',
    injuryClearedToExercise: 'Professional clearance confirmed',
  }).plan;
  assert.ok(rehabilitationPlan.sessions.flatMap((session) => session.exercises).length > 0);
  assert.equal(rehabilitationPlan.sessions.flatMap((session) => session.exercises)
    .some((exercise) => /squat|lunge|leg press|leg extension/i.test(exercise.name)), false);
});

test('low energy reduces session frequency and missing images remain non-blocking', () => {
  const catalogWithoutImages = exerciseLibrary.getExerciseCatalog('Gym')
    .map(({ imageUrl, ...exercise }) => exercise);
  const lowEnergyPlan = generateGymWeeklyPlan({
    fitnessGoal: 'Recomposition',
    trainingExperience: 'Beginner',
    trainingDays: 3,
    availableEquipment: ['Suitable gym equipment available'],
    energyLevel: 'Low',
    healthConditions: ['None'],
    injuries: ['None'],
  }, [], catalogWithoutImages).plan;
  const activeSessions = lowEnergyPlan.sessions.filter((session) => session.exercises.length > 0);
  assert.equal(activeSessions.length, 2);
  assert.equal(activeSessions.every((session) => session.exercises.length <= 3), true);
  assert.ok(activeSessions.flatMap((session) => session.exercises).every((exercise) => exercise.weight === ''));
  assert.ok(activeSessions.flatMap((session) => session.exercises).every((exercise) => !exercise.imageUrl));
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

test('Gym API returns eligible exercises with images optional and no fabricated licensing data', async () => {
  const gymProfile = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Recomposition',
    trainingExperience: 'Beginner',
    trainingDays: 3,
    availableEquipment: ['Suitable gym equipment available'],
    energyLevel: 'Medium',
    healthConsent: true,
    healthConditions: ['None'],
    injuries: ['None'],
  };
  const database = {
    workoutProfiles: [{ ...gymProfile, userId: 'empty-workout-test-user' }],
    workoutPlans: [],
    workoutSessions: [],
  };
  const db = {
    collection(name) {
      const items = database[name] || (database[name] = []);
      return {
        async findOne(query) {
          return items.find((item) => Object.entries(query).every(([key, value]) => item[key] === value)) || null;
        },
        find(query) {
          let found = items.filter((item) => Object.entries(query).every(([key, value]) => item[key] === value));
          const cursor = {
            sort() { return cursor; },
            limit(limit) { found = found.slice(0, limit); return cursor; },
            async toArray() { return found; },
          };
          return cursor;
        },
        async insertOne(document) {
          const insertedId = { toString: () => `test-plan-${items.length + 1}` };
          items.push({ ...document, _id: insertedId });
          return { insertedId };
        },
        async updateOne(query, update) {
          const record = items.find((item) => Object.entries(query).every(([key, value]) => item[key] === value));
          if (record) Object.assign(record, update.$set);
          return { matchedCount: record ? 1 : 0 };
        },
      };
    },
  };
  const app = createApp({
    getDb: () => db,
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
  assert.equal(catalog.body.count, 42);
  assert.equal(catalog.body.sourceCount, 42);
  assert.equal(catalog.body.available, true);
  assert.ok(catalog.body.imageFilesPresent > 0);
  assert.equal(catalog.body.unavailableExercises.length, 0);
  assert.ok(catalog.body.exercises.some((exercise) => !exercise.imageAvailable));
  assert.ok(catalog.body.exercises.every((exercise) => !Object.hasOwn(exercise, 'imageLicense')));

  const generated = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid');
  assert.equal(generated.status, 200);
  assert.equal(generated.body.success, true);
  assert.equal(generated.body.plan.environment, 'Gym');
  const assigned = generated.body.plan.weeklyWorkout.sessions.flatMap((session) => session.exercises);
  assert.equal(assigned.length, 12);
  assert.deepEqual(
    generated.body.plan.weeklyWorkout.sessions.map((session) => session.exercises.length),
    [4, 0, 4, 0, 4, 0, 0],
  );
  assert.ok(assigned.every((exercise) => exercise.exerciseId && exercise.name));
  assert.ok(assigned.every((exercise) => exercise.targetMuscles.length > 0));
  assert.ok(assigned.every((exercise) => exercise.equipmentRequired.length > 0));
  assert.ok(assigned.every((exercise) => exercise.executionSteps.length > 0));
  assert.ok(assigned.every((exercise) => exercise.safetyNotes));
  assert.ok(assigned.every((exercise) => exercise.sets === '2' && exercise.reps === '8-12'));
  assert.ok(assigned.some((exercise) => !exercise.imageUrl));
  assert.ok(database.workoutPlans[0]);
  assert.equal(database.workoutPlans[0].weeklyWorkout.sessions.flatMap((session) => session.exercises).length, 12);

  database.workoutProfiles[0].healthConditions = ['Type 2 Diabetes'];
  database.workoutProfiles[0].healthConditionStatus = 'Stable';
  const diabeticWorkout = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid');
  assert.equal(diabeticWorkout.status, 200);
  assert.equal(diabeticWorkout.body.success, true);
  assert.equal(diabeticWorkout.body.plan.daysPerWeek, 3);
  assert.ok(diabeticWorkout.body.plan.weeklyWorkout.sessions.flatMap((session) => session.exercises).length > 0);
  assert.ok(
    diabeticWorkout.body.plan.weeklyWorkout.sessions
      .flatMap((session) => session.exercises)
      .every((exercise) => exercise.safetyNotes.includes("Follow your clinician's guidance")),
  );
  assert.equal(database.workoutPlans[0].preferencesSnapshot.healthConditionStatus, 'Stable');

  database.workoutProfiles[0].healthConditions = ['None'];
  database.workoutProfiles[0].healthConditionStatus = '';
  database.workoutProfiles[0].injuries = ['Knee Pain'];
  database.workoutProfiles[0].injuryStatus = 'Current';
  database.workoutProfiles[0].injuryRestrictions = 'Avoid deep knee flexion';
  const restrictedInjuryWorkout = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid');
  assert.equal(restrictedInjuryWorkout.status, 200);
  assert.equal(restrictedInjuryWorkout.body.success, true);
  const injuryExercises = restrictedInjuryWorkout.body.plan.weeklyWorkout.sessions
    .flatMap((session) => session.exercises);
  assert.ok(injuryExercises.length > 0);
  assert.equal(injuryExercises.some((exercise) => /squat|lunge|leg press|leg extension/i.test(exercise.name)), false);
  assert.equal(database.workoutPlans[0].preferencesSnapshot.injuryRestrictions, 'Avoid deep knee flexion');

  const homeCatalog = await request(app)
    .get('/api/workouts/exercises')
    .query({ environment: 'Home Workout' })
    .set('Authorization', 'Bearer valid');
  assert.equal(homeCatalog.status, 200);
  assert.equal(homeCatalog.body.sourceCount, 0);

});

test('opening Workouts creates and persists a plan when one does not exist', async () => {
  const profile = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Recomposition',
    trainingExperience: 'Beginner',
    trainingDays: 3,
    availableEquipment: ['Suitable gym equipment available'],
    energyLevel: 'Medium',
    healthConsent: true,
    healthConditions: ['None'],
    injuries: ['None'],
  };
  let savedPlan = null;
  const db = {
    collection(name) {
      return {
        async findOne(query) {
          if (name === 'workoutProfiles') return profile;
          return savedPlan && Object.entries(query).every(([key, value]) => savedPlan[key] === value)
            ? savedPlan
            : null;
        },
        find() {
          return {
            sort() { return this; },
            limit() { return this; },
            async toArray() { return []; },
          };
        },
        async insertOne(document) {
          savedPlan = { ...document, _id: { toString: () => 'assigned-plan-1' } };
          return { insertedId: savedPlan._id };
        },
        async updateOne(query, update) {
          if (savedPlan) Object.assign(savedPlan, update.$set);
          return { matchedCount: savedPlan ? 1 : 0 };
        },
      };
    },
  };
  const app = createApp({
    getDb: () => db,
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
  assert.equal(stalePlan.body.success, true);
  assert.equal(stalePlan.body.plan.id, 'assigned-plan-1');
  assert.ok(stalePlan.body.plan.weeklyWorkout.sessions.flatMap((session) => session.exercises).length > 0);
  assert.ok(savedPlan);
  const secondOpen = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(secondOpen.status, 200);
  assert.equal(secondOpen.body.plan.version, 1);

  profile.injuries = ['No injuries'];
  const noInjurySelected = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(noInjurySelected.status, 200);

  profile.injuries = ['Shoulder injury'];
  const restrictedPlan = await request(app)
    .get('/api/workouts/active')
    .set('Authorization', 'Bearer valid');
  assert.equal(restrictedPlan.status, 200);
  assert.equal(restrictedPlan.body.success, false);
  assert.equal(restrictedPlan.body.code, 'INJURY_SCREENING_REQUIRED');
  assert.equal(restrictedPlan.body.safetyStatus, 'screening_required');
  assert.ok(restrictedPlan.body.requiredScreening.includes('injuryStatus'));

  profile.injuries = ['None'];
  profile.healthConditions = ['Recent Surgery'];
  profile.healthConditionStatus = 'Stable';
  const clearanceRequired = await request(app)
    .post('/api/workouts/generate')
    .set('Authorization', 'Bearer valid');
  assert.equal(clearanceRequired.status, 409);
  assert.equal(clearanceRequired.body.success, false);
  assert.equal(clearanceRequired.body.code, 'PROFESSIONAL_CLEARANCE_REQUIRED');
  assert.equal(clearanceRequired.body.plan, undefined);
  assert.ok(clearanceRequired.body.requiredScreening.includes('healthConditionClearedToExercise'));
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
      healthConditionStatus: 'Stable',
      healthConditionClearedToExercise: 'Not applicable',
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
  assert.equal(response.body.profile.healthConditionStatus, 'Stable');
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

test('assigned exercises include optional media without manufacturing licensing fields', () => {
  const catalog = exerciseLibrary.getExerciseCatalog('Gym');
  const profile = {
    trainingEnvironment: 'Gym',
    fitnessGoal: 'Recomposition',
    trainingExperience: 'Beginner',
    trainingDays: 3,
    healthConditions: ['None'],
    injuries: ['None'],
    energyLevel: 'Medium',
    availableEquipment: ['Suitable gym equipment available'],
  };
  const result = generateGymWeeklyPlan(profile, [], catalog);
  const assigned = result.plan.sessions.flatMap((session) => session.exercises);
  assert.ok(assigned.length > 0);
  assert.ok(assigned.every((exercise) => !Object.hasOwn(exercise, 'imageLicense')));
  assert.ok(assigned.every((exercise) => !Object.hasOwn(exercise, 'assetLicense')));
  assert.ok(assigned.some((exercise) => !exercise.imageUrl));
});
