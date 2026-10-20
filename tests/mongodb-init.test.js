import test from 'node:test';
import assert from 'node:assert/strict';
import mongo from '../src/config/mongodb.js';

function fakeDatabase(initialCollections = []) {
  const collections = new Set(initialCollections);
  const created = [];
  const indexes = [];
  return {
    collections,
    created,
    indexes,
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

  assert.deepEqual(database.created, ['sellerProfiles']);
  assert.deepEqual([...database.collections].sort(), ['products', 'sellerProfiles']);
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

test('MongoDB initialization creates required seller and product indexes', async () => {
  const database = fakeDatabase();
  await mongo.ensureIndexes(database);

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
});
