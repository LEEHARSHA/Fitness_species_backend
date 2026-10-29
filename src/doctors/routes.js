import express from 'express';
import { requireAdmin, requireFirebaseAuth } from '../marketplace/auth.js';
import { createDoctorControllers } from './controllers.js';

export function createDoctorRoutes(dependencies) {
  const router = express.Router();
  const controllers = createDoctorControllers(dependencies);
  const authenticate = requireFirebaseAuth(dependencies.verifyIdToken, [
    dependencies.primaryFirebaseProjectId || process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c',
  ]);
  const authorizeAdmin = requireAdmin(dependencies.adminUids);

  router.get('/doctors', controllers.listPublicDoctors);
  router.get('/doctors/me', authenticate, controllers.getMyDoctor);
  router.put('/doctors/me', authenticate, controllers.saveMyDoctor);
  router.post('/doctors/me/submit', authenticate, controllers.submitMyDoctor);
  router.get('/doctors/:id', controllers.getPublicDoctor);

  router.get('/admin/doctors', authenticate, authorizeAdmin, controllers.listAdminDoctors);
  router.get('/admin/doctors/:id', authenticate, authorizeAdmin, controllers.getAdminDoctor);
  router.patch('/admin/doctors/:id/review', authenticate, authorizeAdmin, controllers.reviewAdminDoctor);

  return router;
}
