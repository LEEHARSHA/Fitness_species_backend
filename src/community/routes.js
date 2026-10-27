import express from 'express';
import { requireAdmin, requireFirebaseAuth } from '../marketplace/auth.js';
import { createCommunityControllers } from './controllers.js';
import { createCommunityRateLimiter } from './rate-limit.js';

export function createCommunityRoutes(dependencies) {
  const router = express.Router();
  const controllers = createCommunityControllers(dependencies);
  const authenticate = requireFirebaseAuth(dependencies.verifyIdToken);
  const authorizeAdmin = requireAdmin(dependencies.adminUids);
  const applicationLimit = createCommunityRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
  const eventWriteLimit = createCommunityRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });
  const registrationLimit = createCommunityRateLimiter({ limit: 15, windowMs: 60 * 1000 });

  router.get('/events', controllers.listPublicEvents);
  router.get('/events/mine', authenticate, controllers.listMyEvents);
  router.get('/events/:eventId/manage', authenticate, controllers.getMyEvent);
  router.get('/events/:eventId', controllers.getPublicEvent);
  router.get('/events/:eventId/registrations/me', authenticate, controllers.getMyRegistration);
  router.get('/registrations/mine', authenticate, controllers.listMyRegistrations);

  router.post('/organizers/apply', authenticate, applicationLimit, controllers.applyAsOrganizer);
  router.get('/organizers/me/summary', authenticate, controllers.getOrganizerSummary);
  router.get('/organizers/me', authenticate, controllers.getMyOrganizer);
  router.patch('/organizers/me', authenticate, controllers.updateMyOrganizer);
  router.post('/events', authenticate, eventWriteLimit, controllers.createEvent);
  router.patch('/events/:eventId', authenticate, controllers.updateMyEvent);
  router.post('/events/:eventId/submit', authenticate, eventWriteLimit, controllers.submitMyEvent);
  router.post('/events/:eventId/cancel', authenticate, controllers.cancelMyEvent);
  router.get('/events/:eventId/registrations', authenticate, controllers.listEventRegistrations);
  router.post('/events/:eventId/registrations', authenticate, registrationLimit, controllers.registerForEvent);
  router.delete('/events/:eventId/registrations/me', authenticate, controllers.cancelRegistration);

  router.get('/admin/organizers', authenticate, authorizeAdmin, controllers.listOrganizerApplications);
  router.patch('/admin/organizers/:uid/review', authenticate, authorizeAdmin, controllers.reviewOrganizer);
  router.get('/admin/events', authenticate, authorizeAdmin, controllers.listEventsForReview);
  router.patch('/admin/events/:eventId/review', authenticate, authorizeAdmin, controllers.reviewEvent);

  return router;
}
