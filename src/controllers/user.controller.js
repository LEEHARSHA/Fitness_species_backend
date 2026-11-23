
const { getDb } = require('../config/mongodb');
const { getUserIdentityFilter } = require('../middleware/auth.middleware');
const { GridFSBucket, ObjectId } = require('mongodb');
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const PROFILE_PHOTO_BUCKET = 'profilePhotos';
const PROFILE_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function detectProfilePhotoMime(buffer) {
  if (
    buffer.length >= 3
    && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  ) return 'image/jpeg';
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) return 'image/png';
  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  return null;
}

function getStoredProfilePhotoId(photoUrl) {
  if (typeof photoUrl !== 'string') return null;
  const match = /\/api\/users\/photos\/([a-f\d]{24})$/i.exec(photoUrl);
  return match ? new ObjectId(match[1]) : null;
}

async function deleteProfilePhoto(bucket, fileId) {
  try {
    await bucket.delete(fileId);
  } catch (error) {
    console.error('[ProfilePhotoUpload] Failed to remove stored image', {
      fileId: fileId.toHexString(),
      errorName: error?.name || 'Error',
    });
  }
}

/**
 * Format internal MongoDB user document to clean public JSON
 */
function formatUserResponse(doc) {
  if (!doc) return null;
  return {
    firebaseUid: doc.firebaseUid,
    firebaseProjectId: doc.firebaseProjectId || null,
    email: doc.email || '',
    name: doc.name || '',
    photoUrl: doc.photoUrl || null,
    profilePhotoUrl: doc.photoUrl || null,
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
    const { uid, email, name, provider, firebaseProjectId } = req.user;
<<<<<<< HEAD

    const filter = { firebaseUid: uid };
=======
    const filter = getUserIdentityFilter(req.user);
>>>>>>> 4a69327 (fsb)

    const setFields = {
      updatedAt: new Date(),
      firebaseProjectId
    };

    if (email) setFields.email = email;
    if (name) setFields.name = name;
    if (provider) setFields.provider = provider;
    if (firebaseProjectId) {
      setFields.firebaseProjectId = firebaseProjectId;
    }

    const update = {
      $setOnInsert: {
        firebaseUid: uid,
        role: 'customer',
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
<<<<<<< HEAD
    const { uid } = req.user;

    const user = await db.collection('users').findOne({ firebaseUid: uid });

=======
    const user = await db.collection('users').findOne(getUserIdentityFilter(req.user));
>>>>>>> 4a69327 (fsb)
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
    const { uid, firebaseProjectId } = req.user;

    const { name, age, gender, height, weight, profile, photoUrl, profilePhotoUrl } = req.body || {};

    const inputName = name !== undefined ? name : profile?.name;
    const inputAge = age !== undefined ? age : profile?.age;
    const inputGender = gender !== undefined ? gender : profile?.gender;
    const inputHeight = height !== undefined ? height : profile?.height;
    const inputWeight = weight !== undefined ? weight : profile?.weight;
    const inputPhotoUrl = photoUrl || profilePhotoUrl;

    const updateFields = {
      updatedAt: new Date()
    };

    let hasFieldsToUpdate = false;

    if (inputPhotoUrl !== undefined && inputPhotoUrl !== null) {
      updateFields.photoUrl = inputPhotoUrl;
      hasFieldsToUpdate = true;
    }

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
      getUserIdentityFilter(req.user),
      { $set: { ...updateFields, firebaseProjectId } },
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

/**
 * @route   PATCH /api/users/me/photo
 * @desc    Upload or update profile photo
 * @access  Private (Requires Firebase ID Token)
 */
const uploadProfilePhoto = async (req, res, next) => {
  let uploadedFileId = null;
  let photoBucket = null;
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'A profile photo in the "photo" field is required.',
      });
    }

    const detectedMimeType = detectProfilePhotoMime(file.buffer);
    if (
      !detectedMimeType
      || detectedMimeType !== file.mimetype
      || !PROFILE_PHOTO_MIME_TYPES.has(detectedMimeType)
    ) {
      return res.status(415).json({
        success: false,
        message: 'The uploaded file is not a supported JPEG, PNG, or WebP image.',
      });
    }

    const db = getDb();
    photoBucket = new GridFSBucket(db, { bucketName: PROFILE_PHOTO_BUCKET });
    const identityFilter = getUserIdentityFilter(req.user);
    const previousUser = await db.collection('users').findOne(identityFilter, {
      projection: { photoUrl: 1 },
    });
    const uploadStream = photoBucket.openUploadStream(`profile-photo-${randomUUID()}`, {
      metadata: { contentType: detectedMimeType },
    });
    uploadedFileId = uploadStream.id;
    await pipeline(Readable.from([file.buffer]), uploadStream);

    const photoUrl = `/api/users/photos/${uploadedFileId.toHexString()}`;

    const { uid, email, name, provider, firebaseProjectId } = req.user;
    const update = {
      $setOnInsert: {
        firebaseUid: uid,
        role: 'customer',
        createdAt: new Date(),
        profile: {
          age: null,
          gender: null,
          height: null,
          weight: null
        }
      },
      $set: {
        photoUrl,
        firebaseProjectId,
        updatedAt: new Date()
      }
    };
    if (email) update.$setOnInsert.email = email;
    if (name) update.$setOnInsert.name = name;
    if (provider) update.$setOnInsert.provider = provider;

    const options = { upsert: true, returnDocument: 'after' };
    const user = await db.collection('users').findOneAndUpdate(identityFilter, update, options);

    if (!user) {
      await deleteProfilePhoto(photoBucket, uploadedFileId);
      uploadedFileId = null;
      return res.status(404).json({
        success: false,
        message: 'User profile not found.',
      });
    }

    const previousPhotoId = getStoredProfilePhotoId(previousUser?.photoUrl);
    const currentPhotoId = new ObjectId(photoUrl.split('/').pop());
    uploadedFileId = null;

    if (previousPhotoId && !previousPhotoId.equals(currentPhotoId)) {
      await deleteProfilePhoto(photoBucket, previousPhotoId);
    }

    return res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully.',
      photoUrl,
      user: formatUserResponse(user),
    });
  } catch (error) {
    if (uploadedFileId) {
      if (photoBucket) await deleteProfilePhoto(photoBucket, uploadedFileId);
    }
    next(error);
  }
};

const getProfilePhoto = async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Profile photo not found.' });
    }

    const db = getDb();
    const bucket = new GridFSBucket(db, { bucketName: PROFILE_PHOTO_BUCKET });
    const fileId = new ObjectId(req.params.id);
    const [file] = await bucket.find({ _id: fileId }).limit(1).toArray();
    if (!file || !PROFILE_PHOTO_MIME_TYPES.has(file.metadata?.contentType)) {
      return res.status(404).json({ success: false, message: 'Profile photo not found.' });
    }

    res.set({
      'Content-Type': file.metadata.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    bucket.openDownloadStream(fileId).on('error', (error) => {
      if (res.headersSent) {
        res.destroy(error);
        return;
      }
      next(error);
    }).pipe(res);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createOrUpdateUser,
  getCurrentUser,
  updateUserProfile,
  uploadProfilePhoto,
  getProfilePhoto,
  detectProfilePhotoMime,
};
