const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  createOrUpdateUser,
  getCurrentUser,
  updateUserProfile,
  uploadProfilePhoto,
  getProfilePhoto,
} = require('../controllers/user.controller');
const { parseProfilePhotoUpload } = require('../middleware/profile-photo-upload');

const router = express.Router();

router.get('/photos/:id', getProfilePhoto);
router.post('/me', requireFirebaseAuth, createOrUpdateUser);
router.get('/me', requireFirebaseAuth, getCurrentUser);
router.patch('/me', requireFirebaseAuth, updateUserProfile);
router.patch('/me/photo', requireFirebaseAuth, parseProfilePhotoUpload, uploadProfilePhoto);

module.exports = router;
