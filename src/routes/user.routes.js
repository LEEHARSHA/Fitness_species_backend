const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  createOrUpdateUser,
  getCurrentUser,
  updateUserProfile
} = require('../controllers/user.controller');

const router = express.Router();

router.post('/me', requireFirebaseAuth, createOrUpdateUser);
router.get('/me', requireFirebaseAuth, getCurrentUser);
router.patch('/me', requireFirebaseAuth, updateUserProfile);

module.exports = router;
