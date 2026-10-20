const { getDb } = require('../config/mongodb');

function formatBmiDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    weightKg: doc.weight || 0.0,
    heightCm: doc.height || 0.0,
    bmi: doc.bmi || 0.0,
    categoryLabel: doc.categoryLabel || 'Normal Weight',
    date: doc.date || new Date().toISOString(),
    calculatedAt: doc.calculatedAt
  };
}

/**
 * @route   POST /api/bmi
 * @desc    Save new BMI calculation history entry
 * @access  Private (Requires Firebase ID Token)
 */
const calculateAndSaveBmi = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const { weight, height, bmi, categoryLabel, date } = req.body || {};

    const parsedWeight = Number(weight);
    const parsedHeight = Number(height);

    if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight >= 500) {
      return res.status(400).json({
        success: false,
        message: 'Weight must be a positive number in kg (less than 500).'
      });
    }

    if (isNaN(parsedHeight) || parsedHeight <= 0 || parsedHeight >= 300) {
      return res.status(400).json({
        success: false,
        message: 'Height must be a positive number in cm (less than 300).'
      });
    }

    // Calculate BMI server-side if not provided
    let computedBmi = Number(bmi);
    if (isNaN(computedBmi) || computedBmi <= 0) {
      const heightM = parsedHeight / 100.0;
      computedBmi = Math.round((parsedWeight / (heightM * heightM)) * 10.0) / 10.0;
    }

    let computedCategory = categoryLabel || 'Normal Weight';
    if (!categoryLabel) {
      if (computedBmi < 18.5) computedCategory = 'Underweight';
      else if (computedBmi <= 24.9) computedCategory = 'Normal Weight';
      else if (computedBmi <= 29.9) computedCategory = 'Overweight';
      else computedCategory = 'Obesity';
    }

    const bmiDoc = {
      userId: userId,
      weight: parsedWeight,
      height: parsedHeight,
      bmi: computedBmi,
      categoryLabel: computedCategory,
      date: date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      calculatedAt: new Date()
    };

    const result = await db.collection('bmiHistory').insertOne(bmiDoc);
    bmiDoc._id = result.insertedId;

    // Sync user profile weight, height, bmi
    await db.collection('users').updateOne(
      { firebaseUid: userId },
      {
        $set: {
          'profile.weight': parsedWeight,
          'profile.height': parsedHeight,
          'profile.bmi': computedBmi,
          updatedAt: new Date()
        }
      }
    );

    return res.status(201).json({
      success: true,
      bmiRecord: formatBmiDoc(bmiDoc)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/bmi/latest
 * @desc    Get latest BMI calculation record for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getLatestBmi = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const latest = await db
      .collection('bmiHistory')
      .find({ userId: userId })
      .sort({ calculatedAt: -1 })
      .limit(1)
      .next();

    return res.status(200).json({
      success: true,
      bmiRecord: formatBmiDoc(latest)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/bmi/history
 * @desc    Get BMI calculation history for authenticated user
 * @access  Private (Requires Firebase ID Token)
 */
const getBmiHistory = async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const history = await db
      .collection('bmiHistory')
      .find({ userId: userId })
      .sort({ calculatedAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      count: history.length,
      history: history.map(formatBmiDoc)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  calculateAndSaveBmi,
  getLatestBmi,
  getBmiHistory
};
