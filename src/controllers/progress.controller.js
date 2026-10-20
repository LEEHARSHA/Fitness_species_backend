const { ObjectId } = require('mongodb');
const { getDb } = require('../config/mongodb');

function formatProgressDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    date: doc.date,
    weight: doc.weight || 0.0,
    measurements: doc.measurements || {
      chest: null,
      waist: null,
      hips: null,
      arms: null,
      thighs: null
    },
    notes: doc.notes || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

/**
 * @route   POST /api/progress
 * @desc    Record new progress measurement
 * @access  Private (Requires Firebase ID Token)
 */
const createProgressRecord = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const { weight, measurements, notes, date } = req.body || {};

    if (weight !== undefined && weight !== null) {
      const parsedWeight = Number(weight);
      if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight >= 500) {
        return res.status(400).json({
          success: false,
          message: 'Weight must be a positive number in kg (less than 500).'
        });
      }
    }

    const recordDate = date ? new Date(date) : new Date();

    const progressDoc = {
      userId: userId,
      date: recordDate,
      weight: weight ? Number(weight) : 0.0,
      measurements: measurements || {
        chest: null,
        waist: null,
        hips: null,
        arms: null,
        thighs: null
      },
      notes: typeof notes === 'string' ? notes.trim() : '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('progress').insertOne(progressDoc);
    progressDoc._id = result.insertedId;

    // Sync weight to user profile if provided
    if (weight && Number(weight) > 0) {
      await db.collection('users').updateOne(
        { firebaseUid: userId },
        {
          $set: {
            'profile.weight': Number(weight),
            updatedAt: new Date()
          }
        }
      );
    }

    return res.status(201).json({
      success: true,
      progress: formatProgressDoc(progressDoc)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/progress
 * @desc    Get progress history for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getProgressHistory = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const history = await db
      .collection('progress')
      .find({ userId: userId })
      .sort({ date: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: history.length,
      progress: history.map(formatProgressDoc)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/progress/latest
 * @desc    Get latest progress record for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getLatestProgress = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const latest = await db
      .collection('progress')
      .find({ userId: userId })
      .sort({ date: -1 })
      .limit(1)
      .next();

    return res.status(200).json({
      success: true,
      progress: formatProgressDoc(latest)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/progress/:id
 * @desc    Update an existing progress record owned by user
 * @access  Private (Requires Firebase ID Token)
 */
const updateProgressRecord = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;
    const progressId = req.params.id;

    if (!ObjectId.isValid(progressId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid progress record ID format.'
      });
    }

    const { weight, measurements, notes } = req.body || {};

    const updateFields = { updatedAt: new Date() };

    if (weight !== undefined && weight !== null) {
      const parsedWeight = Number(weight);
      if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight >= 500) {
        return res.status(400).json({
          success: false,
          message: 'Weight must be a positive number in kg (less than 500).'
        });
      }
      updateFields.weight = parsedWeight;
    }

    if (measurements !== undefined && typeof measurements === 'object') {
      updateFields.measurements = measurements;
    }

    if (notes !== undefined && typeof notes === 'string') {
      updateFields.notes = notes.trim();
    }

    const updated = await db.collection('progress').findOneAndUpdate(
      { _id: new ObjectId(progressId), userId: userId },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Progress record not found or access denied.'
      });
    }

    return res.status(200).json({
      success: true,
      progress: formatProgressDoc(updated)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProgressRecord,
  getProgressHistory,
  getLatestProgress,
  updateProgressRecord
};
