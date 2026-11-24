import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import Razorpay from 'razorpay';
import {
  getGooglePlaySubscription,
  verifyGooglePlayRtdnToken,
} from './googlePlayService.js';
import {
  adminRefundSchema,
  createRazorpayOrderSchema,
  verifyGooglePlaySubscriptionSchema,
  verifyRazorpaySignatureSchema,
} from './validation.js';
import { createUserNotification } from '../notifications/service.js';

const asyncRoute = (handler) => (req, res, next) => {
  return Promise.resolve(handler(req, res, next)).catch(next);
};

const hasId = (value) => /^[a-f\d]{24}$/i.test(value || '') && ObjectId.isValid(value);
const idOf = (value) => new ObjectId(value);
const identity = (user) => ({
  firebaseProjectId: user.firebaseProjectId,
  firebaseUid: user.uid || user.firebaseUid,
});
const appointmentIdentity = (user) => ({
  patientFirebaseProjectId: user.firebaseProjectId,
  patientFirebaseUid: user.uid || user.firebaseUid,
});

function resultError(res, result) {
  res.status(400).json({
    success: false,
    message: result.error.issues[0]?.message || 'Request validation failed.',
    issues: result.error.issues.map(({ path, message }) => ({ path, message })),
  });
}

function safeEqualHex(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string'
    || !/^[a-f\d]+$/i.test(actual) || expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}

function razorpayConfiguration() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { error: 'Payment provider is not configured.' };
  if (!keyId.startsWith('rzp_test_')) {
    return { error: 'Only Razorpay Test Mode credentials are enabled.' };
  }
  return { keyId, keySecret };
}

function productVariant(product, label) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) return label ? null : undefined;
  return variants.find((variant) => {
    const identifiers = [variant?.id, variant?.title, variant?.name, variant?.value]
      .filter((value) => typeof value === 'string');
    return identifiers.some((value) => value === label);
  }) || null;
}

function variantFilter(variant) {
  if (!variant) return null;
  if (variant.id !== undefined) return { 'variants.id': variant.id };
  if (variant.title !== undefined) return { 'variants.title': variant.title };
  if (variant.name !== undefined) return { 'variants.name': variant.name };
  if (variant.value !== undefined) return { 'variants.value': variant.value };
  return null;
}

function responseOrder(order, payment) {
  return {
    success: true,
    keyId: process.env.RAZORPAY_KEY_ID,
    razorpayOrderId: payment.razorpayOrderId,
    orderId: order._id.toString(),
    amount: payment.amountInPaise,
    amountInRupees: payment.amount,
    currency: payment.currency,
    title: payment.targetTitle,
    status: payment.status,
  };
}

export function createPaymentControllers({
  getDb,
  razorpayFactory = (config) => new Razorpay(config),
  googlePlayGetSubscription = getGooglePlaySubscription,
  googlePlayVerifyRtdnToken = verifyGooglePlayRtdnToken,
}) {
  const collection = (name) => getDb().collection(name);

  function getRazorpay(res) {
    const config = razorpayConfiguration();
    if (config.error) {
      res.status(503).json({ success: false, code: 'PAYMENT_PROVIDER_UNAVAILABLE', message: config.error });
      return null;
    }
    return {
      client: razorpayFactory({ key_id: config.keyId, key_secret: config.keySecret }),
      ...config,
    };
  }

  async function loadShopProducts(items) {
    const reserved = [];
    const lines = [];
    let subtotalInPaise = 0;
    const products = collection('products');

    for (const item of items) {
      const productId = idOf(item.productId);
      const product = await products.findOne({ _id: productId, status: 'approved' });
      if (!product) {
        return { error: 'One or more products are no longer available.', status: 409, reserved };
      }

      const variant = productVariant(product, item.variant);
      if (variant === null) {
        return { error: `The selected variant for ${product.name || 'a product'} is unavailable.`, status: 409, reserved };
      }
      const variantMatch = variantFilter(variant);
      const unitPrice = variant?.price ?? product.price;
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return { error: 'A product has an invalid price and cannot be purchased.', status: 409, reserved };
      }

      const stockFilter = {
        _id: productId,
        status: 'approved',
        stock: { $gte: item.quantity },
      };
      const stockUpdate = { stock: -item.quantity };
      if (variant?.stock !== undefined) {
        if (!variantMatch || !Number.isInteger(variant.stock)) {
          return { error: 'A product variant has invalid inventory data.', status: 409, reserved };
        }
        stockFilter.variants = {
          $elemMatch: {
            ...Object.fromEntries(Object.entries(variantMatch).map(([key, value]) => [key.replace('variants.', ''), value])),
            stock: { $gte: item.quantity },
          },
        };
        stockUpdate['variants.$.stock'] = -item.quantity;
      }
      const reservation = await products.updateOne(stockFilter, { $inc: stockUpdate });
      if (reservation.modifiedCount !== 1) {
        return { error: `${product.name || 'A product'} does not have enough stock.`, status: 409, reserved };
      }
      reserved.push({ productId, quantity: item.quantity, variantMatch, variantStock: variant?.stock !== undefined });

      const priceInPaise = Math.round(unitPrice * 100);
      if (!Number.isSafeInteger(priceInPaise) || priceInPaise <= 0) {
        return { error: 'A product has an invalid price and cannot be purchased.', status: 409, reserved };
      }
      subtotalInPaise += priceInPaise * item.quantity;
      if (!Number.isSafeInteger(subtotalInPaise)) {
        return { error: 'The order total is outside the supported range.', status: 400, reserved };
      }
      lines.push({
        productId: productId.toString(),
        productName: product.name || 'Fitness product',
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: priceInPaise / 100,
        sellerUid: product.sellerUid || product.sellerId || null,
        sellerId: product.sellerUid || product.sellerId || null,
      });
    }

    const deliveryFeeInPaise = subtotalInPaise > 99900 ? 0 : 4900;
    return {
      reserved,
      lines,
      subtotalInPaise,
      deliveryFeeInPaise,
      totalInPaise: subtotalInPaise + deliveryFeeInPaise,
    };
  }

  async function restoreReservedStock(reserved) {
    for (const entry of reserved) {
      const increment = { stock: entry.quantity };
      if (entry.variantStock) increment['variants.$.stock'] = entry.quantity;
      await collection('products').updateOne(
        { _id: entry.productId, ...(entry.variantMatch || {}) },
        { $inc: increment },
      );
    }
  }

  async function closePendingTarget(payment, status, now = new Date()) {
    if (payment.purpose === 'shop') {
      const orders = collection('productOrders');
      const order = await orders.findOne({
        _id: idOf(payment.targetId),
        ...identity(payment),
        paymentStatus: 'pending',
        inventoryReleasedAt: null,
      });
      if (!order) return;
      const released = await orders.updateOne(
        { _id: order._id, paymentStatus: 'pending', inventoryReleasedAt: null },
        {
          $set: {
            paymentStatus: status,
            orderStatus: status,
            inventoryReleasedAt: now,
            updatedAt: now,
          },
        },
      );
      if (released.modifiedCount !== 1) return;
      for (const item of order.items) {
        const productFilter = { _id: idOf(item.productId) };
        const increment = { stock: item.quantity };
        if (item.variant) {
          const product = await collection('products').findOne(productFilter);
          const variant = product && productVariant(product, item.variant);
          const match = variant && variantFilter(variant);
          if (match && variant.stock !== undefined) {
            Object.assign(productFilter, match);
            increment['variants.$.stock'] = item.quantity;
          }
        }
        await collection('products').updateOne(productFilter, { $inc: increment });
      }
    } else if (payment.purpose === 'appointment') {
      const appointment = await collection('doctorPortalAppointments').findOne({
        _id: idOf(payment.targetId),
        ...appointmentIdentity(payment),
        status: { $in: ['requested', 'confirmed'] },
        paymentStatus: 'pending',
      });
      if (!appointment) return;
      const cancelled = await collection('doctorPortalAppointments').updateOne(
        {
          _id: appointment._id,
          ...appointmentIdentity(payment),
          status: { $in: ['requested', 'confirmed'] },
          paymentStatus: 'pending',
        },
        {
          $set: {
            status: 'cancelled',
            paymentStatus: status,
            updatedAt: now,
          },
        },
      );
      if (cancelled.modifiedCount === 1) {
        await collection('doctorPortalDailyCapacity').updateOne(
          {
            _id: `${appointment.doctorId}:${appointment.appointmentDate}`,
            reservationCount: { $gt: 0 },
          },
          { $inc: { reservationCount: -1 } },
        );
      }
    }
  }

  async function createProviderOrder(gateway, payment) {
    try {
      const order = await gateway.client.orders.create({
        amount: payment.amountInPaise,
        currency: payment.currency,
        receipt: `fs_${randomUUID().replace(/-/g, '').slice(0, 28)}`,
        notes: {
          paymentId: payment.paymentId,
          purpose: payment.purpose,
        },
      });
      if (
        !order?.id
        || order.amount !== payment.amountInPaise
        || order.currency !== payment.currency
      ) {
        throw new Error('Razorpay returned an order with unexpected amount or currency.');
      }
      return order;
    } catch (error) {
      console.error('[payments] Razorpay order creation failed', {
        code: error?.error?.code || error?.code || 'PROVIDER_ERROR',
      });
      return null;
    }
  }

  async function createShopOrder(req, res, payload, gateway) {
    const orderCollection = collection('productOrders');
    const owner = identity(req.user);
    const existing = await orderCollection.findOne({
      ...owner,
      requestId: payload.requestId,
    });
    if (existing) {
      const existingPayment = await collection('payments').findOne({
        ...owner,
        purpose: 'shop',
        targetId: existing._id.toString(),
      });
      if (existingPayment?.status === 'created') {
        res.json(responseOrder(existing, existingPayment));
        return;
      }
      res.status(409).json({ success: false, message: 'This checkout request has already been processed.' });
      return;
    }

    const pricing = await loadShopProducts(payload.items);
    if (pricing.error) {
      await restoreReservedStock(pricing.reserved);
      res.status(pricing.status).json({ success: false, message: pricing.error });
      return;
    }
    const now = new Date();
    const order = {
      ...owner,
      requestId: payload.requestId,
      items: pricing.lines,
      deliveryAddress: payload.deliveryAddress,
      currency: 'INR',
      subtotal: pricing.subtotalInPaise / 100,
      deliveryFee: pricing.deliveryFeeInPaise / 100,
      totalAmount: pricing.totalInPaise / 100,
      amountInPaise: pricing.totalInPaise,
      paymentStatus: 'pending',
      orderStatus: 'pending_payment',
      holdExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
      inventoryReserved: true,
      inventoryReleasedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    let insertedOrder;
    try {
      insertedOrder = await orderCollection.insertOne(order);
    } catch (error) {
      await restoreReservedStock(pricing.reserved);
      if (error?.code === 11000) {
        const duplicate = await orderCollection.findOne({ ...owner, requestId: payload.requestId });
        const duplicatePayment = duplicate && await collection('payments').findOne({
          ...owner,
          purpose: 'shop',
          targetId: duplicate._id.toString(),
          status: 'created',
        });
        if (duplicate && duplicatePayment) {
          res.json(responseOrder(duplicate, duplicatePayment));
          return;
        }
        res.status(409).json({ success: false, message: 'This checkout request has already been processed.' });
        return;
      }
      throw error;
    }
    order._id = insertedOrder.insertedId;

    const payment = {
      paymentId: `pay_${randomUUID()}`,
      ...owner,
      purpose: 'shop',
      targetId: order._id.toString(),
      targetTitle: `Fitness Species order ${order._id.toString()}`,
      amount: order.totalAmount,
      amountInPaise: order.amountInPaise,
      currency: 'INR',
      status: 'created',
      provider: 'razorpay',
      requestId: payload.requestId,
      createdAt: now,
      updatedAt: now,
    };
    const providerOrder = await createProviderOrder(gateway, payment);
    if (!providerOrder) {
      await restoreReservedStock(pricing.reserved);
      await orderCollection.deleteOne({ _id: order._id });
      res.status(502).json({ success: false, code: 'PAYMENT_PROVIDER_ERROR', message: 'The payment provider could not create an order. Please try again.' });
      return;
    }

    payment.razorpayOrderId = providerOrder.id;
    try {
      await collection('payments').insertOne(payment);
    } catch (error) {
      await restoreReservedStock(pricing.reserved);
      await orderCollection.deleteOne({ _id: order._id });
      throw error;
    }
    res.status(201).json(responseOrder(order, payment));
  }

  async function createAppointmentOrder(req, res, payload, gateway) {
    const owner = identity(req.user);
    const appointment = await collection('doctorPortalAppointments').findOne({
      _id: idOf(payload.targetId),
      ...appointmentIdentity(req.user),
      status: { $in: ['requested', 'confirmed'] },
      paymentStatus: 'pending',
      paymentExpiresAt: { $gt: new Date() },
    });
    if (!appointment) {
      res.status(404).json({ success: false, message: 'A payable appointment was not found or its payment hold has expired.' });
      return;
    }
    const existingPayment = await collection('payments').findOne({
      ...owner,
      purpose: 'appointment',
      targetId: appointment._id.toString(),
      requestId: payload.requestId,
    });
    if (existingPayment) {
      if (existingPayment.status === 'created') {
        res.json(responseOrder(appointment, existingPayment));
      } else {
        res.status(409).json({ success: false, message: 'This appointment payment request has already been processed.' });
      }
      return;
    }

    const amount = appointment.consultationFee;
    const amountInPaise = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
    if (amountInPaise <= 0) {
      res.status(409).json({ success: false, message: 'This appointment does not have a payable consultation fee.' });
      return;
    }
    const payment = {
      paymentId: `pay_${randomUUID()}`,
      ...owner,
      purpose: 'appointment',
      targetId: appointment._id.toString(),
      targetTitle: `Consultation with ${appointment.doctorName || 'doctor'}`,
      amount: amountInPaise / 100,
      amountInPaise,
      currency: appointment.currency || 'INR',
      status: 'created',
      provider: 'razorpay',
      requestId: payload.requestId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const providerOrder = await createProviderOrder(gateway, payment);
    if (!providerOrder) {
      res.status(502).json({ success: false, code: 'PAYMENT_PROVIDER_ERROR', message: 'The payment provider could not create an order. Please try again.' });
      return;
    }
    payment.razorpayOrderId = providerOrder.id;
    await collection('payments').insertOne(payment);
    res.status(201).json(responseOrder(appointment, payment));
  }

  const createRazorpayOrder = asyncRoute(async (req, res) => {
    const parsed = createRazorpayOrderSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const gateway = getRazorpay(res);
    if (!gateway) return;

    if (parsed.data.purpose === 'shop') {
      await createShopOrder(req, res, parsed.data, gateway);
    } else {
      await createAppointmentOrder(req, res, parsed.data, gateway);
    }
  });

  async function providerPaymentIsCaptured(gateway, payment, paymentId) {
    const [remotePayment, remoteOrder] = await Promise.all([
      gateway.client.payments.fetch(paymentId),
      gateway.client.orders.fetch(payment.razorpayOrderId),
    ]);
    return {
      remotePayment,
      remoteOrder,
      valid: remotePayment?.order_id === payment.razorpayOrderId
        && remotePayment?.amount === payment.amountInPaise
        && remotePayment?.currency === payment.currency
        && remoteOrder?.amount === payment.amountInPaise
        && remoteOrder?.currency === payment.currency,
    };
  }

  async function markPaymentCaptured(payment, paymentId, signature) {
    const now = new Date();
    if (payment.purpose === 'shop') {
      const updatedOrder = await collection('productOrders').updateOne(
        {
          _id: idOf(payment.targetId),
          ...identity(payment),
          paymentStatus: 'pending',
          holdExpiresAt: { $gt: now },
        },
        {
          $set: {
            paymentStatus: 'paid',
            orderStatus: 'confirmed',
            razorpayPaymentId: paymentId,
            razorpayOrderId: payment.razorpayOrderId,
            paidAt: now,
            updatedAt: now,
          },
        },
      );
      if (updatedOrder.modifiedCount !== 1) {
        const alreadyPaid = await collection('productOrders').findOne({
          _id: idOf(payment.targetId),
          ...identity(payment),
          paymentStatus: 'paid',
          razorpayPaymentId: paymentId,
        });
        if (!alreadyPaid) return false;
      }
      const order = await collection('productOrders').findOne({
        _id: idOf(payment.targetId),
        ...identity(payment),
        paymentStatus: 'paid',
      });
      if (!order) return false;
      await createUserNotification(getDb(), {
        ...identity(payment),
        eventKey: `shop-order-paid:${order._id}`,
        title: 'Order confirmed',
        message: `Payment for order ${order._id} was verified and the order is confirmed.`,
        category: 'Orders',
        targetScreen: 'order_history',
        createdAt: order.paidAt || now,
      });
    } else if (payment.purpose === 'appointment') {
      const updatedAppointment = await collection('doctorPortalAppointments').updateOne(
        {
          _id: idOf(payment.targetId),
          ...appointmentIdentity(payment),
          status: { $in: ['requested', 'confirmed'] },
          paymentStatus: 'pending',
          paymentExpiresAt: { $gt: now },
        },
        {
          $set: {
            paymentStatus: 'paid',
            razorpayPaymentId: paymentId,
            razorpayOrderId: payment.razorpayOrderId,
            paidAt: now,
            updatedAt: now,
          },
        },
      );
      if (updatedAppointment.modifiedCount !== 1) {
        const alreadyPaid = await collection('doctorPortalAppointments').findOne({
          _id: idOf(payment.targetId),
          ...appointmentIdentity(payment),
          paymentStatus: 'paid',
          razorpayPaymentId: paymentId,
        });
        if (!alreadyPaid) return false;
      }
      const appointment = await collection('doctorPortalAppointments').findOne({
        _id: idOf(payment.targetId),
        ...appointmentIdentity(payment),
        paymentStatus: 'paid',
      });
      if (!appointment) return false;
      await createUserNotification(getDb(), {
        firebaseProjectId: payment.firebaseProjectId,
        firebaseUid: payment.firebaseUid,
        eventKey: `appointment-payment:${appointment._id}`,
        title: 'Appointment payment received',
        message: `Payment for your appointment with ${appointment.doctorName || 'your doctor'} on ${appointment.appointmentDate} at ${appointment.appointmentTime} was verified.`,
        category: 'Appointments',
        targetScreen: 'my_appointments',
        createdAt: appointment.paidAt || now,
      });
    }
    await collection('payments').updateOne(
      { _id: payment._id, status: { $in: ['created', 'authorized', 'pending'] } },
      {
        $set: {
          razorpayPaymentId: paymentId,
          razorpaySignature: signature || null,
          status: 'paid',
          paidAt: now,
          updatedAt: now,
        },
      },
    );
    return true;
  }

  async function refundUnappliedCapture(gateway, payment, paymentId) {
    const now = new Date();
    if (!gateway?.client?.payments?.refund) {
      await collection('payments').updateOne(
        { _id: payment._id, status: { $in: ['created', 'authorized', 'pending', 'paid'] } },
        {
          $set: {
            status: 'refund_required',
            razorpayPaymentId: paymentId,
            automaticRefund: true,
            refundReason: 'Captured payment could not be applied because the payment hold expired.',
            updatedAt: now,
          },
        },
      );
      return { status: 'refund_required' };
    }
    const claimed = await collection('payments').updateOne(
      {
        _id: payment._id,
        status: { $in: ['created', 'authorized', 'pending', 'paid'] },
      },
      {
        $set: {
          status: 'refund_pending',
          razorpayPaymentId: paymentId,
          automaticRefund: true,
          refundReason: 'Captured payment could not be applied because the payment hold expired.',
          refundInitiatedAt: now,
          updatedAt: now,
        },
      },
    );
    if (claimed.modifiedCount !== 1) {
      return collection('payments').findOne({ _id: payment._id });
    }

    try {
      const refund = await gateway.client.payments.refund(paymentId, {
        amount: payment.amountInPaise,
        notes: { reason: 'Expired payment hold' },
      });
      if (!refund?.id) throw new Error('Razorpay did not return a refund ID.');
      await collection('payments').updateOne(
        { _id: payment._id, status: 'refund_pending', automaticRefund: true },
        { $set: { refundId: refund.id, updatedAt: new Date() } },
      );
      return { status: 'refund_pending', refundId: refund.id };
    } catch (error) {
      await collection('payments').updateOne(
        { _id: payment._id, status: 'refund_pending', automaticRefund: true, refundId: { $exists: false } },
        { $set: { status: 'refund_required', updatedAt: new Date() } },
      );
      console.error('[payments] Automatic refund initiation failed', {
        paymentId: payment.paymentId,
        code: error?.error?.code || error?.code || 'PROVIDER_ERROR',
      });
      return { status: 'refund_required' };
    }
  }

  async function reconcileExpiredPaymentHolds() {
    const config = razorpayConfiguration();
    const gateway = config.error
      ? null
      : { client: razorpayFactory({ key_id: config.keyId, key_secret: config.keySecret }) };
    const now = new Date();
    let released = 0;
    let skipped = 0;

    async function reconcileTarget(target, purpose) {
      const targetId = target._id.toString();
      const owner = purpose === 'appointment'
        ? {
          firebaseProjectId: target.patientFirebaseProjectId,
          firebaseUid: target.patientFirebaseUid,
        }
        : identity(target);
      const payment = await collection('payments').findOne({
        ...owner,
        purpose,
        targetId,
      });
      if (!payment) {
        await closePendingTarget({ purpose, targetId, ...owner }, 'expired', now);
        released += 1;
        return;
      }
      if (['refund_pending', 'refund_required', 'refunded', 'failed', 'expired'].includes(payment.status)) {
        await closePendingTarget(payment, 'expired', now);
        released += 1;
        return;
      }
      if (!gateway) {
        skipped += 1;
        return;
      }

      let providerPayments;
      try {
        const result = await gateway.client.orders.fetchPayments(payment.razorpayOrderId);
        providerPayments = Array.isArray(result?.items) ? result.items : [];
      } catch (error) {
        console.error('[payments] Expired hold provider reconciliation failed', {
          paymentId: payment.paymentId,
          code: error?.error?.code || error?.code || 'PROVIDER_ERROR',
        });
        skipped += 1;
        return;
      }

      const captured = providerPayments.find((item) => item.status === 'captured');
      if (captured) {
        if (captured.order_id !== payment.razorpayOrderId
          || captured.amount !== payment.amountInPaise
          || captured.currency !== payment.currency) {
          console.error('[payments] Captured expired-hold payment requires manual review', {
            paymentId: payment.paymentId,
            purpose,
          });
          skipped += 1;
          return;
        }
        await refundUnappliedCapture(gateway, payment, captured.id);
        await closePendingTarget(payment, 'expired', now);
        released += 1;
        return;
      }

      if (providerPayments.some((item) => ['authorized', 'created', 'pending'].includes(item.status))) {
        skipped += 1;
        return;
      }

      await collection('payments').updateOne(
        { _id: payment._id, status: { $in: ['created', 'authorized', 'pending'] } },
        { $set: { status: 'expired', updatedAt: now } },
      );
      await closePendingTarget(payment, 'expired', now);
      released += 1;
    }

    const expiredOrders = await collection('productOrders').find({
      paymentStatus: 'pending',
      holdExpiresAt: { $lte: now },
      inventoryReleasedAt: null,
    }).limit(100).toArray();
    for (const order of expiredOrders) {
      await reconcileTarget(order, 'shop');
    }

    const expiredAppointments = await collection('doctorPortalAppointments').find({
      status: { $in: ['requested', 'confirmed'] },
      paymentStatus: 'pending',
      paymentExpiresAt: { $lte: now },
    }).limit(100).toArray();
    for (const appointment of expiredAppointments) {
      await reconcileTarget(appointment, 'appointment');
    }
    return { released, skipped, providerConfigured: Boolean(gateway) };
  }

  const verifyRazorpaySignature = asyncRoute(async (req, res) => {
    const parsed = verifyRazorpaySignatureSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const gateway = getRazorpay(res);
    if (!gateway) return;

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;
    const payment = await collection('payments').findOne({
      razorpayOrderId,
      ...identity(req.user),
      provider: 'razorpay',
    });
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment order was not found for this account.' });
      return;
    }
    if (payment.status === 'paid') {
      res.json({ success: true, status: 'paid', razorpayPaymentId: payment.razorpayPaymentId });
      return;
    }
    if (!['created', 'authorized', 'pending'].includes(payment.status)) {
      res.status(409).json({ success: false, message: 'This payment is no longer payable.' });
      return;
    }

    const expectedSignature = crypto.createHmac('sha256', gateway.keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    if (!safeEqualHex(expectedSignature, razorpaySignature)) {
      res.status(400).json({ success: false, message: 'Invalid payment signature verification.' });
      return;
    }

    let provider;
    try {
      provider = await providerPaymentIsCaptured(gateway, payment, razorpayPaymentId);
    } catch (error) {
      console.error('[payments] Razorpay payment lookup failed', {
        code: error?.error?.code || error?.code || 'PROVIDER_ERROR',
      });
      res.status(502).json({ success: false, code: 'PAYMENT_STATUS_UNAVAILABLE', message: 'The payment status could not be verified. Please retry.' });
      return;
    }
    if (!provider.valid) {
      res.status(400).json({ success: false, message: 'The provider payment does not match the order amount or currency.' });
      return;
    }
    if (provider.remotePayment.status !== 'captured') {
      if (provider.remotePayment.status === 'authorized') {
        await collection('payments').updateOne(
          { _id: payment._id, status: 'created' },
          { $set: { status: 'authorized', razorpayPaymentId, updatedAt: new Date() } },
        );
        res.status(202).json({ success: false, status: 'authorized', message: 'Payment authorization is pending capture.' });
        return;
      }
      res.status(402).json({ success: false, status: provider.remotePayment.status, message: 'The provider has not captured this payment.' });
      return;
    }
    const captured = await markPaymentCaptured(payment, razorpayPaymentId, razorpaySignature);
    if (!captured) {
      const refund = await refundUnappliedCapture(gateway, payment, razorpayPaymentId);
      res.status(409).json({
        success: false,
        code: 'PAYMENT_HOLD_EXPIRED',
        refundStatus: refund?.status || 'refund_required',
        message: refund?.status === 'refund_pending'
          ? 'The payment hold expired. A refund was initiated.'
          : 'The payment hold expired. The payment requires refund reconciliation.',
      });
      return;
    }
    res.json({
      success: true,
      status: 'paid',
      orderId: payment.targetId,
      razorpayPaymentId,
      message: 'Payment was verified and the order was confirmed.',
    });
  });

  const getMyPaymentHistory = asyncRoute(async (req, res) => {
    const history = await collection('payments')
      .find(identity(req.user))
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json({
      success: true,
      history: history.map((payment) => ({
        id: payment._id.toString(),
        paymentId: payment.paymentId,
        razorpayOrderId: payment.razorpayOrderId || null,
        razorpayPaymentId: payment.razorpayPaymentId || null,
        purpose: payment.purpose,
        targetId: payment.targetId,
        targetTitle: payment.targetTitle,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
      })),
    });
  });

  const getMyShopOrders = asyncRoute(async (req, res) => {
    const orders = await collection('productOrders')
      .find(identity(req.user))
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    res.json({
      success: true,
      orders: orders.map((order) => ({
        id: order._id.toString(),
        items: order.items,
        subtotal: order.subtotal,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        currency: order.currency,
        deliveryAddress: order.deliveryAddress,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        createdAt: order.createdAt,
      })),
    });
  });

  const getMySubscription = asyncRoute(async (req, res) => {
    const now = new Date();
    const subscriptions = await collection('userSubscriptions')
      .find({ ...identity(req.user), status: 'active', expiresAt: { $gt: now } })
      .sort({ expiresAt: -1 })
      .limit(1)
      .toArray();
    const subscription = subscriptions[0];
    res.json({
      success: true,
      isPremium: Boolean(subscription),
      ...(subscription ? {
        productId: subscription.productId,
        expiresAt: subscription.expiresAt,
        autoRenewing: subscription.autoRenewing,
      } : {}),
    });
  });

  const verifyGooglePlaySubscription = asyncRoute(async (req, res) => {
    const parsed = verifyGooglePlaySubscriptionSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    if (
      !googlePlayGetSubscription
      || !process.env.GOOGLE_PLAY_PACKAGE_NAME
      || !process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    ) {
      res.status(503).json({
        success: false,
        code: 'GOOGLE_PLAY_PROVIDER_UNAVAILABLE',
        message: 'Google Play subscription verification is not configured.',
      });
      return;
    }
    const products = (process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS || '')
      .split(',').map((productId) => productId.trim()).filter(Boolean);
    if (!products.includes(parsed.data.productId)) {
      res.status(400).json({ success: false, message: 'This subscription product is not configured.' });
      return;
    }
    const tokenHash = crypto.createHash('sha256').update(parsed.data.purchaseToken).digest('hex');
    const owner = identity(req.user);
    const existingOwner = await collection('userSubscriptions').findOne({ purchaseTokenHash: tokenHash });
    if (
      existingOwner
      && (existingOwner.firebaseProjectId !== owner.firebaseProjectId
        || existingOwner.firebaseUid !== owner.firebaseUid)
    ) {
      res.status(409).json({ success: false, message: 'This purchase is linked to a different account.' });
      return;
    }

    let purchase;
    try {
      purchase = await googlePlayGetSubscription({
        packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME,
        purchaseToken: parsed.data.purchaseToken,
      });
    } catch (error) {
      console.error('[payments] Google Play verification failed', {
        code: error?.code || error?.response?.status || 'PROVIDER_ERROR',
      });
      res.status(502).json({ success: false, code: 'SUBSCRIPTION_STATUS_UNAVAILABLE', message: 'Google Play could not verify this purchase.' });
      return;
    }
    const lineItem = purchase?.lineItems?.find((item) => item.productId === parsed.data.productId);
    const expiresAt = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
    const isActive = [
      'SUBSCRIPTION_STATE_ACTIVE',
      'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
      'SUBSCRIPTION_STATE_CANCELED',
    ]
      .includes(purchase?.subscriptionState)
      && expiresAt instanceof Date && Number.isFinite(expiresAt.getTime()) && expiresAt > new Date();
    if (!lineItem || !isActive) {
      res.status(402).json({ success: false, isPremium: false, message: 'Google Play reports that this subscription is not active.' });
      return;
    }

    const now = new Date();
    const subscription = {
      ...owner,
      productId: parsed.data.productId,
      purchaseTokenHash: tokenHash,
      provider: 'google_play',
      status: 'active',
      subscriptionState: purchase.subscriptionState,
      expiresAt,
      latestOrderId: purchase.latestOrderId || null,
      autoRenewing: lineItem.autoRenewingPlan?.autoRenewEnabled === true,
      updatedAt: now,
    };
    await collection('userSubscriptions').updateOne(
      { purchaseTokenHash: tokenHash },
      { $set: subscription, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
    res.json({ success: true, isPremium: true, expiresAt });
  });

  const handleGooglePlayWebhook = asyncRoute(async (req, res) => {
    const authorization = req.get('authorization') || '';
    const bearer = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!bearer) {
      res.status(401).json({ success: false, message: 'A verified Google Pub/Sub token is required.' });
      return;
    }
    if (!googlePlayVerifyRtdnToken) {
      res.status(503).json({ success: false, message: 'Google Play notification verification is not configured.' });
      return;
    }
    let authorized;
    try {
      authorized = await googlePlayVerifyRtdnToken(bearer[1]);
    } catch (error) {
      const missingConfiguration = error?.code === 'GOOGLE_PLAY_RTDN_CONFIGURATION_MISSING';
      console.error('[payments] Google Play notification authentication failed', {
        code: error?.code || 'TOKEN_VERIFICATION_FAILED',
      });
      res.status(missingConfiguration ? 503 : 401).json({
        success: false,
        message: missingConfiguration
          ? 'Google Play notification verification is not configured.'
          : 'Google Play notification authorization failed.',
      });
      return;
    }
    if (!authorized) {
      res.status(401).json({ success: false, message: 'Google Play notification authorization failed.' });
      return;
    }

    const encodedData = req.body?.message?.data;
    if (typeof encodedData !== 'string') {
      res.status(400).json({ success: false, message: 'Google Play notification data is missing.' });
      return;
    }
    let notification;
    try {
      notification = JSON.parse(Buffer.from(encodedData, 'base64').toString('utf8'));
    } catch {
      res.status(400).json({ success: false, message: 'Google Play notification data is invalid.' });
      return;
    }
    if (notification.packageName !== process.env.GOOGLE_PLAY_PACKAGE_NAME) {
      res.status(400).json({ success: false, message: 'Google Play notification package does not match.' });
      return;
    }
    const subscriptionNotification = notification.subscriptionNotification;
    if (!subscriptionNotification?.purchaseToken || !subscriptionNotification?.subscriptionId) {
      res.json({ success: true, received: true });
      return;
    }
    const allowedProducts = (process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCTS || '')
      .split(',').map((productId) => productId.trim()).filter(Boolean);
    if (!allowedProducts.includes(subscriptionNotification.subscriptionId)) {
      res.status(400).json({ success: false, message: 'Google Play notification product is not configured.' });
      return;
    }
    const tokenHash = crypto.createHash('sha256')
      .update(subscriptionNotification.purchaseToken)
      .digest('hex');
    const existing = await collection('userSubscriptions').findOne({ purchaseTokenHash: tokenHash });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Subscription record has not been linked to an account yet.' });
      return;
    }
    let purchase;
    try {
      purchase = await googlePlayGetSubscription({
        packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME,
        purchaseToken: subscriptionNotification.purchaseToken,
      });
    } catch (error) {
      console.error('[payments] Google Play notification refresh failed', {
        code: error?.code || error?.response?.status || 'PROVIDER_ERROR',
      });
      res.status(502).json({ success: false, message: 'Google Play subscription status is temporarily unavailable.' });
      return;
    }
    const lineItem = purchase?.lineItems?.find((item) => item.productId === subscriptionNotification.subscriptionId);
    const expiresAt = lineItem?.expiryTime ? new Date(lineItem.expiryTime) : null;
    const active = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED']
      .includes(purchase?.subscriptionState)
      && expiresAt instanceof Date && Number.isFinite(expiresAt.getTime()) && expiresAt > new Date();
    await collection('userSubscriptions').updateOne(
      { purchaseTokenHash: tokenHash },
      {
        $set: {
          status: active ? 'active' : purchase?.subscriptionState === 'SUBSCRIPTION_STATE_ON_HOLD' ? 'on_hold' : 'expired',
          subscriptionState: purchase?.subscriptionState || 'UNKNOWN',
          ...(expiresAt ? { expiresAt } : {}),
          autoRenewing: lineItem?.autoRenewingPlan?.autoRenewEnabled === true,
          latestOrderId: purchase?.latestOrderId || null,
          updatedAt: new Date(),
        },
      },
    );
    const eventId = `google-play:${req.body?.message?.messageId || crypto.createHash('sha256').update(encodedData).digest('hex')}`;
    await collection('paymentWebhookEvents').updateOne(
      { eventId },
      { $setOnInsert: { eventId, event: 'google-play-rtdn', receivedAt: new Date() } },
      { upsert: true },
    );
    res.json({ success: true, received: true, isPremium: active });
  });

  const handleRazorpayWebhook = asyncRoute(async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.get('x-razorpay-signature');
    if (!webhookSecret) {
      res.status(503).json({ success: false, message: 'Razorpay webhook verification is not configured.' });
      return;
    }
    if (!Buffer.isBuffer(req.rawBody) || !signature) {
      res.status(400).json({ success: false, message: 'Webhook signature or raw request body is missing.' });
      return;
    }
    const expected = crypto.createHmac('sha256', webhookSecret).update(req.rawBody).digest('hex');
    if (!safeEqualHex(expected, signature)) {
      res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
      return;
    }

    const eventId = req.get('x-razorpay-event-id')
      || crypto.createHash('sha256').update(req.rawBody).digest('hex');
    if (await collection('paymentWebhookEvents').findOne({ eventId })) {
      res.json({ success: true, received: true, duplicate: true });
      return;
    }
    const event = req.body?.event;
    const entity = req.body?.payload?.payment?.entity;
    if (['payment.captured', 'payment.authorized', 'payment.failed'].includes(event) && entity?.order_id) {
      const payment = await collection('payments').findOne({
        razorpayOrderId: entity.order_id,
        provider: 'razorpay',
      });
      if (payment && entity.amount === payment.amountInPaise && entity.currency === payment.currency) {
        if (event === 'payment.captured') {
          const captured = await markPaymentCaptured(payment, entity.id, null);
          if (!captured && payment.status !== 'paid') {
            const gateway = getRazorpay(res);
            if (!gateway) return;
            const refund = await refundUnappliedCapture(gateway, payment, entity.id);
            console.error('[payments] Captured payment could not be applied to its target', {
              paymentId: payment.paymentId,
              purpose: payment.purpose,
              refundStatus: refund?.status || 'refund_required',
            });
          }
        } else if (event === 'payment.authorized') {
          await collection('payments').updateOne(
            { _id: payment._id, status: 'created' },
            { $set: { status: 'authorized', razorpayPaymentId: entity.id, updatedAt: new Date() } },
          );
        } else {
          const failed = await collection('payments').updateOne(
            { _id: payment._id, status: { $in: ['created', 'authorized', 'pending'] } },
            { $set: { status: 'failed', updatedAt: new Date() } },
          );
          if (failed.modifiedCount === 1) await closePendingTarget(payment, 'failed');
        }
      }
    }
    const refundEntity = req.body?.payload?.refund?.entity;
    if (['refund.processed', 'refund.failed'].includes(event) && refundEntity?.payment_id) {
      const refundedPayment = await collection('payments').findOne(
        { razorpayPaymentId: refundEntity.payment_id, provider: 'razorpay' },
      );
      if (refundedPayment) {
        const refundUpdate = await collection('payments').updateOne(
          { _id: refundedPayment._id },
          {
            $set: {
              status: event === 'refund.processed'
                ? 'refunded'
                : refundedPayment.automaticRefund ? 'refund_required' : 'paid',
            ...(event === 'refund.processed' ? { refundedAt: new Date() } : {}),
              updatedAt: new Date(),
            },
          },
        );
        if (
          event === 'refund.processed'
          && refundUpdate.modifiedCount === 1
          && refundedPayment.purpose === 'shop'
        ) {
          const order = await collection('productOrders').findOne({
            _id: idOf(refundedPayment.targetId),
            ...identity(refundedPayment),
          });
          if (order) {
            await createUserNotification(getDb(), {
              ...identity(refundedPayment),
              eventKey: `shop-order-refund:${order._id}:${refundEntity.id}`,
              title: 'Order refund processed',
              message: `The refund for order ${order._id} has been processed.`,
              category: 'Orders',
              targetScreen: 'order_history',
            });
          }
        }
      }
    }
    await collection('paymentWebhookEvents').insertOne({ eventId, event, receivedAt: new Date() });
    res.json({ success: true, received: true });
  });

  const listAdminPayments = asyncRoute(async (_req, res) => {
    const payments = await collection('payments')
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    const subscriptions = await collection('userSubscriptions')
      .find({})
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();
    res.json({
      success: true,
      count: payments.length,
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription._id.toString(),
        firebaseProjectId: subscription.firebaseProjectId,
        firebaseUid: subscription.firebaseUid,
        productId: subscription.productId,
        status: subscription.status,
        subscriptionState: subscription.subscriptionState || null,
        expiresAt: subscription.expiresAt || null,
        autoRenewing: subscription.autoRenewing === true,
        updatedAt: subscription.updatedAt,
      })),
      payments: payments.map((payment) => ({
        id: payment._id.toString(),
        paymentId: payment.paymentId,
        firebaseProjectId: payment.firebaseProjectId,
        firebaseUid: payment.firebaseUid,
        purpose: payment.purpose,
        targetId: payment.targetId,
        targetTitle: payment.targetTitle,
        amount: payment.amount,
        amountInPaise: payment.amountInPaise,
        currency: payment.currency,
        status: payment.status,
        provider: payment.provider,
        razorpayOrderId: payment.razorpayOrderId || null,
        razorpayPaymentId: payment.razorpayPaymentId || null,
        refundId: payment.refundId || null,
        createdAt: payment.createdAt,
        paidAt: payment.paidAt || null,
        refundedAt: payment.refundedAt || null,
      })),
    });
  });

  const processAdminRefund = asyncRoute(async (req, res) => {
    const parsed = adminRefundSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const gateway = getRazorpay(res);
    if (!gateway) return;
    const payment = await collection('payments').findOne({
      provider: 'razorpay',
      $or: [
        { paymentId: parsed.data.paymentId },
        { razorpayPaymentId: parsed.data.paymentId },
        { razorpayOrderId: parsed.data.paymentId },
      ],
    });
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record not found.' });
      return;
    }
    if (!payment.razorpayPaymentId || !['paid', 'fulfilled', 'refund_required'].includes(payment.status)) {
      res.status(409).json({ success: false, message: 'Only captured payments can be refunded.' });
      return;
    }
    if (payment.refundId || payment.status === 'refund_pending' || payment.status === 'refunded') {
      res.status(409).json({ success: false, message: 'A refund has already been initiated for this payment.' });
      return;
    }
    const now = new Date();
    const claimed = await collection('payments').updateOne(
      {
        _id: payment._id,
        status: { $in: ['paid', 'fulfilled', 'refund_required'] },
        refundId: { $exists: false },
      },
      { $set: { status: 'refund_pending', refundReason: parsed.data.reason || 'Admin refund', refundInitiatedAt: now, updatedAt: now } },
    );
    if (claimed.modifiedCount !== 1) {
      res.status(409).json({ success: false, message: 'A refund has already been initiated for this payment.' });
      return;
    }
    let refund;
    try {
      refund = await gateway.client.payments.refund(payment.razorpayPaymentId, {
        amount: payment.amountInPaise,
        notes: { reason: parsed.data.reason || 'Admin refund' },
      });
      if (!refund?.id) throw new Error('Razorpay did not return a refund ID.');
    } catch (error) {
      await collection('payments').updateOne(
        { _id: payment._id, status: 'refund_pending', refundId: { $exists: false } },
        { $set: { status: payment.status, updatedAt: new Date() }, $unset: { refundInitiatedAt: '', refundReason: '' } },
      );
      console.error('[payments] Razorpay refund initiation failed', {
        code: error?.error?.code || error?.code || 'PROVIDER_ERROR',
      });
      res.status(502).json({ success: false, code: 'REFUND_PROVIDER_ERROR', message: 'The payment provider could not initiate the refund.' });
      return;
    }
    await collection('payments').updateOne(
      { _id: payment._id, status: 'refund_pending', refundId: { $exists: false } },
      {
        $set: {
          refundId: refund.id,
          updatedAt: new Date(),
        },
      },
    );
    res.json({ success: true, status: 'refund_pending', refundId: refund.id });
  });

  return {
    createRazorpayOrder,
    verifyRazorpaySignature,
    getMyPaymentHistory,
    getMyShopOrders,
    getMySubscription,
    verifyGooglePlaySubscription,
    handleGooglePlayWebhook,
    handleRazorpayWebhook,
    listAdminPayments,
    processAdminRefund,
    reconcileExpiredPaymentHolds,
  };
}
