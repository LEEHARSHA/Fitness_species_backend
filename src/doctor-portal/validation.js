import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Enter a valid ID.');
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm time.');
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const text = (min, max) => z.string().trim().min(min).max(max);
const optionalText = (max) => z.string().trim().max(max).optional();
const httpsUrl = z.string().trim().url().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Use a valid HTTPS URL.');

const organizationFields = {
  name: text(2, 160),
  organizationType: z.enum([
    'multispeciality_hospital',
    'general_hospital',
    'specialty_hospital',
    'medical_centre',
    'private_clinic',
    'diagnostic_centre',
  ]),
  email: z.string().trim().email().max(254),
  phone: text(7, 40),
  address: text(5, 400),
  city: text(2, 100),
  state: text(2, 100),
  registrationNumber: text(2, 120),
  website: httpsUrl.optional(),
  logoUrl: httpsUrl.optional(),
  description: optionalText(2000),
  facilities: z.array(text(1, 120)).max(50).default([]),
  adminName: text(2, 120),
  adminDesignation: text(2, 120),
};

const breakSchema = z.object({ startTime: time, endTime: time }).strict();
const doctorFields = {
  fullName: text(2, 120),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']),
  dateOfBirth: z.string().date(),
  email: z.string().trim().email().max(254),
  phone: text(7, 40),
  specialization: text(2, 100),
  additionalSpecializations: z.array(text(2, 100)).max(20).default([]),
  qualifications: z.array(text(2, 160)).min(1).max(20),
  medicalRegistrationNumber: text(2, 100),
  medicalCouncil: text(2, 160),
  yearsExperience: z.number().int().min(0).max(80),
  biography: optionalText(3000),
  departmentId: objectId.optional(),
  branch: optionalText(160),
  consultationRoom: optionalText(80),
  consultationFee: z.number().finite().min(0).max(1000000),
  dailyAppointmentLimit: z.number().int().min(1).max(100),
  consultationMode: z.enum(['online', 'offline', 'both']),
  workingDays: z.array(z.enum(days)).min(1).max(7),
  openingTime: time,
  closingTime: time,
  timeZone: text(1, 100),
  appointmentDurationMinutes: z.number().int().min(5).max(240),
  breaks: z.array(breakSchema).max(8).default([]),
};
const dateOfBirthSchema = z.string().date().refine(
  (value) => value <= new Date().toISOString().slice(0, 10),
  'Date of birth cannot be in the future.',
);
doctorFields.dateOfBirth = dateOfBirthSchema;

export const organizationSchema = z.object(organizationFields).strict();
export const organizationUpdateSchema = z.object(
  Object.fromEntries(Object.entries(organizationFields).map(([key, schema]) => [key, schema.optional()])),
).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const organizationAdminQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

const validateDoctorSchedule = (doctor, context) => {
  if (doctor.closingTime && doctor.openingTime && doctor.closingTime <= doctor.openingTime) {
    context.addIssue({ code: 'custom', path: ['closingTime'], message: 'Closing time must be later than opening time.' });
  }
  if (doctor.timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: doctor.timeZone });
    } catch {
      context.addIssue({ code: 'custom', path: ['timeZone'], message: 'Enter a valid IANA time zone.' });
    }
  }
  (doctor.breaks || []).forEach((item, index) => {
    if (item.endTime <= item.startTime
      || (doctor.openingTime && item.startTime < doctor.openingTime)
      || (doctor.closingTime && item.endTime > doctor.closingTime)) {
      context.addIssue({ code: 'custom', path: ['breaks', index], message: 'Breaks must be valid and fall within working hours.' });
    }
    if (index > 0 && item.startTime < doctor.breaks[index - 1].endTime) {
      context.addIssue({ code: 'custom', path: ['breaks', index], message: 'Breaks must be ordered and must not overlap.' });
    }
  });
  if (doctor.workingDays && new Set(doctor.workingDays).size !== doctor.workingDays.length) {
    context.addIssue({ code: 'custom', path: ['workingDays'], message: 'Working days must not contain duplicates.' });
  }
};

export const hospitalDoctorSchema = z.object(doctorFields).strict().superRefine((doctor, context) => {
  validateDoctorSchedule(doctor, context);
});

export const doctorUpdateSchema = z.object(
  Object.fromEntries(Object.entries(doctorFields).map(([key, schema]) => [key, schema.optional()])),
).strict().superRefine(validateDoctorSchedule)
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const departmentSchema = z.object({
  name: text(2, 120),
  description: optionalText(1000),
}).strict();
export const departmentUpdateSchema = departmentSchema.partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
export const hospitalDoctorQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  specialization: text(2, 100).optional(),
  departmentId: objectId.optional(),
}).strict();
export const doctorActiveSchema = z.object({ isActive: z.boolean() }).strict();

export const appointmentBookingSchema = z.object({
  doctorId: objectId,
  patientName: text(2, 120),
  patientGender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).optional(),
  patientAgeAtBooking: z.number().int().min(0).max(120).optional(),
  appointmentDate: z.string().date(),
  appointmentTime: time,
  appointmentType: z.enum(['online', 'in_person']),
  patientConsent: z.literal(true),
}).strict();
export const appointmentRescheduleSchema = z.object({
  appointmentDate: z.string().date(),
  appointmentTime: time,
}).strict();
export const publicDoctorQuerySchema = z.object({
  specialty: text(1, 100).optional(),
  city: text(1, 100).optional(),
  departmentId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export const appointmentQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  doctorId: objectId.optional(),
  departmentId: objectId.optional(),
  status: z.enum(['requested', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  appointmentType: z.enum(['online', 'in_person']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((query) => !query.from || !query.to || query.from <= query.to, {
  path: ['to'],
  message: 'The end date must not precede the start date.',
});

export const appointmentStatusSchema = z.object({
  status: z.enum(['confirmed', 'completed', 'cancelled', 'no_show']),
  reason: optionalText(500),
}).strict().superRefine((update, context) => {
  if (['cancelled', 'no_show'].includes(update.status) && !update.reason?.trim()) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required.' });
  }
});

export const verificationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: optionalText(1000),
}).strict().superRefine((value, context) => {
  if (value.status === 'rejected' && !value.reviewNote?.trim()) {
    context.addIssue({ code: 'custom', path: ['reviewNote'], message: 'A rejection reason is required.' });
  }
});

export const invitationAcceptSchema = z.object({
  doctorId: objectId,
}).strict();
