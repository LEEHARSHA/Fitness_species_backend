const fs = require('node:fs');
const path = require('node:path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const SECONDARY_PROJECT_ID = 'project-fitness-species';

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
  return process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c';
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

  if (hasSecondaryCredentials() && primaryProjectId !== SECONDARY_PROJECT_ID) {
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

async function verifyFirebaseIdToken(idToken) {
  const configuredIds = new Set(getConfiguredFirebaseProjectIds());
  const configuredApps = getApps().filter((app) => configuredIds.has(app.options.projectId));
  if (configuredApps.length !== configuredIds.size) {
    throw new Error('Firebase Admin apps are not initialized for every configured project.');
  }

  const errors = [];
  for (const app of configuredApps) {
    try {
      return await getAuth(app).verifyIdToken(idToken);
    } catch (error) {
      errors.push(error);
    }
  }

  const usefulError = errors.find((error) => (
    error?.code === 'auth/id-token-expired'
    || error?.code === 'auth/id-token-revoked'
  )) || errors[errors.length - 1];
  throw usefulError;
}

module.exports = {
  initFirebase,
  verifyFirebaseIdToken,
  getConfiguredFirebaseProjectIds,
};
