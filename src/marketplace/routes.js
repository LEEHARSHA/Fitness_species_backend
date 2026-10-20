import express from 'express';
import { requireAdmin, requireFirebaseAuth } from './auth.js';
import { createMarketplaceControllers } from './controllers.js';

export function createMarketplaceRoutes(dependencies) {
  const router = express.Router();
  const controllers = createMarketplaceControllers(dependencies);
  const authenticate = requireFirebaseAuth(dependencies.verifyIdToken);
  const authorizeAdmin = requireAdmin(dependencies.adminUids);

  router.get('/products', controllers.listPublicProducts);
  router.get('/products/:productId', controllers.getPublicProduct);

  router.get('/seller/profile', authenticate, controllers.getSellerProfile);
  router.post('/seller/profile', authenticate, controllers.saveSellerProfile);
  router.patch('/seller/profile', authenticate, controllers.saveSellerProfile);
  router.get('/seller/products', authenticate, controllers.listSellerProducts);
  router.post('/seller/products', authenticate, controllers.createProduct);
  router.get('/seller/products/:productId', authenticate, controllers.getSellerProduct);
  router.patch('/seller/products/:productId/stock', authenticate, controllers.updateProductStock);
  router.patch('/seller/products/:productId', authenticate, controllers.updateProduct);

  router.get('/admin/products', authenticate, authorizeAdmin, controllers.listAdminProducts);
  router.get('/admin/products/:productId', authenticate, authorizeAdmin, controllers.getAdminProduct);
  router.patch('/admin/products/:productId/review', authenticate, authorizeAdmin, controllers.reviewProduct);

  return router;
}
