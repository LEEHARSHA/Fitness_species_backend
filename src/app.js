import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import workoutRoutesModule from './routes/workout.routes.js';
import { createWorkoutSessionRoutes } from './workouts/sessions.js';
import dietRoutes from './routes/diet.routes.js';
import progressRoutes from './routes/progress.routes.js';
import bmiRoutes from './routes/bmi.routes.js';
import waterRoutes from './routes/water.routes.js';
import { createMarketplaceRoutes } from './marketplace/routes.js';
import { createCommunityRoutes } from './community/routes.js';
import { createDoctorRoutes } from './doctors/routes.js';
import { createDoctorPortalRoutes } from './doctor-portal/routes.js';
import { createPaymentRoutes } from './payments/routes.js';
import { createAiCoachRoutes } from './ai-coach/routes.js';
import { createNotificationRoutes } from './notifications/routes.js';
import { requireFirebaseAuth as createFirebaseAuthMiddleware } from './marketplace/auth.js';
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
  app.use(express.json({ limit: '10mb', strict: true }));

  app.use((req, res, next) => {
    const supplied = req.get('x-correlation-id');
    const correlationId = supplied && /^[a-zA-Z0-9._:-]{1,100}$/.test(supplied)
      ? supplied
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    req.correlationId = correlationId;
    res.set('X-Correlation-Id', correlationId);
    next();
  });

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
  app.use('/api/workouts', createWorkoutSessionRoutes({
    getDb,
    verifyIdToken,
    primaryFirebaseProjectId,
    supportedFirebaseProjectIds,
  }));
  app.use('/api/workouts', workoutRoutesModule.createWorkoutRoutes({
    authenticate: createFirebaseAuthMiddleware(verifyIdToken, supportedFirebaseProjectIds),
    getDb,
  }));
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
  app.use('/api', createPaymentRoutes({
    getDb,
    verifyIdToken,
    primaryFirebaseProjectId,
    supportedFirebaseProjectIds,
    adminUids,
  }));
  app.use('/api', createAiCoachRoutes({
    getDb,
    verifyIdToken,
    primaryFirebaseProjectId,
    supportedFirebaseProjectIds,
  }));
  app.use('/api', createNotificationRoutes({
    getDb,
    verifyIdToken,
    primaryFirebaseProjectId,
    supportedFirebaseProjectIds,
  }));

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found.' });
  });

  app.use((error, req, res, _next) => {
    const correlationId = req.correlationId || 'unknown';
    const category = error?.name === 'MongoServerError'
      ? 'mongodb_error'
      : error?.name === 'MongoNetworkError'
        ? 'mongodb_network_error'
        : error?.code === 11000
          ? 'duplicate_profile'
          : 'unexpected_server_error';
    const status = error?.statusCode || error?.status || 500;
    console.error('Request failed:', {
      correlationId,
      route: `${req.method} ${req.originalUrl}`,
      category,
      status,
      errorCode: typeof error?.code === 'string' || typeof error?.code === 'number'
        ? error.code
        : error?.name || 'UNKNOWN',
    });
    if (error?.type === 'entity.too.large') {
      res.status(413).json({
        success: false,
        code: 'REQUEST_TOO_LARGE',
        correlationId,
        message: 'Request body is too large.',
      });
      return;
    }
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({
        success: false,
        code: 'INVALID_JSON',
        correlationId,
        message: 'Request body must be valid JSON.',
      });
      return;
    }
    if (error?.message === 'Origin is not allowed by CORS.') {
      res.status(403).json({
        success: false,
        code: 'ORIGIN_FORBIDDEN',
        correlationId,
        message: 'Origin is not allowed.',
      });
      return;
    }
    res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      code: category === 'duplicate_profile'
        ? 'DUPLICATE_PROFILE'
        : category === 'mongodb_error'
          ? 'MONGODB_ERROR'
          : category === 'mongodb_network_error'
            ? 'MONGODB_NETWORK_ERROR'
            : 'UNEXPECTED_SERVER_ERROR',
      correlationId,
      message: 'An unexpected server error occurred. Please retry.',
    });
  });

  return app;
}

export default createApp();
