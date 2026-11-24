import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';
import { createUserNotification } from '../src/notifications/service.js';

const primaryProject = 'sellerportal-2786c';
const secondaryProject = 'project-fitness-species';
let records;

function clone(value) {
  if (value instanceof ObjectId) return new ObjectId(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function equal(left, right) {
  if (left instanceof ObjectId || right instanceof ObjectId) return String(left) === String(right);
  if (left instanceof Date || right instanceof Date) return new Date(left).getTime() === new Date(right).getTime();
  return left === right || (left == null && right == null);
}

function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$and') return expected.every((clause) => matches(document, clause));
    if (key === '$or') return expected.some((clause) => matches(document, clause));
    const actual = document[key];
    if (expected instanceof RegExp) return expected.test(String(actual || ''));
    if (expected && typeof expected === 'object'
      && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
      if ('$exists' in expected && (actual !== undefined) !== expected.$exists) return false;
      if ('$in' in expected && !expected.$in.some((value) => (
        value instanceof RegExp ? value.test(String(actual || '')) : equal(actual, value)
      ))) return false;
      if ('$ne' in expected && equal(actual, expected.$ne)) return false;
      if ('$lte' in expected && !(actual != null && actual <= expected.$lte)) return false;
      if ('$gte' in expected && !(actual != null && actual >= expected.$gte)) return false;
      if (Object.keys(expected).some((operator) => operator.startsWith('$'))) return true;
      return matches(actual || {}, expected);
    }
    return equal(actual, expected);
  });
}

class MemoryCollection {
  constructor(name) {
    this.name = name;
    records[name] ||= [];
  }

  items() {
    return records[this.name];
  }

  async findOne(query) {
    const result = this.items().find((item) => matches(item, query));
    return result ? clone(result) : null;
  }

  async insertOne(document) {
    const stored = clone(document);
    stored._id ||= new ObjectId();
    this.items().push(stored);
    return { insertedId: stored._id };
  }

  async updateOne(query, update, options = {}) {
    let item = this.items().find((record) => matches(record, query));
    let inserted = false;
    if (!item && options.upsert) {
      item = { _id: new ObjectId() };
      for (const [key, value] of Object.entries(query)) {
        if (!key.startsWith('$')) item[key] = clone(value);
      }
      this.items().push(item);
      inserted = true;
    }
    if (!item) return { matchedCount: 0, modifiedCount: 0 };
    Object.assign(item, clone(update.$set || {}));
    if (inserted) Object.assign(item, clone(update.$setOnInsert || {}));
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(query, update) {
    const found = this.items().filter((item) => matches(item, query));
    for (const item of found) Object.assign(item, clone(update.$set || {}));
    return { matchedCount: found.length, modifiedCount: found.length };
  }

  async findOneAndUpdate(query, update) {
    const item = this.items().find((record) => matches(record, query));
    if (!item) return null;
    Object.assign(item, clone(update.$set || {}));
    return clone(item);
  }

  async deleteOne(query) {
    const index = this.items().findIndex((item) => matches(item, query));
    if (index < 0) return { deletedCount: 0 };
    this.items().splice(index, 1);
    return { deletedCount: 1 };
  }

  async countDocuments(query) {
    return this.items().filter((item) => matches(item, query)).length;
  }

  find(query) {
    let results = this.items().filter((item) => matches(item, query));
    const cursor = {
      sort(specification) {
        const fields = Object.entries(specification);
        results = [...results].sort((left, right) => {
          for (const [field, direction] of fields) {
            if (left[field] === right[field]) continue;
            return (left[field] > right[field] ? 1 : -1) * direction;
          }
          return 0;
        });
        return cursor;
      },
      limit(count) {
        results = results.slice(0, count);
        return cursor;
      },
      async toArray() {
        return clone(results);
      },
    };
    return cursor;
  }
}

const claims = {
  primary: {
    uid: 'shared-user',
    aud: primaryProject,
    iss: `https://securetoken.google.com/${primaryProject}`,
  },
  secondary: {
    uid: 'shared-user',
    aud: secondaryProject,
    iss: `https://securetoken.google.com/${secondaryProject}`,
  },
  other: {
    uid: 'other-user',
    aud: primaryProject,
    iss: `https://securetoken.google.com/${primaryProject}`,
  },
};

function makeApp() {
  const db = { collection: (name) => new MemoryCollection(name) };
  return createApp({
    getDb: () => db,
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => claims[token],
    primaryFirebaseProjectId: primaryProject,
    supportedFirebaseProjectIds: [primaryProject, secondaryProject],
  });
}

function authorized(app, token = 'primary') {
  return {
    get: (path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
    post: (path) => request(app).post(path).set('Authorization', `Bearer ${token}`),
    patch: (path) => request(app).patch(path).set('Authorization', `Bearer ${token}`),
    delete: (path) => request(app).delete(path).set('Authorization', `Bearer ${token}`),
  };
}

beforeEach(() => {
  records = {};
});

test('notification feed merges real appointment and in-app events with project isolation', async () => {
  const app = makeApp();
  const createdAt = new Date('2026-11-24T05:00:00.000Z');
  records.notifications = [
    {
      _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
      firebaseProjectId: primaryProject,
      firebaseUid: 'shared-user',
      title: 'Order confirmed',
      message: 'Payment verified.',
      category: 'Orders',
      isRead: false,
      createdAt,
    },
    {
      _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
      firebaseUid: 'shared-user',
      title: 'Workout summary',
      message: 'Your workout is saved.',
      category: 'Workout',
      isRead: true,
      createdAt: new Date('2026-11-23T05:00:00.000Z'),
    },
    {
      _id: new ObjectId('cccccccccccccccccccccccc'),
      firebaseProjectId: secondaryProject,
      firebaseUid: 'shared-user',
      title: 'Challenge registration',
      message: 'You are registered.',
      category: 'Challenges',
      isRead: false,
      createdAt,
    },
    {
      _id: new ObjectId('dddddddddddddddddddddddd'),
      firebaseProjectId: primaryProject,
      firebaseUid: 'other-user',
      title: 'Private notification',
      message: 'Not for this user.',
      category: 'Fitness',
      isRead: false,
      createdAt,
    },
  ];
  records.doctorPortalNotifications = [{
    _id: new ObjectId('eeeeeeeeeeeeeeeeeeeeeeee'),
    recipientFirebaseProjectId: primaryProject,
    recipientFirebaseUid: 'shared-user',
    title: 'Appointment booked',
    body: 'Your appointment is booked.',
    type: 'appointment_requested',
    readAt: null,
    isActive: true,
    scheduledFor: null,
    createdAt: new Date('2026-11-24T04:00:00.000Z'),
  }];

  const feed = await authorized(app).get('/api/notifications');
  assert.equal(feed.status, 200);
  assert.equal(feed.body.total, 3);
  assert.equal(feed.body.unreadCount, 2);
  assert.deepEqual(
    feed.body.notifications.map(({ category }) => category),
    ['Orders', 'Appointments', 'Workout'],
  );
  assert.equal(
    feed.body.notifications.find(({ source }) => source === 'doctorPortalNotifications').targetScreen,
    'my_appointments',
  );

  const filtered = await authorized(app).get('/api/notifications').query({ category: 'orders' });
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.unreadCount, 2);
  assert.equal(filtered.body.notifications[0].category, 'Orders');

  const firstPage = await authorized(app).get('/api/notifications').query({ limit: 1, page: 1 });
  const secondPage = await authorized(app).get('/api/notifications').query({ limit: 1, page: 2 });
  assert.equal(firstPage.body.notifications.length, 1);
  assert.equal(firstPage.body.hasMore, true);
  assert.notEqual(firstPage.body.notifications[0].id, secondPage.body.notifications[0].id);

  const secondaryFeed = await authorized(app, 'secondary').get('/api/notifications');
  assert.equal(secondaryFeed.body.total, 1);
  assert.equal(secondaryFeed.body.notifications[0].category, 'Challenges');
});

test('notification actions are scoped to the verified owner and client creation is disabled', async () => {
  const app = makeApp();
  const notificationId = new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
  const appointmentNotificationId = new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
  records.notifications = [{
    _id: notificationId,
    firebaseProjectId: primaryProject,
    firebaseUid: 'shared-user',
    title: 'Order confirmed',
    message: 'Payment verified.',
    category: 'Orders',
    isRead: false,
    createdAt: new Date(),
  }];
  records.doctorPortalNotifications = [{
    _id: appointmentNotificationId,
    recipientFirebaseProjectId: primaryProject,
    recipientFirebaseUid: 'shared-user',
    title: 'Appointment booked',
    body: 'Your appointment is booked.',
    readAt: null,
    isActive: true,
    scheduledFor: null,
    createdAt: new Date(),
  }];

  const unauthorizedRead = await authorized(app, 'other')
    .patch(`/api/notifications/${notificationId}/read`);
  assert.equal(unauthorizedRead.status, 404);

  const markedAppointment = await authorized(app)
    .patch(`/api/notifications/${appointmentNotificationId}/read`)
    .query({ source: 'doctorPortalNotifications' });
  assert.equal(markedAppointment.status, 200);
  assert.ok(records.doctorPortalNotifications[0].readAt instanceof Date);

  const dismissed = await authorized(app)
    .delete(`/api/notifications/${appointmentNotificationId}`)
    .query({ source: 'doctorPortalNotifications' });
  assert.equal(dismissed.status, 200);
  assert.equal(records.doctorPortalNotifications[0].isActive, false);

  const markedAll = await authorized(app).patch('/api/notifications/read-all');
  assert.equal(markedAll.status, 200);
  assert.equal((await authorized(app).get('/api/notifications')).body.unreadCount, 0);

  const clientCreation = await authorized(app).post('/api/notifications').send({
    title: 'Fake order',
    message: 'Pretend this order shipped.',
    category: 'Orders',
  });
  assert.equal(clientCreation.status, 404);
});

test('notification pagination and category parameters are validated', async () => {
  const app = makeApp();
  assert.equal(
    (await authorized(app).get('/api/notifications').query({ page: 101 })).status,
    400,
  );
  assert.equal(
    (await authorized(app).get('/api/notifications').query({ category: 'unknown' })).status,
    400,
  );
});

test('trusted event notification writes are idempotent', async () => {
  const db = { collection: (name) => new MemoryCollection(name) };
  const notification = {
    firebaseProjectId: primaryProject,
    firebaseUid: 'shared-user',
    eventKey: 'order-paid:order-123',
    title: 'Order confirmed',
    message: 'Payment verified.',
    category: 'Orders',
    targetScreen: 'order_history',
  };

  await createUserNotification(db, notification);
  await createUserNotification(db, { ...notification, message: 'Duplicate event.' });

  assert.equal(records.notifications.length, 1);
  assert.equal(records.notifications[0].message, 'Payment verified.');
});
