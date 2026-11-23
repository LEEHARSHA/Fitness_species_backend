import express from 'express';
import { requireAdmin, requireFirebaseAuth } from '../marketplace/auth.js';
import { createPaymentControllers } from './controllers.js';

export function createPaymentRoutes(dependencies) {
  const router = express.Router();
  const controllers = createPaymentControllers(dependencies);
  const primaryProjectId = dependencies.primaryFirebaseProjectId
    || process.env.FIREBASE_PROJECT_ID
    || 'sellerportal-2786c';
  const authenticate = requireFirebaseAuth(
    dependencies.verifyIdToken,
    dependencies.supportedFirebaseProjectIds || [primaryProjectId],
  );
  const authenticatePrimary = requireFirebaseAuth(dependencies.verifyIdToken, [primaryProjectId]);
  const authorizeAdmin = requireAdmin(dependencies.adminUids);

  // User Payments
  router.post('/payments/razorpay/create-order', authenticate, controllers.createRazorpayOrder);
  router.post('/payments/razorpay/verify', authenticate, controllers.verifyRazorpaySignature);
  router.get('/payments/my-history', authenticate, controllers.getMyPaymentHistory);
  router.get('/payments/my-orders', authenticate, controllers.getMyShopOrders);
  router.get('/payments/my-subscription', authenticate, controllers.getMySubscription);
  router.post('/payments/google-play/verify-subscription', authenticate, controllers.verifyGooglePlaySubscription);

  // Webhooks
  router.post('/payments/webhooks/razorpay', controllers.handleRazorpayWebhook);
  router.post('/payments/webhooks/google-play', controllers.handleGooglePlayWebhook);

  // Admin Payments & Refunds
  router.get('/admin/payments', authenticatePrimary, authorizeAdmin, controllers.listAdminPayments);
  router.post('/admin/payments/refund', authenticatePrimary, authorizeAdmin, controllers.processAdminRefund);

  return router;
}
