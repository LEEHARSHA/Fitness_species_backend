const express = require('express');
const { requireFirebaseAuth } = require('../middleware/auth.middleware');
const {
  createProgressRecord,
  getProgressHistory,
  getLatestProgress,
  updateProgressRecord
} = require('../controllers/progress.controller');

const router = express.Router();

router.post('/', requireFirebaseAuth, createProgressRecord);
router.get('/', requireFirebaseAuth, getProgressHistory);
router.get('/latest', requireFirebaseAuth, getLatestProgress);
router.patch('/:id', requireFirebaseAuth, updateProgressRecord);

module.exports = router;
