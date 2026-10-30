import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';

const records = new Map();
const primaryProjectId = 'sellerportal-2786c';

function clone(value) {
  if (value instanceof ObjectId) return new ObjectId(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((clause) => matches(document, clause));
    const actual = document[key];
    if (expected instanceof RegExp) {
      return Array.isArray(actual)
        ? actual.some((value) => expected.test(String(value)))
        : expected.test(String(actual || ''));
    }
    if (expected && typeof expected === 'object'
      && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      if ('$in' in expected) return expected.$in.includes(actual);
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
      if ('$regex' in expected) {
        const expression = new RegExp(expected.$regex, expected.$options || '');
        return Array.isArray(actual)
          ? actual.some((value) => expression.test(String(value)))
          : expression.test(String(actual || ''));
      }
    }
    if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();
    }
    if (Array.isArray(actual) && typeof expected === 'string') return actual.includes(expected);
    if (actual instanceof ObjectId || expected instanceof ObjectId) {
      return String(actual) === String(expected);
    }
    return actual === expected;
  });
}

class Collection {
  constructor(name) {
    this.name = name;
    if (!records.has(name)) records.set(name, []);
  }

  items() {
    return records.get(this.name);
  }

  async findOne(query) {
    const document = this.items().find((item) => matches(item, query));
    return document ? clone(document) : null;
  }

  async insertOne(document) {
    const stored = clone(document);
    stored._id ||= new ObjectId();
    this.items().push(stored);
    return { insertedId: stored._id };
  }

  async findOneAndUpdate(query, update, options = {}) {
    let document = this.items().find((item) => matches(item, query));
    if (!document && options.upsert) {
      const identity = update.$setOnInsert || {};
      if (this.items().some((item) => (
        item.firebaseProjectId === identity.firebaseProjectId
        && item.firebaseUid === identity.firebaseUid
      ))) {
        const error = new Error('Duplicate key.');
        error.code = 11000;
        throw error;
      }
      document = { _id: new ObjectId(), ...clone(identity) };
      this.items().push(document);
    }
    if (!document) return null;
    Object.assign(document, clone(update.$set || {}));
    for (const [field, amount] of Object.entries(update.$inc || {})) {
      document[field] = (document[field] || 0) + amount;
    }
    for (const [field, value] of Object.entries(update.$push || {})) {
      document[field] ||= [];
      document[field].push(clone(value));
    }
    return clone(document);
  }

  async countDocuments(query) {
    return this.items().filter((item) => matches(item, query)).length;
  }

  find(query) {
    let documents = this.items().filter((item) => matches(item, query));
    const cursor = {
      sort(specification) {
        const fields = Object.entries(specification);
        documents = [...documents].sort((left, right) => {
          for (const [field, direction] of fields) {
            if (left[field] === right[field]) continue;
            return (left[field] > right[field] ? 1 : -1) * direction;
          }
          return 0;
        });
        return cursor;
      },
      skip(count) {
        documents = documents.slice(count);
        return cursor;
      },
      limit(count) {
        documents = documents.slice(0, count);
        return cursor;
      },
      async toArray() {
        return clone(documents);
      },
    };
    return cursor;
  }
}

const claims = {
  doctor: {
    uid: 'doctor-a',
    name: 'Dr. Doctor A',
    email: 'doctor@example.test',
    email_verified: true,
    aud: primaryProjectId,
    iss: `https://securetoken.google.com/${primaryProjectId}`,
  },
  other: {
    uid: 'doctor-b',
    name: 'Dr. Doctor B',
    email: 'other@example.test',
    email_verified: true,
    aud: primaryProjectId,
    iss: `https://securetoken.google.com/${primaryProjectId}`,
  },
  unverified: {
    uid: 'unverified-doctor',
    email: 'unverified@example.test',
    email_verified: false,
    aud: primaryProjectId,
    iss: `https://securetoken.google.com/${primaryProjectId}`,
  },
  admin: {
    uid: 'admin',
    name: 'Administrator',
    email: 'admin@example.test',
    email_verified: true,
    aud: primaryProjectId,
    iss: `https://securetoken.google.com/${primaryProjectId}`,
  },
  android: {
    uid: 'doctor-a',
    email: 'doctor@example.test',
    email_verified: true,
    aud: 'project-fitness-species',
    iss: 'https://securetoken.google.com/project-fitness-species',
  },
};

function makeApp(adminUids = ['admin']) {
  const db = { collection: (name) => new Collection(name) };
  return createApp({
    getDb: () => db,
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => {
      if (token === 'expired') {
        const error = new Error('Token expired.');
        error.code = 'auth/id-token-expired';
        throw error;
      }
      if (!claims[token]) throw new Error('Invalid token.');
      return claims[token];
    },
    primaryFirebaseProjectId: primaryProjectId,
    adminUids,
  });
}

function authorized(app, token = 'doctor') {
  const send = (method, path, body) => {
    let req = request(app)[method](path).set('Authorization', `Bearer ${token}`);
    if (body !== undefined) req = req.send(body);
    return req;
  };
  return {
    get: (path) => send('get', path),
    put: (path, body) => send('put', path, body),
    post: (path, body = {}) => send('post', path, body),
    patch: (path, body) => send('patch', path, body),
  };
}

function profile(overrides = {}) {
  return {
    fullName: 'Dr. Doctor A',
    phone: '+91 9876543210',
    medicalRegistrationNumber: 'MCI-12345',
    medicalCouncil: 'Maharashtra Medical Council',
    qualifications: [{
      qualification: 'MBBS',
      institution: 'Pune Medical College',
      graduationYear: 2012,
    }],
    primarySpecialty: 'Cardiology',
    additionalSpecialties: ['Internal Medicine'],
    yearsExperience: 12,
    clinicName: 'Fitness Species Clinic',
    clinicAddress: '10 Market Road',
    city: 'Pune',
    state: 'Maharashtra',
    postalCode: '411001',
    consultationMode: 'both',
    workingDays: ['monday', 'wednesday', 'friday'],
    openingTime: '09:00',
    closingTime: '17:00',
    timeZone: 'Asia/Kolkata',
    breaks: [{ startTime: '13:00', endTime: '14:00' }],
    appointmentDurationMinutes: 30,
    dailyAppointmentLimit: 16,
    consultationFee: 800,
    currency: 'INR',
    ...overrides,
  };
}

async function createSubmittedDoctor(app, token = 'doctor') {
  const draft = await authorized(app, token).put('/api/doctors/me', profile());
  assert.equal(draft.status, 200);
  const submitted = await authorized(app, token).post('/api/doctors/me/submit');
  assert.equal(submitted.status, 200);
  return submitted.body.doctor;
}

beforeEach(() => records.clear());

test('doctor routes reject missing, invalid, expired, and wrong-project credentials', async () => {
  const app = makeApp();
  assert.equal((await request(app).get('/api/doctors/me')).status, 401);
  assert.equal((await authorized(app, 'invalid').get('/api/doctors/me')).status, 401);
  assert.equal((await authorized(app, 'expired').get('/api/doctors/me')).body.code, 'TOKEN_EXPIRED');
  assert.equal((await authorized(app, 'android').get('/api/doctors/me')).status, 401);
});

test('doctor draft is server-owned, protected from client overrides, and isolated by account', async () => {
  const app = makeApp();
  const forged = await authorized(app).put('/api/doctors/me', {
    ...profile(),
    firebaseUid: 'doctor-b',
    firebaseProjectId: 'other-project',
    role: 'admin',
    status: 'approved',
    reviewerUid: 'doctor',
    professionalEmail: 'attacker@example.test',
    aadhaarNumber: 'not-collected',
  });
  assert.equal(forged.status, 400);

  const saved = await authorized(app).put('/api/doctors/me', profile());
  assert.equal(saved.status, 200);
  assert.equal(saved.body.doctor.status, 'draft');
  assert.equal(saved.body.doctor.firebaseUid, undefined);
  assert.equal(saved.body.doctor.professionalEmail, claims.doctor.email);

  const otherAccount = await authorized(app, 'other').get('/api/doctors/me');
  assert.equal(otherAccount.status, 404);
  const otherDraft = await authorized(app, 'other').put('/api/doctors/me', profile({
    fullName: 'Dr. Doctor B',
  }));
  assert.equal(otherDraft.status, 200);
  assert.equal(otherDraft.body.doctor.fullName, 'Dr. Doctor B');
  assert.equal(records.get('doctorApplications').length, 2);
});

test('draft and submission validate required fields and availability', async () => {
  const app = makeApp();
  assert.equal((await authorized(app).put('/api/doctors/me', {})).status, 400);
  assert.equal((await authorized(app).put('/api/doctors/me', {
    openingTime: '18:00',
    closingTime: '09:00',
  })).status, 400);
  assert.equal((await authorized(app).put('/api/doctors/me', {
    workingDays: ['monday', 'monday'],
  })).status, 400);
  assert.equal((await authorized(app).put('/api/doctors/me', {
    breaks: [{ startTime: '12:00', endTime: '13:00' }],
    openingTime: '09:00',
    closingTime: '11:00',
  })).status, 400);

  await authorized(app).put('/api/doctors/me', { phone: '+91 9876543210' });
  const incomplete = await authorized(app).post('/api/doctors/me/submit');
  assert.equal(incomplete.status, 400);
  assert.equal(incomplete.body.success, false);
});

test('verified Firebase email is required to submit a profile', async () => {
  const app = makeApp();
  await authorized(app, 'unverified').put('/api/doctors/me', profile());
  const submitted = await authorized(app, 'unverified').post('/api/doctors/me/submit');
  assert.equal(submitted.status, 403);
  assert.equal(submitted.body.code, 'VERIFIED_EMAIL_REQUIRED');
});

test('every doctor admin endpoint requires an allowlisted administrator', async () => {
  const app = makeApp();
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  assert.equal((await authorized(app).get('/api/admin/doctors')).status, 403);
  assert.equal((await authorized(app).get(`/api/admin/doctors/${id}`)).status, 403);
  assert.equal((await authorized(app).patch(`/api/admin/doctors/${id}/review`, {
    status: 'approved',
  })).status, 403);
});

test('admins review applications with notes, audit decisions, suspend, and reactivate', async () => {
  const app = makeApp();
  const pending = await createSubmittedDoctor(app);

  assert.equal((await authorized(app, 'admin').get('/api/admin/doctors')).body.count, 1);
  const missingNote = await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${pending.id}/review`, { status: 'changes_requested' });
  assert.equal(missingNote.status, 400);

  const requestedChanges = await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${pending.id}/review`, {
      status: 'changes_requested',
      reviewNote: 'Please clarify clinic availability.',
    });
  assert.equal(requestedChanges.status, 200);
  assert.equal(requestedChanges.body.doctor.status, 'changes_requested');

  const update = await authorized(app).put('/api/doctors/me', profile({
    dailyAppointmentLimit: 18,
  }));
  assert.equal(update.status, 200);
  assert.equal(update.body.doctor.status, 'changes_requested');
  assert.equal((await authorized(app).post('/api/doctors/me/submit')).status, 200);

  const doctor = await authorized(app).get('/api/doctors/me');
  const approval = await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${doctor.body.doctor.id}/review`, { status: 'approved' });
  assert.equal(approval.status, 200);
  assert.equal(approval.body.doctor.reviewHistory.length, 2);
  assert.equal(approval.body.doctor.reviewHistory[0].reviewerUid, 'admin');
  assert.equal((await authorized(app).put('/api/doctors/me', profile())).status, 409);

  const suspended = await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${doctor.body.doctor.id}/review`, {
      status: 'suspended',
      reviewNote: 'Temporary suspension for review.',
    });
  assert.equal(suspended.status, 200);
  assert.equal((await request(app).get(`/api/doctors/${doctor.body.doctor.id}`)).status, 404);

  const reactivated = await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${doctor.body.doctor.id}/review`, { status: 'approved' });
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.doctor.status, 'approved');
  assert.equal(reactivated.body.doctor.reviewHistory.length, 4);
});

test('rejected applications cannot be resubmitted or edited by the doctor', async () => {
  const app = makeApp();
  const pending = await createSubmittedDoctor(app);
  const rejected = await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${pending.id}/review`, {
      status: 'rejected',
      reviewNote: 'Registration information could not be verified.',
    });
  assert.equal(rejected.status, 200);
  assert.equal((await authorized(app).put('/api/doctors/me', profile())).status, 409);
  const submit = await authorized(app).post('/api/doctors/me/submit');
  assert.equal(submit.status, 409);
  assert.match(submit.body.message, /cannot be resubmitted/i);
  const invalidTransition = await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${pending.id}/review`, { status: 'approved' });
  assert.equal(invalidTransition.status, 409);
});

test('public directory filters approved doctors and excludes protected profile fields', async () => {
  const app = makeApp();
  const pending = await createSubmittedDoctor(app);
  assert.equal((await request(app).get('/api/doctors')).body.total, 0);
  assert.equal((await request(app).get(`/api/doctors/${pending.id}`)).status, 404);

  await authorized(app, 'admin')
    .patch(`/api/admin/doctors/${pending.id}/review`, { status: 'approved' });
  const directory = await request(app).get('/api/doctors?specialty=internal%20medicine&city=pune');
  assert.equal(directory.status, 200);
  assert.equal(directory.body.total, 1);
  const doctor = directory.body.doctors[0];
  assert.equal(doctor.fullName, 'Dr. Doctor A');
  for (const key of [
    'medicalRegistrationNumber',
    'professionalEmail',
    'phone',
    'firebaseUid',
    'firebaseProjectId',
    'reviewNote',
    'reviewedBy',
    'reviewHistory',
    'status',
  ]) {
    assert.equal(key in doctor, false, `Public response must omit ${key}.`);
  }

  const detail = await request(app).get(`/api/doctors/${pending.id}`);
  assert.equal(detail.status, 200);
  assert.equal('medicalRegistrationNumber' in detail.body.doctor, false);
});
