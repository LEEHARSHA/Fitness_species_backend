const multer = require('multer');

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const receiveProfilePhoto = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 0,
  },
  fileFilter(_req, file, callback) {
    if (!acceptedMimeTypes.has(file.mimetype)) {
      const error = new Error('Profile photo must be a JPEG, PNG, or WebP image.');
      error.statusCode = 415;
      callback(error);
      return;
    }
    callback(null, true);
  },
}).single('photo');

function parseProfilePhotoUpload(req, res, next) {
  receiveProfilePhoto(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({
        success: false,
        message: status === 413
          ? 'Profile photo must be 5 MB or smaller.'
          : 'Upload exactly one image in the "photo" field.',
      });
      return;
    }

    if (error.statusCode === 415) {
      res.status(415).json({ success: false, message: error.message });
      return;
    }

    next(error);
  });
}

module.exports = { parseProfilePhotoUpload };
