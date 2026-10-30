import { z } from 'zod';

export const doctorStatuses = [
  'draft',
  'pending_review',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
];

const dayNames = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const timeSchema = z.string().regex(timePattern, 'Use 24-hour HH:mm time.');
const currentYear = new Date().getFullYear();

const photoReferenceSchema = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Use a valid HTTPS profile photo URL.');

const qualificationSchema = z.object({
  qualification: z.string().trim().min(2).max(160),
  institution: z.string().trim().min(2).max(180),
  graduationYear: z.number().int().min(1900).max(currentYear + 5).optional(),
}).strict();

const breakSchema = z.object({
  startTime: timeSchema,
  endTime: timeSchema,
}).strict();

const specialtySchema = z.string().trim().min(2).max(100);

const profileFields = {
  fullName: z.string().trim().min(2).max(120),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).optional(),
  dateOfBirth: z.string().date().optional(),
  profilePhotoUrl: photoReferenceSchema.optional(),
  phone: z.string().trim().min(7).max(40),
  medicalRegistrationNumber: z.string().trim().min(2).max(100),
  medicalCouncil: z.string().trim().min(2).max(160),
  qualifications: z.array(qualificationSchema).min(1).max(20),
  primarySpecialty: specialtySchema,
  additionalSpecialties: z.array(specialtySchema).max(20),
  yearsExperience: z.number().int().min(0).max(80),
  clinicName: z.string().trim().min(2).max(160),
  clinicAddress: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().min(3).max(20),
  consultationMode: z.enum(['online', 'offline', 'both']),
  workingDays: z.array(z.enum(dayNames)).min(1).max(7),
  openingTime: timeSchema,
  closingTime: timeSchema,
  timeZone: z.string().trim().min(1).max(100),
  breaks: z.array(breakSchema).max(8),
  appointmentDurationMinutes: z.number().int().min(5).max(240),
  dailyAppointmentLimit: z.number().int().min(1).max(100),
  consultationFee: z.number().finite().min(0).max(1000000),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
};

const editableProfileFields = Object.fromEntries(
  Object.entries(profileFields).map(([field, schema]) => [field, schema.optional()]),
);

export const doctorDraftSchema = z.object(editableProfileFields).strict()
  .refine((profile) => Object.keys(profile).length > 0, {
    message: 'At least one doctor profile field is required.',
  })
  .superRefine((profile, context) => {
    if (
      profile.workingDays
      && new Set(profile.workingDays).size !== profile.workingDays.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['workingDays'],
        message: 'Working days must not contain duplicates.',
      });
    }
    if (profile.timeZone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: profile.timeZone });
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['timeZone'],
          message: 'Enter a valid IANA timezone.',
        });
      }
    }
    validateAvailability(profile, context);
  });

export const doctorSubmissionSchema = z.object(profileFields).strict()
  .superRefine((profile, context) => {
    if (new Set(profile.workingDays).size !== profile.workingDays.length) {
      context.addIssue({
        code: 'custom',
        path: ['workingDays'],
        message: 'Working days must not contain duplicates.',
      });
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: profile.timeZone });
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['timeZone'],
        message: 'Enter a valid IANA timezone.',
      });
    }
    validateAvailability(profile, context);
  });

function minutesSinceMidnight(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function validateAvailability(profile, context) {
  const opening = profile.openingTime;
  const closing = profile.closingTime;
  if (opening && closing && minutesSinceMidnight(closing) <= minutesSinceMidnight(opening)) {
    context.addIssue({
      code: 'custom',
      path: ['closingTime'],
      message: 'Closing time must be later than opening time.',
    });
  }

  if (!Array.isArray(profile.breaks)) return;
  const breaks = profile.breaks
    .map(({ startTime, endTime }, index) => ({
      index,
      start: minutesSinceMidnight(startTime),
      end: minutesSinceMidnight(endTime),
    }));

  for (const breakTime of breaks) {
    if (breakTime.end <= breakTime.start) {
      context.addIssue({
        code: 'custom',
        path: ['breaks', breakTime.index, 'endTime'],
        message: 'A break end time must be later than its start time.',
      });
    }
    if (
      opening
      && closing
      && (breakTime.start < minutesSinceMidnight(opening)
        || breakTime.end > minutesSinceMidnight(closing))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['breaks', breakTime.index],
        message: 'Breaks must fall within working hours.',
      });
    }
  }

  for (let index = 1; index < breaks.length; index += 1) {
    if (breaks[index].start < breaks[index - 1].end) {
      context.addIssue({
        code: 'custom',
        path: ['breaks', breaks[index].index],
        message: 'Breaks must not overlap and must be ordered by start time.',
      });
    }
  }
}

const pageNumber = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);

export const doctorDirectoryQuerySchema = z.object({
  specialty: specialtySchema.optional(),
  city: z.string().trim().min(1).max(100).optional(),
  page: pageNumber,
  limit: pageSize,
}).passthrough();

export const adminDoctorQuerySchema = z.object({
  status: z.enum(doctorStatuses).default('pending_review'),
  page: pageNumber,
  limit: pageSize,
}).strict();

export const doctorReviewSchema = z.object({
  status: z.enum(['approved', 'rejected', 'changes_requested', 'suspended']),
  reviewNote: z.string().trim().min(1).max(1000).optional(),
}).strict().superRefine((review, context) => {
  if (
    ['rejected', 'changes_requested', 'suspended'].includes(review.status)
    && !review.reviewNote
  ) {
    context.addIssue({
      code: 'custom',
      path: ['reviewNote'],
      message: 'A review note is required for this decision.',
    });
  }
});
