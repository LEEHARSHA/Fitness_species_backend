import { z } from 'zod';

export const createRazorpayOrderSchema = z.object({
  purpose: z.enum(['shop', 'appointment']),
  targetId: z.string().min(1, 'Target ID is required'),
  notes: z.record(z.string(), z.string()).optional(),
});

export const verifyRazorpaySignatureSchema = z.object({
  razorpayOrderId: z.string().min(1, 'Razorpay Order ID is required'),
  razorpayPaymentId: z.string().min(1, 'Razorpay Payment ID is required'),
  razorpaySignature: z.string().min(1, 'Razorpay Signature is required'),
  purpose: z.enum(['shop', 'appointment']),
  targetId: z.string().min(1, 'Target ID is required'),
});

export const verifyGooglePlaySubscriptionSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  purchaseToken: z.string().min(1, 'Purchase token is required'),
  packageName: z.string().optional(),
});

export const adminRefundSchema = z.object({
  paymentId: z.string().min(1, 'Payment ID is required'),
  reason: z.string().optional(),
});
