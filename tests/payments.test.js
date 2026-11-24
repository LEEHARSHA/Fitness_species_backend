import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createPaymentControllers } from '../src/payments/controllers.js';

const primaryProject = 'sellerportal-2786c';
const androidProject = 'project-fitness-species';
const keyId = 'rzp_test_unit_test';
const keySecret = 'test-secret-not-a-real-credential';
let records;
let gatewayState;

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
  return left === right;
}

function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((clause) => matches(document, clause));
    const actual = key.split('.').reduce((value, part) => value?.[part], document);
    if (expected && typeof expected === 'object' && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      if ('$in' in expected && !expected.$in.some((value) => equal(actual, value))) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      if ('$gte' in expected && !(actual >= expected.$gte)) return false;
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$lte' in expected && !(actual <= expected.$lte)) return false;
      if ('$exists' in expected && (actual !== undefined) !== expected.$exists) return false;
      if ('$ne' in expected && equal(actual, expected.$ne)) return false;
      return true;
    }
    return equal(actual, expected);
  });
}

class TestCollection {
  constructor(name) {
    this.name = name;
    records[name] ||= [];
  }

  items() {
    return records[this.name];
  }

  async findOne(query) {
    return clone(this.items().find((item) => matches(item, query)) || null);
  }

  async countDocuments(query = {}) {
    return this.items().filter((item) => matches(item, query)).length;
  }

  async insertOne(document) {
    const stored = clone(document);
    stored._id ||= new ObjectId();
    if (
      this.name === 'productOrders'
      && this.items().some((item) => item.firebaseProjectId === stored.firebaseProjectId
        && item.firebaseUid === stored.firebaseUid && item.requestId === stored.requestId)
    ) {
      const error = new Error('Duplicate request.');
      error.code = 11000;
      throw error;
    }
    this.items().push(stored);
    return { insertedId: stored._id };
  }

  async updateOne(query, update, options = {}) {
    let item = this.items().find((record) => matches(record, query));
    if (!item && options.upsert) {
      item = Object.fromEntries(Object.entries(query).filter(([key]) => !key.startsWith('$')));
      Object.assign(item, clone(update.$setOnInsert || {}));
      item._id ||= new ObjectId();
      this.items().push(item);
    }
    if (!item) return { matchedCount: 0, modifiedCount: 0 };
    for (const [field, value] of Object.entries(update.$set || {})) {
      item[field] = clone(value);
    }
    for (const [field, value] of Object.entries(update.$setOnInsert || {})) {
      if (item[field] === undefined) item[field] = clone(value);
    }
    for (const [field, amount] of Object.entries(update.$inc || {})) {
      item[field] = (item[field] || 0) + amount;
    }
    for (const field of Object.keys(update.$unset || {})) delete item[field];
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async deleteOne(query) {
    const index = this.items().findIndex((item) => matches(item, query));
    if (index < 0) return { deletedCount: 0 };
    this.items().splice(index, 1);
    return { deletedCount: 1 };
  }

  find(query = {}) {
    let items = this.items().filter((item) => matches(item, query));
    const cursor = {
      sort(spec) {
        const [field, direction] = Object.entries(spec)[0];
        items = [...items].sort((a, b) => ((a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) * direction));
        return cursor;
      },
      limit(count) {
        items = items.slice(0, count);
        return cursor;
      },
      skip(count) {
        items = items.slice(count);
        return cursor;
      },
      async toArray() {
        return clone(items);
      },
    };
    return cursor;
  }
}

function makeControllers(options = {}) {
  return createPaymentControllers({
    getDb: () => ({ collection: (name) => new TestCollection(name) }),
    razorpayFactory: () => gatewayState.client,
    ...options,
  });
}

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function call(handler, req = {}) {
  const res = response();
  await handler({
    body: {},
    user: { uid: 'customer-a', firebaseProjectId: androidProject },
    headers: {},
    get(name) { return this.headers[name.toLowerCase()]; },
    ...req,
  }, res, (error) => { throw error; });
  return res;
}

function shopRequest(overrides = {}) {
  return {
    purpose: 'shop',
    requestId: '4a80d5f8-f545-48cb-9952-9fb15101b52a',
    deliveryAddress: '12 Fitness Road, Visakhapatnam',
    items: [{ productId: 'aaaaaaaaaaaaaaaaaaaaaaaa', variant: '', quantity: 2 }],
    ...overrides,
  };
}

function expectedSignature(orderId, paymentId) {
  return crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
}

beforeEach(() => {
  records = {
    doctorPortalAppointments: [],
    products: [{
      _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
      status: 'approved',
      name: 'Training Belt',
      price: 120.5,
      stock: 10,
      sellerUid: 'seller-a',
    }],
  };
  gatewayState = {
    createdOrders: 0,
    providerPayments: [],
    client: {
      orders: {
        create: async (data) => {
          gatewayState.createdOrders += 1;
          gatewayState.orderData = data;
          return {
            id: `order_provider_${gatewayState.createdOrders}`,
            amount: data.amount,
            currency: data.currency,
          };
        },
        fetch: async (id) => ({
          id,
          amount: gatewayState.orderData.amount,
          currency: gatewayState.orderData.currency,
        }),
        fetchPayments: async () => ({ items: gatewayState.providerPayments || [] }),
      },
      payments: {
        fetch: async (id) => ({
          id,
          order_id: gatewayState.lastOrderId,
          amount: gatewayState.orderData.amount,
          currency: gatewayState.orderData.currency,
          status: 'captured',
        }),
        refund: async (id, data) => {
          gatewayState.refundRequest = { id, data };
          return { id: 'rfnd_provider_1', status: 'pending' };
        },
      },
    },
  };
  process.env.RAZORPAY_KEY_ID = keyId;
  process.env.RAZORPAY_KEY_SECRET = keySecret;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  delete process.env.GOOGLE_PLAY_PACKAGE_NAME;
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  delete process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS;
});

test('Shop order creation prices approved products on the server and reserves stock', async () => {
  const controllers = makeControllers();
  const result = await call(controllers.createRazorpayOrder, { body: shopRequest() });

  assert.equal(result.statusCode, 201);
  assert.equal(result.body.amount, 29000);
  assert.equal(result.body.amountInRupees, 290);
  assert.equal(result.body.currency, 'INR');
  assert.equal(result.body.orderId.length, 24);
  assert.equal(gatewayState.orderData.amount, 29000);
  assert.equal(records.products[0].stock, 8);
  assert.equal(records.productOrders[0].items[0].sellerUid, 'seller-a');
  assert.equal(records.productOrders[0].paymentStatus, 'pending');
  assert.equal(records.productOrders[0].orderStatus, 'pending_payment');
  assert.equal(records.payments[0].status, 'created');
});

test('my shop orders are project-scoped and return the requested page with server status', async () => {
  records.productOrders = Array.from({ length: 5 }, (_, index) => ({
    _id: new ObjectId(),
    firebaseProjectId: androidProject,
    firebaseUid: 'customer-a',
    items: [],
    subtotal: index + 10,
    deliveryFee: 0,
    totalAmount: index + 10,
    currency: 'INR',
    deliveryAddress: 'Saved address',
    paymentStatus: index === 0 ? 'pending' : 'paid',
    orderStatus: index === 0 ? 'pending_payment' : 'confirmed',
    createdAt: new Date(Date.UTC(2025, 0, index + 1)),
  }));
  records.productOrders.push({
    ...records.productOrders[0],
    _id: new ObjectId(),
    firebaseProjectId: primaryProject,
  });
  records.productOrders.push({
    ...records.productOrders[0],
    _id: new ObjectId(),
    firebaseUid: 'another-customer',
  });

  const result = await call(makeControllers().getMyShopOrders, {
    query: { page: '2', limit: '2' },
    user: { uid: 'customer-a', firebaseProjectId: androidProject },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.total, 5);
  assert.equal(result.body.page, 2);
  assert.equal(result.body.limit, 2);
  assert.equal(result.body.orders.length, 2);
  assert.ok(result.body.orders.every((order) => order.orderStatus === 'confirmed'));
});

test('Shop order retries are idempotent and do not reserve stock twice', async () => {
  const controllers = makeControllers();
  const first = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  const retry = await call(controllers.createRazorpayOrder, { body: shopRequest() });

  assert.equal(first.statusCode, 201);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.razorpayOrderId, first.body.razorpayOrderId);
  assert.equal(gatewayState.createdOrders, 1);
  assert.equal(records.products[0].stock, 8);
});

test('unapproved, missing, and out-of-stock products cannot create payable orders', async () => {
  const controllers = makeControllers();
  const outOfStock = await call(controllers.createRazorpayOrder, {
    body: shopRequest({ items: [{ productId: 'aaaaaaaaaaaaaaaaaaaaaaaa', variant: '', quantity: 11 }] }),
  });
  assert.equal(outOfStock.statusCode, 409);
  assert.equal(gatewayState.createdOrders, 0);

  records.products[0].status = 'pending';
  const unapproved = await call(controllers.createRazorpayOrder, { body: shopRequest({ requestId: '89854bcf-d51e-4242-ae34-952b35099b62' }) });
  assert.equal(unapproved.statusCode, 409);
  assert.equal(records.payments, undefined);
});

test('missing Test Mode credentials never creates a simulated payment order', async () => {
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  const result = await call(makeControllers().createRazorpayOrder, { body: shopRequest() });

  assert.equal(result.statusCode, 503);
  assert.equal(result.body.code, 'PAYMENT_PROVIDER_UNAVAILABLE');
  assert.equal(gatewayState.createdOrders, 0);
  assert.equal(records.productOrders, undefined);
});

test('Razorpay provider errors restore reserved stock and do not create an order record', async () => {
  gatewayState.client.orders.create = async () => {
    const error = new Error('provider credentials should not be surfaced');
    error.error = { code: 'BAD_REQUEST_ERROR' };
    throw error;
  };
  const result = await call(makeControllers().createRazorpayOrder, { body: shopRequest() });

  assert.equal(result.statusCode, 502);
  assert.equal(result.body.code, 'PAYMENT_PROVIDER_ERROR');
  assert.equal(records.products[0].stock, 10);
  assert.equal(records.productOrders.length, 0);
  assert.equal(records.payments, undefined);
});

test('only an owned, correctly signed, captured payment with matching amount is confirmed', async () => {
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  const orderId = created.body.razorpayOrderId;
  gatewayState.lastOrderId = orderId;

  const invalid = await call(controllers.verifyRazorpaySignature, {
    body: {
      razorpayOrderId: orderId,
      razorpayPaymentId: 'pay_provider_1',
      razorpaySignature: '0'.repeat(64),
    },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(records.payments[0].status, 'created');

  const wrongOwner = await call(controllers.verifyRazorpaySignature, {
    user: { uid: 'customer-b', firebaseProjectId: androidProject },
    body: {
      razorpayOrderId: orderId,
      razorpayPaymentId: 'pay_provider_1',
      razorpaySignature: expectedSignature(orderId, 'pay_provider_1'),
    },
  });
  assert.equal(wrongOwner.statusCode, 404);

  const verified = await call(controllers.verifyRazorpaySignature, {
    body: {
      razorpayOrderId: orderId,
      razorpayPaymentId: 'pay_provider_1',
      razorpaySignature: expectedSignature(orderId, 'pay_provider_1'),
    },
  });
  assert.equal(verified.statusCode, 200);
  assert.equal(verified.body.status, 'paid');
  assert.equal(records.payments[0].status, 'paid');
  assert.equal(records.productOrders[0].paymentStatus, 'paid');
  assert.equal(records.productOrders[0].orderStatus, 'confirmed');
  assert.equal(records.notifications.length, 1);
  assert.equal(records.notifications[0].category, 'Orders');
  assert.equal(records.notifications[0].firebaseProjectId, androidProject);
  assert.equal(records.notifications[0].targetScreen, 'order_history');
});

test('appointment payments use the patient Firebase identity and update the held appointment', async () => {
  const appointmentId = new ObjectId();
  records.doctorPortalAppointments.push({
    _id: appointmentId,
    patientFirebaseProjectId: androidProject,
    patientFirebaseUid: 'customer-a',
    status: 'requested',
    paymentStatus: 'pending',
    paymentExpiresAt: new Date(Date.now() + 60_000),
    consultationFee: 125,
    currency: 'INR',
    doctorName: 'Dr. Example',
    appointmentDate: '2026-12-01',
    appointmentTime: '10:30',
  });
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, {
    body: {
      purpose: 'appointment',
      requestId: '79921321-86c0-4b6a-9c52-22d765c5b61e',
      targetId: appointmentId.toString(),
    },
  });

  assert.equal(created.statusCode, 201);
  assert.equal(created.body.amount, 12_500);
  gatewayState.lastOrderId = created.body.razorpayOrderId;
  const verified = await call(controllers.verifyRazorpaySignature, {
    body: {
      razorpayOrderId: gatewayState.lastOrderId,
      razorpayPaymentId: 'pay_appointment_1',
      razorpaySignature: expectedSignature(gatewayState.lastOrderId, 'pay_appointment_1'),
    },
  });

  assert.equal(verified.statusCode, 200);
  assert.equal(records.doctorPortalAppointments[0].paymentStatus, 'paid');
  assert.equal(records.doctorPortalAppointments[0].razorpayPaymentId, 'pay_appointment_1');
  assert.equal(records.payments[0].status, 'paid');
  assert.equal(records.notifications.length, 1);
  assert.equal(records.notifications[0].category, 'Appointments');
  assert.equal(records.notifications[0].firebaseProjectId, androidProject);
});

test('a provider amount mismatch cannot mark an order paid', async () => {
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  gatewayState.lastOrderId = created.body.razorpayOrderId;
  gatewayState.client.payments.fetch = async () => ({
    id: 'pay_provider_1',
    order_id: gatewayState.lastOrderId,
    amount: gatewayState.orderData.amount - 1,
    currency: 'INR',
    status: 'captured',
  });

  const result = await call(controllers.verifyRazorpaySignature, {
    body: {
      razorpayOrderId: gatewayState.lastOrderId,
      razorpayPaymentId: 'pay_provider_1',
      razorpaySignature: expectedSignature(gatewayState.lastOrderId, 'pay_provider_1'),
    },
  });
  assert.equal(result.statusCode, 400);
  assert.equal(records.payments[0].status, 'created');
  assert.equal(records.productOrders[0].paymentStatus, 'pending');
});

test('a captured payment whose hold expired is not fulfilled and is automatically refunded', async () => {
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  gatewayState.lastOrderId = created.body.razorpayOrderId;
  records.productOrders[0].holdExpiresAt = new Date(Date.now() - 1000);

  const result = await call(controllers.verifyRazorpaySignature, {
    body: {
      razorpayOrderId: gatewayState.lastOrderId,
      razorpayPaymentId: 'pay_late_capture',
      razorpaySignature: expectedSignature(gatewayState.lastOrderId, 'pay_late_capture'),
    },
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.code, 'PAYMENT_HOLD_EXPIRED');
  assert.equal(result.body.refundStatus, 'refund_pending');
  assert.equal(records.productOrders[0].paymentStatus, 'pending');
  assert.equal(records.payments[0].status, 'refund_pending');
  assert.equal(records.payments[0].refundId, 'rfnd_provider_1');
  assert.equal(gatewayState.refundRequest.id, 'pay_late_capture');
});

test('a failed automatic refund is recorded for admin reconciliation', async () => {
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  gatewayState.lastOrderId = created.body.razorpayOrderId;
  records.productOrders[0].holdExpiresAt = new Date(Date.now() - 1000);
  gatewayState.client.payments.refund = async () => {
    throw new Error('provider diagnostic must not leak');
  };

  const result = await call(controllers.verifyRazorpaySignature, {
    body: {
      razorpayOrderId: gatewayState.lastOrderId,
      razorpayPaymentId: 'pay_late_capture',
      razorpaySignature: expectedSignature(gatewayState.lastOrderId, 'pay_late_capture'),
    },
  });

  assert.equal(result.statusCode, 409);
  assert.equal(result.body.refundStatus, 'refund_required');
  assert.equal(records.payments[0].status, 'refund_required');
  assert.equal(records.payments[0].razorpayPaymentId, 'pay_late_capture');
});

test('expired unpaid checkout holds release inventory idempotently', async () => {
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  records.productOrders[0].holdExpiresAt = new Date(Date.now() - 1000);
  records.products[0].stock = 8;

  const first = await controllers.reconcileExpiredPaymentHolds();
  const second = await controllers.reconcileExpiredPaymentHolds();

  assert.equal(first.released, 1);
  assert.equal(records.productOrders[0].paymentStatus, 'expired');
  assert.equal(records.productOrders[0].orderStatus, 'expired');
  assert.equal(records.products[0].stock, 10);
  assert.equal(second.released, 0);
  assert.ok(created.body.orderId);
});

test('expired holds with captured payments trigger a refund before stock is released', async () => {
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  records.productOrders[0].holdExpiresAt = new Date(Date.now() - 1000);
  records.products[0].stock = 8;
  gatewayState.providerPayments = [{
    id: 'pay_late_capture',
    order_id: created.body.razorpayOrderId,
    amount: created.body.amount,
    currency: 'INR',
    status: 'captured',
  }];

  const result = await controllers.reconcileExpiredPaymentHolds();

  assert.equal(result.released, 1);
  assert.equal(gatewayState.refundRequest.id, 'pay_late_capture');
  assert.equal(records.payments[0].status, 'refund_pending');
  assert.equal(records.productOrders[0].paymentStatus, 'expired');
  assert.equal(records.products[0].stock, 10);
});

test('signed failed-payment webhooks release reserved inventory only once', async () => {
  const controllers = makeControllers();
  const created = await call(controllers.createRazorpayOrder, { body: shopRequest() });
  process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
  const body = {
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'pay_provider_failed',
          order_id: created.body.razorpayOrderId,
          amount: created.body.amount,
          currency: 'INR',
        },
      },
    },
  };
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  const request = {
    body,
    rawBody,
    headers: {
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': 'evt_failed_1',
    },
  };
  const first = await call(controllers.handleRazorpayWebhook, request);
  const second = await call(controllers.handleRazorpayWebhook, request);

  assert.equal(first.statusCode, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(records.products[0].stock, 10);
  assert.equal(records.productOrders[0].paymentStatus, 'failed');
});

test('Google Play subscriptions are granted only from active Publisher API results', async () => {
  process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.example.fitness';
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"client_email":"publisher@example.test","private_key":"not-used-in-this-test"}';
  process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS = 'fitness_species_premium_monthly,fitness_species_premium_yearly';
  const expiry = new Date(Date.now() + 60_000).toISOString();
  const controllers = makeControllers({
    googlePlayGetSubscription: async () => ({
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      latestOrderId: 'GPA.test',
      lineItems: [{
        productId: 'fitness_species_premium_monthly',
        expiryTime: expiry,
        autoRenewingPlan: { autoRenewEnabled: true },
      }],
    }),
  });
  const result = await call(controllers.verifyGooglePlaySubscription, {
    body: { productId: 'fitness_species_premium_monthly', purchaseToken: 'play-token-value' },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.isPremium, true);
  assert.equal(records.userSubscriptions[0].status, 'active');
  assert.equal(records.userSubscriptions[0].purchaseTokenHash.length, 64);
  assert.equal('purchaseToken' in records.userSubscriptions[0], false);
});

test('expired and cross-account Google Play purchases do not grant entitlements', async () => {
  process.env.GOOGLE_PLAY_PACKAGE_NAME = 'com.example.fitness';
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"client_email":"publisher@example.test","private_key":"not-used-in-this-test"}';
  process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS = 'fitness_species_premium_monthly';
  const tokenHash = crypto.createHash('sha256').update('linked-token').digest('hex');
  records.userSubscriptions = [{
    _id: new ObjectId(),
    purchaseTokenHash: tokenHash,
    firebaseProjectId: primaryProject,
    firebaseUid: 'another-project-user',
  }];
  const controllers = makeControllers({
    googlePlayGetSubscription: async () => ({
      subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
      lineItems: [{
        productId: 'fitness_species_premium_monthly',
        expiryTime: new Date(Date.now() - 60_000).toISOString(),
      }],
    }),
  });

  const inactive = await call(controllers.verifyGooglePlaySubscription, {
    body: { productId: 'fitness_species_premium_monthly', purchaseToken: 'new-token' },
  });
  assert.equal(inactive.statusCode, 402);

  const linkedToOtherProject = await call(controllers.verifyGooglePlaySubscription, {
    body: { productId: 'fitness_species_premium_monthly', purchaseToken: 'linked-token' },
  });
  assert.equal(linkedToOtherProject.statusCode, 409);
});
