import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);
const { parseProfilePhotoUpload } = require('../src/middleware/profile-photo-upload.js');
const { detectProfilePhotoMime } = require('../src/controllers/user.controller.js');

function createUploadApp() {
  const app = express();
  app.patch('/photo', parseProfilePhotoUpload, (req, res) => {
    res.status(201).json({
      field: req.file.fieldname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });
  return app;
}

test('profile photo upload accepts one image in the photo multipart field', async () => {
  const response = await request(createUploadApp())
    .patch('/photo')
    .attach('photo', Buffer.from([0xff, 0xd8, 0xff]), {
      filename: 'profile.jpg',
      contentType: 'image/jpeg',
    });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, {
    field: 'photo',
    mimeType: 'image/jpeg',
    size: 3,
  });
});

test('profile photo upload rejects unsupported MIME types and unexpected field names', async () => {
  const unsupportedMime = await request(createUploadApp())
    .patch('/photo')
    .attach('photo', Buffer.from('not an image'), {
      filename: 'notes.txt',
      contentType: 'text/plain',
    });
  assert.equal(unsupportedMime.status, 415);

  const unexpectedField = await request(createUploadApp())
    .patch('/photo')
    .attach('image', Buffer.from([0xff, 0xd8, 0xff]), {
      filename: 'profile.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(unexpectedField.status, 400);
});

test('profile photo upload rejects files larger than 5 MB', async () => {
  const response = await request(createUploadApp())
    .patch('/photo')
    .attach('photo', Buffer.alloc(5 * 1024 * 1024 + 1), {
      filename: 'large.jpg',
      contentType: 'image/jpeg',
    });

  assert.equal(response.status, 413);
});

test('profile photo content signatures must match an accepted image type', () => {
  assert.equal(detectProfilePhotoMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(
    detectProfilePhotoMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    'image/png',
  );
  assert.equal(
    detectProfilePhotoMime(Buffer.from('RIFF0000WEBP')),
    'image/webp',
  );
  assert.equal(detectProfilePhotoMime(Buffer.from('not an image')), null);
});
