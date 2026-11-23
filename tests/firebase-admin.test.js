import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createFirebaseIdTokenVerifier } = require('../src/config/firebase-admin.js');
const { getUserIdentityFilter } = require('../src/middleware/auth.middleware.js');
const PRIMARY_PROJECT_ID = 'sellerportal-2786c';
const ANDROID_PROJECT_ID = 'project-fitness-species';

function makeToken(claims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

test('Firebase verifier selects exactly the configured app matching the token audience', async () => {
  const apps = new Map([
    [PRIMARY_PROJECT_ID, { projectId: PRIMARY_PROJECT_ID }],
    [ANDROID_PROJECT_ID, { projectId: ANDROID_PROJECT_ID }],
  ]);
  const calls = [];
  const verify = createFirebaseIdTokenVerifier({
    getConfiguredProjectIds: () => [...apps.keys()],
    getAppForProject: (projectId) => apps.get(projectId),
    verifyToken: async (_token, app) => {
      calls.push(app.projectId);
      return {
        uid: 'same-uid',
        aud: app.projectId,
        iss: `https://securetoken.google.com/${app.projectId}`,
      };
    },
  });

  for (const projectId of [PRIMARY_PROJECT_ID, ANDROID_PROJECT_ID]) {
    const claims = {
      aud: projectId,
      iss: `https://securetoken.google.com/${projectId}`,
    };
    assert.equal((await verify(makeToken(claims))).aud, projectId);
  }
  assert.deepEqual(calls, [PRIMARY_PROJECT_ID, ANDROID_PROJECT_ID]);
});

test('Firebase verifier rejects untrusted or misissued audiences before token verification', async () => {
  let verifyCalls = 0;
  const verify = createFirebaseIdTokenVerifier({
    getConfiguredProjectIds: () => [PRIMARY_PROJECT_ID, ANDROID_PROJECT_ID],
    getAppForProject: () => ({}),
    verifyToken: async () => {
      verifyCalls += 1;
      return {};
    },
  });

  await assert.rejects(
    verify(makeToken({ aud: 'untrusted-project', iss: 'https://securetoken.google.com/untrusted-project' })),
    /untrusted project/,
  );
  await assert.rejects(
    verify(makeToken({ aud: ANDROID_PROJECT_ID, iss: `https://securetoken.google.com/${PRIMARY_PROJECT_ID}` })),
    /issuer does not match/,
  );
  assert.equal(verifyCalls, 0);
});

test('Firebase verifier rejects claims that do not match the selected verifier project', async () => {
  const verify = createFirebaseIdTokenVerifier({
    getConfiguredProjectIds: () => [PRIMARY_PROJECT_ID, ANDROID_PROJECT_ID],
    getAppForProject: () => ({}),
    verifyToken: async () => ({
      uid: 'same-uid',
      aud: PRIMARY_PROJECT_ID,
      iss: `https://securetoken.google.com/${PRIMARY_PROJECT_ID}`,
    }),
  });

  await assert.rejects(
    verify(makeToken({
      aud: ANDROID_PROJECT_ID,
      iss: `https://securetoken.google.com/${ANDROID_PROJECT_ID}`,
    })),
    /claims do not match/,
  );
});

test('Firebase user profile filters include project identity and preserve primary legacy records', () => {
  assert.deepEqual(getUserIdentityFilter({
    uid: 'shared-uid',
    firebaseProjectId: ANDROID_PROJECT_ID,
  }), {
    $and: [
      { firebaseUid: 'shared-uid' },
      { firebaseProjectId: ANDROID_PROJECT_ID },
    ],
  });
  assert.deepEqual(getUserIdentityFilter({
    uid: 'legacy-primary-user',
    firebaseProjectId: PRIMARY_PROJECT_ID,
  }), {
    $and: [
      { firebaseUid: 'legacy-primary-user' },
      {
        $or: [
          { firebaseProjectId: PRIMARY_PROJECT_ID },
          { firebaseProjectId: { $exists: false } },
        ],
      },
    ],
  });
});
