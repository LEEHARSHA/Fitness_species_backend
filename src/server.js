import 'dotenv/config';
import firebase from './config/firebase-admin.js';
import mongo from './config/mongodb.js';
import { createApp } from './app.js';
import { createPaymentControllers } from './payments/controllers.js';

const { initFirebase } = firebase;
const { connectDB, initializeDB, getDb, getDbStatus, checkDB, closeDB } = mongo;
const app = createApp({
  getDb,
  getDbStatus,
  checkDB,
  verifyIdToken: firebase.verifyFirebaseIdToken,
  primaryFirebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c',
  supportedFirebaseProjectIds: firebase.getConfiguredFirebaseProjectIds(),
});
const paymentMaintenance = createPaymentControllers({ getDb });
const port = Number(process.env.PORT || 5000);
let server;
let paymentMaintenanceTimer;

async function reconcilePaymentHolds() {
  try {
    const result = await paymentMaintenance.reconcileExpiredPaymentHolds();
    if (result.released || result.skipped) {
      console.info('[payments] Expired hold reconciliation completed.', result);
    }
  } catch (error) {
    console.error('[payments] Expired hold reconciliation failed.', {
      code: error?.code || error?.error?.code || 'RECONCILIATION_ERROR',
    });
  }
}

async function startServer() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  initFirebase();
  await connectDB();
  await initializeDB();
  console.info('MongoDB connection and ping verified.');
  await reconcilePaymentHolds();
  paymentMaintenanceTimer = setInterval(reconcilePaymentHolds, 60_000);
  paymentMaintenanceTimer.unref();

  server = app.listen(port, '0.0.0.0', () => {
    console.info(`Fitness Species API listening on 0.0.0.0:${port}.`);
  });
}

async function shutdown(signal) {
  console.info(`${signal} received; shutting down.`);
  if (paymentMaintenanceTimer) clearInterval(paymentMaintenanceTimer);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDB();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

startServer().catch(async (error) => {
  console.error(error.message);
  try {
    await closeDB();
  } catch {
    console.error('MongoDB shutdown failed.');
  }
  process.exitCode = 1;
});
