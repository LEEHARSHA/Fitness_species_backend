import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_PURPOSES,
  PAYMENT_PROVIDERS,
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
  classifyPaymentPurpose,
} from '../src/payments/policy.js';

test('payment purpose classification keeps gateways and SKUs separate', () => {
  assert.deepEqual(
    classifyPaymentPurpose(PAYMENT_PURPOSES.PHYSICAL_PRODUCT),
    {
      purpose: 'shop',
      provider: PAYMENT_PROVIDERS.RAZORPAY,
      category: 'physical_product',
    },
  );
  assert.deepEqual(
    classifyPaymentPurpose(PAYMENT_PURPOSES.QUALIFYING_CONSULTATION),
    {
      purpose: 'appointment',
      provider: PAYMENT_PROVIDERS.RAZORPAY,
      category: 'consultation_service',
    },
  );
  assert.deepEqual(
    classifyPaymentPurpose(PAYMENT_PURPOSES.DIGITAL_PREMIUM),
    {
      purpose: 'subscription',
      provider: PAYMENT_PROVIDERS.GOOGLE_PLAY,
      category: 'digital_subscription',
    },
  );
});

test('unsupported payment purpose is rejected', () => {
  assert.throws(
    () => classifyPaymentPurpose('other'),
    /Unsupported payment purpose/,
  );
});

test('payment status transitions reject invalid transitions', () => {
  assert.equal(
    canTransitionPaymentStatus(PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PAID),
    false,
  );
  assert.equal(
    canTransitionPaymentStatus(PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING),
    true,
  );
  assert.equal(
    canTransitionPaymentStatus(PAYMENT_STATUS.PAID, PAYMENT_STATUS.FULFILLED),
    true,
  );
  assert.equal(
    canTransitionPaymentStatus(PAYMENT_STATUS.FULFILLED, PAYMENT_STATUS.REFUND_PENDING),
    true,
  );
  assert.equal(
    canTransitionPaymentStatus(PAYMENT_STATUS.REFUND_PENDING, PAYMENT_STATUS.PAID),
    true,
  );
  assert.equal(
    canTransitionPaymentStatus(PAYMENT_STATUS.REFUNDED, PAYMENT_STATUS.PAID),
    false,
  );
});
