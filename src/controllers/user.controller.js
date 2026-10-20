const { getDb } = require('../config/mongodb');

/**
 * Format internal MongoDB user document to clean public JSON
 */
function formatUserResponse(doc) {
  if (!doc) return null;
  return {
    firebaseUid: doc.firebaseUid,
    email: doc.email || '',
    name: doc.name || '',
    photoUrl: doc.photoUrl || null,
    provider: doc.provider || '',
    role: doc.role || 'customer',
    profile: {
      age: doc.profile?.age ?? null,
      gender: doc.profile?.gender ?? null,
      height: doc.profile?.height ?? null,
      weight: doc.profile?.weight ?? null
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

/**
 * @route   POST /api/users/me
 * @desc    Create user if not exists or sync metadata if exists
 * @access  Private (Requires Firebase ID Token)
 */
const createOrUpdateUser = async (req, res, next) => {
  try {
    const db = getDb();
    const { uid, email, name, provider } = req.user;

    const filter = { firebaseUid: uid };

    const setFields = {
      updatedAt: new Date()
    };
    if (email) setFields.email = email;
    if (name) setFields.name = name;
    if (provider) setFields.provider = provider;

    const update = {
      $setOnInsert: {
        firebaseUid: uid,
        role: 'customer', // Default role on creation. Cannot be changed via this endpoint!
        photoUrl: null,
        profile: {
          age: null,
          gender: null,
          height: null,
          weight: null
        },
        createdAt: new Date()
      },
      $set: setFields
    };

    const options = { upsert: true, returnDocument: 'after' };
    const user = await db.collection('users').findOneAndUpdate(filter, update, options);

    return res.status(200).json({
      success: true,
      user: formatUserResponse(user)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private (Requires Firebase ID Token)
 */
const getCurrentUser = async (req, res, next) => {
  try {
    const db = getDb();
    const { uid } = req.user;

    const user = await db.collection('users').findOne({ firebaseUid: uid });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user: formatUserResponse(user)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/users/me
 * @desc    Update user profile fields (name, age, gender, height, weight)
 * @access  Private (Requires Firebase ID Token)
 */
const updateUserProfile = async (req, res, next) => {
  try {
    const db = getDb();
    const { uid } = req.user;

    const { name, age, gender, height, weight, profile } = req.body || {};

    const inputName = name !== undefined ? name : profile?.name;
    const inputAge = age !== undefined ? age : profile?.age;
    const inputGender = gender !== undefined ? gender : profile?.gender;
    const inputHeight = height !== undefined ? height : profile?.height;
    const inputWeight = weight !== undefined ? weight : profile?.weight;

    const updateFields = {
      updatedAt: new Date()
    };

    let hasFieldsToUpdate = false;

    if (inputName !== undefined && inputName !== null) {
      if (typeof inputName !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Name must be a string.'
        });
      }
      const trimmedName = inputName.trim();
      if (trimmedName.length < 1 || trimmedName.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Name must be between 1 and 100 characters.'
        });
      }
      updateFields.name = trimmedName;
      hasFieldsToUpdate = true;
    }

    if (inputAge !== undefined && inputAge !== null) {
      const parsedAge = Number(inputAge);
      if (isNaN(parsedAge) || !Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
        return res.status(400).json({
          success: false,
          message: 'Age must be a valid integer between 1 and 120.'
        });
      }
      updateFields['profile.age'] = parsedAge;
      hasFieldsToUpdate = true;
    }

    if (inputGender !== undefined && inputGender !== null) {
      if (typeof inputGender !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Gender must be a string.'
        });
      }
      const trimmedGender = inputGender.trim();
      if (trimmedGender.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Gender must be at most 50 characters.'
        });
      }
      updateFields['profile.gender'] = trimmedGender;
      hasFieldsToUpdate = true;
    }

    if (inputHeight !== undefined && inputHeight !== null) {
      const parsedHeight = Number(inputHeight);
      if (isNaN(parsedHeight) || parsedHeight <= 0 || parsedHeight >= 300) {
        return res.status(400).json({
          success: false,
          message: 'Height must be a positive number in cm (less than 300).'
        });
      }
      updateFields['profile.height'] = parsedHeight;
      hasFieldsToUpdate = true;
    }

    if (inputWeight !== undefined && inputWeight !== null) {
      const parsedWeight = Number(inputWeight);
      if (isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight >= 500) {
        return res.status(400).json({
          success: false,
          message: 'Weight must be a positive number in kg (less than 500).'
        });
      }
      updateFields['profile.weight'] = parsedWeight;
      hasFieldsToUpdate = true;
    }

    if (!hasFieldsToUpdate) {
      return res.status(400).json({
        success: false,
        message: 'No valid profile fields provided for update.'
      });
    }

    const user = await db.collection('users').findOneAndUpdate(
      { firebaseUid: uid },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found.'
      });
    }

    return res.status(200).json({
      success: true,
      user: formatUserResponse(user)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrUpdateUser,
  getCurrentUser,
  updateUserProfile
};
