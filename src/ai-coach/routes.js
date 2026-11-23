import express from 'express';
import { requireFirebaseAuth } from '../marketplace/auth.js';
import { createAiCoachControllers } from './controllers.js';

export function createAiCoachRoutes(dependencies) {
  const router = express.Router();
  const controllers = createAiCoachControllers(dependencies);
  const primaryProjectId = dependencies.primaryFirebaseProjectId
    || process.env.FIREBASE_PROJECT_ID
    || 'sellerportal-2786c';
  const supportedProjectIds = new Set([
    primaryProjectId,
    ...(dependencies.supportedFirebaseProjectIds || []),
  ]);
  const authenticate = requireFirebaseAuth(
    dependencies.verifyIdToken,
    [...supportedProjectIds],
  );

  router.post('/ai-coach/chat', authenticate, controllers.chatWithAiCoach);
  router.get('/ai-coach/history', authenticate, controllers.getAiCoachHistory);

  return router;
}
