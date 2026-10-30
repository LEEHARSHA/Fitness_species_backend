import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import workoutRoutes from './routes/workout.routes.js';
import dietRoutes from './routes/diet.routes.js';
import progressRoutes from './routes/progress.routes.js';
import bmiRoutes from './routes/bmi.routes.js';
import waterRoutes from './routes/water.routes.js';
import { createMarketplaceRoutes } from './marketplace/routes.js';
import { createCommunityRoutes } from './community/routes.js';
import { createDoctorRoutes } from './doctors/routes.js';
import { createDoctorPortalRoutes } from './doctor-portal/routes.js';
import mongo from './config/mongodb.js';
import { getAuth } from 'firebase-admin/auth';

const PRODUCTION_CORS_ORIGINS = [
  'https://seller-n14iroz5o-leeharshas-projects.vercel.app',
  'https://seller-lilac-five.vercel.app',
  'https://admin-portal-sepia-chi.vercel.app',
  'https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app',
  'https://fitness-species-community.vercel.app',
  'https://doctors-webpage-three.vercel.app',
];

const DEFAULT_LOCAL_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3005',
  'http://localhost:3001',
];

export function isAllowedCorsOrigin(origin, allowedSet) {
  if (!origin) return true;
  if (allowedSet.has(origin)) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (
      url.protocol === 'https:' &&
      host.endsWith('.vercel.app') &&
      (
        host.startsWith('seller') ||
        host.startsWith('admin-portal') ||
        host.includes('leeharshas-projects')
      )
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

export function parseCorsOrigins(value = process.env.CORS_ORIGINS) {
  const configuredOrigins = (value || DEFAULT_LOCAL_CORS_ORIGINS.join(','))
    .split(',');
  const origins = configuredOrigins
    .map((origin) => origin.trim())
    .filter((origin) => Boolean(origin) && origin !== '*');
  return new Set([...PRODUCTION_CORS_ORIGINS, ...origins]);
}

export function createApp({
  getDb = mongo.getDb,
  getDbStatus = mongo.getDbStatus,
  getDbName = mongo.getDbName,
  checkDB = mongo.checkDB,
  verifyIdToken = (token) => getAuth().verifyIdToken(token),
  primaryFirebaseProjectId = process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c',
  supportedFirebaseProjectIds = [primaryFirebaseProjectId],
  adminUids = (process.env.ADMIN_FIREBASE_UIDS || '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean),
  corsOrigins = parseCorsOrigins(),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin, corsOrigins)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by CORS.'));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }));
  app.use(express.json({ limit: '1mb', strict: true }));

  app.get('/api/health', async (_req, res) => {
    let ready = false;
    try {
      await checkDB();
      ready = getDbStatus() === 'connected';
    } catch {
      ready = false;
    }
    res.status(ready ? 200 : 503).json({
      success: ready,
      status: ready ? 'ok' : 'not_ready',
      server: 'running',
      database: {
        name: ready ? getDbName() : null,
        status: ready ? 'connected' : 'disconnected',
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api', (req, res, next) => {
    if (req.path === '/health') {
      next();
      return;
    }
    if (getDbStatus() !== 'connected') {
      res.status(503).json({
        success: false,
        message: 'The service is temporarily unavailable because the database is not connected.',
      });
      return;
    }
    next();
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/workouts', workoutRoutes);
  app.use('/api/diets', dietRoutes);
  app.use('/api/progress', progressRoutes);
  app.use('/api/bmi', bmiRoutes);
  app.use('/api/water', waterRoutes);
  app.use('/api', createMarketplaceRoutes({
    getDb,
    verifyIdToken,
    supportedFirebaseProjectIds: [primaryFirebaseProjectId],
    adminUids,
  }));
  app.use('/api/community', createCommunityRoutes({
    getDb,
    verifyIdToken,
    primaryFirebaseProjectId,
    supportedFirebaseProjectIds,
    adminUids,
  }));
  app.use('/api', createDoctorRoutes({
    getDb,
    verifyIdToken,
    primaryFirebaseProjectId,
    adminUids,
  }));
  app.use('/api/doctor-portal', createDoctorPortalRoutes({
    getDb,
    verifyIdToken,
    primaryFirebaseProjectId,
    supportedFirebaseProjectIds,
    adminUids,
  }));

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found.' });
  });

  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ success: false, message: 'Request body is too large.' });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ success: false, message: 'Request body must be valid JSON.' });
      return;
    }
    if (error?.message === 'Origin is not allowed by CORS.') {
      res.status(403).json({ success: false, message: 'Origin is not allowed.' });
      return;
    }
    console.error('Request failed:', error?.name || 'Error');
    res.status(500).json({ success: false, message: 'An unexpected server error occurred.' });
  });

  return app;
}

export default createApp();
