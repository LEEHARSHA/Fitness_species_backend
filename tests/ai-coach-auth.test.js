import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

const ANDROID_PROJECT_ID = 'project-fitness-species';
const PRIMARY_PROJECT_ID = 'sellerportal-2786c';

function createAuthTestApp(supportedFirebaseProjectIds = [PRIMARY_PROJECT_ID]) {
  return createApp({
    getDbStatus: () => 'connected',
    verifyIdToken: async () => ({
      uid: 'android-user',
      aud: ANDROID_PROJECT_ID,
      iss: `https://securetoken.google.com/${ANDROID_PROJECT_ID}`,
    }),
    primaryFirebaseProjectId: PRIMARY_PROJECT_ID,
    supportedFirebaseProjectIds,
  });
}

test('AI Coach accepts Android Firebase tokens only when its project is configured', async () => {
  const enabledApp = createAuthTestApp([PRIMARY_PROJECT_ID, ANDROID_PROJECT_ID]);
  const enabledResponse = await request(enabledApp)
    .post('/api/ai-coach/chat')
    .set('Authorization', 'Bearer unit-test-token')
    .send({ message: '' });

  assert.equal(enabledResponse.status, 400);
  assert.equal(enabledResponse.body.message, 'Message text is required.');

  const disabledApp = createAuthTestApp([PRIMARY_PROJECT_ID]);
  const disabledResponse = await request(disabledApp)
    .post('/api/ai-coach/chat')
    .set('Authorization', 'Bearer unit-test-token')
    .send({ message: '' });

  assert.equal(disabledResponse.status, 401);
  assert.equal(disabledResponse.body.code, 'TOKEN_INVALID');
});
