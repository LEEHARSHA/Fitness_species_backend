const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * @route   GET /api/auth/me
 * @desc    Get the current authenticated user details from the verified token
 * @access  Private
 */
router.get('/me', requireFirebaseAuth, (req, res) => {
  // Return the verified user data attached by the middleware
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
