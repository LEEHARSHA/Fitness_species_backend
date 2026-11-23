import { ObjectId } from 'mongodb';
import {
  appointmentBookingSchema,
  appointmentQuerySchema,
  appointmentRescheduleSchema,
  appointmentSummaryQuerySchema,
  appointmentStatusSchema,
  adminOrganizationDoctorsQuerySchema,
  availabilityOverrideSchema,
  availabilityQuerySchema,
  consultationAccessSchema,
  consultationSchema,
  departmentSchema,
  departmentUpdateSchema,
  doctorUpdateSchema,
  doctorActiveSchema,
  hospitalDoctorQuerySchema,
  hospitalDoctorSchema,
  invitationAcceptSchema,
  organizationAdminQuerySchema,
  organizationSchema,
  organizationUpdateSchema,
  notificationQuerySchema,
  patientDirectoryQuerySchema,
  patientVisitsQuerySchema,
  publicDoctorQuerySchema,
  staffInvitationAcceptSchema,
  staffInvitationSchema,
  verificationSchema,
} from './validation.js';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
const idOf = (value) => new ObjectId(value);
const hasId = (value) => /^[a-f\d]{24}$/i.test(value || '') && ObjectId.isValid(value);
const hasDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const owner = (user) => ({ firebaseProjectId: user.firebaseProjectId, firebaseUid: user.uid });
const userOwner = (document, user) => (
  document?.firebaseProjectId === user.firebaseProjectId && document?.firebaseUid === user.uid
);
const clean = (document) => {
  if (!document) return null;
  const {
    _id,
    firebaseProjectId: _firebaseProjectId,
    firebaseUid: _firebaseUid,
    adminFirebaseProjectId: _adminFirebaseProjectId,
    adminFirebaseUid: _adminFirebaseUid,
    assignedFirebaseProjectId: _assignedFirebaseProjectId,
    assignedFirebaseUid: _assignedFirebaseUid,
    patientFirebaseProjectId: _patientFirebaseProjectId,
    patientFirebaseUid: _patientFirebaseUid,
    recipientFirebaseProjectId: _recipientFirebaseProjectId,
    recipientFirebaseUid: _recipientFirebaseUid,
    eventKey: _eventKey,
    slotKeys: _slotKeys,
    ...rest
  } = document;
  return { ...rest, id: _id.toString() };
};
const resultError = (res, result) => res.status(400).json({
  success: false,
  message: result.error.issues[0]?.message || 'Request validation failed.',
  issues: result.error.issues.map(({ path, message }) => ({ path, message })),
});

const minutes = (time) => {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};
const dayName = (date) => (
  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${date}T12:00:00Z`).getUTCDay()]
);
const localDateTime = (timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return { date: `${value.year}-${value.month}-${value.day}`, time: `${value.hour}:${value.minute}` };
};
const isPast = (doctor, date, time) => {
  const now = localDateTime(doctor.timeZone || 'Asia/Kolkata');
  return date < now.date || (date === now.date && time <= now.time);
};
const slotKeysFor = (doctorId, date, time, duration) => {
  const start = minutes(time);
  return Array.from({ length: duration }, (_, index) => `${doctorId}:${date}:${String(Math.floor((start + index) / 60)).padStart(2, '0')}:${String((start + index) % 60).padStart(2, '0')}`);
};
const availabilityError = (doctor, date, time, appointmentType) => {
  const override = doctor.availabilityOverrides?.[date];
  if (override?.isAvailable === false) return 'The doctor is not available on that date.';
  const hasOverrideHours = override?.isAvailable === true && override.openingTime && override.closingTime;
  if (!hasOverrideHours && !doctor.workingDays?.includes(dayName(date))) return 'The doctor is not available on that day.';
  const openingTime = hasOverrideHours ? override.openingTime : doctor.openingTime;
  const closingTime = hasOverrideHours ? override.closingTime : doctor.closingTime;
  if (time < openingTime || minutes(time) + doctor.appointmentDurationMinutes > minutes(closingTime)) {
    return 'The requested time is outside the doctor’s availability.';
  }
  if (doctor.consultationMode === 'online' && appointmentType !== 'online') return 'This doctor only offers online consultations.';
  if (doctor.consultationMode === 'offline' && appointmentType !== 'in_person') return 'This doctor only offers in-person consultations.';
  const start = minutes(time);
  const end = start + doctor.appointmentDurationMinutes;
  const breaks = override?.breaks || doctor.breaks || [];
  if (breaks.some((period) => start < minutes(period.endTime) && end > minutes(period.startTime))) {
    return 'The requested time overlaps a scheduled break.';
  }
  return null;
};

export function createDoctorPortalControllers({ getDb }) {
  const collection = (name) => getDb().collection(name);
  const audit = (user, action, subjectId, details = {}) => (
    collection('doctorPortalAuditLogs').insertOne({
      action,
      actorFirebaseProjectId: user.firebaseProjectId,
      actorFirebaseUid: user.uid,
      subjectId,
      ...details,
      createdAt: new Date(),
    })
  );
  const staffResponse = (staff) => {
    if (!staff) return null;
    const {
      _id,
      emailSearch: _emailSearch,
      firebaseProjectId: _firebaseProjectId,
      firebaseUid: _firebaseUid,
      invitedBy: _invitedBy,
      revokedBy: _revokedBy,
      ...safeFields
    } = staff;
    return { ...safeFields, id: _id.toString() };
  };
  const operationalAppointmentResponse = (appointment) => ({
    id: appointment._id.toString(),
    appointmentId: appointment.appointmentId,
    patientName: appointment.patientName,
    patientContact: appointment.patientContact,
    consultationReason: appointment.consultationReason,
    notes: appointment.notes,
    doctorId: appointment.doctorId,
    doctorName: appointment.doctorName,
    doctorSpecialization: appointment.doctorSpecialization,
    organizationId: appointment.organizationId?.toString() || null,
    organizationName: appointment.organizationName,
    departmentId: appointment.departmentId?.toString() || null,
    appointmentDate: appointment.appointmentDate,
    appointmentTime: appointment.appointmentTime,
    appointmentType: appointment.appointmentType,
    status: appointment.status,
    consultationFee: appointment.consultationFee ?? null,
    currency: appointment.currency || 'INR',
    paymentStatus: appointment.paymentStatus || 'not_required',
    paidAt: appointment.paidAt || null,
    statusHistory: (appointment.statusHistory || []).map(({ status, changedAt }) => ({ status, changedAt })),
    rescheduleHistory: (appointment.rescheduleHistory || []).map(({
      previousDate,
      previousTime,
      appointmentDate,
      appointmentTime,
      changedAt,
    }) => ({ previousDate, previousTime, appointmentDate, appointmentTime, changedAt })),
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  });
  const consultationResponse = (consultation) => {
    if (!consultation) return null;
    const { createdBy: _createdBy, updatedBy: _updatedBy, ...safeFields } = clean(consultation);
    return safeFields;
  };

  async function hospitalStaff(user) {
    return collection('doctorPortalStaff').find({
      firebaseProjectId: user.firebaseProjectId,
      firebaseUid: user.uid,
      isActive: true,
    }).toArray();
  }

  async function createAppointmentNotifications(appointment, eventType, eventKeySuffix) {
    const recipients = [];
    if (appointment.patientFirebaseProjectId && appointment.patientFirebaseUid) {
      recipients.push({
        firebaseProjectId: appointment.patientFirebaseProjectId,
        uid: appointment.patientFirebaseUid,
        type: 'patient',
      });
    }

    if (hasId(appointment.doctorId)) {
      const doctorId = idOf(appointment.doctorId);
      if (appointment.organizationId) {
        const [doctor, organization] = await Promise.all([
          collection('doctorPortalDoctors').findOne({ _id: doctorId }),
          collection('doctorPortalOrganizations').findOne({ _id: appointment.organizationId }),
        ]);
        if (doctor?.assignedFirebaseProjectId && doctor.assignedFirebaseUid) {
          recipients.push({
            firebaseProjectId: doctor.assignedFirebaseProjectId,
            uid: doctor.assignedFirebaseUid,
            type: 'doctor',
          });
        }
        if (organization?.adminFirebaseProjectId && organization.adminFirebaseUid) {
          recipients.push({
            firebaseProjectId: organization.adminFirebaseProjectId,
            uid: organization.adminFirebaseUid,
            type: 'hospital',
          });
        }
      } else {
        const doctor = await collection('doctorApplications').findOne({ _id: doctorId });
        if (doctor?.firebaseProjectId && doctor.firebaseUid) {
          recipients.push({
            firebaseProjectId: doctor.firebaseProjectId,
            uid: doctor.firebaseUid,
            type: 'doctor',
          });
        }
      }
    }

    const now = new Date();
    const title = eventType === 'appointment_requested'
      ? 'New appointment request'
      : eventType === 'appointment_rescheduled'
        ? 'Appointment rescheduled'
        : 'Appointment status updated';
    const body = eventType === 'appointment_requested'
      ? `A patient requested an appointment for ${appointment.appointmentDate} at ${appointment.appointmentTime}.`
      : eventType === 'appointment_rescheduled'
        ? `An appointment was rescheduled to ${appointment.appointmentDate} at ${appointment.appointmentTime}.`
        : `Appointment status changed to ${appointment.status}.`;

    for (const recipient of recipients) {
      const eventKey = [
        appointment._id.toString(),
        eventKeySuffix,
        recipient.firebaseProjectId,
        recipient.uid,
      ].join(':');
      await collection('doctorPortalNotifications').updateOne(
        { eventKey },
        { $setOnInsert: {
          eventKey,
          recipientFirebaseProjectId: recipient.firebaseProjectId,
          recipientFirebaseUid: recipient.uid,
          recipientType: recipient.type,
          organizationId: appointment.organizationId || null,
          appointmentId: appointment._id,
          type: eventType,
          title,
          body,
          readAt: null,
          scheduledFor: null,
          isActive: true,
          createdAt: now,
        } },
        { upsert: true },
      );
    }
  }

  async function updateFollowUpNotifications(appointment, consultation, previous) {
    const oldReminderAt = previous?.followUpReminderAt
      ? new Date(previous.followUpReminderAt).getTime()
      : null;
    const reminderAt = consultation.followUpReminderAt
      ? new Date(consultation.followUpReminderAt).getTime()
      : null;
    if (oldReminderAt === reminderAt
      && previous?.followUpDate === consultation.followUpDate) return;

    const recipients = [];
    if (appointment.patientFirebaseProjectId && appointment.patientFirebaseUid) {
      recipients.push({
        firebaseProjectId: appointment.patientFirebaseProjectId,
        uid: appointment.patientFirebaseUid,
        type: 'patient',
      });
    }
    if (hasId(appointment.doctorId)) {
      const doctorId = idOf(appointment.doctorId);
      const doctor = appointment.organizationId
        ? await collection('doctorPortalDoctors').findOne({ _id: doctorId })
        : await collection('doctorApplications').findOne({ _id: doctorId });
      const firebaseProjectId = appointment.organizationId
        ? doctor?.assignedFirebaseProjectId
        : doctor?.firebaseProjectId;
      const firebaseUid = appointment.organizationId
        ? doctor?.assignedFirebaseUid
        : doctor?.firebaseUid;
      if (firebaseProjectId && firebaseUid) {
        recipients.push({ firebaseProjectId, uid: firebaseUid, type: 'doctor' });
      }
    }

    for (const recipient of recipients) {
      const eventKey = [
        appointment._id.toString(),
        'follow-up',
        recipient.firebaseProjectId,
        recipient.uid,
      ].join(':');
      const filter = { eventKey };
      if (!reminderAt || !consultation.followUpDate) {
        await collection('doctorPortalNotifications').updateOne(
          filter,
          { $set: { isActive: false, updatedAt: new Date() } },
        );
        continue;
      }
      const now = new Date();
      await collection('doctorPortalNotifications').updateOne(
        filter,
        {
          $set: {
            recipientFirebaseProjectId: recipient.firebaseProjectId,
            recipientFirebaseUid: recipient.uid,
            recipientType: recipient.type,
            organizationId: appointment.organizationId || null,
            appointmentId: appointment._id,
            type: 'follow_up_reminder',
            title: 'Follow-up reminder',
            body: `A follow-up is scheduled for ${consultation.followUpDate}.`,
            scheduledFor: new Date(reminderAt),
            readAt: null,
            isActive: true,
            updatedAt: now,
          },
          $setOnInsert: { eventKey, createdAt: now },
        },
        { upsert: true },
      );
    }
  }

  async function reserveDailyCapacity(doctorId, appointmentDate, limit) {
    const capacityId = `${doctorId}:${appointmentDate}`;
    const capacities = collection('doctorPortalDailyCapacity');
    try {
      const reserved = await capacities.findOneAndUpdate(
        {
          _id: capacityId,
          $or: [
            { reservationCount: { $lt: limit } },
            { reservationCount: { $exists: false } },
          ],
        },
        {
          $inc: { reservationCount: 1 },
          $setOnInsert: { doctorId, appointmentDate, createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' },
      );
      return Boolean(reserved);
    } catch (error) {
      if (error?.code !== 11000 && error?.codeName !== 'DuplicateKey') throw error;
      const retry = await capacities.updateOne(
        { _id: capacityId, reservationCount: { $lt: limit } },
        { $inc: { reservationCount: 1 } },
      );
      return retry.modifiedCount === 1;
    }
  }

  async function releaseDailyCapacity(doctorId, appointmentDate) {
    const capacityId = `${doctorId}:${appointmentDate}`;
    await collection('doctorPortalDailyCapacity').updateOne(
      { _id: capacityId, reservationCount: { $gt: 0 } },
      { $inc: { reservationCount: -1 } },
    );
  }

  async function currentOrganization(user) {
    return collection('doctorPortalOrganizations').findOne({
      adminFirebaseProjectId: user.firebaseProjectId,
      adminFirebaseUid: user.uid,
    });
  }

  async function individualDoctor(user) {
    const profile = await collection('doctorApplications').findOne({
      ...owner(user),
      status: 'approved',
    });
    return profile;
  }

  async function assignedDoctor(user) {
    return collection('doctorPortalDoctors').findOne({
      assignedFirebaseProjectId: user.firebaseProjectId,
      assignedFirebaseUid: user.uid,
      isActive: true,
      verificationStatus: 'approved',
    });
  }

  async function appointmentScope(user, query = {}) {
    const org = await currentOrganization(user);
    if (org) return { organizationId: org._id, ...(query.doctorId ? { doctorId: query.doctorId } : {}) };
    const assigned = await assignedDoctor(user);
    if (assigned) return { doctorId: assigned._id.toString() };
    const doctor = await individualDoctor(user);
    if (doctor) return { doctorId: doctor._id.toString() };
    const memberships = await hospitalStaff(user);
    if (memberships.length) {
      return {
        organizationId: { $in: memberships.map(({ organizationId }) => organizationId) },
        ...(query.doctorId ? { doctorId: query.doctorId } : {}),
      };
    }
    return null;
  }

  async function ownedDoctorProfile(user) {
    const assigned = await assignedDoctor(user);
    if (assigned) {
      return {
        doctor: assigned,
        collectionName: 'doctorPortalDoctors',
        filter: {
          _id: assigned._id,
          assignedFirebaseProjectId: user.firebaseProjectId,
          assignedFirebaseUid: user.uid,
          isActive: true,
          verificationStatus: 'approved',
        },
      };
    }
    const individual = await individualDoctor(user);
    if (individual) {
      return {
        doctor: individual,
        collectionName: 'doctorApplications',
        filter: { _id: individual._id, ...owner(user), status: 'approved' },
      };
    }
    return null;
  }

  async function isTreatingDoctor(user, doctorId) {
    const profile = await ownedDoctorProfile(user);
    return Boolean(profile && profile.doctor._id.toString() === String(doctorId));
  }

  async function canAccessConsultation(user, appointment, consultation) {
    if (await isTreatingDoctor(user, appointment.doctorId)) return true;
    const profile = await ownedDoctorProfile(user);
    return Boolean(
      profile
      && consultation?.authorizedDoctorIds?.includes(profile.doctor._id.toString()),
    );
  }

  async function providerById(doctorId) {
    const hospitalDoctor = await collection('doctorPortalDoctors').findOne({
      _id: idOf(doctorId),
      isActive: true,
      verificationStatus: 'approved',
    });
    if (hospitalDoctor) {
      const org = await collection('doctorPortalOrganizations').findOne({
        _id: hospitalDoctor.organizationId,
        verificationStatus: 'approved',
      });
      return org ? { ...hospitalDoctor, doctorId, organization: org } : null;
    }
    const individual = await collection('doctorApplications').findOne({
      _id: idOf(doctorId),
      status: 'approved',
    });
    return individual ? { ...individual, doctorId, organization: null } : null;
  }

  const registerOrganization = asyncRoute(async (req, res) => {
    const parsed = organizationSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    if (!req.user.emailVerified || !req.user.email) {
      res.status(403).json({ success: false, code: 'VERIFIED_EMAIL_REQUIRED', message: 'Verify the organization administrator email before registering a hospital.' });
      return;
    }
    if (parsed.data.email.toLocaleLowerCase('en-US') !== req.user.email.toLocaleLowerCase('en-US')) {
      res.status(400).json({ success: false, message: 'Use the verified organization administrator email for the hospital account.' });
      return;
    }
    const organizations = collection('doctorPortalOrganizations');
    const exists = await organizations.findOne({
      adminFirebaseProjectId: req.user.firebaseProjectId,
      adminFirebaseUid: req.user.uid,
    });
    if (exists) {
      res.status(409).json({ success: false, message: 'This account already manages a hospital or clinic.' });
      return;
    }
    const now = new Date();
    const document = {
      ...parsed.data,
      citySearch: parsed.data.city.toLocaleLowerCase('en-US'),
      adminFirebaseProjectId: req.user.firebaseProjectId,
      adminFirebaseUid: req.user.uid,
      verificationStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await organizations.insertOne(document);
    res.status(201).json({ success: true, organization: { ...document, id: inserted.insertedId.toString() } });
  });

  const getMyOrganization = asyncRoute(async (req, res) => {
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(404).json({ success: false, code: 'ORGANIZATION_REQUIRED', message: 'No organization is registered for this account.' });
      return;
    }
    res.json({ success: true, organization: clean(organization) });
  });

  const updateMyOrganization = asyncRoute(async (req, res) => {
    const parsed = organizationUpdateSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(404).json({ success: false, message: 'No organization is registered for this account.' });
      return;
    }
    if (organization.verificationStatus === 'approved') {
      res.status(409).json({ success: false, message: 'Approved organization details require platform review before changes can be applied.' });
      return;
    }
    const updated = await collection('doctorPortalOrganizations').findOneAndUpdate(
      { _id: organization._id, ...owner(req.user) },
      { $set: {
        ...parsed.data,
        ...(parsed.data.city ? { citySearch: parsed.data.city.toLocaleLowerCase('en-US') } : {}),
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    res.json({ success: true, organization: clean(updated) });
  });

  const listHospitalDoctors = asyncRoute(async (req, res) => {
    const parsed = hospitalDoctorQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(404).json({ success: false, message: 'No organization is registered for this account.' });
      return;
    }
    const { search = '', specialization, departmentId } = parsed.data;
    const filter = { organizationId: organization._id };
    if (specialization) filter.specializationSearch = String(specialization).trim().toLocaleLowerCase('en-US');
    if (departmentId) filter.departmentId = idOf(departmentId);
    if (search) filter.fullNameSearch = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const doctors = await collection('doctorPortalDoctors').find(filter).sort({ fullName: 1 }).limit(200).toArray();
    res.json({ success: true, doctors: doctors.map(clean) });
  });

  const listPublicHospitalDoctors = asyncRoute(async (req, res) => {
    const parsed = publicDoctorQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const query = parsed.data;
    const organizations = collection('doctorPortalOrganizations');
    const orgFilter = { verificationStatus: 'approved' };
    if (query.city) orgFilter.citySearch = query.city.toLocaleLowerCase('en-US');
    const approvedOrganizations = await organizations.find(orgFilter).toArray();
    const organizationById = new Map(approvedOrganizations.map((organization) => [organization._id.toString(), organization]));
    const organizationIds = approvedOrganizations.map(({ _id }) => _id);
    const filter = {
      isActive: true,
      verificationStatus: 'approved',
      organizationId: { $in: organizationIds },
    };
    if (query.specialty) filter.specializationSearch = query.specialty.toLocaleLowerCase('en-US');
    if (query.departmentId) filter.departmentId = idOf(query.departmentId);
    const collectionDoctors = collection('doctorPortalDoctors');
    const [doctors, total] = await Promise.all([
      collectionDoctors.find(filter).sort({ fullName: 1 })
        .skip((query.page - 1) * query.limit).limit(query.limit).toArray(),
      collectionDoctors.countDocuments(filter),
    ]);
    const departmentIds = [...new Set(doctors.map(({ departmentId }) => departmentId?.toString()).filter(Boolean))].map(idOf);
    const doctorDepartments = departmentIds.length
      ? await collection('doctorPortalDepartments').find({ _id: { $in: departmentIds }, isActive: true }).toArray()
      : [];
    const departmentById = new Map(doctorDepartments.map((department) => [department._id.toString(), department]));
    const results = doctors.map((doctor) => {
      const organization = organizationById.get(doctor.organizationId.toString());
      const department = doctor.departmentId ? departmentById.get(doctor.departmentId.toString()) : null;
      return {
        id: doctor._id.toString(),
        fullName: doctor.fullName,
        specialization: doctor.specialization,
        additionalSpecializations: doctor.additionalSpecializations,
        qualifications: doctor.qualifications,
        yearsExperience: doctor.yearsExperience,
        biography: doctor.biography || null,
        department: department?.name || null,
        branch: doctor.branch || null,
        consultationRoom: doctor.consultationRoom || null,
        organizationName: organization.name,
        organizationType: organization.organizationType,
        address: organization.address,
        city: organization.city,
        state: organization.state,
        consultationFee: doctor.consultationFee,
        consultationMode: doctor.consultationMode,
        workingDays: doctor.workingDays,
        openingTime: doctor.openingTime,
        closingTime: doctor.closingTime,
        timeZone: doctor.timeZone,
        breaks: doctor.breaks,
        appointmentDurationMinutes: doctor.appointmentDurationMinutes,
      };
    });
    res.json({
      success: true,
      doctors: results,
      total,
      page: query.page,
      limit: query.limit,
    });
  });

  const getPublicHospitalDoctor = asyncRoute(async (req, res) => {
    if (!hasId(req.params.doctorId)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }
    const doctor = await collection('doctorPortalDoctors').findOne({
      _id: idOf(req.params.doctorId),
      isActive: true,
      verificationStatus: 'approved',
    });
    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor not found or not available.' });
      return;
    }
    const organization = await collection('doctorPortalOrganizations').findOne({
      _id: doctor.organizationId,
      verificationStatus: 'approved',
    });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Doctor not found or not available.' });
      return;
    }
    const department = doctor.departmentId
      ? await collection('doctorPortalDepartments').findOne({ _id: doctor.departmentId, organizationId: organization._id, isActive: true })
      : null;
    res.json({
      success: true,
      doctor: {
        id: doctor._id.toString(),
        fullName: doctor.fullName,
        specialization: doctor.specialization,
        additionalSpecializations: doctor.additionalSpecializations,
        qualifications: doctor.qualifications,
        yearsExperience: doctor.yearsExperience,
        biography: doctor.biography || null,
        department: department?.name || null,
        branch: doctor.branch || null,
        consultationRoom: doctor.consultationRoom || null,
        organizationName: organization.name,
        organizationType: organization.organizationType,
        address: organization.address,
        city: organization.city,
        state: organization.state,
        consultationFee: doctor.consultationFee,
        consultationMode: doctor.consultationMode,
        workingDays: doctor.workingDays,
        openingTime: doctor.openingTime,
        closingTime: doctor.closingTime,
        timeZone: doctor.timeZone,
        breaks: doctor.breaks,
        appointmentDurationMinutes: doctor.appointmentDurationMinutes,
      },
    });
  });

  const addHospitalDoctor = asyncRoute(async (req, res) => {
    const parsed = hospitalDoctorSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(404).json({ success: false, message: 'No organization is registered for this account.' });
      return;
    }
    if (organization.verificationStatus !== 'approved') {
      res.status(403).json({ success: false, code: 'ORGANIZATION_NOT_APPROVED', message: 'Only an approved organization can add bookable doctors.' });
      return;
    }
    if (parsed.data.departmentId) {
      const department = await collection('doctorPortalDepartments').findOne({
        _id: idOf(parsed.data.departmentId),
        organizationId: organization._id,
        isActive: true,
      });
      if (!department) {
        res.status(400).json({ success: false, message: 'Choose an active department belonging to this organization.' });
        return;
      }
    }
    const now = new Date();
    const document = {
      ...parsed.data,
      organizationId: organization._id,
      departmentId: parsed.data.departmentId ? idOf(parsed.data.departmentId) : null,
      fullNameSearch: parsed.data.fullName.toLocaleLowerCase('en-US'),
      specializationSearch: parsed.data.specialization.toLocaleLowerCase('en-US'),
      emailSearch: parsed.data.email.toLocaleLowerCase('en-US'),
      verificationStatus: 'pending_review',
      isActive: false,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await collection('doctorPortalDoctors').insertOne(document);
    res.status(201).json({ success: true, doctor: { ...document, id: inserted.insertedId.toString() } });
  });

  const updateHospitalDoctor = asyncRoute(async (req, res) => {
    if (!hasId(req.params.doctorId)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }
    const parsed = doctorUpdateSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    const doctor = await collection('doctorPortalDoctors').findOne({
      _id: idOf(req.params.doctorId),
      organizationId: organization?._id,
    });
    if (!organization || !doctor) {
      res.status(404).json({ success: false, message: 'Doctor was not found in your organization.' });
      return;
    }
    if (parsed.data.departmentId) {
      const department = await collection('doctorPortalDepartments').findOne({
        _id: idOf(parsed.data.departmentId),
        organizationId: organization._id,
        isActive: true,
      });
      if (!department) {
        res.status(400).json({ success: false, message: 'Choose an active department belonging to this organization.' });
        return;
      }
    }
    const fields = { ...parsed.data, updatedAt: new Date() };
    if (fields.departmentId) fields.departmentId = idOf(fields.departmentId);
    if (fields.fullName) fields.fullNameSearch = fields.fullName.toLocaleLowerCase('en-US');
    if (fields.specialization) fields.specializationSearch = fields.specialization.toLocaleLowerCase('en-US');
    if (fields.email) fields.emailSearch = fields.email.toLocaleLowerCase('en-US');
    const updated = await collection('doctorPortalDoctors').findOneAndUpdate(
      { _id: doctor._id, organizationId: organization._id },
      { $set: fields },
      { returnDocument: 'after' },
    );
    res.json({ success: true, doctor: clean(updated) });
  });

  const setHospitalDoctorActive = asyncRoute(async (req, res) => {
    if (!hasId(req.params.doctorId)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }
    const parsed = doctorActiveSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    const doctor = await collection('doctorPortalDoctors').findOne({
      _id: idOf(req.params.doctorId),
      organizationId: organization?._id,
    });
    if (!organization || !doctor) {
      res.status(404).json({ success: false, message: 'Doctor was not found in your organization.' });
      return;
    }
    if (parsed.data.isActive && doctor.verificationStatus !== 'approved') {
      res.status(409).json({ success: false, message: 'Only platform-approved doctors can be activated.' });
      return;
    }
    if (parsed.data.isActive) {
      const approvedOrganization = await collection('doctorPortalOrganizations').findOne({
        _id: doctor.organizationId,
        verificationStatus: 'approved',
      });
      if (!approvedOrganization) {
        res.status(409).json({
          success: false,
          message: 'The organization must be platform-approved before its doctors can be activated.',
        });
        return;
      }
    }
    const updated = await collection('doctorPortalDoctors').findOneAndUpdate(
      { _id: doctor._id, organizationId: organization._id },
      { $set: { isActive: parsed.data.isActive, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    res.json({ success: true, doctor: clean(updated) });
  });

  const removeHospitalDoctor = asyncRoute(async (req, res) => {
    if (!hasId(req.params.doctorId)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }
    const organization = await currentOrganization(req.user);
    const doctor = await collection('doctorPortalDoctors').findOne({
      _id: idOf(req.params.doctorId),
      organizationId: organization?._id,
    });
    if (!organization || !doctor) {
      res.status(404).json({ success: false, message: 'Doctor was not found in your organization.' });
      return;
    }
    await collection('doctorPortalDoctors').findOneAndUpdate(
      { _id: doctor._id, organizationId: organization._id },
      { $set: { isActive: false, removedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    res.json({ success: true, message: 'Doctor has been removed from the organization.' });
  });

  const listDepartments = asyncRoute(async (req, res) => {
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(404).json({ success: false, message: 'No organization is registered for this account.' });
      return;
    }
    const departments = await collection('doctorPortalDepartments')
      .find({ organizationId: organization._id, isActive: { $ne: false } })
      .sort({ name: 1 }).toArray();
    res.json({ success: true, departments: departments.map(clean) });
  });

  const createDepartment = asyncRoute(async (req, res) => {
    const parsed = departmentSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(404).json({ success: false, message: 'No organization is registered for this account.' });
      return;
    }
    const now = new Date();
    const department = {
      ...parsed.data,
      organizationId: organization._id,
      nameSearch: parsed.data.name.toLocaleLowerCase('en-US'),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await collection('doctorPortalDepartments').insertOne(department);
    res.status(201).json({ success: true, department: { ...department, id: inserted.insertedId.toString() } });
  });

  const updateDepartment = asyncRoute(async (req, res) => {
    if (!hasId(req.params.departmentId)) {
      res.status(400).json({ success: false, message: 'Invalid department ID.' });
      return;
    }
    const parsed = departmentUpdateSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    const updated = await collection('doctorPortalDepartments').findOneAndUpdate(
      { _id: idOf(req.params.departmentId), organizationId: organization?._id, isActive: true },
      { $set: {
        ...parsed.data,
        ...(parsed.data.name ? { nameSearch: parsed.data.name.toLocaleLowerCase('en-US') } : {}),
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      res.status(404).json({ success: false, message: 'Department was not found in your organization.' });
      return;
    }
    res.json({ success: true, department: clean(updated) });
  });

  const deactivateDepartment = asyncRoute(async (req, res) => {
    if (!hasId(req.params.departmentId)) {
      res.status(400).json({ success: false, message: 'Invalid department ID.' });
      return;
    }
    const organization = await currentOrganization(req.user);
    const updated = await collection('doctorPortalDepartments').findOneAndUpdate(
      { _id: idOf(req.params.departmentId), organizationId: organization?._id, isActive: true },
      { $set: { isActive: false, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      res.status(404).json({ success: false, message: 'Department was not found in your organization.' });
      return;
    }
    await collection('doctorPortalDoctors').updateMany(
      { organizationId: organization._id, departmentId: updated._id },
      { $set: { departmentId: null, updatedAt: new Date() } },
    );
    res.json({ success: true, department: clean(updated) });
  });

  const reviewOrganization = asyncRoute(async (req, res) => {
    if (!hasId(req.params.organizationId)) {
      res.status(400).json({ success: false, message: 'Invalid organization ID.' });
      return;
    }
    const parsed = verificationSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await collection('doctorPortalOrganizations').findOneAndUpdate(
      { _id: idOf(req.params.organizationId), verificationStatus: 'pending' },
      { $set: {
        verificationStatus: parsed.data.status,
        reviewNote: parsed.data.reviewNote || null,
        reviewedBy: req.user.uid,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    if (!organization) {
      res.status(404).json({ success: false, message: 'Pending organization was not found.' });
      return;
    }
    res.json({ success: true, organization: clean(organization) });
  });

  const listAdminOrganizations = asyncRoute(async (req, res) => {
    const parsed = organizationAdminQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const { status, page, limit } = parsed.data;
    const organizations = collection('doctorPortalOrganizations');
    const filter = { verificationStatus: status };
    const [total, results] = await Promise.all([
      organizations.countDocuments(filter),
      organizations.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);
    res.json({
      success: true,
      organizations: results.map(clean),
      total,
      page,
      limit,
    });
  });

  const getAdminOrganization = asyncRoute(async (req, res) => {
    if (!hasId(req.params.organizationId)) {
      res.status(400).json({ success: false, message: 'Invalid organization ID.' });
      return;
    }
    const organization = await collection('doctorPortalOrganizations').findOne({
      _id: idOf(req.params.organizationId),
    });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization was not found.' });
      return;
    }
    res.json({ success: true, organization: clean(organization) });
  });

  const listAdminOrganizationDoctors = asyncRoute(async (req, res) => {
    if (!hasId(req.params.organizationId)) {
      res.status(400).json({ success: false, message: 'Invalid organization ID.' });
      return;
    }
    const parsed = adminOrganizationDoctorsQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const organizationId = idOf(req.params.organizationId);
    const organization = await collection('doctorPortalOrganizations').findOne({ _id: organizationId });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization was not found.' });
      return;
    }

    const { status, search = '', page, limit } = parsed.data;
    const filter = { organizationId };
    if (status !== 'all') filter.verificationStatus = status;
    if (search) {
      const term = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = ['fullName', 'email', 'specialization', 'medicalRegistrationNumber']
        .map((field) => ({ [field]: { $regex: term, $options: 'i' } }));
    }

    const doctorsCollection = collection('doctorPortalDoctors');
    const [doctors, total] = await Promise.all([
      doctorsCollection.find(filter).sort({ createdAt: -1, _id: 1 })
        .skip((page - 1) * limit).limit(limit).toArray(),
      doctorsCollection.countDocuments(filter),
    ]);
    const departmentIds = [...new Set(
      doctors.map(({ departmentId }) => departmentId?.toString()).filter(Boolean),
    )].map(idOf);
    const departments = departmentIds.length
      ? await collection('doctorPortalDepartments').find({
        _id: { $in: departmentIds },
        organizationId,
      }).toArray()
      : [];
    const departmentById = new Map(departments.map((department) => [department._id.toString(), department.name]));

    res.json({
      success: true,
      doctors: doctors.map((doctor) => ({
        ...clean(doctor),
        departmentName: doctor.departmentId
          ? departmentById.get(doctor.departmentId.toString()) || null
          : null,
      })),
      total,
      page,
      limit,
    });
  });

  const getAdminOrganizationDoctor = asyncRoute(async (req, res) => {
    if (!hasId(req.params.organizationId) || !hasId(req.params.doctorId)) {
      res.status(400).json({ success: false, message: 'Invalid organization or doctor ID.' });
      return;
    }
    const organizationId = idOf(req.params.organizationId);
    const organization = await collection('doctorPortalOrganizations').findOne({ _id: organizationId });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization was not found.' });
      return;
    }
    const doctor = await collection('doctorPortalDoctors').findOne({
      _id: idOf(req.params.doctorId),
      organizationId,
    });
    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor was not found in this organization.' });
      return;
    }
    const department = doctor.departmentId
      ? await collection('doctorPortalDepartments').findOne({
        _id: doctor.departmentId,
        organizationId,
      })
      : null;
    res.json({
      success: true,
      doctor: {
        ...clean(doctor),
        departmentName: department?.name || null,
      },
    });
  });

  const reviewAdminOrganizationDoctor = asyncRoute(async (req, res) => {
    if (!hasId(req.params.organizationId) || !hasId(req.params.doctorId)) {
      res.status(400).json({ success: false, message: 'Invalid organization or doctor ID.' });
      return;
    }
    const parsed = verificationSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organizationId = idOf(req.params.organizationId);
    const organization = await collection('doctorPortalOrganizations').findOne({ _id: organizationId });
    if (!organization) {
      res.status(404).json({ success: false, message: 'Organization was not found.' });
      return;
    }
    const now = new Date();
    const doctor = await collection('doctorPortalDoctors').findOneAndUpdate(
      {
        _id: idOf(req.params.doctorId),
        organizationId,
        verificationStatus: 'pending_review',
      },
      { $set: {
        verificationStatus: parsed.data.status,
        reviewNote: parsed.data.reviewNote || null,
        reviewedBy: req.user.uid,
        reviewedAt: now,
        updatedAt: now,
      } },
      { returnDocument: 'after' },
    );
    if (!doctor) {
      res.status(404).json({ success: false, message: 'Pending doctor was not found in this organization.' });
      return;
    }
    res.json({ success: true, doctor: clean(doctor) });
  });

  const listPendingOrganizations = asyncRoute(async (_req, res) => {
    const organizations = await collection('doctorPortalOrganizations')
      .find({ verificationStatus: 'pending' }).sort({ createdAt: 1 }).limit(100).toArray();
    res.json({ success: true, organizations: organizations.map(clean) });
  });

  const listPendingHospitalDoctors = asyncRoute(async (_req, res) => {
    const doctors = await collection('doctorPortalDoctors')
      .find({ verificationStatus: 'pending_review' }).sort({ createdAt: 1 }).limit(100).toArray();
    res.json({ success: true, doctors: doctors.map(clean) });
  });

  const reviewHospitalDoctor = asyncRoute(async (req, res) => {
    if (!hasId(req.params.doctorId)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }
    const parsed = verificationSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const doctor = await collection('doctorPortalDoctors').findOneAndUpdate(
      { _id: idOf(req.params.doctorId), verificationStatus: 'pending_review' },
      { $set: {
        verificationStatus: parsed.data.status,
        reviewNote: parsed.data.reviewNote || null,
        reviewedBy: req.user.uid,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    if (!doctor) {
      res.status(404).json({ success: false, message: 'Pending hospital doctor was not found.' });
      return;
    }
    res.json({ success: true, doctor: clean(doctor) });
  });

  const acceptDoctorInvitation = asyncRoute(async (req, res) => {
    const parsed = invitationAcceptSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    if (!req.user.emailVerified || !req.user.email) {
      res.status(403).json({ success: false, code: 'VERIFIED_EMAIL_REQUIRED', message: 'Verify the invited doctor email before accepting access.' });
      return;
    }
    const doctor = await collection('doctorPortalDoctors').findOne({
      _id: idOf(parsed.data.doctorId),
      emailSearch: req.user.email.toLocaleLowerCase('en-US'),
      isActive: true,
      verificationStatus: 'approved',
    });
    if (!doctor) {
      res.status(404).json({ success: false, message: 'No active, approved doctor invitation matches this verified account.' });
      return;
    }
    const org = await collection('doctorPortalOrganizations').findOne({
      _id: doctor.organizationId,
      verificationStatus: 'approved',
    });
    if (!org) {
      res.status(403).json({ success: false, message: 'The organization must be approved before doctor access can be linked.' });
      return;
    }
    if (
      doctor.assignedFirebaseUid
      && (doctor.assignedFirebaseUid !== req.user.uid
        || doctor.assignedFirebaseProjectId !== req.user.firebaseProjectId)
    ) {
      res.status(409).json({ success: false, message: 'This doctor profile is already linked to another account.' });
      return;
    }
    const linked = await collection('doctorPortalDoctors').findOneAndUpdate(
      {
        _id: doctor._id,
        organizationId: org._id,
        isActive: true,
        verificationStatus: 'approved',
        $or: [
          { assignedFirebaseUid: { $exists: false } },
          { assignedFirebaseUid: null },
          {
            assignedFirebaseUid: req.user.uid,
            assignedFirebaseProjectId: req.user.firebaseProjectId,
          },
        ],
      },
      { $set: {
        assignedFirebaseProjectId: req.user.firebaseProjectId,
        assignedFirebaseUid: req.user.uid,
        invitationAcceptedAt: new Date(),
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    if (!linked) {
      res.status(409).json({ success: false, message: 'This doctor profile was linked to another account. Request a new invitation.' });
      return;
    }
    await audit(req.user, 'doctor_invitation_accepted', doctor._id);
    res.json({ success: true, doctor: clean(linked), organization: clean(org) });
  });

  const listOrganizationStaff = asyncRoute(async (req, res) => {
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(403).json({ success: false, message: 'Only the organization administrator can manage staff.' });
      return;
    }
    const staff = await collection('doctorPortalStaff')
      .find({ organizationId: organization._id })
      .sort({ createdAt: -1 }).toArray();
    await audit(req.user, 'organization_staff_listed', organization._id, { resultCount: staff.length });
    res.json({ success: true, staff: staff.map(staffResponse) });
  });

  const inviteOrganizationStaff = asyncRoute(async (req, res) => {
    const parsed = staffInvitationSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(403).json({ success: false, message: 'Only the organization administrator can invite staff.' });
      return;
    }
    if (organization.verificationStatus !== 'approved') {
      res.status(403).json({ success: false, message: 'Only an approved organization can invite staff.' });
      return;
    }
    const email = parsed.data.email.toLocaleLowerCase('en-US');
    const staffCollection = collection('doctorPortalStaff');
    const existing = await staffCollection.findOne({
      organizationId: organization._id,
      emailSearch: email,
    });
    if (existing?.isActive || existing?.invitationStatus === 'pending') {
      res.status(409).json({ success: false, message: 'This email already has active staff access or a pending invitation.' });
      return;
    }
    const now = new Date();
    let staff;
    if (existing) {
      staff = await staffCollection.findOneAndUpdate(
        { _id: existing._id, organizationId: organization._id, isActive: { $ne: true } },
        { $set: {
          email: parsed.data.email.trim(),
          emailSearch: email,
          invitationStatus: 'pending',
          isActive: false,
          invitedBy: req.user.uid,
          invitedAt: now,
          acceptedAt: null,
          revokedAt: null,
          firebaseProjectId: null,
          firebaseUid: null,
          updatedAt: now,
        } },
        { returnDocument: 'after' },
      );
      if (!staff) {
        res.status(409).json({ success: false, message: 'Staff access changed. Reload and try again.' });
        return;
      }
    } else {
      const document = {
        organizationId: organization._id,
        email: parsed.data.email.trim(),
        emailSearch: email,
        invitationStatus: 'pending',
        isActive: false,
        invitedBy: req.user.uid,
        invitedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      const inserted = await staffCollection.insertOne(document);
      staff = { ...document, _id: inserted.insertedId };
    }
    await audit(req.user, 'organization_staff_invited', staff._id, {
      organizationId: organization._id,
    });
    res.status(201).json({ success: true, staff: staffResponse(staff) });
  });

  const acceptOrganizationStaffInvitation = asyncRoute(async (req, res) => {
    const parsed = staffInvitationAcceptSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    if (!req.user.emailVerified || !req.user.email) {
      res.status(403).json({ success: false, code: 'VERIFIED_EMAIL_REQUIRED', message: 'Verify the invited staff email before accepting access.' });
      return;
    }
    const emailSearch = req.user.email.toLocaleLowerCase('en-US');
    const staff = await collection('doctorPortalStaff').findOneAndUpdate(
      {
        _id: idOf(parsed.data.staffId),
        emailSearch,
        invitationStatus: 'pending',
        isActive: false,
      },
      { $set: {
        invitationStatus: 'active',
        isActive: true,
        firebaseProjectId: req.user.firebaseProjectId,
        firebaseUid: req.user.uid,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    if (!staff) {
      res.status(404).json({ success: false, message: 'No pending staff invitation matches this verified account.' });
      return;
    }
    await audit(req.user, 'organization_staff_invitation_accepted', staff._id, {
      organizationId: staff.organizationId,
    });
    res.json({ success: true, staff: staffResponse(staff) });
  });

  const deactivateOrganizationStaff = asyncRoute(async (req, res) => {
    if (!hasId(req.params.staffId)) {
      res.status(400).json({ success: false, message: 'Invalid staff ID.' });
      return;
    }
    const organization = await currentOrganization(req.user);
    if (!organization) {
      res.status(403).json({ success: false, message: 'Only the organization administrator can deactivate staff.' });
      return;
    }
    const staff = await collection('doctorPortalStaff').findOneAndUpdate(
      { _id: idOf(req.params.staffId), organizationId: organization._id, invitationStatus: { $ne: 'revoked' } },
      { $set: {
        invitationStatus: 'revoked',
        isActive: false,
        revokedBy: req.user.uid,
        revokedAt: new Date(),
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    if (!staff) {
      res.status(404).json({ success: false, message: 'Staff member was not found in this organization.' });
      return;
    }
    await audit(req.user, 'organization_staff_deactivated', staff._id, {
      organizationId: organization._id,
    });
    res.json({ success: true, staff: staffResponse(staff) });
  });

  const getAvailabilityCalendar = asyncRoute(async (req, res) => {
    const parsed = availabilityQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const organization = await currentOrganization(req.user);
    const ownProfile = organization ? null : await ownedDoctorProfile(req.user);
    const memberships = ownProfile || organization ? [] : await hospitalStaff(req.user);
    let doctor;
    if (ownProfile) {
      if (parsed.data.doctorId && parsed.data.doctorId !== ownProfile.doctor._id.toString()) {
        res.status(403).json({ success: false, message: 'Doctors can only access their own calendar.' });
        return;
      }
      doctor = ownProfile.doctor;
    } else if (organization) {
      if (!parsed.data.doctorId) {
        res.status(400).json({ success: false, message: 'Select a doctor to view the organization calendar.' });
        return;
      }
      doctor = await collection('doctorPortalDoctors').findOne({
        _id: idOf(parsed.data.doctorId),
        organizationId: organization._id,
      });
    } else if (memberships.length) {
      if (!parsed.data.doctorId) {
        res.status(400).json({ success: false, message: 'Select an assigned doctor to view the organization calendar.' });
        return;
      }
      doctor = await collection('doctorPortalDoctors').findOne({
        _id: idOf(parsed.data.doctorId),
        organizationId: { $in: memberships.map(({ organizationId }) => organizationId) },
      });
    } else {
      res.status(403).json({ success: false, message: 'Calendar access is not authorized.' });
      return;
    }
    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor was not found in your authorized scope.' });
      return;
    }

    const from = parsed.data.from || new Date().toISOString().slice(0, 10);
    const defaultToDate = new Date(`${from}T00:00:00.000Z`);
    defaultToDate.setUTCDate(defaultToDate.getUTCDate() + 30);
    const to = parsed.data.to || defaultToDate.toISOString().slice(0, 10);
    if (to < from) {
      res.status(400).json({ success: false, message: 'The end date must not precede the start date.' });
      return;
    }
    if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 90) {
      res.status(400).json({ success: false, message: 'Calendar ranges cannot exceed 90 days.' });
      return;
    }
    const doctorId = doctor._id.toString();
    const appointments = await collection('doctorPortalAppointments')
      .find({
        doctorId,
        appointmentDate: { $gte: from, $lte: to },
        status: { $in: ['requested', 'confirmed'] },
      })
      .sort({ appointmentDate: 1, appointmentTime: 1 }).toArray();
    const overrides = Object.entries(doctor.availabilityOverrides || {})
      .filter(([date]) => date >= from && date <= to)
      .map(([date, override]) => ({
        date,
        ...override,
        ...(ownProfile ? {} : { reason: undefined }),
      }));
    await audit(req.user, 'availability_calendar_viewed', doctor._id, { from, to });
    res.json({
      success: true,
      doctorId,
      range: { from, to },
      schedule: {
        workingDays: doctor.workingDays || [],
        openingTime: doctor.openingTime || null,
        closingTime: doctor.closingTime || null,
        timeZone: doctor.timeZone || null,
        appointmentDurationMinutes: doctor.appointmentDurationMinutes || null,
        breaks: doctor.breaks || [],
      },
      overrides,
      appointments: appointments.map(operationalAppointmentResponse),
    });
  });

  const setAvailabilityOverride = asyncRoute(async (req, res) => {
    if (!hasDate(req.params.date)) {
      res.status(400).json({ success: false, message: 'Invalid availability date.' });
      return;
    }
    const parsed = availabilityOverrideSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    if (req.params.date < new Date().toISOString().slice(0, 10)) {
      res.status(400).json({ success: false, message: 'Availability cannot be changed for a past date.' });
      return;
    }
    const profile = await ownedDoctorProfile(req.user);
    if (!profile) {
      res.status(403).json({ success: false, message: 'Only an approved, active doctor can change personal availability.' });
      return;
    }
    const update = await collection(profile.collectionName).findOneAndUpdate(
      profile.filter,
      { $set: {
        [`availabilityOverrides.${req.params.date}`]: parsed.data,
        updatedAt: new Date(),
      } },
      { returnDocument: 'after' },
    );
    if (!update) {
      res.status(404).json({ success: false, message: 'Doctor profile is no longer available.' });
      return;
    }
    await audit(req.user, 'availability_override_set', profile.doctor._id, {
      date: req.params.date,
      isAvailable: parsed.data.isAvailable,
    });
    res.json({
      success: true,
      doctorId: profile.doctor._id.toString(),
      date: req.params.date,
      override: parsed.data,
    });
  });

  const removeAvailabilityOverride = asyncRoute(async (req, res) => {
    if (!hasDate(req.params.date)) {
      res.status(400).json({ success: false, message: 'Invalid availability date.' });
      return;
    }
    const profile = await ownedDoctorProfile(req.user);
    if (!profile) {
      res.status(403).json({ success: false, message: 'Only an approved, active doctor can change personal availability.' });
      return;
    }
    const result = await collection(profile.collectionName).updateOne(
      profile.filter,
      { $unset: { [`availabilityOverrides.${req.params.date}`]: '' }, $set: { updatedAt: new Date() } },
    );
    if (!result.matchedCount && !result.modifiedCount) {
      res.status(404).json({ success: false, message: 'Doctor profile is no longer available.' });
      return;
    }
    await audit(req.user, 'availability_override_removed', profile.doctor._id, { date: req.params.date });
    res.json({ success: true, doctorId: profile.doctor._id.toString(), date: req.params.date });
  });

  const listNotifications = asyncRoute(async (req, res) => {
    const parsed = notificationQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const filter = {
      recipientFirebaseProjectId: req.user.firebaseProjectId,
      recipientFirebaseUid: req.user.uid,
      isActive: { $ne: false },
      $or: [{ scheduledFor: null }, { scheduledFor: { $lte: new Date() } }],
      ...(parsed.data.unread ? { readAt: null } : {}),
    };
    const notifications = collection('doctorPortalNotifications');
    const [items, total] = await Promise.all([
      notifications.find(filter).sort({ createdAt: -1, _id: -1 })
        .skip((parsed.data.page - 1) * parsed.data.limit).limit(parsed.data.limit).toArray(),
      notifications.countDocuments(filter),
    ]);
    res.json({
      success: true,
      notifications: items.map(clean),
      total,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
  });

  const markNotificationRead = asyncRoute(async (req, res) => {
    if (!hasId(req.params.notificationId)) {
      res.status(400).json({ success: false, message: 'Invalid notification ID.' });
      return;
    }
    const filter = {
      _id: idOf(req.params.notificationId),
      recipientFirebaseProjectId: req.user.firebaseProjectId,
      recipientFirebaseUid: req.user.uid,
      isActive: { $ne: false },
    };
    const notifications = collection('doctorPortalNotifications');
    const notification = await notifications.findOneAndUpdate(
      filter,
      { $set: { readAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification was not found.' });
      return;
    }
    res.json({ success: true, notification: clean(notification) });
  });

  const getConsultationRecord = asyncRoute(async (req, res) => {
    if (!hasId(req.params.appointmentId)) {
      res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
      return;
    }
    const appointmentId = idOf(req.params.appointmentId);
    const appointment = await collection('doctorPortalAppointments').findOne({ _id: appointmentId });
    if (!appointment) {
      res.status(404).json({ success: false, message: 'Appointment was not found.' });
      return;
    }
    const consultation = await collection('doctorPortalConsultations').findOne({ appointmentId });
    if (!(await canAccessConsultation(req.user, appointment, consultation))) {
      res.status(403).json({ success: false, message: 'This account is not authorized to access the consultation record.' });
      return;
    }
    await audit(req.user, 'consultation_record_viewed', appointmentId, { doctorId: appointment.doctorId });
    res.json({ success: true, consultation: consultationResponse(consultation) });
  });

  const saveConsultationRecord = asyncRoute(async (req, res) => {
    if (!hasId(req.params.appointmentId)) {
      res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
      return;
    }
    const parsed = consultationSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const appointmentId = idOf(req.params.appointmentId);
    const appointment = await collection('doctorPortalAppointments').findOne({ _id: appointmentId });
    if (!appointment) {
      res.status(404).json({ success: false, message: 'Appointment was not found.' });
      return;
    }
    const now = new Date();
    const consultationCollection = collection('doctorPortalConsultations');
    const previous = await consultationCollection.findOne({ appointmentId });
    if (!(await canAccessConsultation(req.user, appointment, previous))) {
      res.status(403).json({ success: false, message: 'This account is not authorized to update the consultation record.' });
      return;
    }
    const consultationFields = {
      ...parsed.data,
      ...(typeof parsed.data.followUpReminderAt === 'string'
        ? { followUpReminderAt: new Date(parsed.data.followUpReminderAt) }
        : {}),
    };
    const consultation = await consultationCollection.findOneAndUpdate(
      { appointmentId },
      {
        $set: {
          ...consultationFields,
          doctorId: appointment.doctorId,
          organizationId: appointment.organizationId || null,
          updatedBy: req.user.uid,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId(),
          appointmentId,
          createdBy: req.user.uid,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    await updateFollowUpNotifications(appointment, consultation, previous);
    await audit(req.user, 'consultation_record_saved', consultation._id, {
      appointmentId,
      doctorId: appointment.doctorId,
      hasFollowUp: Boolean(consultation.followUpDate),
    });
    res.json({ success: true, consultation: consultationResponse(consultation) });
  });

  const setConsultationAccess = asyncRoute(async (req, res) => {
    if (!hasId(req.params.appointmentId)) {
      res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
      return;
    }
    const parsed = consultationAccessSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const appointmentId = idOf(req.params.appointmentId);
    const appointment = await collection('doctorPortalAppointments').findOne({ _id: appointmentId });
    if (!appointment) {
      res.status(404).json({ success: false, message: 'Appointment was not found.' });
      return;
    }
    if (!(await isTreatingDoctor(req.user, appointment.doctorId))) {
      res.status(403).json({ success: false, message: 'Only the treating doctor can authorize clinical access.' });
      return;
    }
    const doctorIds = parsed.data.doctorIds.map(idOf);
    const authorizedHospitalDoctors = appointment.organizationId
      ? await collection('doctorPortalDoctors').find({
        _id: { $in: doctorIds },
        organizationId: appointment.organizationId,
        isActive: true,
        verificationStatus: 'approved',
      }).toArray()
      : [];
    const authorizedIndividualDoctors = appointment.organizationId
      ? []
      : await collection('doctorApplications').find({
        _id: { $in: doctorIds },
        status: 'approved',
      }).toArray();
    const approvedIds = new Set([
      ...authorizedHospitalDoctors,
      ...authorizedIndividualDoctors,
    ].map(({ _id }) => _id.toString()));
    if (doctorIds.some((doctorId) => !approvedIds.has(doctorId.toString()))) {
      res.status(403).json({
        success: false,
        message: 'Clinical access can only be granted to approved doctors in the same organization.',
      });
      return;
    }
    const consultationCollection = collection('doctorPortalConsultations');
    const existing = await consultationCollection.findOne({ appointmentId });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Create a consultation record before granting clinical access.' });
      return;
    }
    const consultation = await consultationCollection.findOneAndUpdate(
      { _id: existing._id, appointmentId },
      { $set: { authorizedDoctorIds: [...approvedIds], updatedBy: req.user.uid, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    await audit(req.user, 'consultation_access_updated', consultation._id, {
      appointmentId,
      authorizedDoctorCount: approvedIds.size,
    });
    res.json({
      success: true,
      consultationId: consultation._id.toString(),
      authorizedDoctorIds: consultation.authorizedDoctorIds,
    });
  });

  const bookAppointment = asyncRoute(async (req, res) => {
    const parsed = appointmentBookingSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const provider = await providerById(parsed.data.doctorId);
    if (!provider) {
      res.status(404).json({ success: false, message: 'Approved and active doctor was not found.' });
      return;
    }
    const unavailable = availabilityError(provider, parsed.data.appointmentDate, parsed.data.appointmentTime, parsed.data.appointmentType);
    if (unavailable) {
      res.status(409).json({ success: false, code: 'DOCTOR_UNAVAILABLE', message: unavailable });
      return;
    }
    if (isPast(provider, parsed.data.appointmentDate, parsed.data.appointmentTime)) {
      res.status(409).json({ success: false, code: 'APPOINTMENT_TIME_PASSED', message: 'Choose a future appointment time.' });
      return;
    }
    if (!Number.isFinite(provider.consultationFee) || provider.consultationFee < 0) {
      res.status(409).json({ success: false, code: 'CONSULTATION_FEE_UNAVAILABLE', message: 'The doctor does not have a valid consultation fee configured.' });
      return;
    }
    const appointments = collection('doctorPortalAppointments');
    const now = new Date();
    const expiredHolds = await appointments.find({
      doctorId: provider.doctorId,
      appointmentDate: parsed.data.appointmentDate,
      status: 'requested',
      paymentStatus: 'pending',
      paymentExpiresAt: { $lte: now },
    }).toArray();
    for (const expired of expiredHolds) {
      const released = await appointments.updateOne(
        { _id: expired._id, status: 'requested', paymentStatus: 'pending', paymentExpiresAt: { $lte: now } },
        { $set: { status: 'cancelled', paymentStatus: 'expired', updatedAt: now } },
      );
      if (released.modifiedCount === 1) {
        await releaseDailyCapacity(provider.doctorId, expired.appointmentDate);
      }
    }
    const reserved = await reserveDailyCapacity(
      provider.doctorId,
      parsed.data.appointmentDate,
      provider.dailyAppointmentLimit,
    );
    if (!reserved) {
      res.status(409).json({ success: false, code: 'DAILY_LIMIT_REACHED', message: 'The doctor has reached the appointment limit for this day.' });
      return;
    }
    const appointmentId = new ObjectId();
    const appointment = {
      _id: appointmentId,
      appointmentId: appointmentId.toString(),
      ...parsed.data,
      doctorId: provider.doctorId,
      doctorName: provider.fullName,
      doctorSpecialization: provider.primarySpecialty || provider.specialization,
      organizationId: provider.organization?._id || null,
      organizationName: provider.organization?.name || provider.clinicName,
      departmentId: provider.departmentId || null,
      patientFirebaseProjectId: req.user.firebaseProjectId,
      patientFirebaseUid: req.user.uid,
      status: 'requested',
      consultationFee: provider.consultationFee,
      currency: provider.currency || 'INR',
      paymentStatus: provider.consultationFee > 0 ? 'pending' : 'not_required',
      ...(provider.consultationFee > 0
        ? { paymentExpiresAt: new Date(now.getTime() + 15 * 60 * 1000) }
        : {}),
      slotKeys: slotKeysFor(provider.doctorId, parsed.data.appointmentDate, parsed.data.appointmentTime, provider.appointmentDurationMinutes),
      statusHistory: [{ status: 'requested', changedBy: req.user.uid, changedAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    let inserted;
    try {
      inserted = await appointments.insertOne(appointment);
    } catch (error) {
      await releaseDailyCapacity(provider.doctorId, parsed.data.appointmentDate);
      if (error?.code === 11000 || error?.codeName === 'DuplicateKey') {
        res.status(409).json({ success: false, code: 'APPOINTMENT_SLOT_TAKEN', message: 'That appointment time is already booked. Choose another time.' });
        return;
      }
      throw error;
    }
    appointment._id = inserted.insertedId;
    await audit(req.user, 'appointment_booked', inserted.insertedId, {
      doctorId: provider.doctorId,
      organizationId: provider.organization?._id || null,
    });
    await createAppointmentNotifications(appointment, 'appointment_requested', 'booked');
    res.status(201).json({ success: true, appointment: clean(appointment) });
  });

  const listAppointments = asyncRoute(async (req, res) => {
    const parsed = appointmentQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const query = parsed.data;
    const scope = await appointmentScope(req.user, query);
    if (!scope) {
      res.status(403).json({ success: false, message: 'This account has no authorized doctor or hospital appointment access.' });
      return;
    }
    const filter = { ...scope };
    if (query.from || query.to) {
      filter.appointmentDate = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.status) filter.status = query.status;
    if (query.appointmentType) filter.appointmentType = query.appointmentType;
    if (query.departmentId) filter.departmentId = idOf(query.departmentId);
    if (query.search) {
      const search = query.search.replace(/^PT-/i, '');
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { patientName: { $regex: escaped, $options: 'i' } },
        { doctorName: { $regex: escaped, $options: 'i' } },
        { appointmentId: { $regex: escaped, $options: 'i' } },
      ];
    }
    const appointments = collection('doctorPortalAppointments');
    const [items, total] = await Promise.all([
      appointments.find(filter).sort({ appointmentDate: 1, appointmentTime: 1 })
        .skip((query.page - 1) * query.limit).limit(query.limit).toArray(),
      appointments.countDocuments(filter),
    ]);
    await audit(req.user, 'appointments_viewed', scope.organizationId || scope.doctorId, {
      resultCount: items.length,
      filters: {
        from: query.from || null,
        to: query.to || null,
        doctorId: query.doctorId || null,
        departmentId: query.departmentId || null,
        status: query.status || null,
      },
    });
    const actorDoctor = await ownedDoctorProfile(req.user);
    res.json({
      success: true,
      appointments: items.map((item) => (
        actorDoctor?.doctor._id.toString() === String(item.doctorId)
          ? clean(item)
          : operationalAppointmentResponse(item)
      )),
      total,
      page: query.page,
      limit: query.limit,
    });
  });

  const getAppointmentSummary = asyncRoute(async (req, res) => {
    const parsed = appointmentSummaryQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const query = parsed.data;
    const scope = await appointmentScope(req.user, query);
    if (!scope) {
      res.status(403).json({ success: false, message: 'This account has no authorized doctor or hospital appointment access.' });
      return;
    }

    const today = query.today || new Date().toISOString().slice(0, 10);
    const dateFilter = {
      ...(query.from || query.to ? {
        appointmentDate: {
          ...(query.from ? { $gte: query.from } : {}),
          ...(query.to ? { $lte: query.to } : {}),
        },
      } : {}),
      ...(query.departmentId ? { departmentId: idOf(query.departmentId) } : {}),
    };
    const activeStatusFilter = { status: { $in: ['requested', 'confirmed'] } };
    const [facets = {}] = await collection('doctorPortalAppointments').aggregate([
      { $match: scope },
      {
        $facet: {
          totals: [
            { $match: dateFilter },
            { $count: 'appointments' },
          ],
          patients: [
            { $match: dateFilter },
            {
              $group: {
                _id: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$patientFirebaseProjectId', null] },
                        { $ne: ['$patientFirebaseUid', null] },
                      ],
                    },
                    { projectId: '$patientFirebaseProjectId', uid: '$patientFirebaseUid' },
                    { appointmentId: '$_id' },
                  ],
                },
              },
            },
            { $count: 'count' },
          ],
          statuses: [
            { $match: dateFilter },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          doctors: [
            { $match: dateFilter },
            {
              $group: {
                _id: '$doctorId',
                doctorName: { $first: '$doctorName' },
                departmentId: { $first: '$departmentId' },
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, doctorName: 1 } },
          ],
          months: [
            { $match: dateFilter },
            {
              $group: {
                _id: { $substrBytes: ['$appointmentDate', 0, 7] },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          departments: [
            { $match: dateFilter },
            {
              $group: {
                _id: '$departmentId',
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
          ],
          today: [
            { $match: { appointmentDate: today, ...activeStatusFilter, ...(dateFilter.departmentId ? { departmentId: dateFilter.departmentId } : {}) } },
            { $count: 'count' },
          ],
          upcoming: [
            { $match: { appointmentDate: { $gte: today }, ...activeStatusFilter, ...(dateFilter.departmentId ? { departmentId: dateFilter.departmentId } : {}) } },
            { $count: 'count' },
          ],
        },
      },
    ]).toArray();
    const statuses = Object.fromEntries(
      ['requested', 'confirmed', 'completed', 'cancelled', 'no_show'].map((status) => [status, 0]),
    );
    for (const item of facets.statuses || []) statuses[item._id] = item.count;
    const summary = {
      totalAppointments: facets.totals?.[0]?.appointments || 0,
      totalPatients: facets.patients?.[0]?.count || 0,
      todayAppointments: facets.today?.[0]?.count || 0,
      upcomingAppointments: facets.upcoming?.[0]?.count || 0,
      byStatus: statuses,
      doctorStats: (facets.doctors || []).map((item) => ({
        doctorId: item._id,
        doctorName: item.doctorName,
        departmentId: item.departmentId?.toString() || null,
        appointments: item.count,
      })),
      monthlyTrends: (facets.months || []).map((item) => ({ month: item._id, appointments: item.count })),
      departmentStats: (facets.departments || []).map((item) => ({
        departmentId: item._id?.toString() || null,
        appointments: item.count,
      })),
    };
    await audit(req.user, 'appointment_summary_viewed', scope.organizationId || scope.doctorId, {
      filters: { from: query.from || null, to: query.to || null, doctorId: query.doctorId || null },
    });
    res.json({ success: true, summary });
  });

  const listPatients = asyncRoute(async (req, res) => {
    const parsed = patientDirectoryQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const query = parsed.data;
    const scope = await appointmentScope(req.user, query);
    if (!scope) {
      res.status(403).json({ success: false, message: 'This account has no authorized doctor or hospital patient access.' });
      return;
    }
    if ((await hospitalStaff(req.user)).length && !(await ownedDoctorProfile(req.user))) {
      res.status(403).json({ success: false, message: 'Operational staff do not have access to the patient directory.' });
      return;
    }
    const filter = { ...scope };
    if (query.from || query.to) {
      filter.appointmentDate = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.status) filter.status = query.status;
    if (query.appointmentType) filter.appointmentType = query.appointmentType;
    if (query.departmentId) filter.departmentId = idOf(query.departmentId);
    if (query.search) {
      const search = query.search.replace(/^PT-/i, '');
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { patientName: { $regex: escaped, $options: 'i' } },
        { doctorName: { $regex: escaped, $options: 'i' } },
        { appointmentId: { $regex: escaped, $options: 'i' } },
      ];
    }
    const direction = query.sortOrder === 'asc' ? 1 : -1;
    const patientSort = query.sortBy === 'name'
      ? { patientName: direction, patientId: 1 }
      : { latestAppointmentDate: direction, latestAppointmentTime: direction };
    const [result = {}] = await collection('doctorPortalAppointments').aggregate([
      { $match: filter },
      { $sort: { appointmentDate: 1, appointmentTime: 1, createdAt: 1, _id: 1 } },
      {
        $group: {
          _id: {
            $cond: [
              {
                $and: [
                  { $ne: ['$patientFirebaseProjectId', null] },
                  { $ne: ['$patientFirebaseUid', null] },
                ],
              },
              { projectId: '$patientFirebaseProjectId', uid: '$patientFirebaseUid' },
              { appointmentId: '$_id' },
            ],
          },
          patientId: { $min: '$_id' },
          patientName: { $last: '$patientName' },
          patientGender: { $last: '$patientGender' },
          patientAgeAtBooking: { $last: '$patientAgeAtBooking' },
          createdAt: { $min: '$createdAt' },
          latestAppointmentDate: { $last: '$appointmentDate' },
          latestAppointmentTime: { $last: '$appointmentTime' },
          latestAppointmentId: { $last: '$appointmentId' },
          latestStatus: { $last: '$status' },
          doctorId: { $last: '$doctorId' },
          doctorName: { $last: '$doctorName' },
          doctorSpecialization: { $last: '$doctorSpecialization' },
          departmentId: { $last: '$departmentId' },
          visitCount: { $sum: 1 },
        },
      },
      {
        $facet: {
          patients: [
            { $sort: patientSort },
            { $skip: (query.page - 1) * query.limit },
            { $limit: query.limit },
            {
              $lookup: {
                from: 'doctorPortalDepartments',
                localField: 'departmentId',
                foreignField: '_id',
                as: 'department',
              },
            },
            { $addFields: { departmentName: { $arrayElemAt: ['$department.name', 0] } } },
            {
              $project: {
                _id: 0,
                patientId: { $toString: '$patientId' },
                patientName: 1,
                patientGender: 1,
                patientAgeAtBooking: 1,
                createdAt: 1,
                latestAppointmentDate: 1,
                latestAppointmentTime: 1,
                latestAppointmentId: 1,
                latestStatus: 1,
                doctorId: 1,
                doctorName: 1,
                doctorSpecialization: 1,
                departmentId: { $toString: '$departmentId' },
                departmentName: 1,
                visitCount: 1,
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]).toArray();
    const patients = (result.patients || []).map((patient) => ({
      ...patient,
      patientIdentifier: `PT-${patient.patientId.toUpperCase()}`,
      departmentId: patient.departmentId === 'null' ? null : patient.departmentId,
    }));
    await audit(req.user, 'patients_viewed', scope.organizationId || scope.doctorId, {
      resultCount: patients.length,
      filters: { from: query.from || null, to: query.to || null, status: query.status || null },
    });
    res.json({
      success: true,
      patients,
      total: result.total?.[0]?.count || 0,
      page: query.page,
      limit: query.limit,
    });
  });

  const listPatientVisits = asyncRoute(async (req, res) => {
    if (!hasId(req.params.patientId)) {
      res.status(400).json({ success: false, message: 'Invalid patient reference.' });
      return;
    }
    const parsed = patientVisitsQuerySchema.safeParse(req.query);
    if (!parsed.success) return resultError(res, parsed);
    const query = parsed.data;
    const scope = await appointmentScope(req.user);
    if (!scope) {
      res.status(403).json({ success: false, message: 'Patient visit access is not authorized.' });
      return;
    }
    if ((await hospitalStaff(req.user)).length && !(await ownedDoctorProfile(req.user))) {
      res.status(403).json({ success: false, message: 'Operational staff do not have access to patient visit histories.' });
      return;
    }
    const appointments = collection('doctorPortalAppointments');
    const anchor = await appointments.findOne({ _id: idOf(req.params.patientId), ...scope });
    if (!anchor) {
      res.status(404).json({ success: false, message: 'Patient record was not found.' });
      return;
    }
    const identityFilter = anchor.patientFirebaseUid && anchor.patientFirebaseProjectId
      ? {
        patientFirebaseUid: anchor.patientFirebaseUid,
        patientFirebaseProjectId: anchor.patientFirebaseProjectId,
      }
      : { _id: anchor._id };
    const filter = { ...scope, ...identityFilter };
    if (query.from || query.to) {
      filter.appointmentDate = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    if (query.status) filter.status = query.status;
    if (query.appointmentType) filter.appointmentType = query.appointmentType;
    const [items, total] = await Promise.all([
      appointments.find(filter).sort({ appointmentDate: -1, appointmentTime: -1 })
        .skip((query.page - 1) * query.limit).limit(query.limit).toArray(),
      appointments.countDocuments(filter),
    ]);
    await audit(req.user, 'patient_visits_viewed', anchor._id, { resultCount: items.length });
    res.json({ success: true, appointments: items.map(clean), total, page: query.page, limit: query.limit });
  });

  const getAppointment = asyncRoute(async (req, res) => {
    if (!hasId(req.params.appointmentId)) {
      res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
      return;
    }
    const scope = await appointmentScope(req.user);
    if (!scope) {
      res.status(403).json({ success: false, message: 'Appointment access is not authorized.' });
      return;
    }
    const appointment = await collection('doctorPortalAppointments').findOne({
      _id: idOf(req.params.appointmentId),
      ...scope,
    });
    if (!appointment) {
      res.status(404).json({ success: false, message: 'Appointment was not found.' });
      return;
    }
    await audit(req.user, 'appointment_viewed', appointment._id, { doctorId: appointment.doctorId });
    const appointmentResponse = await isTreatingDoctor(req.user, appointment.doctorId)
      ? clean(appointment)
      : operationalAppointmentResponse(appointment);
    res.json({ success: true, appointment: appointmentResponse });
  });

  const updateAppointmentStatus = asyncRoute(async (req, res) => {
    if (!hasId(req.params.appointmentId)) {
      res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
      return;
    }
    const parsed = appointmentStatusSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const scope = await appointmentScope(req.user);
    if (!scope) {
      res.status(403).json({ success: false, message: 'Appointment access is not authorized.' });
      return;
    }
    const appointments = collection('doctorPortalAppointments');
    const id = idOf(req.params.appointmentId);
    const current = await appointments.findOne({ _id: id, ...scope });
    if (!current) {
      res.status(404).json({ success: false, message: 'Appointment was not found.' });
      return;
    }
    const allowed = {
      requested: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled', 'no_show'],
      completed: [],
      cancelled: [],
      no_show: [],
    };
    if (!allowed[current.status]?.includes(parsed.data.status)) {
      res.status(409).json({ success: false, message: `Cannot change appointment status from ${current.status} to ${parsed.data.status}.` });
      return;
    }
    const now = new Date();
    const updated = await appointments.findOneAndUpdate(
      { _id: id, ...scope, status: current.status },
      {
        $set: {
          status: parsed.data.status,
          statusReason: parsed.data.reason || null,
          updatedAt: now,
          ...(parsed.data.status === 'cancelled' ? { slotKeys: [] } : {}),
        },
        $push: { statusHistory: { status: parsed.data.status, reason: parsed.data.reason || null, changedBy: req.user.uid, changedAt: now } },
      },
      { returnDocument: 'after' },
    );
    if (!updated) {
      res.status(409).json({ success: false, message: 'The appointment changed. Reload and try again.' });
      return;
    }
    if (parsed.data.status === 'cancelled') {
      await releaseDailyCapacity(updated.doctorId, updated.appointmentDate);
    }
    await audit(req.user, 'appointment_status_changed', id, {
      doctorId: updated.doctorId,
      previousStatus: current.status,
      newStatus: updated.status,
    });
    await createAppointmentNotifications(
      updated,
      'appointment_status_changed',
      `status:${updated.status}:${updated.updatedAt.getTime()}`,
    );
    const appointmentResponse = await isTreatingDoctor(req.user, updated.doctorId)
      ? clean(updated)
      : operationalAppointmentResponse(updated);
    res.json({ success: true, appointment: appointmentResponse });
  });

  const rescheduleAppointment = asyncRoute(async (req, res) => {
    if (!hasId(req.params.appointmentId)) {
      res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
      return;
    }
    const parsed = appointmentRescheduleSchema.safeParse(req.body);
    if (!parsed.success) return resultError(res, parsed);
    const scope = await appointmentScope(req.user);
    if (!scope) {
      res.status(403).json({ success: false, message: 'Appointment access is not authorized.' });
      return;
    }
    const appointments = collection('doctorPortalAppointments');
    const id = idOf(req.params.appointmentId);
    const current = await appointments.findOne({ _id: id, ...scope });
    if (!current) {
      res.status(404).json({ success: false, message: 'Appointment was not found.' });
      return;
    }
    if (!['requested', 'confirmed'].includes(current.status)) {
      res.status(409).json({ success: false, message: 'Only requested or confirmed appointments can be rescheduled.' });
      return;
    }
    const provider = await providerById(current.doctorId);
    if (!provider) {
      res.status(409).json({ success: false, message: 'The assigned doctor is no longer available.' });
      return;
    }
    const unavailable = availabilityError(provider, parsed.data.appointmentDate, parsed.data.appointmentTime, current.appointmentType);
    if (unavailable) {
      res.status(409).json({ success: false, code: 'DOCTOR_UNAVAILABLE', message: unavailable });
      return;
    }
    if (isPast(provider, parsed.data.appointmentDate, parsed.data.appointmentTime)) {
      res.status(409).json({ success: false, code: 'APPOINTMENT_TIME_PASSED', message: 'Choose a future appointment time.' });
      return;
    }
    const newDate = current.appointmentDate !== parsed.data.appointmentDate;
    if (newDate) {
      const reserved = await reserveDailyCapacity(
        current.doctorId,
        parsed.data.appointmentDate,
        provider.dailyAppointmentLimit,
      );
      if (!reserved) {
        res.status(409).json({ success: false, code: 'DAILY_LIMIT_REACHED', message: 'The doctor has reached the appointment limit for this day.' });
        return;
      }
    }
    const now = new Date();
    let updated;
    try {
      updated = await appointments.findOneAndUpdate(
        { _id: id, ...scope, status: current.status },
        {
          $set: {
            appointmentDate: parsed.data.appointmentDate,
            appointmentTime: parsed.data.appointmentTime,
            slotKeys: slotKeysFor(current.doctorId, parsed.data.appointmentDate, parsed.data.appointmentTime, provider.appointmentDurationMinutes),
            updatedAt: now,
          },
          $push: {
            rescheduleHistory: {
              previousDate: current.appointmentDate,
              previousTime: current.appointmentTime,
              appointmentDate: parsed.data.appointmentDate,
              appointmentTime: parsed.data.appointmentTime,
              changedBy: req.user.uid,
              changedAt: now,
            },
          },
        },
        { returnDocument: 'after' },
      );
      if (!updated) {
        if (newDate) await releaseDailyCapacity(current.doctorId, parsed.data.appointmentDate);
        res.status(409).json({ success: false, message: 'The appointment changed. Reload and try again.' });
        return;
      }
      if (newDate) await releaseDailyCapacity(current.doctorId, current.appointmentDate);
    } catch (error) {
      if (newDate) await releaseDailyCapacity(current.doctorId, parsed.data.appointmentDate);
      if (error?.code === 11000 || error?.codeName === 'DuplicateKey') {
        res.status(409).json({ success: false, code: 'APPOINTMENT_SLOT_TAKEN', message: 'That appointment time is already booked. Choose another time.' });
        return;
      }
      throw error;
    }
    await audit(req.user, 'appointment_rescheduled', id, { doctorId: current.doctorId });
    await createAppointmentNotifications(
      updated,
      'appointment_rescheduled',
      `rescheduled:${updated.updatedAt.getTime()}`,
    );
    const appointmentResponse = await isTreatingDoctor(req.user, updated.doctorId)
      ? clean(updated)
      : operationalAppointmentResponse(updated);
    res.json({ success: true, appointment: appointmentResponse });
  });

  return {
    registerOrganization,
    getMyOrganization,
    updateMyOrganization,
    listHospitalDoctors,
    listPublicHospitalDoctors,
    getPublicHospitalDoctor,
    addHospitalDoctor,
    updateHospitalDoctor,
    setHospitalDoctorActive,
    removeHospitalDoctor,
    listDepartments,
    createDepartment,
    updateDepartment,
    deactivateDepartment,
    reviewOrganization,
    listAdminOrganizations,
    getAdminOrganization,
    listAdminOrganizationDoctors,
    getAdminOrganizationDoctor,
    reviewAdminOrganizationDoctor,
    listPendingOrganizations,
    listPendingHospitalDoctors,
    reviewHospitalDoctor,
    acceptDoctorInvitation,
    listOrganizationStaff,
    inviteOrganizationStaff,
    acceptOrganizationStaffInvitation,
    deactivateOrganizationStaff,
    getAvailabilityCalendar,
    setAvailabilityOverride,
    removeAvailabilityOverride,
    listNotifications,
    markNotificationRead,
    getConsultationRecord,
    saveConsultationRecord,
    setConsultationAccess,
    bookAppointment,
    listAppointments,
    getAppointmentSummary,
    listPatients,
    listPatientVisits,
    getAppointment,
    updateAppointmentStatus,
    rescheduleAppointment,
  };
}
