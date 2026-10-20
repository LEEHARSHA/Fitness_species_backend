const fs = require('node:fs');
const path = require('node:path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');

function readServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (json) {
    try {
      return JSON.parse(json);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON.');
    }
  }

  if (credentialsPath) {
    const resolvedPath = path.resolve(process.cwd(), credentialsPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error('The file configured by GOOGLE_APPLICATION_CREDENTIALS does not exist.');
    }
    try {
      return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    } catch {
      throw new Error('The file configured by GOOGLE_APPLICATION_CREDENTIALS is not valid JSON.');
    }
  }

  return null;
}

function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c';
  const serviceAccount = readServiceAccount();

  if (serviceAccount && (
    serviceAccount.type !== 'service_account'
    || !serviceAccount.project_id
    || !serviceAccount.private_key
    || !serviceAccount.client_email
  )) {
    throw new Error('Firebase service-account credentials are missing required fields.');
  }
  if (serviceAccount && serviceAccount.project_id !== projectId) {
    throw new Error('Firebase service-account project does not match FIREBASE_PROJECT_ID.');
  }

  const existing = getApps().find((app) => app.name === '[DEFAULT]');
  if (existing) {
    if (existing.options.projectId !== projectId) {
      throw new Error('The initialized Firebase app does not match FIREBASE_PROJECT_ID.');
    }
    return existing;
  }

  if (!serviceAccount) {
    throw new Error('Firebase credentials are required. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.');
  }

  return initializeApp({ credential: cert(serviceAccount), projectId });
}

module.exports = { initFirebase };
