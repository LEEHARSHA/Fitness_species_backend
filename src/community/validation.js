import { z } from 'zod';

export const organizerStatuses = ['pending', 'approved', 'rejected', 'changes_requested'];
export const eventStatuses = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'changes_requested',
  'cancelled',
  'completed',
];
export const eventCategories = [
  'running',
  'walking',
  'cycling',
  'gym',
  'college',
  'corporate',
  'yoga',
  'sports',
  'other',
];

const optionalHttpsUrl = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Use a valid HTTPS URL.');

const dateString = z.string().trim().min(1).refine((value) => Number.isFinite(Date.parse(value)), {
  message: 'Enter a valid date and time.',
});

const organizerFields = {
  type: z.enum(['organization', 'individual']),
  organizationName: z.string().trim().min(2).max(160).optional(),
  organizationType: z.string().trim().min(2).max(100).optional(),
  contactName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  website: optionalHttpsUrl.optional(),
  description: z.string().trim().min(20).max(3000),
  experience: z.string().trim().min(20).max(3000).optional(),
  publicProfile: optionalHttpsUrl.optional(),
};

export const organizerApplicationSchema = z.object(organizerFields).strict().superRefine((value, context) => {
  if (value.type === 'organization' && !value.organizationName) {
    context.addIssue({
      code: 'custom',
      path: ['organizationName'],
      message: 'Organization name is required.',
    });
  }
  if (value.type === 'individual' && !value.experience) {
    context.addIssue({
      code: 'custom',
      path: ['experience'],
      message: 'Describe your fitness or community experience.',
    });
  }
  if (value.type === 'individual' && value.organizationName) {
    context.addIssue({
      code: 'custom',
      path: ['organizationName'],
      message: 'Individuals cannot submit an organization name.',
    });
  }
});

export const organizerProfileSchema = z.object({
  organizationName: z.string().trim().min(2).max(160).optional(),
  organizationType: z.string().trim().min(2).max(100).optional(),
  contactName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(7).max(40).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  website: optionalHttpsUrl.optional(),
  description: z.string().trim().min(20).max(3000).optional(),
  experience: z.string().trim().min(20).max(3000).optional(),
  publicProfile: optionalHttpsUrl.optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, {
  message: 'At least one profile field is required.',
});

const eventFields = {
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(30).max(10000),
  category: z.enum(eventCategories),
  coverImageUrl: optionalHttpsUrl,
  startAt: dateString,
  endAt: dateString,
  timeZone: z.string().trim().min(1).max(100),
  venueType: z.enum(['in_person', 'online']),
  venueName: z.string().trim().max(160).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  registrationDeadline: dateString.optional(),
  capacity: z.number().int().positive().max(100000).optional(),
  eligibility: z.string().trim().max(2000).optional(),
  instructions: z.string().trim().max(3000).optional(),
  pricingType: z.enum(['free', 'paid']),
  amount: z.number().finite().positive().max(10000000).optional(),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).default('INR'),
  externalRegistrationUrl: optionalHttpsUrl.optional(),
};

function validateEventFields(event, context) {
  const startAt = Date.parse(event.startAt);
  const endAt = Date.parse(event.endAt);
  if (startAt <= Date.now()) {
    context.addIssue({
      code: 'custom',
      path: ['startAt'],
      message: 'Event start time must be in the future.',
    });
  }
  if (endAt <= startAt) {
    context.addIssue({
      code: 'custom',
      path: ['endAt'],
      message: 'End time must be after the start time.',
    });
  }
  if (event.registrationDeadline && Date.parse(event.registrationDeadline) > Date.parse(event.startAt)) {
    context.addIssue({
      code: 'custom',
      path: ['registrationDeadline'],
      message: 'Registration deadline must be on or before the event start.',
    });
  }
  if (event.registrationDeadline && Date.parse(event.registrationDeadline) <= Date.now()) {
    context.addIssue({
      code: 'custom',
      path: ['registrationDeadline'],
      message: 'Registration deadline must be in the future.',
    });
  }
  if ((event.latitude === undefined) !== (event.longitude === undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['latitude'],
      message: 'Provide both latitude and longitude, or neither.',
    });
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: event.timeZone }).format(new Date(event.startAt));
  } catch {
    context.addIssue({
      code: 'custom',
      path: ['timeZone'],
      message: 'Enter a valid IANA timezone.',
    });
  }
  if (event.venueType === 'in_person' && (!event.venueName || !event.address || !event.city)) {
    context.addIssue({
      code: 'custom',
      path: ['venueName'],
      message: 'In-person events require a venue name, address, and city.',
    });
  }
  if (event.pricingType === 'paid' && event.amount === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['amount'],
      message: 'Paid events require a positive amount.',
    });
  }
  if (event.pricingType === 'free' && event.amount !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['amount'],
      message: 'Free events must not include a price.',
    });
  }
  if (
    event.pricingType === 'paid'
    && !event.externalRegistrationUrl
    && !event.instructions
  ) {
    context.addIssue({
      code: 'custom',
      path: ['externalRegistrationUrl'],
      message: 'Paid events require an external registration link or organizer instructions.',
    });
  }
}

export const createEventSchema = z.object(eventFields).strict().superRefine(validateEventFields);
export const updateEventSchema = z.object(eventFields).partial().strict()
  .refine((event) => Object.keys(event).length > 0, {
    message: 'At least one event field is required.',
  })
  .superRefine((event, context) => {
    if (event.startAt && event.endAt && Date.parse(event.endAt) <= Date.parse(event.startAt)) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'End time must be after the start time.',
      });
    }
    if ((event.latitude === undefined) !== (event.longitude === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Provide both latitude and longitude, or neither.',
      });
    }
  });

const pageNumber = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);

export const registrationQuerySchema = z.object({
  page: pageNumber,
  limit: pageSize,
});

export const eventRegistrationSchema = z.object({
  participantName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  phone: z.string().trim().min(7).max(40).optional().or(z.literal('')),
}).strict();

export const publicEventQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  postalCode: z.string().trim().min(1).max(20).optional(),
  category: z.enum(eventCategories).optional(),
  startDate: dateString.optional(),
  endDate: dateString.optional(),
  pricingType: z.enum(['free', 'paid']).optional(),
  organizerType: z.enum(['organization', 'individual']).optional(),
  latitude: z.coerce.number().finite().min(-90).max(90).optional(),
  longitude: z.coerce.number().finite().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().finite().positive().max(500).default(50),
  sortBy: z.enum(['date', 'distance']).default('date'),
  page: pageNumber,
  limit: pageSize,
}).refine((query) => (
  (query.latitude === undefined) === (query.longitude === undefined)
), {
  message: 'Provide both latitude and longitude, or neither.',
}).refine((query) => (
  query.sortBy !== 'distance' || query.latitude !== undefined
), {
  message: 'Distance sorting requires latitude and longitude.',
}).refine((query) => (
  query.startDate === undefined
  || query.endDate === undefined
  || Date.parse(query.endDate) >= Date.parse(query.startDate)
), {
  message: 'endDate cannot be before startDate.',
});

export const adminReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'changes_requested']),
  reviewNote: z.string().trim().max(1000).optional(),
}).strict().refine((review) => (
  review.status === 'approved' || Boolean(review.reviewNote && review.reviewNote.length >= 5)
), {
  message: 'A review note of 5 to 1000 characters is required unless approved.',
});
