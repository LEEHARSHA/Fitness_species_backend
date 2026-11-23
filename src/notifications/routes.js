import express from 'express';
import { requireFirebaseAuth } from '../marketplace/auth.js';
import { createNotificationControllers } from './controllers.js';

export function createNotificationRoutes(dependencies) {
  const router = express.Router();
  const controllers = createNotificationControllers(dependencies);
  const authenticate = requireFirebaseAuth(dependencies.verifyIdToken, [
    dependencies.primaryFirebaseProjectId || process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c',
  ]);

  router.get('/notifications', authenticate, controllers.getNotifications);
  router.post('/notifications', authenticate, controllers.createNotification);
  router.patch('/notifications/read-all', authenticate, controllers.markAllAsRead);
  router.patch('/notifications/:id/read', authenticate, controllers.markNotificationAsRead);
  router.delete('/notifications/:id', authenticate, controllers.deleteNotification);

  return router;
}
