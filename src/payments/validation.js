import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid ID is required.');
const requestId = z.string().uuid();

const shopOrderSchema = z.object({
  purpose: z.literal('shop'),
  requestId,
  deliveryAddress: z.string().trim().min(8).max(1000),
  items: z.array(z.object({
    productId: objectId,
    variant: z.string().trim().max(120).optional().default(''),
    quantity: z.number().int().min(1).max(25),
  }).strict()).min(1).max(30),
}).strict().superRefine((order, context) => {
  const distinctItems = new Set(
    order.items.map((item) => `${item.productId}:${item.variant.toLocaleLowerCase('en-US')}`),
  );
  if (distinctItems.size !== order.items.length) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'A product variant may only appear once in an order.',
    });
  }
});

const appointmentOrderSchema = z.object({
  purpose: z.literal('appointment'),
  requestId,
  targetId: objectId,
}).strict();

export const createRazorpayOrderSchema = z.discriminatedUnion('purpose', [
  shopOrderSchema,
  appointmentOrderSchema,
]);

export const verifyRazorpaySignatureSchema = z.object({
  razorpayOrderId: z.string().min(1).max(80),
  razorpayPaymentId: z.string().min(1).max(80),
  razorpaySignature: z.string().regex(/^[a-f\d]{64}$/i),
}).strict();

export const verifyGooglePlaySubscriptionSchema = z.object({
  productId: z.string().min(1).max(200),
  purchaseToken: z.string().min(1).max(4096),
}).strict();

export const myShopOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const adminRefundSchema = z.object({
  paymentId: z.string().min(1).max(100),
  reason: z.string().trim().max(500).optional(),
}).strict();
