import test from 'node:test';
import assert from 'node:assert/strict';
import mongo from '../src/config/mongodb.js';

function fakeDatabase(initialCollections = [], initialRegistrationIndexes = []) {
  const collections = new Set(initialCollections);
  const created = [];
  const indexes = [];
  const droppedIndexes = [];
  return {
    collections,
    created,
    indexes,
    droppedIndexes,
    listCollections() {
      return {
        toArray: async () => [...collections].map((name) => ({ name })),
      };
    },
    async createCollection(name) {
      if (collections.has(name)) {
        const error = new Error('Namespace exists.');
        error.code = 48;
        throw error;
      }
      collections.add(name);
      created.push(name);
    },
    collection(name) {
      return {
        listIndexes: () => ({
          toArray: async () => name === 'communityRegistrations'
            ? initialRegistrationIndexes
            : [],
        }),
        dropIndex: async (indexName) => {
          droppedIndexes.push(indexName);
          initialRegistrationIndexes = initialRegistrationIndexes
            .filter((index) => index.name !== indexName);
        },
        createIndex: async (keys, options) => {
          indexes.push({ name, keys, options });
          return `${name}_${Object.keys(keys).join('_')}`;
        },
      };
    },
  };
}

test('MongoDB collection initialization creates required collections idempotently', async () => {
  const database = fakeDatabase(['products']);
  await mongo.ensureCollections(database);
  await mongo.ensureCollections(database);

  assert.deepEqual(database.created, [
    'sellerProfiles',
    'communityOrganizers',
    'communityEvents',
    'communityRegistrations',
    'communityModerationLogs',
    'doctorApplications',
  ]);
  assert.deepEqual([...database.collections].sort(), [
    'communityEvents',
    'communityModerationLogs',
    'communityOrganizers',
    'communityRegistrations',
    'doctorApplications',
    'products',
    'sellerProfiles',
  ]);
});

test('MongoDB collection initialization tolerates concurrent collection creation', async () => {
  const database = fakeDatabase();
  database.createCollection = async (name) => {
    database.collections.add(name);
    const error = new Error('Namespace exists.');
    error.codeName = 'NamespaceExists';
    throw error;
  };
  await assert.doesNotReject(mongo.ensureCollections(database));
});

test('MongoDB index initialization is repeatable and creates required indexes', async () => {
  const database = fakeDatabase();
  await mongo.ensureIndexes(database);
  await assert.doesNotReject(mongo.ensureIndexes(database));

  assert.ok(database.indexes.some((index) => (
    index.name === 'sellerProfiles'
    && index.keys.firebaseUid === 1
    && index.options.unique === true
  )));
  assert.ok(database.indexes.some((index) => (
    index.name === 'products'
    && index.keys.sellerId === 1
    && index.keys.createdAt === -1
  )));
  assert.ok(database.indexes.some((index) => (
    index.name === 'products'
    && index.keys.status === 1
    && index.keys.createdAt === -1
  )));
  assert.ok(database.indexes.some((index) => (
    index.name === 'communityEvents'
    && index.keys.location === '2dsphere'
  )));
  assert.ok(database.indexes.some((index) => (
    index.name === 'communityRegistrations'
    && index.keys.eventId === 1
    && index.keys.participantProjectId === 1
    && index.keys.participantUid === 1
    && index.options.unique === true
  )));
  assert.ok(database.indexes.some((index) => (
    index.name === 'communityModerationLogs'
    && index.keys.subjectType === 1
    && index.keys.subjectId === 1
    && index.keys.reviewedAt === -1
  )));
  assert.ok(database.indexes.some((index) => (
    index.name === 'doctorApplications'
    && index.keys.firebaseProjectId === 1
    && index.keys.firebaseUid === 1
    && index.options.unique === true
  )));
  assert.ok(database.indexes.some((index) => (
    index.name === 'doctorApplications'
    && index.keys.status === 1
    && index.keys.submittedAt === 1
  )));
});

test('MongoDB replaces the legacy registration uniqueness index', async () => {
  const database = fakeDatabase([], [{
    name: 'eventId_1_participantUid_1',
    key: { eventId: 1, participantUid: 1 },
    unique: true,
  }]);

  await mongo.ensureIndexes(database);

  assert.deepEqual(database.droppedIndexes, ['eventId_1_participantUid_1']);
  assert.ok(database.indexes.some((index) => (
    index.name === 'communityRegistrations'
    && index.keys.eventId === 1
    && index.keys.participantProjectId === 1
    && index.keys.participantUid === 1
    && index.options.unique === true
  )));
});
