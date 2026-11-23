import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { requireFirebaseAuth } from '../src/marketplace/auth.js';

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

test('Firebase identities sharing a UID remain project-scoped', async () => {
  const claimsByToken = {
    'primary-token': {
      uid: 'shared-uid',
      aud: PRIMARY_PROJECT_ID,
      iss: `https://securetoken.google.com/${PRIMARY_PROJECT_ID}`,
    },
    'android-token': {
      uid: 'shared-uid',
      aud: ANDROID_PROJECT_ID,
      iss: `https://securetoken.google.com/${ANDROID_PROJECT_ID}`,
    },
  };
  const identities = [];

  for (const token of Object.keys(claimsByToken)) {
    const req = { get: () => `Bearer ${token}` };
    const res = {
      status() { return this; },
      json(body) { this.body = body; return this; },
    };
    await requireFirebaseAuth(
      async (receivedToken) => claimsByToken[receivedToken],
      [PRIMARY_PROJECT_ID, ANDROID_PROJECT_ID],
    )(req, res, () => {});
    identities.push(req.user);
  }

  assert.equal(identities[0].uid, identities[1].uid);
  assert.notEqual(identities[0].databaseUid, identities[1].databaseUid);
  assert.equal(identities[0].firebaseProjectId, PRIMARY_PROJECT_ID);
  assert.equal(identities[1].firebaseProjectId, ANDROID_PROJECT_ID);
});

test('Firebase auth middleware rejects an audience outside the explicit project allowlist', async () => {
  const req = { get: () => 'Bearer untrusted-token' };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  await requireFirebaseAuth(async () => ({
    uid: 'untrusted-user',
    aud: 'untrusted-project',
    iss: 'https://securetoken.google.com/untrusted-project',
  }), [PRIMARY_PROJECT_ID, ANDROID_PROJECT_ID])(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'TOKEN_INVALID');
});
