import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';

const records = new Map();

function clone(value) {
  if (value instanceof ObjectId) return new ObjectId(value);
  if (value instanceof Date) return new Date(value);
  if (value instanceof RegExp) return new RegExp(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function haversineKm([longitudeA, latitudeA], [longitudeB, latitudeB]) {
  const radians = (value) => (value * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 6378.1 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((clause) => matches(document, clause));
    if (key === '$and') return expected.every((clause) => matches(document, clause));
    const actual = document[key];
    if (expected instanceof RegExp) return expected.test(String(actual || ''));
    if (expected && typeof expected === 'object' && !(expected instanceof Date)
      && !(expected instanceof ObjectId) && !Array.isArray(expected)) {
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
      if ('$type' in expected && expected.$type === 'date' && !(actual instanceof Date)) return false;
      if ('$gte' in expected && actual < expected.$gte) return false;
      if ('$lte' in expected && actual > expected.$lte) return false;
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      if ('$in' in expected && !expected.$in.some((value) => String(value) === String(actual))) return false;
      if ('$geoWithin' in expected) {
        if (!actual?.coordinates) return false;
        const { $centerSphere: [center, radiusRadians] } = expected.$geoWithin;
        return haversineKm(center, actual.coordinates) <= radiusRadians * 6378.1;
      }
      if ('$near' in expected) {
        if (!actual?.coordinates) return false;
        const { coordinates: center } = expected.$near.$geometry;
        return haversineKm(center, actual.coordinates) * 1000 <= expected.$near.$maxDistance;
      }
      if (Object.keys(expected).some((key) => key.startsWith('$'))) return true;
      return matches(actual || {}, expected);
    }
    if (actual instanceof ObjectId || expected instanceof ObjectId) {
      return String(actual) === String(expected);
    }
    return actual instanceof Date && expected instanceof Date
      ? actual.getTime() === expected.getTime()
      : actual === expected;
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
    let found = this.items().find((item) => matches(item, query));
    if (!found && options.upsert) {
      found = { _id: new ObjectId() };
      for (const [key, value] of Object.entries(query)) {
        if (!key.startsWith('$')) found[key] = clone(value);
      }
      Object.assign(found, clone(update.$setOnInsert || {}));
      this.items().push(found);
    }
    if (!found) return null;
    Object.assign(found, clone(update.$set || {}));
    for (const [key, amount] of Object.entries(update.$inc || {})) {
      found[key] = (found[key] || 0) + amount;
    }
    return clone(found);
  }

  async updateOne(query, update) {
    const found = this.items().find((item) => matches(item, query));
    if (!found) return { matchedCount: 0 };
    Object.assign(found, clone(update.$set || {}));
    for (const [key, amount] of Object.entries(update.$inc || {})) {
      found[key] = (found[key] || 0) + amount;
    }
    return { matchedCount: 1 };
  }

  async countDocuments(query) {
    return this.items().filter((item) => matches(item, query)).length;
  }

  find(query) {
    let documents = this.items().filter((item) => matches(item, query));
    if (query.location?.$near) {
      const center = query.location.$near.$geometry.coordinates;
      documents.sort((left, right) => (
        haversineKm(center, left.location.coordinates)
        - haversineKm(center, right.location.coordinates)
      ));
    }
    const cursor = {
      sort(specification) {
        const [[field, direction]] = Object.entries(specification);
        documents = [...documents].sort((left, right) => (
          (left[field] > right[field] ? 1 : left[field] < right[field] ? -1 : 0) * direction
        ));
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
  'user-a': {
    uid: 'user-a',
    name: 'Organizer A',
    email: 'a@example.test',
    aud: 'sellerportal-2786c',
    iss: 'https://securetoken.google.com/sellerportal-2786c',
  },
  'user-b': {
    uid: 'user-b',
    name: 'Participant B',
    email: 'b@example.test',
    aud: 'sellerportal-2786c',
    iss: 'https://securetoken.google.com/sellerportal-2786c',
  },
  'android-user-b': {
    uid: 'user-b',
    name: 'Android Participant B',
    email: 'b.android@example.test',
    aud: 'project-fitness-species',
    iss: 'https://securetoken.google.com/project-fitness-species',
  },
  admin: {
    uid: 'admin',
    email: 'admin@example.test',
    aud: 'sellerportal-2786c',
    iss: 'https://securetoken.google.com/sellerportal-2786c',
  },
};

function makeApp(adminUids = ['admin']) {
  const db = { collection: (name) => new Collection(name) };
  return createApp({
    getDb: () => db,
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => {
      if (!claims[token]) throw new Error('Invalid token');
      return claims[token];
    },
    primaryFirebaseProjectId: 'sellerportal-2786c',
    supportedFirebaseProjectIds: ['sellerportal-2786c', 'project-fitness-species'],
    adminUids,
  });
}

function auth(app, token = 'user-a') {
  return {
    get: (path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path) => request(app).post(path).set('Authorization', `Bearer ${token}`),
    patch: (path) => request(app).patch(path).set('Authorization', `Bearer ${token}`),
    delete: (path) => request(app).delete(path).set('Authorization', `Bearer ${token}`),
  };
}

function application(overrides = {}) {
  return {
    type: 'organization',
    organizationName: 'Pune Running Club',
    organizationType: 'Fitness club',
    contactName: 'Organizer A',
    phone: '+91 9876543210',
    address: '10 Market Road',
    city: 'Pune',
    description: 'We organize inclusive running events for our local community.',
    ...overrides,
  };
}

function eventPayload(overrides = {}) {
  const startAt = new Date(Date.now() + 7 * 86400000);
  const endAt = new Date(startAt.getTime() + 2 * 3600000);
  return {
    title: 'Pune Community Run',
    description: 'A community run welcoming participants of all fitness levels.',
    category: 'running',
    coverImageUrl: 'https://images.example.test/community-run.jpg',
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    timeZone: 'Asia/Kolkata',
    venueType: 'in_person',
    venueName: 'Riverfront Park',
    address: '10 Riverside Road',
    city: 'Pune',
    postalCode: '411001',
    latitude: 18.5204,
    longitude: 73.8567,
    capacity: 10,
    pricingType: 'free',
    currency: 'INR',
    ...overrides,
  };
}

async function approvedOrganizer(app) {
  const applicationResponse = await auth(app).post('/api/community/organizers/apply').send(application());
  assert.equal(applicationResponse.status, 201);
  const approval = await auth(app, 'admin')
    .patch('/api/community/admin/organizers/user-a/review')
    .send({ status: 'approved' });
  assert.equal(approval.status, 200);
}

async function approvedEvent(app, payload = eventPayload()) {
  const organizer = await auth(app).get('/api/community/organizers/me');
  if (organizer.status === 404) await approvedOrganizer(app);
  const created = await auth(app).post('/api/community/events').send(payload);
  assert.equal(created.status, 201);
  const submitted = await auth(app).post(`/api/community/events/${created.body.event.id}/submit`);
  assert.equal(submitted.status, 200);
  const approved = await auth(app, 'admin')
    .patch(`/api/community/admin/events/${created.body.event.id}/review`)
    .send({ status: 'approved' });
  assert.equal(approved.status, 200);
  return approved.body.event;
}

beforeEach(() => {
  records.clear();
  process.env.FIREBASE_PROJECT_ID = 'sellerportal-2786c';
});

test('public discovery is available without auth and returns no invented events', async () => {
  const response = await request(makeApp()).get('/api/community/events');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.deepEqual(response.body.events, []);
});

test('applications validate input and pending organizers cannot create events', async () => {
  const app = makeApp();
  assert.equal((await auth(app).post('/api/community/organizers/apply').send({
    ...application(),
    phone: '',
  })).status, 400);

  const submitted = await auth(app).post('/api/community/organizers/apply').send(application());
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.organizer.status, 'pending');
  assert.equal((await auth(app).post('/api/community/events').send(eventPayload())).status, 403);
  assert.equal((await auth(app).get('/api/community/organizers/me')).status, 200);
});

test('community moderation routes deny non-admin Firebase users', async () => {
  const app = makeApp();
  const response = await auth(app).get('/api/community/admin/organizers?status=pending');
  assert.equal(response.status, 403);
});

test('approved organizers create drafts, events stay hidden until admin approval', async () => {
  const app = makeApp();
  await approvedOrganizer(app);
  const created = await auth(app).post('/api/community/events').send(eventPayload());
  assert.equal(created.status, 201);
  assert.equal(created.body.event.status, 'draft');
  assert.equal((await request(app).get('/api/community/events')).body.total, 0);
  assert.equal((await request(app).get(`/api/community/events/${created.body.event.id}`)).status, 404);

  const submitted = await auth(app).post(`/api/community/events/${created.body.event.id}/submit`);
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.event.status, 'pending_review');
  const pendingEvent = records.get('communityEvents')
    .find((event) => String(event._id) === created.body.event.id);
  assert.equal(pendingEvent.status, 'pending_review');
  assert.equal(pendingEvent.publishedAt, null);
  const pendingQueue = await auth(app, 'admin').get('/api/community/admin/events');
  assert.equal(pendingQueue.status, 200);
  assert.equal(pendingQueue.body.count, 1);
  assert.equal(pendingQueue.body.events[0].id, created.body.event.id);
  assert.equal(pendingQueue.body.events[0].status, 'pending_review');

  const approval = await auth(app, 'admin')
    .patch(`/api/community/admin/events/${created.body.event.id}/review`)
    .send({ status: 'approved' });
  assert.equal(approval.status, 200);
  assert.equal(approval.body.event.status, 'approved');
  assert.ok(approval.body.event.publishedAt);
  assert.equal(approval.body.event.reviewNote, null);
  assert.equal(pendingEvent.reviewedBy, 'admin');
  assert.ok(pendingEvent.reviewedAt instanceof Date);
  assert.ok(pendingEvent.publishedAt instanceof Date);

  const publicList = await request(app).get('/api/community/events');
  assert.equal(publicList.status, 200);
  assert.equal(publicList.body.total, 1);
  assert.equal(publicList.body.events[0].organizer.verified, true);
  assert.equal('organizerUid' in publicList.body.events[0], false);
  assert.equal('email' in publicList.body.events[0].organizer, false);

  const detail = await request(app).get(`/api/community/events/${created.body.event.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.event.status, 'approved');
});

test('public discovery excludes approved events without a publication timestamp', async () => {
  const app = makeApp();
  const event = await approvedEvent(app);
  const storedEvent = records.get('communityEvents')
    .find((record) => String(record._id) === event.id);
  storedEvent.publishedAt = null;

  const publicList = await request(app).get('/api/community/events');
  assert.equal(publicList.status, 200);
  assert.equal(publicList.body.total, 0);
  assert.deepEqual(publicList.body.events, []);
  assert.equal((await request(app).get(`/api/community/events/${event.id}`)).status, 404);
});

test('organizers cannot modify each other’s events and approved edits return to review', async () => {
  const app = makeApp();
  const event = await approvedEvent(app);
  const otherUserEdit = await auth(app, 'user-b')
    .patch(`/api/community/events/${event.id}`)
    .send({ title: 'Changed by another user' });
  assert.equal(otherUserEdit.status, 404);

  const edited = await auth(app).patch(`/api/community/events/${event.id}`)
    .send({ title: 'Updated Pune Community Run' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.event.status, 'pending_review');
  assert.equal((await request(app).get(`/api/community/events/${event.id}`)).status, 404);
});

test('paid events require a positive price and external instructions', async () => {
  const app = makeApp();
  await approvedOrganizer(app);
  const missingPrice = await auth(app).post('/api/community/events').send(eventPayload({
    pricingType: 'paid',
    instructions: 'Register at the venue.',
  }));
  assert.equal(missingPrice.status, 400);

  const missingInstructions = await auth(app).post('/api/community/events').send(eventPayload({
    pricingType: 'paid',
    amount: 500,
  }));
  assert.equal(missingInstructions.status, 400);

  const validPaid = await auth(app).post('/api/community/events').send(eventPayload({
    pricingType: 'paid',
    amount: 500,
    externalRegistrationUrl: 'https://tickets.example.test/run',
  }));
  assert.equal(validPaid.status, 201);

  const pastStart = await auth(app).post('/api/community/events').send(eventPayload({
    startAt: new Date(Date.now() - 86400000).toISOString(),
    endAt: new Date(Date.now() - 82800000).toISOString(),
  }));
  assert.equal(pastStart.status, 400);
});

test('nearby discovery filters by server-side radius and excludes unpublished records', async () => {
  const app = makeApp();
  const nearby = await approvedEvent(app);
  const nearbySecond = await approvedEvent(app, eventPayload({
    title: 'Nearby Trail Walk',
    latitude: 18.6,
    longitude: 73.8567,
  }));
  const far = await approvedEvent(app, eventPayload({
    title: 'Distant City Run',
    city: 'Mumbai',
    latitude: 19.076,
    longitude: 72.8777,
  }));

  const response = await request(app).get('/api/community/events')
    .query({ latitude: 18.5204, longitude: 73.8567, radiusKm: 50, sortBy: 'distance' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.events.map((event) => event.id), [nearby.id, nearbySecond.id]);
  assert.equal(response.body.events.some((event) => event.id === far.id), false);
});

test('registration requires contact details and persists verified user identity', async () => {
  const app = makeApp();
  const event = await approvedEvent(app);
  const registrationPath = `/api/community/events/${event.id}/registrations`;
  const missingPhone = await auth(app, 'user-b').post(registrationPath).send({});
  assert.equal(missingPhone.status, 400);
  assert.equal(missingPhone.body.code, 'CONTACT_DETAILS_REQUIRED');

  const invalidEmail = await auth(app, 'user-b').post(registrationPath).send({
    email: 'not-an-email',
    phone: '+91 9876543210',
  });
  assert.equal(invalidEmail.status, 400);
  const invalidPhone = await auth(app, 'user-b').post(registrationPath).send({
    phone: '123',
  });
  assert.equal(invalidPhone.status, 400);

  const registered = await auth(app, 'user-b').post(registrationPath).send({
    phone: '+91 9876543210',
  });
  assert.equal(registered.status, 201);
  const stored = records.get('communityRegistrations')[0];
  assert.equal(stored.participantUid, 'user-b');
  assert.equal(stored.participantName, 'Participant B');
  assert.equal(stored.email, 'b@example.test');
  assert.equal(stored.phone, '+91 9876543210');
});

test('registration enforces duplicate and capacity limits and exposes participant data only to the owner', async () => {
  const app = makeApp();
  const event = await approvedEvent(app, eventPayload({ capacity: 1 }));
  const registrationPath = `/api/community/events/${event.id}/registrations`;
  const contactDetails = {
    participantName: 'Participant B',
    email: 'b@example.test',
    phone: '+91 9876543210',
  };
  const first = await auth(app, 'user-b').post(registrationPath).send(contactDetails);
  assert.equal(first.status, 201);
  assert.equal(first.body.registration.status, 'registered');
  const mine = await auth(app, 'user-b').get(`${registrationPath}/me`);
  assert.equal(mine.status, 200);
  assert.equal(mine.body.registration.status, 'registered');

  const duplicate = await auth(app, 'user-b').post(registrationPath).send(contactDetails);
  assert.equal(duplicate.status, 409);
  const full = await auth(app).post(registrationPath).send({
    participantName: 'Organizer A',
    email: 'a@example.test',
    phone: '+91 9876543211',
  });
  assert.equal(full.status, 409);

  const emptyList = await auth(app).get(`/api/community/events/${(await approvedEvent(app)).id}/registrations`);
  assert.equal(emptyList.status, 200);
  assert.equal(emptyList.body.total, 0);

  const organizerList = await auth(app).get(`${registrationPath}`);
  assert.equal(organizerList.status, 200);
  assert.equal(organizerList.body.registrations.length, 1);
  assert.deepEqual(Object.keys(organizerList.body.registrations[0]).sort(), [
    'email',
    'id',
    'participantName',
    'phone',
    'registeredAt',
    'status',
  ]);
  assert.equal(organizerList.body.registrations[0].email, 'b@example.test');
  assert.equal(organizerList.body.registrations[0].phone, '+91 9876543210');
  assert.equal(
    (await auth(app, 'user-b').get(`${registrationPath}`)).status,
    404,
  );

  const participantHistory = await auth(app, 'user-b').get('/api/community/registrations/mine');
  assert.equal(participantHistory.status, 200);
  assert.equal(participantHistory.body.registrations.length, 1);
  assert.equal(participantHistory.body.registrations[0].event.id, event.id);

  const cancelled = await auth(app, 'user-b').delete(`${registrationPath}/me`);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.registration.status, 'cancelled');
  const historyAfterCancellation = await auth(app, 'user-b').get('/api/community/registrations/mine');
  assert.equal(historyAfterCancellation.body.registrations[0].status, 'cancelled');
  const reopenedCapacity = await auth(app).post(registrationPath).send({
    participantName: 'Organizer A',
    email: 'a@example.test',
    phone: '+91 9876543211',
  });
  assert.equal(reopenedCapacity.status, 201);
});

test('registration rejects nonexistent and approved-but-unpublished events', async () => {
  const app = makeApp();
  const missing = await auth(app, 'user-b')
    .post('/api/community/events/64b000000000000000000000/registrations')
    .send({ participantName: 'Participant B', email: 'b@example.test', phone: '+91 9876543210' });
  assert.equal(missing.status, 404);

  const event = await approvedEvent(app);
  const storedEvent = records.get('communityEvents')
    .find((record) => String(record._id) === event.id);
  storedEvent.publishedAt = null;
  const unpublished = await auth(app, 'user-b')
    .post(`/api/community/events/${event.id}/registrations`)
    .send({ participantName: 'Participant B', email: 'b@example.test', phone: '+91 9876543210' });
  assert.equal(unpublished.status, 404);
});

test('secondary Firebase participants are isolated by project and cannot use organizer or admin routes', async () => {
  const app = makeApp();
  const event = await approvedEvent(app);
  const registrationPath = `/api/community/events/${event.id}/registrations`;
  const primaryRegistration = await auth(app, 'user-b').post(registrationPath).send({
    phone: '+91 9876543210',
  });
  assert.equal(primaryRegistration.status, 201);

  const secondaryRegistration = await auth(app, 'android-user-b').post(registrationPath).send({
    phone: '+91 9876543211',
  });
  assert.equal(secondaryRegistration.status, 201);
  assert.deepEqual(
    records.get('communityRegistrations')
      .map(({ participantUid, participantProjectId }) => ({ participantUid, participantProjectId }))
      .sort((left, right) => left.participantProjectId.localeCompare(right.participantProjectId)),
    [
      { participantUid: 'user-b', participantProjectId: 'project-fitness-species' },
      { participantUid: 'user-b', participantProjectId: 'sellerportal-2786c' },
    ],
  );

  const primaryHistory = await auth(app, 'user-b').get('/api/community/registrations/mine');
  const secondaryHistory = await auth(app, 'android-user-b').get('/api/community/registrations/mine');
  assert.equal(primaryHistory.body.total, 1);
  assert.equal(secondaryHistory.body.total, 1);
  assert.equal(
    (await auth(app, 'android-user-b').get(registrationPath)).status,
    401,
  );
  assert.equal(
    (await auth(app, 'android-user-b').get('/api/community/organizers/me')).status,
    401,
  );
  assert.equal(
    (await auth(app, 'android-user-b').get('/api/community/admin/events')).status,
    401,
  );
});

test('organizer application endpoint limits repeated requests', async () => {
  const app = makeApp();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await auth(app).post('/api/community/organizers/apply').send(application());
  }
  const limited = await auth(app).post('/api/community/organizers/apply').send(application());
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
});

test('cancelled events leave discovery and remain visibly cancelled by direct link', async () => {
  const app = makeApp();
  const event = await approvedEvent(app);
  const cancellation = await auth(app).post(`/api/community/events/${event.id}/cancel`);
  assert.equal(cancellation.status, 200);
  assert.equal(cancellation.body.event.status, 'cancelled');
  assert.equal((await request(app).get('/api/community/events')).body.total, 0);
  assert.equal((await request(app).get(`/api/community/events/${event.id}`)).body.event.status, 'cancelled');
});

test('organizer and event decisions are retained in moderation history', async () => {
  const app = makeApp();
  await approvedOrganizer(app);
  const event = await approvedEvent(app);

  const logs = records.get('communityModerationLogs');
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map(({ subjectType, decision, reviewedBy }) => ({
    subjectType,
    decision,
    reviewedBy,
  })), [
    { subjectType: 'organizer', decision: 'approved', reviewedBy: 'admin' },
    { subjectType: 'event', decision: 'approved', reviewedBy: 'admin' },
  ]);
  assert.equal(String(logs[1].subjectId), event.id);
  assert.equal(logs.every(({ reviewedAt, createdAt }) => (
    reviewedAt instanceof Date && createdAt instanceof Date
  )), true);
});

test('organizers who are also admins cannot review their own application or event', async () => {
  const app = makeApp(['admin', 'user-a']);
  const applicationResponse = await auth(app).post('/api/community/organizers/apply').send(application());
  assert.equal(applicationResponse.status, 201);

  const ownApplicationReview = await auth(app)
    .patch('/api/community/admin/organizers/user-a/review')
    .send({ status: 'approved' });
  assert.equal(ownApplicationReview.status, 403);

  const approval = await auth(app, 'admin')
    .patch('/api/community/admin/organizers/user-a/review')
    .send({ status: 'approved' });
  assert.equal(approval.status, 200);

  const created = await auth(app).post('/api/community/events').send(eventPayload());
  const submitted = await auth(app).post(`/api/community/events/${created.body.event.id}/submit`);
  assert.equal(submitted.status, 200);

  const ownEventReview = await auth(app)
    .patch(`/api/community/admin/events/${created.body.event.id}/review`)
    .send({ status: 'approved' });
  assert.equal(ownEventReview.status, 403);
});
