import 'dotenv/config';
import mongo from '../src/config/mongodb.js';
import { MongoClient, ServerApiVersion } from 'mongodb';

/**
 * Classify a raw MongoDB/Node error into a safe, actionable category.
 * Never includes credentials, passwords, or the full URI in the output.
 */
function classifyError(error) {
  const name = error?.name || 'Error';
  const code = error?.code ?? error?.codeName ?? null;
  const msg = (error?.message || '').toLowerCase();
  const errInfo = error?.errorResponse || error?.errInfo || null;

  // Authentication failure (wrong username / password)
  if (
    code === 18 || code === 'AuthenticationFailed'
    || msg.includes('authentication failed')
    || msg.includes('bad auth')
    || msg.includes('auth failed')
    || (errInfo?.ok === 0 && errInfo?.code === 18)
  ) {
    return {
      category: 'AUTHENTICATION_FAILURE',
      explanation:
        'The database rejected the credentials in MONGODB_URI. '
        + 'The username or password in the URI is wrong for this Atlas cluster. '
        + 'Fix: update MONGODB_URI in .env with the new password you set in Atlas → Database Access.',
    };
  }

  // URI parse / invalid format
  if (
    msg.includes('invalid connection string')
    || msg.includes('invalid uri')
    || msg.includes('failed to parse')
    || msg.includes('uri must')
    || name === 'MongoParseError'
  ) {
    return {
      category: 'URI_PARSE_ERROR',
      explanation:
        'The MONGODB_URI value could not be parsed as a valid MongoDB connection string. '
        + 'Common causes: missing @ separator, unencoded special characters in the password '
        + '(use percent-encoding, e.g. @ → %40, # → %23), or a malformed SRV hostname.',
    };
  }

  // DNS resolution failure (host not found)
  if (
    msg.includes('getaddrinfo')
    || msg.includes('enotfound')
    || msg.includes('dns')
    || msg.includes('failed to resolve')
    || (typeof code === 'string' && code === 'ENOTFOUND')
    || code === 'ENOTFOUND'
  ) {
    return {
      category: 'DNS_RESOLUTION_FAILURE',
      explanation:
        'The Atlas cluster hostname in MONGODB_URI could not be resolved. '
        + 'Causes: wrong cluster hostname, the cluster was deleted/renamed, '
        + 'or no internet / DNS access from this machine.',
    };
  }

  // Network timeout (Atlas reachable but not responding — likely IP access-list)
  if (
    msg.includes('timed out')
    || msg.includes('timeout')
    || msg.includes('server selection timed out')
    || msg.includes('connection timed out')
    || code === 'ETIMEDOUT'
    || code === 'ECONNREFUSED'
    || name === 'MongoServerSelectionError'
  ) {
    return {
      category: 'NETWORK_TIMEOUT_OR_IP_ACCESS_LIST_REJECTION',
      explanation:
        'The connection attempt timed out. This most commonly means your current '
        + 'IP address is not in the Atlas IP Access List. '
        + 'Fix: go to Atlas → Network Access → IP Access List and add your current IP, '
        + 'or temporarily allow access from anywhere (0.0.0.0/0) for testing.',
    };
  }

  // Explicit authorization / permission error (connected but not authorized for DB)
  if (
    code === 13 || code === 'Unauthorized'
    || msg.includes('not authorized')
    || msg.includes('unauthorized')
  ) {
    return {
      category: 'AUTHORIZATION_FAILURE',
      explanation:
        'The user authenticated successfully but is not authorized to access the '
        + '\'fitness_species\' database. '
        + 'Fix: in Atlas → Database Access, ensure the user has readWrite (or Atlas Admin) '
        + 'permissions on the fitness_species database.',
    };
  }

  // TLS / SSL errors
  if (
    msg.includes('ssl')
    || msg.includes('tls')
    || msg.includes('certificate')
    || code === 'ECONNRESET'
  ) {
    return {
      category: 'TLS_SSL_ERROR',
      explanation:
        'A TLS/SSL handshake or certificate error occurred. '
        + 'Ensure the system CA certificates are up to date and the Atlas cluster '
        + 'is using a valid certificate.',
    };
  }

  // Fallback
  return {
    category: 'UNKNOWN_CONNECTION_FAILURE',
    explanation:
      'An unexpected error occurred during connection. '
      + `Error name: ${name}. Error code: ${code ?? 'none'}. `
      + 'Check Atlas cluster status, network access, and credentials.',
  };
}

function matchesIndex(actual, expected) {
  return JSON.stringify(actual.key) === JSON.stringify(expected);
}

/**
 * Attempt a direct MongoClient connection so we can inspect the raw error
 * before it is swallowed by the sanitising catch in mongodb.js.
 */
async function probeRawConnection(uri, dbName) {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 12000,
  });
  try {
    await client.connect();
    const database = client.db(dbName);
    await database.command({ ping: 1 });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}

async function checkDatabase() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;

  // --- Environment variable checks ---
  if (!uri) {
    console.error('[MISSING_ENV] MONGODB_URI is not set. Add it to .env or the deployment environment.');
    process.exitCode = 1;
    return;
  }
  if (!dbName) {
    console.error('[MISSING_ENV] MONGODB_DB_NAME is not set. Set it to: fitness_species');
    process.exitCode = 1;
    return;
  }
  if (dbName !== 'fitness_species') {
    console.error(`[WRONG_DB_NAME] MONGODB_DB_NAME is "${dbName}" but must be "fitness_species".`);
    process.exitCode = 1;
    return;
  }

  // --- URI structural checks ---
  const startsCorrectly = uri.startsWith('mongodb+srv://') || uri.startsWith('mongodb://');
  if (!startsCorrectly) {
    console.error('[URI_FORMAT] MONGODB_URI does not start with mongodb+srv:// or mongodb://');
    process.exitCode = 1;
    return;
  }
  if (uri.includes('<') || uri.includes('>')) {
    console.error('[URI_FORMAT] MONGODB_URI contains literal angle brackets < > — replace them with actual values.');
    process.exitCode = 1;
    return;
  }
  if (/\s/.test(uri)) {
    console.error('[URI_FORMAT] MONGODB_URI contains whitespace — remove all spaces, tabs, or newlines from the value.');
    process.exitCode = 1;
    return;
  }

  console.info('[CHECK] Environment variables: OK');
  console.info('[CHECK] URI format: OK (length=' + uri.length + ', srv=' + uri.startsWith('mongodb+srv://') + ')');
  console.info('[CHECK] Database name: fitness_species ✓');
  console.info('[CONNECTING] Probing Atlas connection (timeout: 12s)…');

  // --- Raw connection probe for accurate error classification ---
  const probe = await probeRawConnection(uri, dbName);
  if (!probe.success) {
    const { category, explanation } = classifyError(probe.error);
    console.error(`\n[FAILED] Category: ${category}`);
    console.error(`[FAILED] ${explanation}`);
    console.error(`[FAILED] Raw error name: ${probe.error?.name || 'unknown'}`);
    if (probe.error?.code != null) {
      console.error(`[FAILED] Raw error code: ${probe.error.code}`);
    }
    process.exitCode = 1;
    return;
  }

  console.info('[CHECK] Atlas connection and ping: OK');

  // --- Full application-level check via existing mongo module ---
  try {
    await mongo.connectDB();
    await mongo.initializeDB();
  } catch (error) {
    console.error('[APP_INIT_FAILED]', error.message);
    process.exitCode = 1;
    return;
  }

  const database = mongo.getDb();
  const collections = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray())
      .map(({ name }) => name),
  );
  for (const name of mongo.requiredCollections) {
    if (!collections.has(name)) {
      console.error(`[MISSING_COLLECTION] Required MongoDB collection "${name}" is missing.`);
      process.exitCode = 1;
      return;
    }
  }

  for (const [collectionName, expectedIndexes] of Object.entries(mongo.requiredIndexes)) {
    const indexes = await database.collection(collectionName).listIndexes().toArray();
    for (const expectedKey of expectedIndexes) {
      const actual = indexes.find((index) => matchesIndex(index, expectedKey));
      if (!actual) {
        console.error(`[MISSING_INDEX] Required index missing from collection "${collectionName}": ${JSON.stringify(expectedKey)}`);
        process.exitCode = 1;
        return;
      }
      const expectedUnique =
        collectionName === 'users'
        || collectionName === 'sellers'
        || collectionName === 'sellerProfiles'
        || collectionName === 'waterLogs';
      if (expectedUnique && actual.unique !== true) {
        console.error(`[MISSING_UNIQUE_INDEX] Expected unique index on collection "${collectionName}": ${JSON.stringify(expectedKey)}`);
        process.exitCode = 1;
        return;
      }
    }
  }

  const [sellerProfiles, legacySellers, products] = await Promise.all([
    database.collection('sellerProfiles').countDocuments(),
    database.collection('sellers').countDocuments(),
    database.collection('products').countDocuments(),
  ]);

  console.info('\n[SUCCESS] MongoDB fully verified.');
  console.info(`[SUCCESS] Database: ${mongo.getDbName()}`);
  console.info(`[SUCCESS] Collections and indexes: ready`);
  console.info(`[SUCCESS] Records — sellerProfiles: ${sellerProfiles}, legacy sellers: ${legacySellers}, products: ${products}`);
}

try {
  await checkDatabase();
} catch (error) {
  // Unexpected uncaught error — report category only, no credentials
  const { category, explanation } = classifyError(error);
  console.error(`\n[UNCAUGHT] Category: ${category}`);
  console.error(`[UNCAUGHT] ${explanation}`);
  process.exitCode = 1;
} finally {
  try {
    await mongo.closeDB();
  } catch {
    // Ignore shutdown errors — connection may already be closed
  }
}
