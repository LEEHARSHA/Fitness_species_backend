import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp, parseCorsOrigins } from '../src/app.js';
import mongo from '../src/config/mongodb.js';

const records = new Map();
const ids = {
  sellerA: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
  sellerB: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
  admin: new ObjectId('cccccccccccccccccccccccc'),
};

function sameValue(left, right) {
  if (left instanceof ObjectId || right instanceof ObjectId) {
    return String(left) === String(right);
  }
  return left === right;
}

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
    if (expected instanceof RegExp) return expected.test(String(actual || ''));
    if (expected && typeof expected === 'object' && !(expected instanceof ObjectId)) {
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
      if ('$gte' in expected && actual < expected.$gte) return false;
      if ('$lte' in expected && actual > expected.$lte) return false;
      return true;
    }
    return sameValue(actual, expected);
  });
}

class TestCollection {
  constructor(name) {
    this.name = name;
    if (!records.has(name)) records.set(name, []);
  }

  items() {
    return records.get(this.name);
  }

  async findOne(query) {
    const found = this.items().find((item) => matches(item, query));
    return found ? clone(found) : null;
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
        if (!key.startsWith('$')) found[key] = value;
      }
      Object.assign(found, update.$setOnInsert || {});
      this.items().push(found);
    }
    if (!found) return null;
    Object.assign(found, update.$set || {});
    return clone(found);
  }

  async countDocuments(query) {
    return this.items().filter((item) => matches(item, query)).length;
  }

  find(query) {
    let results = this.items().filter((item) => matches(item, query));
    const cursor = {
      sort(specification) {
        const [[field, direction]] = Object.entries(specification);
        results = [...results].sort((a, b) => (
          (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * direction
        ));
        return cursor;
      },
      skip(count) {
        results = results.slice(count);
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

function makeApp({ dbStatus = 'connected', adminUids = [], pingFails = false } = {}) {
  const db = { collection: (name) => new TestCollection(name) };
  const claims = {
    'seller-a-token': { uid: 'seller-a', email: 'a@example.test', aud: 'sellerportal-2786c', iss: 'https://securetoken.google.com/sellerportal-2786c' },
    'seller-b-token': { uid: 'seller-b', email: 'b@example.test', aud: 'sellerportal-2786c', iss: 'https://securetoken.google.com/sellerportal-2786c' },
    'admin-token': { uid: 'admin-1', email: 'admin@example.test', aud: 'sellerportal-2786c', iss: 'https://securetoken.google.com/sellerportal-2786c' },
  };
  return createApp({
    getDb: () => db,
    getDbStatus: () => dbStatus,
    getDbName: () => 'fitness_species',
    checkDB: async () => {
      if (pingFails) throw new Error('Database unavailable.');
    },
    verifyIdToken: async (token) => {
      if (!claims[token]) throw new Error('Invalid token');
      return claims[token];
    },
    adminUids,
  });
}

function withAuth(app, token = 'seller-a-token') {
  const authorized = (method, path) => request(app)[method](path)
    .set('Authorization', `Bearer ${token}`);
  return {
    get: (path) => authorized('get', path),
    post: (path) => authorized('post', path),
    patch: (path) => authorized('patch', path),
  };
}

function completeSeller(uid = 'seller-a', email = 'a@example.test') {
  return {
    firebaseUid: uid,
    email,
    businessName: 'Species Fitness',
    ownerName: 'Seller Name',
    phone: '+91 9876543210',
    businessAddress: {
      address: '10 Market Road',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
    },
    status: 'approved',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function productPayload(overrides = {}) {
  return {
    name: 'Training Dumbbell',
    description: 'Adjustable training dumbbell',
    shortDescription: 'Adjustable dumbbell',
    category: 'Fitness Equipment',
    subCategory: 'Weights',
    brand: 'Species',
    sku: 'DUMBBELL-01',
    price: 1200,
    compareAtPrice: 1500,
    discountPercent: 20,
    stock: 8,
    lowStockThreshold: 2,
    images: ['https://images.example.test/product.jpg'],
    variants: [{ id: 'v1', title: '10 kg', stock: 8, attributes: {} }],
    specifications: { material: 'Steel' },
    ...overrides,
  };
}

beforeEach(() => {
  records.clear();
  process.env.FIREBASE_PROJECT_ID = 'sellerportal-2786c';
});

test('health reports connected and disconnected MongoDB readiness accurately', async () => {
  const healthy = await request(makeApp()).get('/api/health');
  assert.equal(healthy.status, 200);
  assert.deepEqual({ ...healthy.body, timestamp: undefined }, {
    success: true,
    status: 'ok',
    server: 'running',
    database: { name: 'fitness_species', status: 'connected' },
    timestamp: undefined,
  });
  assert.equal(Number.isNaN(Date.parse(healthy.body.timestamp)), false);

  const unavailableApp = makeApp({ dbStatus: 'disconnected' });
  const unhealthy = await request(unavailableApp).get('/api/health');
  assert.equal(unhealthy.status, 503);
  assert.equal(unhealthy.body.database.status, 'disconnected');
  assert.equal(unhealthy.body.database.name, null);
  const apiUnavailable = await request(unavailableApp).get('/api/products');
  assert.equal(apiUnavailable.status, 503);

  const failedPing = await request(makeApp({ pingFails: true })).get('/api/health');
  assert.equal(failedPing.status, 503);
  assert.equal(failedPing.body.database.status, 'disconnected');
});

test('rejects missing, malformed, invalid, and wrong-project Firebase tokens', async () => {
  const app = makeApp();
  assert.equal((await request(app).get('/api/seller/profile')).status, 401);
  assert.equal((await request(app).get('/api/seller/profile').set('Authorization', 'Basic abc')).status, 401);
  assert.equal((await withAuth(app, 'invalid').get('/api/seller/profile')).status, 401);

  const wrongProjectApp = createApp({
    getDb: () => ({ collection: () => new TestCollection('sellers') }),
    getDbStatus: () => 'connected',
    verifyIdToken: async () => ({
      uid: 'attacker',
      aud: 'another-project',
      iss: 'https://securetoken.google.com/another-project',
    }),
  });
  assert.equal((await withAuth(wrongProjectApp).get('/api/seller/profile')).status, 401);
});

test('classifies Firebase token failures without logging tokens or user details', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...values) => warnings.push(values);
  try {
    const app = createApp({
      getDb: () => ({ collection: () => new TestCollection('sellers') }),
      getDbStatus: () => 'connected',
      verifyIdToken: async (token) => {
        if (token === 'expired-token') {
          const error = new Error('expiration details must not be logged');
          error.code = 'auth/id-token-expired';
          throw error;
        }
        if (token === 'wrong-project-token') {
          throw new Error('Firebase ID token has incorrect audience.');
        }
        throw new Error('invalid token details must not be logged');
      },
    });
    const missing = await request(app).get('/api/seller/profile');
    const malformed = await request(app).get('/api/seller/profile')
      .set('Authorization', 'Basic secret-value');
    const expired = await request(app).get('/api/seller/profile')
      .set('Authorization', 'Bearer expired-token');
    const wrongProject = await request(app).get('/api/seller/profile')
      .set('Authorization', 'Bearer wrong-project-token');
    const invalid = await request(app).get('/api/seller/profile')
      .set('Authorization', 'Bearer invalid-token');

    assert.equal(missing.body.code, 'AUTH_REQUIRED');
    assert.equal(malformed.body.code, 'AUTH_REQUIRED');
    assert.equal(expired.body.code, 'TOKEN_EXPIRED');
    assert.equal(wrongProject.body.code, 'TOKEN_INVALID');
    assert.equal(invalid.body.code, 'TOKEN_INVALID');

    const logText = JSON.stringify(warnings);
    assert.match(logText, /missing_authorization_header/);
    assert.match(logText, /malformed_authorization_header/);
    assert.match(logText, /expired_token/);
    assert.match(logText, /firebase_project_mismatch/);
    assert.match(logText, /invalid_token/);
    assert.doesNotMatch(logText, /secret-value|expired-token|invalid-token|expiration details|user@example\.test/);
  } finally {
    console.warn = originalWarn;
  }
});

test('secondary Firebase project tokens cannot access seller endpoints', async () => {
  const projectIds = ['sellerportal-2786c', 'project-fitness-species'];
  const app = createApp({
    getDb: () => ({ collection: () => new TestCollection('sellers') }),
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => {
      if (token === 'android-token') {
        return {
          uid: 'android-user',
          aud: 'project-fitness-species',
          iss: 'https://securetoken.google.com/project-fitness-species',
        };
      }
      return {
        uid: 'unconfigured-user',
        aud: 'unconfigured-project',
        iss: 'https://securetoken.google.com/unconfigured-project',
      };
    },
    supportedFirebaseProjectIds: projectIds,
  });

  const androidRequest = await withAuth(app, 'android-token').get('/api/seller/profile');
  assert.equal(androidRequest.status, 401);

  const unsupportedRequest = await withAuth(app, 'unsupported-token').get('/api/seller/profile');
  assert.equal(unsupportedRequest.status, 401);
});

test('missing seller profiles return an explicit setup-required response', async () => {
  const app = makeApp();
  const missing = await withAuth(app).get('/api/seller/profile');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'SELLER_PROFILE_SETUP_REQUIRED');
  assert.equal(missing.body.setupRequired, true);
  assert.match(missing.body.message, /save your seller profile/i);
  assert.equal((await withAuth(app).post('/api/seller/profile').send({})).status, 400);

  await withAuth(app).post('/api/seller/profile').send({ businessName: 'Species Fitness' });
  const incomplete = await withAuth(app).get('/api/seller/profile');
  assert.equal(incomplete.status, 200);
  assert.equal(incomplete.body.setupRequired, true);
  assert.equal(incomplete.body.seller.profileComplete, false);
});

test('seller profile create, read, and patch use token identity and calculate completion', async () => {
  const app = makeApp();
  assert.equal((await withAuth(app).get('/api/seller/profile')).status, 404);
  const created = await withAuth(app).post('/api/seller/profile').send({
    businessName: 'Species Fitness',
    ownerName: 'Seller Name',
    phone: '+91 9876543210',
    businessAddress: completeSeller().businessAddress,
    email: 'forged@example.test',
  });
  assert.equal(created.status, 400);
  assert.equal((await withAuth(app).post('/api/seller/profile').send({
    businessName: 'Species Fitness',
    firebaseUid: 'seller-b',
  })).status, 400);

  const body = {
    businessName: 'Species Fitness',
    ownerName: 'Seller Name',
    phone: '+91 9876543210',
    businessAddress: completeSeller().businessAddress,
  };
  const saved = await withAuth(app).post('/api/seller/profile').send(body);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.seller.firebaseUid, 'seller-a');
  assert.equal(saved.body.seller.email, 'a@example.test');
  assert.equal(saved.body.seller.profileComplete, true);
  assert.equal(saved.body.seller.profileCompletion, 100);
  assert.equal(records.get('sellerProfiles')[0].profileComplete, true);
  assert.equal((records.get('sellers') || []).length, 0);

  const read = await withAuth(app).get('/api/seller/profile');
  assert.equal(read.status, 200);
  assert.equal(read.body.seller.businessName, 'Species Fitness');
  assert.equal(read.body.setupRequired, false);
  records.get('sellerProfiles')[0].status = 'approved';
  records.get('sellerProfiles')[0].role = 'admin';
  const patched = await withAuth(app).patch('/api/seller/profile').send({ phone: '+91 9999999999' });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.seller.phone, '+91 9999999999');
  assert.equal(patched.body.seller.email, 'a@example.test');
  assert.equal(records.get('sellerProfiles')[0].status, 'approved');
  assert.equal(records.get('sellerProfiles')[0].role, 'admin');
  assert.equal((await withAuth(app, 'seller-b-token').get('/api/seller/profile')).body.code, 'SELLER_PROFILE_SETUP_REQUIRED');
});

test('updating a legacy sellers record does not create a duplicate seller profile', async () => {
  const app = makeApp();
  await new TestCollection('sellers').insertOne(completeSeller());
  const response = await withAuth(app).patch('/api/seller/profile').send({
    phone: '+91 9999999999',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.seller.phone, '+91 9999999999');
  assert.equal(records.get('sellers').length, 1);
  assert.equal((records.get('sellerProfiles') || []).length, 0);
});

test('one seller cannot read or modify another sellers profile', async () => {
  const app = makeApp();
  // Seller A creates a complete profile.
  const profileBody = {
    businessName: 'Species Fitness',
    ownerName: 'Seller Name',
    phone: '+91 9876543210',
    businessAddress: completeSeller().businessAddress,
  };
  const created = await withAuth(app).post('/api/seller/profile').send(profileBody);
  assert.equal(created.status, 200);
  assert.equal(created.body.seller.firebaseUid, 'seller-a');

  // Seller B cannot read seller A's profile — gets their own 404.
  const sellerBGet = await withAuth(app, 'seller-b-token').get('/api/seller/profile');
  assert.equal(sellerBGet.status, 404);
  assert.equal(sellerBGet.body.code, 'SELLER_PROFILE_SETUP_REQUIRED');
  assert.equal(sellerBGet.body.setupRequired, true);

  // Seller B cannot modify seller A's profile — their PATCH only affects their own slot.
  const sellerBPatch = await withAuth(app, 'seller-b-token').patch('/api/seller/profile').send({
    businessName: 'Unauthorized Store',
  });
  // Seller B has no profile yet, so PATCH creates one for seller-b only.
  assert.equal(sellerBPatch.status, 200);
  assert.equal(sellerBPatch.body.seller.firebaseUid, 'seller-b');
  assert.equal(sellerBPatch.body.seller.businessName, 'Unauthorized Store');

  // Seller A's profile is unchanged.
  const sellerARead = await withAuth(app).get('/api/seller/profile');
  assert.equal(sellerARead.status, 200);
  assert.equal(sellerARead.body.seller.firebaseUid, 'seller-a');
  assert.equal(sellerARead.body.seller.businessName, 'Species Fitness');
  // Seller A's email remains from their token, not seller B's.
  assert.equal(sellerARead.body.seller.email, 'a@example.test');
});

test('incomplete profiles cannot submit products; complete sellers create pending products', async () => {
  const app = makeApp({ adminUids: ['admin-1'] });
  await withAuth(app).post('/api/seller/profile').send({ businessName: 'New Store' });
  assert.equal((await withAuth(app).post('/api/seller/products').send(productPayload())).status, 409);
  const complete = completeSeller();
  const saved = await withAuth(app).post('/api/seller/profile').send({
    businessName: complete.businessName,
    ownerName: complete.ownerName,
    phone: complete.phone,
    businessAddress: complete.businessAddress,
  });
  assert.equal(saved.body.seller.profileComplete, true);

  const response = await withAuth(app).post('/api/seller/products').send(productPayload({
    sellerId: 'seller-b',
  }));
  assert.equal(response.status, 400);

  const created = await withAuth(app).post('/api/seller/products').send(productPayload());
  assert.equal(created.status, 201);
  assert.equal(created.body.product.status, 'pending');
  assert.equal(created.body.product.sellerId, 'seller-a');
  assert.equal(created.body.product.sellerUid, 'seller-a');
  assert.ok(created.body.product.id);
  assert.equal(created.body.product.discountPercent, 20);
  assert.deepEqual(created.body.product.images, productPayload().images);

  const persisted = await withAuth(app).get('/api/seller/products');
  assert.equal(persisted.status, 200);
  assert.equal(persisted.body.count, 1);
  assert.equal(persisted.body.products[0].id, created.body.product.id);
  assert.deepEqual(persisted.body.products[0].images, productPayload().images);

  const adminList = await withAuth(app, 'admin-token').get('/api/admin/products?status=pending');
  assert.equal(adminList.status, 200);
  assert.deepEqual(adminList.body.products[0].images, productPayload().images);
  const adminDetail = await withAuth(app, 'admin-token')
    .get(`/api/admin/products/${created.body.product.id}`);
  assert.equal(adminDetail.status, 200);
  assert.deepEqual(adminDetail.body.product.images, productPayload().images);
});

test('seller product creation accepts only valid HTTPS image URLs', async () => {
  const app = makeApp({ adminUids: ['admin-1'] });
  const complete = completeSeller();
  await withAuth(app).post('/api/seller/profile').send({
    businessName: complete.businessName,
    ownerName: complete.ownerName,
    phone: complete.phone,
    businessAddress: complete.businessAddress,
  });

  const invalidUrls = [
    'http://images.example.test/product.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'https://user:password@images.example.test/product.jpg',
    'not a URL',
  ];
  for (const image of invalidUrls) {
    const rejected = await withAuth(app).post('/api/seller/products').send(productPayload({
      images: [image],
    }));
    assert.equal(rejected.status, 400);
  }

  const noImages = await withAuth(app).post('/api/seller/products').send(productPayload({
    images: [],
  }));
  assert.equal(noImages.status, 400);

  const accepted = await withAuth(app).post('/api/seller/products').send(productPayload({
    images: ['https://cdn.example.test/front.jpg', 'https://cdn.example.test/back.png'],
  }));
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.product.status, 'pending');
  assert.deepEqual(accepted.body.product.images, [
    'https://cdn.example.test/front.jpg',
    'https://cdn.example.test/back.png',
  ]);

  const pendingProducts = await withAuth(app).get('/api/seller/products?status=pending');
  assert.equal(pendingProducts.status, 200);
  assert.equal(pendingProducts.body.count, 1);
  assert.equal(pendingProducts.body.products[0].id, accepted.body.product.id);
  assert.equal(pendingProducts.body.products[0].status, 'pending');

  const adminPendingProducts = await withAuth(app, 'admin-token')
    .get('/api/admin/products?status=pending');
  assert.equal(adminPendingProducts.status, 200);
  assert.equal(adminPendingProducts.body.products[0].id, accepted.body.product.id);
  assert.deepEqual(adminPendingProducts.body.products[0].images, accepted.body.product.images);
});

test('seller product image updates accept valid HTTPS URLs and reject unsafe protocols', async () => {
  const app = makeApp();
  const complete = completeSeller();
  await withAuth(app).post('/api/seller/profile').send({
    businessName: complete.businessName,
    ownerName: complete.ownerName,
    phone: complete.phone,
    businessAddress: complete.businessAddress,
  });
  const products = new TestCollection('products');
  const id = ids.sellerA;
  const legacyImage = 'https://contents.mediadecathlon.com/p123/abc/image.jpg';
  await products.insertOne({
    _id: id,
    sellerUid: 'seller-a',
    status: 'pending',
    images: [legacyImage],
    price: 10,
    compareAtPrice: null,
  });
  const uploadedImage = 'https://cdn.example.test/new-product.webp';
  const update = await withAuth(app).patch(`/api/seller/products/${id}`).send({
    images: [legacyImage, uploadedImage],
  });
  assert.equal(update.status, 200);
  assert.deepEqual(update.body.product.images, [legacyImage, uploadedImage]);

  const invalidUpdate = await withAuth(app).patch(`/api/seller/products/${id}`).send({
    images: ['javascript:alert(1)'],
  });
  assert.equal(invalidUpdate.status, 400);
});

test('seller product listing and detail enforce ownership', async () => {
  const app = makeApp();
  const collection = new TestCollection('products');
  await collection.insertOne({
    _id: ids.sellerA,
    sellerId: 'seller-a',
    status: 'pending',
    name: 'Owner product',
    createdAt: new Date(),
  });
  await collection.insertOne({
    _id: ids.sellerB,
    sellerId: 'seller-b',
    status: 'pending',
    name: 'Other product',
    createdAt: new Date(),
  });

  const list = await withAuth(app).get('/api/seller/products');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.products.map((product) => product.name), ['Owner product']);
  assert.equal((await withAuth(app).get(`/api/seller/products/${ids.sellerB}`)).status, 404);
  assert.equal((await withAuth(app).get(`/api/seller/products/${ids.sellerA}`)).status, 200);
  assert.equal((await withAuth(app).patch(`/api/seller/products/${ids.sellerB}`).send({
    name: 'Unauthorized update',
  })).status, 404);
});

test('seller stock route validates input and only updates seller-owned products', async () => {
  const app = makeApp();
  const products = new TestCollection('products');
  await products.insertOne({
    _id: ids.sellerA,
    sellerUid: 'seller-a',
    status: 'pending',
    stock: 8,
    name: 'Owner product',
  });
  await products.insertOne({
    _id: ids.sellerB,
    sellerUid: 'seller-b',
    status: 'pending',
    stock: 4,
    name: 'Other product',
  });

  const updated = await withAuth(app).patch(`/api/seller/products/${ids.sellerA}/stock`)
    .send({ stock: 12 });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.product.stock, 12);
  assert.equal((await withAuth(app).patch(`/api/seller/products/${ids.sellerB}/stock`)
    .send({ stock: 12 })).status, 404);
  assert.equal((await withAuth(app).patch(`/api/seller/products/${ids.sellerA}/stock`)
    .send({ stock: -1 })).status, 400);
  assert.equal((await request(app).patch(`/api/seller/products/${ids.sellerA}/stock`)
    .send({ stock: 1 })).status, 401);
});

test('rejects invalid product IDs and invalid product fields', async () => {
  const app = makeApp();
  assert.equal((await withAuth(app).get('/api/seller/products/not-an-object-id')).status, 400);
  assert.equal((await withAuth(app).post('/api/seller/products').send(productPayload({
    price: -10,
  }))).status, 400);
  assert.equal((await withAuth(app).post('/api/seller/products').send(productPayload({
    status: 'approved',
  }))).status, 400);
});

test('editing a rejected product resubmits it as pending and clears review fields', async () => {
  const app = makeApp();
  await new TestCollection('sellers').insertOne(completeSeller());
  const id = ids.sellerA;
  await new TestCollection('products').insertOne({
    _id: id,
    sellerId: 'seller-a',
    name: 'Rejected product',
    description: '',
    category: 'Fitness Equipment',
    price: 500,
    compareAtPrice: null,
    stock: 2,
    status: 'rejected',
    rejectionReason: 'Image quality is too low',
    rejectedAt: new Date(),
    approvedAt: null,
  });
  const response = await withAuth(app).patch(`/api/seller/products/${id}`).send({
    name: 'Updated product',
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.product.name, 'Updated product');
  assert.equal(response.body.product.status, 'pending');
  assert.equal(response.body.product.rejectionReason, null);
  assert.equal(response.body.product.rejectedAt, null);
});

test('admin routes deny authenticated non-admin users and an empty allowlist', async () => {
  const app = makeApp();
  const denied = await withAuth(app).get('/api/admin/products?status=pending');
  assert.equal(denied.status, 403);
  const invalidAuth = await request(app).get('/api/admin/products');
  assert.equal(invalidAuth.status, 401);
  assert.equal((await withAuth(app, 'invalid').get('/api/admin/products')).status, 401);

  const forgedIdentity = await withAuth(app)
    .patch(`/api/admin/products/${ids.sellerA}/review`)
    .send({ status: 'approved', uid: 'admin-1', role: 'admin', isAdmin: true });
  assert.equal(forgedIdentity.status, 403);
});

test('ADMIN_FIREBASE_UIDS configures the admin gate and missing configuration denies access', async () => {
  const previousAllowlist = process.env.ADMIN_FIREBASE_UIDS;
  const db = { collection: (name) => new TestCollection(name) };
  const createEnvironmentApp = () => createApp({
    getDb: () => db,
    getDbStatus: () => 'connected',
    verifyIdToken: async (token) => {
      if (token !== 'admin-token') throw new Error('Invalid token');
      return {
        uid: 'admin-1',
        aud: 'sellerportal-2786c',
        iss: 'https://securetoken.google.com/sellerportal-2786c',
      };
    },
  });

  try {
    delete process.env.ADMIN_FIREBASE_UIDS;
    const noAllowlistApp = createEnvironmentApp();
    assert.equal((await withAuth(noAllowlistApp, 'admin-token').get('/api/admin/products')).status, 403);

    process.env.ADMIN_FIREBASE_UIDS = ' admin-1, ';
    const configuredApp = createEnvironmentApp();
    assert.equal((await withAuth(configuredApp, 'admin-token').get('/api/admin/products')).status, 200);
  } finally {
    if (previousAllowlist === undefined) delete process.env.ADMIN_FIREBASE_UIDS;
    else process.env.ADMIN_FIREBASE_UIDS = previousAllowlist;
  }
});

test('all admin product endpoints require an authorized Firebase UID', async () => {
  const app = makeApp();
  const paths = [
    ['get', '/api/admin/products?status=pending'],
    ['get', `/api/admin/products/${ids.sellerA}`],
    ['patch', `/api/admin/products/${ids.sellerA}/review`],
  ];
  for (const [method, path] of paths) {
    const unauthenticated = await request(app)[method](path);
    assert.equal(unauthenticated.status, 401, `${method.toUpperCase()} ${path}`);
    const invalidToken = await withAuth(app, 'invalid')[method](path);
    assert.equal(invalidToken.status, 401, `${method.toUpperCase()} ${path}`);
    const nonAdmin = await withAuth(app)[method](path);
    assert.equal(nonAdmin.status, 403, `${method.toUpperCase()} ${path}`);
  }
});

test('allowlisted administrators can approve and reject pending products', async () => {
  const app = makeApp({ adminUids: ['admin-1'] });
  const firstId = ids.sellerA;
  const secondId = ids.sellerB;
  const products = new TestCollection('products');
  await products.insertOne({ _id: firstId, status: 'pending', sellerId: 'seller-a' });
  await products.insertOne({ _id: secondId, status: 'pending', sellerId: 'seller-b' });

  const approved = await withAuth(app, 'admin-token')
    .patch(`/api/admin/products/${firstId}/review`)
    .send({ status: 'approved' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.product.status, 'approved');
  assert.ok(approved.body.product.approvedAt);
  assert.equal(records.get('products').find((product) => product._id.equals(firstId)).status, 'approved');
  assert.ok(records.get('products').find((product) => product._id.equals(firstId)).approvedAt instanceof Date);

  const rejected = await withAuth(app, 'admin-token')
    .patch(`/api/admin/products/${secondId}/review`)
    .send({ status: 'rejected', rejectionReason: 'Please provide clearer images.' });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.product.status, 'rejected');
  assert.equal(rejected.body.product.rejectionReason, 'Please provide clearer images.');
  const persistedRejection = records.get('products').find((product) => product._id.equals(secondId));
  assert.equal(persistedRejection.status, 'rejected');
  assert.equal(persistedRejection.rejectionReason, 'Please provide clearer images.');
  assert.ok(persistedRejection.rejectedAt instanceof Date);
});

test('a newly approved product appears on the next public catalog fetch', async () => {
  const app = makeApp({ adminUids: ['admin-1'] });
  const id = ids.sellerA;
  await new TestCollection('products').insertOne({
    _id: id,
    status: 'pending',
    sellerId: 'seller-a',
    name: 'Newly approved product',
  });

  const beforeApproval = await request(app).get('/api/products');
  assert.equal(beforeApproval.status, 200);
  assert.equal(beforeApproval.body.total, 0);

  const approved = await withAuth(app, 'admin-token')
    .patch(`/api/admin/products/${id}/review`)
    .send({ status: 'approved' });
  assert.equal(approved.status, 200);

  const afterApproval = await request(app).get('/api/products');
  assert.equal(afterApproval.status, 200);
  assert.deepEqual(afterApproval.body.products.map((product) => product.name), [
    'Newly approved product',
  ]);
});

test('allowlisted administrators can list pending products and read product details', async () => {
  const app = makeApp({ adminUids: [' admin-1 '] });
  const products = new TestCollection('products');
  await products.insertOne({ _id: ids.sellerA, status: 'pending', name: 'Pending item' });
  await products.insertOne({ _id: ids.sellerB, status: 'approved', name: 'Approved item' });

  const pending = await withAuth(app, 'admin-token').get('/api/admin/products?status=pending');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.total, 1);
  assert.deepEqual(pending.body.products.map((product) => product.name), ['Pending item']);

  const details = await withAuth(app, 'admin-token').get(`/api/admin/products/${ids.sellerB}`);
  assert.equal(details.status, 200);
  assert.equal(details.body.product.name, 'Approved item');
  assert.equal((await withAuth(app, 'admin-token').get('/api/admin/products?status=unknown')).status, 400);
  assert.equal((await withAuth(app, 'admin-token').get('/api/admin/products/not-an-object-id')).status, 400);
});

test('admin review validates rejection reasons and pending-only transitions', async () => {
  const app = makeApp({ adminUids: ['admin-1'] });
  const products = new TestCollection('products');
  await products.insertOne({ _id: ids.sellerA, status: 'approved' });
  const missingReason = await withAuth(app, 'admin-token')
    .patch(`/api/admin/products/${ids.sellerA}/review`)
    .send({ status: 'rejected', rejectionReason: 'no' });
  assert.equal(missingReason.status, 400);
  const wrongTransition = await withAuth(app, 'admin-token')
    .patch(`/api/admin/products/${ids.sellerA}/review`)
    .send({ status: 'approved' });
  assert.equal(wrongTransition.status, 409);
});

test('public catalog and product detail expose only approved products', async () => {
  const app = makeApp();
  const products = new TestCollection('products');
  await products.insertOne({
    _id: ids.sellerA,
    status: 'approved',
    name: 'Public product',
    description: 'A customer-facing description',
    shortDescription: 'Product summary',
    category: 'Fitness Equipment',
    subCategory: 'Weights',
    brand: 'Species',
    sku: 'PUBLIC-01',
    price: 12,
    compareAtPrice: 15,
    discountPercent: 20,
    stock: 4,
    images: [{
      id: 'image-1',
      url: 'https://cdn.example.test/product.jpg',
      isPrimary: true,
      alt: 'Product photo',
      sellerUid: 'nested-private-uid',
    }],
    variants: [{
      title: 'Standard',
      stock: 4,
      adminUid: 'nested-private-admin',
    }],
    specifications: { material: 'Steel' },
    sellerId: 'seller-private-id',
    sellerUid: 'seller-private-uid',
    rejectionReason: 'private moderation detail',
    adminUid: 'private-admin-id',
    credentials: 'private-data',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  await products.insertOne({
    _id: new ObjectId('dddddddddddddddddddddddd'),
    status: 'approved',
    name: 'Second public product',
    category: 'Fitness Equipment',
    price: 20,
  });
  await products.insertOne({ _id: ids.sellerB, status: 'pending', name: 'Pending product', category: 'Fitness Equipment', price: 12 });
  await products.insertOne({ _id: ids.admin, status: 'rejected', name: 'Rejected product', category: 'Fitness Equipment', price: 12 });

  const catalog = await request(app).get('/api/products?category=Fitness%20Equipment&page=1&limit=1');
  assert.equal(catalog.status, 200);
  assert.deepEqual(catalog.body.products.map((product) => product.name), ['Public product']);
  assert.equal(catalog.body.count, 1);
  assert.equal(catalog.body.total, 2);
  assert.equal(catalog.body.page, 1);
  assert.equal(catalog.body.limit, 1);
  assert.deepEqual(catalog.body.products[0], {
    id: ids.sellerA.toString(),
    name: 'Public product',
    description: 'A customer-facing description',
    shortDescription: 'Product summary',
    category: 'Fitness Equipment',
    subCategory: 'Weights',
    brand: 'Species',
    sku: 'PUBLIC-01',
    price: 12,
    compareAtPrice: 15,
    discountPercent: 20,
    images: ['https://cdn.example.test/product.jpg'],
    stock: 4,
    lowStockThreshold: 10,
    variants: [{ title: 'Standard', stock: 4 }],
    specifications: { material: 'Steel' },
    status: 'approved',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  });
  assert.equal((await request(app).get('/api/products?category=Fitness%20Equipment&page=2&limit=1'))
    .body.products[0].name, 'Second public product');
  assert.equal((await request(app).get(`/api/products/${ids.sellerB}`)).status, 404);
  assert.equal((await request(app).get(`/api/products/${ids.sellerA}`)).status, 200);
  const detail = await request(app).get(`/api/products/${ids.sellerA}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.product.sku, 'PUBLIC-01');
  assert.equal('sellerId' in detail.body.product, false);
  assert.equal('sellerUid' in detail.body.product, false);
  assert.equal('rejectionReason' in detail.body.product, false);
  assert.equal('adminUid' in detail.body.product, false);
  assert.equal('credentials' in detail.body.product, false);
  assert.equal(detail.body.product.images[0], 'https://cdn.example.test/product.jpg');
  assert.equal('adminUid' in detail.body.product.variants[0], false);
});

test('public catalog reports database failures instead of returning fabricated products', async () => {
  const app = createApp({
    getDb: () => {
      throw new Error('Database unavailable.');
    },
    getDbStatus: () => 'connected',
  });

  const response = await request(app)
    .get('/api/products')
    .set('Origin', 'https://seller-lilac-five.vercel.app');
  assert.equal(response.status, 500);
  assert.equal(
    response.headers['access-control-allow-origin'],
    'https://seller-lilac-five.vercel.app',
  );
  assert.deepEqual(response.body, {
    success: false,
    message: 'An unexpected server error occurred.',
  });
});

test('CORS allows configured portals and rejects unexpected browser origins', async () => {
  const app = makeApp();
  const origins = [
    'http://localhost:3000',
    'http://localhost:3005',
    'https://seller-lilac-five.vercel.app',
    'https://admin-portal-sepia-chi.vercel.app',
    'https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app',
    'https://fitness-species-community.vercel.app',
  ];
  for (const origin of origins) {
    for (const status of ['pending', 'approved', 'rejected']) {
      const allowed = await request(app)
        .options(`/api/admin/products?status=${status}`)
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'authorization,content-type');
      assert.equal(allowed.status, 204);
      assert.equal(allowed.headers['access-control-allow-origin'], origin);
      assert.match(allowed.headers['access-control-allow-methods'], /\bGET\b/);
      assert.match(allowed.headers['access-control-allow-methods'], /\bPOST\b/);
      assert.match(allowed.headers['access-control-allow-methods'], /\bPATCH\b/);
      assert.match(allowed.headers['access-control-allow-methods'], /\bPUT\b/);
      assert.match(allowed.headers['access-control-allow-methods'], /\bDELETE\b/);
      assert.match(allowed.headers['access-control-allow-methods'], /\bOPTIONS\b/);
      assert.match(allowed.headers['access-control-allow-headers'].toLowerCase(), /\bauthorization\b/);
      assert.match(allowed.headers['access-control-allow-headers'].toLowerCase(), /\bcontent-type\b/);
      assert.equal(allowed.headers['access-control-allow-credentials'], undefined);
    }
  }

  const allowedReviewPreflight = await request(app)
    .options('/api/admin/products/123/review')
    .set('Origin', 'https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app')
    .set('Access-Control-Request-Method', 'PATCH')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
  assert.equal(allowedReviewPreflight.status, 204);
  assert.equal(
    allowedReviewPreflight.headers['access-control-allow-origin'],
    'https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app',
  );

  const rejected = await request(app)
    .get('/api/products')
    .set('Origin', 'https://untrusted.example.test');
  assert.equal(rejected.status, 403);
  assert.equal(rejected.body.message, 'Origin is not allowed.');

  const rejectedPreflight = await request(app)
    .options('/api/seller/products')
    .set('Origin', 'https://untrusted.example.test')
    .set('Access-Control-Request-Method', 'GET')
    .set('Access-Control-Request-Headers', 'authorization,content-type');
  assert.equal(rejectedPreflight.status, 403);
  assert.equal(rejectedPreflight.headers['access-control-allow-origin'], undefined);

  const unauthenticatedSellerRequest = await request(app)
    .get('/api/seller/profile')
    .set('Origin', 'http://localhost:3005');
  assert.equal(unauthenticatedSellerRequest.status, 401);
  assert.equal(unauthenticatedSellerRequest.headers['access-control-allow-origin'], 'http://localhost:3005');

  const unauthenticatedProductRequest = await request(app)
    .post('/api/seller/products')
    .set('Origin', 'https://seller-lilac-five.vercel.app')
    .set('Content-Type', 'application/json')
    .send({});
  assert.equal(unauthenticatedProductRequest.status, 401);
  assert.equal(
    unauthenticatedProductRequest.headers['access-control-allow-origin'],
    'https://seller-lilac-five.vercel.app',
  );
});

test('CORS origin configuration preserves required portals and parses configured origins exactly', () => {
  assert.deepEqual(
    [...parseCorsOrigins(' http://localhost:3005, https://seller-lilac-five.vercel.app ,, ')],
    [
      'https://seller-n14iroz5o-leeharshas-projects.vercel.app',
      'https://seller-lilac-five.vercel.app',
      'https://admin-portal-sepia-chi.vercel.app',
      'https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app',
      'https://fitness-species-community.vercel.app',
      'http://localhost:3005',
    ],
  );
  assert.deepEqual([...parseCorsOrigins(undefined)], [
    'https://seller-n14iroz5o-leeharshas-projects.vercel.app',
    'https://seller-lilac-five.vercel.app',
    'https://admin-portal-sepia-chi.vercel.app',
    'https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app',
    'https://fitness-species-community.vercel.app',
    'http://localhost:3000',
    'http://localhost:3005',
    'http://localhost:3001',
  ]);
  assert.equal(parseCorsOrigins('*,https://local.example.test').has('*'), false);
  assert.equal(parseCorsOrigins('https://local.example.test/').has('https://local.example.test'), false);
  assert.equal(parseCorsOrigins('https://local.example.test/').has('https://local.example.test/'), true);
});

test('authenticated seller product creation succeeds with CORS from the production portal', async () => {
  const app = makeApp({ corsOrigins: parseCorsOrigins('http://localhost:5173') });
  const seller = await withAuth(app).post('/api/seller/profile').send({
    businessName: 'Species Fitness',
    ownerName: 'Seller Name',
    phone: '+91 9876543210',
    businessAddress: completeSeller().businessAddress,
  });
  assert.equal(seller.status, 200);

  const created = await request(app)
    .post('/api/seller/products')
    .set('Origin', 'https://seller-lilac-five.vercel.app')
    .set('Authorization', 'Bearer seller-a-token')
    .send(productPayload());

  assert.equal(created.status, 201);
  assert.equal(created.headers['access-control-allow-origin'], 'https://seller-lilac-five.vercel.app');
  assert.equal(created.body.product.status, 'pending');
});

test('MongoDB connection failure remains disconnected when no URI is configured', async () => {
  const previousUri = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  try {
    await assert.rejects(mongo.connectDB(), /MONGODB_URI is not configured/);
    assert.equal(mongo.getDbStatus(), 'disconnected');
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
  }
});

test('MongoDB connection requires the configured fitness_species database name', async () => {
  const previousUri = process.env.MONGODB_URI;
  const previousDbName = process.env.MONGODB_DB_NAME;
  process.env.MONGODB_URI = 'mongodb://example.invalid';
  delete process.env.MONGODB_DB_NAME;
  try {
    await assert.rejects(mongo.connectDB(), /MONGODB_DB_NAME is not configured/);
    assert.equal(mongo.getDbStatus(), 'disconnected');
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
    if (previousDbName === undefined) delete process.env.MONGODB_DB_NAME;
    else process.env.MONGODB_DB_NAME = previousDbName;
  }
});
