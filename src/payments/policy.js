export const PAYMENT_PURPOSES = Object.freeze({
  PHYSICAL_PRODUCT: 'shop',
  QUALIFYING_CONSULTATION: 'appointment',
  DIGITAL_PREMIUM: 'subscription',
});

export const PAYMENT_PROVIDERS = Object.freeze({
  RAZORPAY: 'razorpay',
  GOOGLE_PLAY: 'google_play',
});

const PAYMENT_PURPOSE_POLICIES = Object.freeze({
  [PAYMENT_PURPOSES.PHYSICAL_PRODUCT]: Object.freeze({
    provider: PAYMENT_PROVIDERS.RAZORPAY,
    category: 'physical_product',
  }),
  [PAYMENT_PURPOSES.QUALIFYING_CONSULTATION]: Object.freeze({
    provider: PAYMENT_PROVIDERS.RAZORPAY,
    category: 'consultation_service',
  }),
  [PAYMENT_PURPOSES.DIGITAL_PREMIUM]: Object.freeze({
    provider: PAYMENT_PROVIDERS.GOOGLE_PLAY,
    category: 'digital_subscription',
  }),
});

export const PAYMENT_STATUS = Object.freeze({
  CREATED: 'created',
  AUTHORIZED: 'authorized',
  PENDING: 'pending',
  PAID: 'paid',
  FULFILLED: 'fulfilled',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  REFUND_PENDING: 'refund_pending',
  PARTIALLY_REFUNDED: 'partially_refunded',
  REFUNDED: 'refunded',
});

const PAYMENT_TRANSITIONS = Object.freeze({
  [PAYMENT_STATUS.CREATED]: new Set([
    PAYMENT_STATUS.AUTHORIZED,
    PAYMENT_STATUS.PENDING,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.EXPIRED,
  ]),
  [PAYMENT_STATUS.AUTHORIZED]: new Set([
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.EXPIRED,
  ]),
  [PAYMENT_STATUS.PENDING]: new Set([
    PAYMENT_STATUS.PAID,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.CANCELLED,
    PAYMENT_STATUS.EXPIRED,
  ]),
  [PAYMENT_STATUS.PAID]: new Set([
    PAYMENT_STATUS.FULFILLED,
    PAYMENT_STATUS.REFUND_PENDING,
    PAYMENT_STATUS.PARTIALLY_REFUNDED,
    PAYMENT_STATUS.REFUNDED,
  ]),
  [PAYMENT_STATUS.FULFILLED]: new Set([
    PAYMENT_STATUS.REFUND_PENDING,
    PAYMENT_STATUS.PARTIALLY_REFUNDED,
    PAYMENT_STATUS.REFUNDED,
  ]),
  [PAYMENT_STATUS.REFUND_PENDING]: new Set([
    PAYMENT_STATUS.PARTIALLY_REFUNDED,
    PAYMENT_STATUS.REFUNDED,
    PAYMENT_STATUS.PAID,
  ]),
  [PAYMENT_STATUS.PARTIALLY_REFUNDED]: new Set([
    PAYMENT_STATUS.REFUND_PENDING,
    PAYMENT_STATUS.REFUNDED,
  ]),
  [PAYMENT_STATUS.FAILED]: new Set(),
  [PAYMENT_STATUS.CANCELLED]: new Set(),
  [PAYMENT_STATUS.EXPIRED]: new Set(),
  [PAYMENT_STATUS.REFUNDED]: new Set(),
});

export function classifyPaymentPurpose(purpose) {
  const policy = PAYMENT_PURPOSE_POLICIES[purpose];
  if (!policy) {
    throw new Error(`Unsupported payment purpose: ${purpose}`);
  }
  return {
    purpose,
    ...policy,
  };
}

export function canTransitionPaymentStatus(fromStatus, toStatus) {
  return Boolean(PAYMENT_TRANSITIONS[fromStatus]?.has(toStatus));
}

