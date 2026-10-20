const { getDb } = require('../config/mongodb');

/**
 * Middleware factory to enforce specific application role(s).
 * Must be used after requireFirebaseAuth middleware.
 * Looks up trusted role from MongoDB users collection for req.user.uid.
 */
const requireRole = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      const db = getDb();
      const user = await db.collection('users').findOne({ firebaseUid: req.user.uid });

      const userRole = user && user.role ? user.role : 'customer';
      req.user.role = userRole;

      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          message: `Forbidden. Action requires one of the following roles: ${allowedRoles.join(', ')}.`
        });
      }

      next();
    } catch (error) {
      console.error('Role authorization error:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Internal server error during authorization check.'
      });
    }
  };
};

module.exports = {
  requireRole
};
