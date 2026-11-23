const fs = require('node:fs');
const path = require('node:path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const PRIMARY_PROJECT_ID = 'sellerportal-2786c';
const SECONDARY_PROJECT_ID = 'project-fitness-species';
const TRUSTED_PROJECT_IDS = new Set([PRIMARY_PROJECT_ID, SECONDARY_PROJECT_ID]);

function readServiceAccount(jsonEnv, credentialsPathEnv) {
  const json = process.env[jsonEnv];
  const credentialsPath = credentialsPathEnv ? process.env[credentialsPathEnv] : undefined;
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      throw new Error(`${jsonEnv} must contain valid JSON.`);
    }
  }

  if (credentialsPath) {
    const resolvedPath = path.resolve(process.cwd(), credentialsPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`The file configured by ${credentialsPathEnv} does not exist.`);
    }
    try {
      return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch {
      throw new Error(`The file configured by ${credentialsPathEnv} is not valid JSON.`);
    }
  }

  return null;
}

function validateServiceAccount(serviceAccount, projectId) {
  if (serviceAccount && (
    serviceAccount.type !== 'service_account'
    || !serviceAccount.project_id
    || !serviceAccount.private_key
    || !serviceAccount.client_email
  )) {
    throw new Error('Firebase service-account credentials are missing required fields.');
  }
  if (serviceAccount && serviceAccount.project_id !== projectId) {
    throw new Error(`Firebase service-account project does not match ${projectId}.`);
  }
}

function initializeFirebaseApp(projectId, appName, serviceAccount) {
  validateServiceAccount(serviceAccount, projectId);
  const existing = getApps().find((app) => app.name === appName);
  if (existing) {
    if (existing.options.projectId !== projectId) {
      throw new Error(`The initialized Firebase app does not match ${projectId}.`);
    }
    return existing;
  }

  if (!serviceAccount) {
    throw new Error('Firebase credentials are required for every configured Firebase project.');
  }

  return initializeApp(
    { credential: cert(serviceAccount), projectId },
    appName === '[DEFAULT]' ? undefined : appName,
  );
}

function getPrimaryProjectId() {
  const projectId = process.env.FIREBASE_PROJECT_ID || PRIMARY_PROJECT_ID;
  if (projectId !== PRIMARY_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID must identify the trusted primary Firebase project.');
  }
  return projectId;
}

function hasSecondaryCredentials() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_PROJECT_FITNESS_SPECIES
    || process.env.GOOGLE_APPLICATION_CREDENTIALS_PROJECT_FITNESS_SPECIES,
  );
}

function getConfiguredFirebaseProjectIds() {
  const projectIds = [getPrimaryProjectId()];
  if (hasSecondaryCredentials() && !projectIds.includes(SECONDARY_PROJECT_ID)) {
    projectIds.push(SECONDARY_PROJECT_ID);
  }
  return projectIds;
}

function getUnverifiedProjectId(idToken) {
  const segments = typeof idToken === 'string' ? idToken.split('.') : [];
  if (segments.length !== 3) {
    throw new Error('Firebase ID token is malformed.');
  }

  try {
    const claims = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
    if (typeof claims.aud !== 'string' || !TRUSTED_PROJECT_IDS.has(claims.aud)) {
      throw new Error('Firebase ID token belongs to an untrusted project.');
    }
    if (claims.iss !== `https://securetoken.google.com/${claims.aud}`) {
      throw new Error('Firebase ID token issuer does not match its project.');
    }
    return claims.aud;
  } catch (error) {
    if (error?.message?.startsWith('Firebase ID token')) throw error;
    throw new Error('Firebase ID token claims are malformed.');
  }
}

function initFirebase() {
  const primaryProjectId = getPrimaryProjectId();
  const primaryServiceAccount = readServiceAccount(
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_APPLICATION_CREDENTIALS',
  );
  if (!primaryServiceAccount) {
    throw new Error('Firebase credentials are required. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
  }
  const primaryApp = initializeFirebaseApp(primaryProjectId, '[DEFAULT]', primaryServiceAccount);

  if (hasSecondaryCredentials()) {
    const secondaryServiceAccount = readServiceAccount(
      'FIREBASE_SERVICE_ACCOUNT_JSON_PROJECT_FITNESS_SPECIES',
      'GOOGLE_APPLICATION_CREDENTIALS_PROJECT_FITNESS_SPECIES',
    );
    if (!secondaryServiceAccount) {
      throw new Error('Firebase credentials for project-fitness-species are required.');
    }
    initializeFirebaseApp(
      SECONDARY_PROJECT_ID,
      'project-fitness-species',
      secondaryServiceAccount,
    );
  }

  return primaryApp;
}

function createFirebaseIdTokenVerifier({
  getConfiguredProjectIds,
  getAppForProject,
  verifyToken,
}) {
  return async (idToken) => {
    const projectId = getUnverifiedProjectId(idToken);
    if (!getConfiguredProjectIds().includes(projectId)) {
      throw new Error('Firebase ID token project is not configured on this backend.');
    }

    const app = getAppForProject(projectId);
    if (!app) throw new Error(`Firebase Admin app for ${projectId} is not initialized.`);

    const claims = await verifyToken(idToken, app);
    if (
      claims.aud !== projectId
      || claims.iss !== `https://securetoken.google.com/${projectId}`
    ) {
      throw new Error('Firebase ID token claims do not match the verified project.');
    }
    return claims;
  };
}

const verifyFirebaseIdTokenForConfiguredApp = createFirebaseIdTokenVerifier({
  getConfiguredProjectIds: getConfiguredFirebaseProjectIds,
  getAppForProject(projectId) {
    const appName = projectId === PRIMARY_PROJECT_ID ? '[DEFAULT]' : SECONDARY_PROJECT_ID;
    return getApps().find((candidate) => (
      candidate.name === appName && candidate.options.projectId === projectId
    ));
  },
  verifyToken: (idToken, app) => getAuth(app).verifyIdToken(idToken),
});

async function verifyFirebaseIdToken(idToken) {
  // The unverified audience only selects the verifier; Firebase Admin validates the token before use.
  return verifyFirebaseIdTokenForConfiguredApp(idToken);
}

module.exports = {
  initFirebase,
  verifyFirebaseIdToken,
  getConfiguredFirebaseProjectIds,
  createFirebaseIdTokenVerifier,
};
