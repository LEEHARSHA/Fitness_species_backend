const { getDb } = require('../config/mongodb');

function getTodayDateString(dateInput) {
  if (dateInput && typeof dateInput === 'string' && dateInput.length >= 10) {
    return dateInput.substring(0, 10);
  }
  const d = dateInput ? new Date(dateInput) : new Date();
  return d.toISOString().substring(0, 10);
}

function formatWaterDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    date: doc.date,
    consumedLitres: Math.round(((doc.intakeMl || 0) / 1000.0) * 100.0) / 100.0,
    targetLitres: Math.round(((doc.targetMl || 3000) / 1000.0) * 10.0) / 10.0,
    intakeMl: doc.intakeMl || 0,
    targetMl: doc.targetMl || 3000,
    history: doc.history || [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

/**
 * @route   GET /api/water/today
 * @desc    Get or initialize today's water intake record
 * @access  Private (Requires Firebase ID Token)
 */
const getTodayWater = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;
    const dateStr = getTodayDateString(req.query.date);

    const filter = { userId: userId, date: dateStr };
    const update = {
      $setOnInsert: {
        userId: userId,
        date: dateStr,
        intakeMl: 0,
        targetMl: 3000,
        history: [],
        createdAt: new Date()
      },
      $set: {
        updatedAt: new Date()
      }
    };

    const options = { upsert: true, returnDocument: 'after' };
    const record = await db.collection('waterLogs').findOneAndUpdate(filter, update, options);

    return res.status(200).json({
      success: true,
      waterRecord: formatWaterDoc(record)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/water/log
 * @desc    Log water intake amount (e.g. +250ml) for today
 * @access  Private (Requires Firebase ID Token)
 */
const logWaterIntake = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const { amountMl, date, timeStr } = req.body || {};

    const parsedAmount = Number(amountMl);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Amount in mL must be a positive number up to 5000 mL.'
      });
    }

    const dateStr = getTodayDateString(date);
    const logTime = timeStr || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const logEntry = {
      id: 'w_' + Math.random().toString(36).substring(2, 10),
      amountMl: parsedAmount,
      timeStr: logTime
    };

    const filter = { userId: userId, date: dateStr };
    const update = {
      $inc: { intakeMl: parsedAmount },
      $push: { history: { $each: [logEntry], $position: 0 } },
      $setOnInsert: {
        userId: userId,
        date: dateStr,
        targetMl: 3000,
        createdAt: new Date()
      },
      $set: {
        updatedAt: new Date()
      }
    };

    const options = { upsert: true, returnDocument: 'after' };
    const record = await db.collection('waterLogs').findOneAndUpdate(filter, update, options);

    return res.status(200).json({
      success: true,
      waterRecord: formatWaterDoc(record)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/water/today
 * @desc    Update water target or total intake directly for today
 * @access  Private (Requires Firebase ID Token)
 */
const updateTodayWaterTarget = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const { targetMl, intakeMl, targetLitres, consumedLitres, date } = req.body || {};

    const dateStr = getTodayDateString(date);

    const setFields = { updatedAt: new Date() };

    if (targetMl !== undefined && targetMl !== null) {
      const parsedTarget = Number(targetMl);
      if (isNaN(parsedTarget) || parsedTarget < 0 || parsedTarget > 20000) {
        return res.status(400).json({
          success: false,
          message: 'Target mL must be between 0 and 20000 mL.'
        });
      }
      setFields.targetMl = parsedTarget;
    } else if (targetLitres !== undefined && targetLitres !== null) {
      const parsedTargetL = Number(targetLitres);
      if (isNaN(parsedTargetL) || parsedTargetL < 0 || parsedTargetL > 20) {
        return res.status(400).json({
          success: false,
          message: 'Target Litres must be between 0 and 20 L.'
        });
      }
      setFields.targetMl = Math.round(parsedTargetL * 1000);
    }

    if (intakeMl !== undefined && intakeMl !== null) {
      const parsedIntake = Number(intakeMl);
      if (isNaN(parsedIntake) || parsedIntake < 0 || parsedIntake > 20000) {
        return res.status(400).json({
          success: false,
          message: 'Intake mL must be non-negative.'
        });
      }
      setFields.intakeMl = parsedIntake;
    } else if (consumedLitres !== undefined && consumedLitres !== null) {
      const parsedConsumedL = Number(consumedLitres);
      if (isNaN(parsedConsumedL) || parsedConsumedL < 0 || parsedConsumedL > 20) {
        return res.status(400).json({
          success: false,
          message: 'Consumed Litres must be non-negative.'
        });
      }
      setFields.intakeMl = Math.round(parsedConsumedL * 1000);
    }

    const filter = { userId: userId, date: dateStr };
    const update = {
      $set: setFields,
      $setOnInsert: {
        userId: userId,
        date: dateStr,
        history: [],
        createdAt: new Date()
      }
    };

    const options = { upsert: true, returnDocument: 'after' };
    const record = await db.collection('waterLogs').findOneAndUpdate(filter, update, options);

    return res.status(200).json({
      success: true,
      waterRecord: formatWaterDoc(record)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/water/history
 * @desc    Get historical daily water logs for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getWaterHistory = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const history = await db
      .collection('waterLogs')
      .find({ userId: userId })
      .sort({ date: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: history.length,
      history: history.map(formatWaterDoc)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTodayWater,
  logWaterIntake,
  updateTodayWaterTarget,
  getWaterHistory
};
