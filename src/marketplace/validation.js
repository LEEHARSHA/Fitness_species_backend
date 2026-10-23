import { z } from 'zod';

export const productStatuses = ['pending', 'approved', 'rejected'];
export const productCategories = [
  'Supplements',
  'Medicines / Wellness',
  'Gym Wear',
  'Fitness Equipment',
  'Footwear',
  'Snacks',
];

const addressSchema = z.object({
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(30).optional(),
}).strict();

const sellerProfileSchema = z.object({
  businessName: z.string().trim().min(2).max(120).optional(),
  ownerName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(5).max(40).optional(),
  businessAddress: addressSchema.optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, {
  message: 'At least one seller profile field is required.',
});

const variantSchema = z.object({
  id: z.string().max(120).optional(),
  title: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  value: z.string().max(200).optional(),
  sku: z.string().max(100).optional(),
  price: z.number().finite().nonnegative().optional(),
  stock: z.number().int().nonnegative().optional(),
  attributes: z.record(z.string(), z.string()).optional(),
}).passthrough();

const productFields = {
  name: z.string().trim().min(2).max(200),
  description: z.string().max(10000).optional(),
  shortDescription: z.string().max(500).optional(),
  category: z.enum(productCategories),
  subCategory: z.string().trim().max(120).optional(),
  brand: z.string().trim().max(120).optional(),
  sku: z.string().trim().max(100).optional(),
  price: z.number().finite().positive(),
  compareAtPrice: z.number().finite().positive().nullable().optional(),
  discountPercent: z.number().finite().min(0).max(100).optional(),
  stock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  images: z.array(z.string().url().max(2048)).min(1).max(30).optional(),
  variants: z.array(variantSchema).max(100).optional(),
  specifications: z.record(z.string(), z.string()).optional(),
};

export const createSellerProfileSchema = sellerProfileSchema;
export const updateSellerProfileSchema = sellerProfileSchema;
export const createProductSchema = z.object(productFields).strict();
export const updateProductSchema = z.object(productFields).partial().strict()
  .refine((product) => Object.keys(product).length > 0, {
    message: 'At least one editable product field is required.',
  });
export const updateProductStockSchema = z.object({
  stock: z.number().int().nonnegative(),
}).strict();

export const sellerProductQuerySchema = z.object({
  status: z.enum(productStatuses).optional(),
});

const pageNumber = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);

export const adminProductQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  page: pageNumber,
  limit: pageSize,
});

export const publicProductQuerySchema = z.object({
  category: z.string().trim().min(1).max(120).optional(),
  subCategory: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  minPrice: z.coerce.number().finite().nonnegative().optional(),
  maxPrice: z.coerce.number().finite().nonnegative().optional(),
  page: pageNumber,
  limit: pageSize,
}).refine((query) => (
  query.minPrice === undefined
  || query.maxPrice === undefined
  || query.minPrice <= query.maxPrice
), { message: 'minPrice cannot be greater than maxPrice.' });

export const productReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().trim().min(5).max(1000).optional(),
}).strict().refine((review) => (
  review.status !== 'rejected' || Boolean(review.rejectionReason)
), { message: 'A rejection reason of 5 to 1000 characters is required.' });
