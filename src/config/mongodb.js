const { MongoClient, ServerApiVersion } = require('mongodb');

let client;
let db;
let connectedDbName;
let connectionState = 'disconnected';
let connectionPromise;

const requiredCollections = ['sellerProfiles', 'products'];
const requiredIndexes = {
  users: [
    { firebaseUid: 1 },
  ],
  sellers: [
    { firebaseUid: 1 },
  ],
  sellerProfiles: [
    { firebaseUid: 1 },
  ],
  products: [
    { sellerId: 1, status: 1, createdAt: -1 },
    { sellerUid: 1, status: 1, createdAt: -1 },
    { sellerId: 1, createdAt: -1 },
    { status: 1, createdAt: -1 },
    { status: 1, category: 1, createdAt: -1 },
    { sku: 1 },
  ],
  workoutPlans: [
    { userId: 1, status: 1 },
    { userId: 1, version: -1 },
  ],
  dietPlans: [
    { userId: 1, status: 1 },
    { userId: 1, version: -1 },
  ],
  progress: [
    { userId: 1, date: -1 },
  ],
  bmiHistory: [
    { userId: 1, calculatedAt: -1 },
  ],
  waterLogs: [
    { userId: 1, date: 1 },
  ],
};

async function ensureCollections(database, collectionNames = requiredCollections) {
  const existing = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray())
      .map(({ name }) => name),
  );
  for (const name of collectionNames) {
    if (existing.has(name)) continue;
    try {
      await database.createCollection(name);
      existing.add(name);
    } catch (error) {
      if (error.code !== 48 && error.codeName !== 'NamespaceExists') throw error;
    }
  }
}

async function ensureIndexes(database) {
  const indexOperations = Object.entries(requiredIndexes).flatMap(([collectionName, indexes]) => (
    indexes.map((keys) => database.collection(collectionName).createIndex(keys, {
      ...(collectionName === 'users' || collectionName === 'sellers'
        || (collectionName === 'sellerProfiles' && keys.firebaseUid)
        || (collectionName === 'waterLogs' && keys.userId && keys.date)
        ? { unique: true }
        : {}),
    }))
  ));
  await Promise.all(indexOperations);
}

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured.');
  }
  if (!dbName) {
    throw new Error('MONGODB_DB_NAME is not configured.');
  }
  if (dbName !== 'fitness_species') {
    throw new Error('MONGODB_DB_NAME must be set to fitness_species.');
  }
  return { uri, dbName };
}

async function connectDB() {
  if (connectionState === 'connected' && db) return db;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    let config;
    try {
      config = getMongoConfig();
    } catch (error) {
      connectionState = 'disconnected';
      throw error;
    }

    try {
      if (!client) {
        client = new MongoClient(config.uri, {
          serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
          },
          serverSelectionTimeoutMS: 10000,
        });
        client.on('close', () => {
          connectionState = 'disconnected';
        });
        client.on('topologyClosed', () => {
          connectionState = 'disconnected';
        });
        client.on('serverHeartbeatFailed', () => {
          connectionState = 'disconnected';
        });
        client.on('serverHeartbeatSucceeded', () => {
          if (db) connectionState = 'connected';
        });
      }

      await client.connect();
      const database = client.db(config.dbName);
      await database.command({ ping: 1 });
      db = database;
      connectedDbName = config.dbName;
      connectionState = 'connected';
      return db;
    } catch (error) {
      connectionState = 'disconnected';
      const failedClient = client;
      client = undefined;
      db = undefined;
      connectedDbName = undefined;
      if (failedClient) {
        try {
          await failedClient.close();
        } catch {
          // Preserve the sanitized connection error.
        }
      }
      throw new Error('MongoDB connection or ping failed. Check the URI, Atlas network access, and database credentials.');
    }
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = undefined;
  }
}

function getDb() {
  if (!db || connectionState !== 'connected') {
    throw new Error('MongoDB is not connected.');
  }
  return db;
}

async function checkDB() {
  if (!db || !client) {
    throw new Error('MongoDB is not connected.');
  }
  try {
    await db.command({ ping: 1 });
    connectionState = 'connected';
  } catch {
    connectionState = 'disconnected';
    throw new Error('MongoDB health check failed.');
  }
}

async function initializeDB() {
  if (!db || connectionState !== 'connected') {
    throw new Error('MongoDB is not connected.');
  }
  try {
    await ensureCollections(db);
    await ensureIndexes(db);
  } catch {
    throw new Error('MongoDB index initialization failed. Check database permissions and existing index definitions.');
  }
}

function getDbStatus() {
  return connectionState;
}

function getDbName() {
  return connectedDbName || process.env.MONGODB_DB_NAME || null;
}

async function closeDB() {
  const currentClient = client;
  client = undefined;
  db = undefined;
  connectedDbName = undefined;
  connectionState = 'disconnected';
  connectionPromise = undefined;
  if (currentClient) await currentClient.close();
}

module.exports = {
  connectDB,
  checkDB,
  initializeDB,
  getDb,
  getDbStatus,
  getDbName,
  ensureCollections,
  ensureIndexes,
  requiredCollections,
  requiredIndexes,
  closeDB,
};
