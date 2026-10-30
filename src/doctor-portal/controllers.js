import { ObjectId } from 'mongodb';
import {
  appointmentBookingSchema,
  appointmentQuerySchema,
  appointmentRescheduleSchema,
  appointmentStatusSchema,
  departmentSchema,
  departmentUpdateSchema,
  doctorUpdateSchema,
  doctorActiveSchema,
  hospitalDoctorQuerySchema,
  hospitalDoctorSchema,
  invitationAcceptSchema,
  organizationSchema,
  organizationUpdateSchema,
  publicDoctorQuerySchema,
  verificationSchema,
} from './validation.js';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
const idOf = (value) => new ObjectId(value);
const hasId = (value) => /^[a-f\d]{24}$/i.test(value || '') && ObjectId.isValid(value);
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
  if (!doctor.workingDays?.includes(dayName(date))) return 'The doctor is not available on that day.';
  if (time < doctor.openingTime || minutes(time) + doctor.appointmentDurationMinutes > minutes(doctor.closingTime)) {
    return 'The requested time is outside the doctor’s availability.';
  }
  if (doctor.consultationMode === 'online' && appointmentType !== 'online') return 'This doctor only offers online consultations.';
  if (doctor.consultationMode === 'offline' && appointmentType !== 'in_person') return 'This doctor only offers in-person consultations.';
  const start = minutes(time);
  const end = start + doctor.appointmentDurationMinutes;
  if ((doctor.breaks || []).some((period) => start < minutes(period.endTime) && end > minutes(period.startTime))) {
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
    return null;
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
    const appointments = collection('doctorPortalAppointments');
    const reserved = await reserveDailyCapacity(
      provider.doctorId,
      parsed.data.appointmentDate,
      provider.dailyAppointmentLimit,
    );
    if (!reserved) {
      res.status(409).json({ success: false, code: 'DAILY_LIMIT_REACHED', message: 'The doctor has reached the appointment limit for this day.' });
      return;
    }
    const now = new Date();
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
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    res.json({ success: true, appointment: clean(appointment) });
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
    res.json({ success: true, appointment: clean(updated) });
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
    res.json({ success: true, appointment: clean(updated) });
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
    listPendingOrganizations,
    listPendingHospitalDoctors,
    reviewHospitalDoctor,
    acceptDoctorInvitation,
    bookAppointment,
    listAppointments,
    getAppointment,
    updateAppointmentStatus,
    rescheduleAppointment,
  };
}
