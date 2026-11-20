import { ObjectId } from 'mongodb';
import {
  adminDoctorQuerySchema,
  doctorDirectoryQuerySchema,
  doctorDraftSchema,
  doctorReviewSchema,
  doctorSubmissionSchema,
} from './validation.js';

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function invalid(res, result) {
  res.status(400).json({
    success: false,
    message: result.error.issues[0]?.message || 'Request validation failed.',
    issues: result.error.issues.map(({ path, message }) => ({ path, message })),
  });
}

function validObjectId(value) {
  return /^[a-f\d]{24}$/i.test(value) && ObjectId.isValid(value);
}

function ownerFilter(user) {
  return {
    firebaseProjectId: user.firebaseProjectId,
    firebaseUid: user.uid,
  };
}

function privateDoctorResponse(doctor) {
  if (!doctor) return null;
  const {
    _id,
    firebaseProjectId: _firebaseProjectId,
    firebaseUid: _firebaseUid,
    reviewHistory = [],
    revision: _revision,
    ...profile
  } = doctor;
  return {
    ...profile,
    id: _id.toString(),
    reviewHistory: reviewHistory.map(({ decision, note, reviewedAt }) => ({
      decision,
      note,
      reviewedAt,
    })),
  };
}

function adminDoctorResponse(doctor) {
  if (!doctor) return null;
  return {
    ...doctor,
    id: doctor._id.toString(),
    _id: undefined,
  };
}

function publicDoctorResponse(doctor) {
  return {
    id: doctor._id.toString(),
    fullName: doctor.fullName,
    profilePhotoUrl: doctor.profilePhotoUrl || null,
    medicalCouncil: doctor.medicalCouncil,
    qualifications: doctor.qualifications,
    primarySpecialty: doctor.primarySpecialty,
    additionalSpecialties: doctor.additionalSpecialties,
    yearsExperience: doctor.yearsExperience,
    clinicName: doctor.clinicName,
    clinicAddress: doctor.clinicAddress,
    city: doctor.city,
    state: doctor.state,
    postalCode: doctor.postalCode,
    consultationMode: doctor.consultationMode,
    workingDays: doctor.workingDays,
    openingTime: doctor.openingTime,
    closingTime: doctor.closingTime,
    timeZone: doctor.timeZone,
    breaks: doctor.breaks,
    appointmentDurationMinutes: doctor.appointmentDurationMinutes,
    dailyAppointmentLimit: doctor.dailyAppointmentLimit,
    consultationFee: doctor.consultationFee,
    currency: doctor.currency,
  };
}

function publicHospitalDoctorResponse(doctor, organization) {
  return {
    id: doctor._id.toString(),
    organizationId: organization?._id.toString() || null,
    organizationName: organization?.name || null,
    fullName: doctor.fullName,
    profilePhotoUrl: doctor.profilePhotoUrl || null,
    medicalCouncil: doctor.medicalCouncil || null,
    qualifications: doctor.qualifications,
    primarySpecialty: doctor.specialization || doctor.primarySpecialty,
    additionalSpecialties: doctor.additionalSpecializations || doctor.additionalSpecialties || [],
    yearsExperience: doctor.yearsExperience || 0,
    clinicName: organization ? organization.name : (doctor.clinicName || 'Hospital Clinic'),
    clinicAddress: organization ? organization.address : (doctor.clinicAddress || ''),
    city: organization ? organization.city : (doctor.city || ''),
    state: organization ? organization.state : (doctor.state || 'Andhra Pradesh'),
    postalCode: organization ? organization.postalCode : (doctor.postalCode || ''),
    consultationMode: doctor.consultationMode || 'both',
    workingDays: doctor.workingDays || [],
    openingTime: doctor.openingTime || '09:00',
    closingTime: doctor.closingTime || '17:00',
    timeZone: doctor.timeZone || 'Asia/Kolkata',
    breaks: doctor.breaks || [],
    appointmentDurationMinutes: doctor.appointmentDurationMinutes || 30,
    dailyAppointmentLimit: doctor.dailyAppointmentLimit || 20,
    consultationFee: doctor.consultationFee || 500,
    currency: doctor.currency || 'INR',
  };
}

function normalizeSearchValue(value) {
  return value.trim().toLocaleLowerCase('en-US');
}

function duplicateKey(error) {
  return error?.code === 11000 || error?.codeName === 'DuplicateKey';
}

export function createDoctorControllers({ getDb }) {
  const getMyDoctor = asyncRoute(async (req, res) => {
    const doctor = await getDb().collection('doctorApplications')
      .findOne(ownerFilter(req.user));
    if (!doctor) {
      res.status(404).json({
        success: false,
        code: 'DOCTOR_APPLICATION_REQUIRED',
        message: 'No doctor application exists for this account.',
      });
      return;
    }
    res.json({ success: true, doctor: privateDoctorResponse(doctor) });
  });

  const saveMyDoctor = asyncRoute(async (req, res) => {
    const result = doctorDraftSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);

    const now = new Date();
    const set = { ...result.data, updatedAt: now };
    if (result.data.city !== undefined) {
      set.citySearch = normalizeSearchValue(result.data.city);
    }
    if (result.data.primarySpecialty !== undefined) {
      set.primarySpecialtySearch = normalizeSearchValue(result.data.primarySpecialty);
    }
    if (result.data.additionalSpecialties !== undefined) {
      set.additionalSpecialtiesSearch = result.data.additionalSpecialties
        .map(normalizeSearchValue);
    }
    if (req.user.emailVerified && req.user.email) {
      set.professionalEmail = req.user.email;
    }
    const setOnInsert = {
      ...ownerFilter(req.user),
      ...(result.data.fullName === undefined
        ? { fullName: req.user.name || '' }
        : {}),
      ...(!req.user.emailVerified || !req.user.email
        ? { professionalEmail: null }
        : {}),
      status: 'draft',
      createdAt: now,
      submittedAt: null,
      reviewNote: null,
      reviewedBy: null,
      reviewedAt: null,
      approvedAt: null,
      suspendedAt: null,
      reviewHistory: [],
    };

    let doctor;
    try {
      doctor = await getDb().collection('doctorApplications').findOneAndUpdate(
        {
          ...ownerFilter(req.user),
          status: { $in: ['draft', 'changes_requested'] },
        },
        { $set: set, $setOnInsert: setOnInsert, $inc: { revision: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      res.status(409).json({
        success: false,
        message: 'This application cannot be edited in its current status.',
      });
      return;
    }

    res.json({ success: true, doctor: privateDoctorResponse(doctor) });
  });

  const submitMyDoctor = asyncRoute(async (req, res) => {
    if (Object.keys(req.body || {}).length > 0) {
      res.status(400).json({
        success: false,
        message: 'Submission does not accept profile, identity, or status fields.',
      });
      return;
    }
    if (!req.user.emailVerified || !req.user.email) {
      res.status(403).json({
        success: false,
        code: 'VERIFIED_EMAIL_REQUIRED',
        message: 'Verify the Firebase account email before submitting a doctor application.',
      });
      return;
    }

    const collection = getDb().collection('doctorApplications');
    const owner = ownerFilter(req.user);
    const current = await collection.findOne(owner);
    if (!current) {
      res.status(404).json({
        success: false,
        message: 'Save a doctor profile draft before submitting it.',
      });
      return;
    }
    if (!['draft', 'changes_requested'].includes(current.status)) {
      res.status(409).json({
        success: false,
        message: current.status === 'rejected'
          ? 'Rejected applications cannot be resubmitted.'
          : 'This application cannot be submitted in its current status.',
      });
      return;
    }

    const submission = Object.fromEntries(
      Object.keys(doctorSubmissionSchema.shape).map((field) => [field, current[field]]),
    );
    const result = doctorSubmissionSchema.safeParse(submission);
    if (!result.success) return invalid(res, result);

    const now = new Date();
    const doctor = await collection.findOneAndUpdate(
      {
        ...owner,
        status: current.status,
        updatedAt: current.updatedAt,
        revision: current.revision,
      },
      {
        $set: {
          status: 'pending_review',
          professionalEmail: req.user.email,
          submittedAt: now,
          updatedAt: now,
          reviewNote: null,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!doctor) {
      res.status(409).json({
        success: false,
        message: 'The application changed while it was being submitted. Reload and try again.',
      });
      return;
    }
    res.json({ success: true, doctor: privateDoctorResponse(doctor) });
  });

  const listPublicDoctors = asyncRoute(async (req, res) => {
    const result = doctorDirectoryQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, result);
    const { specialty, city, page, limit } = result.data;

    // 1. Filter for Independent Doctors (doctorApplications)
    const independentFilter = { status: 'approved' };
    if (specialty) {
      const term = normalizeSearchValue(specialty);
      independentFilter.$or = [
        { primarySpecialtySearch: { $regex: term, $options: 'i' } },
        { additionalSpecialtiesSearch: { $regex: term, $options: 'i' } },
        { primarySpecialty: { $regex: term, $options: 'i' } },
      ];
    }
    if (city) {
      const cityTerm = normalizeSearchValue(city.split(',')[0]);
      independentFilter.citySearch = { $regex: cityTerm, $options: 'i' };
    }

    // 2. Filter for Hospital/Organization Doctors (doctorPortalDoctors + doctorPortalOrganizations)
    const orgFilter = { verificationStatus: 'approved' };
    if (city) {
      const cityTerm = normalizeSearchValue(city.split(',')[0]);
      orgFilter.citySearch = { $regex: cityTerm, $options: 'i' };
    }

    const db = getDb();
    const [independentDocs, approvedOrgs] = await Promise.all([
      db.collection('doctorApplications').find(independentFilter).toArray(),
      db.collection('doctorPortalOrganizations').find(orgFilter).toArray(),
    ]);

    const organizationById = new Map(approvedOrgs.map((org) => [org._id.toString(), org]));
    const approvedOrgIds = approvedOrgs.map((org) => org._id);

    let hospitalDocs = [];
    if (approvedOrgIds.length > 0) {
      const hospitalFilter = {
        isActive: true,
        verificationStatus: 'approved',
        organizationId: { $in: approvedOrgIds },
      };
      if (specialty) {
        const term = normalizeSearchValue(specialty);
        hospitalFilter.$or = [
          { specializationSearch: { $regex: term, $options: 'i' } },
          { specialization: { $regex: term, $options: 'i' } },
        ];
      }
      hospitalDocs = await db.collection('doctorPortalDoctors').find(hospitalFilter).toArray();
    }

    // Combine both sources
    const mappedIndependent = independentDocs.map(publicDoctorResponse);
    const mappedHospital = hospitalDocs.map((doc) => {
      const org = organizationById.get(doc.organizationId?.toString());
      return publicHospitalDoctorResponse(doc, org);
    });

    const combined = [...mappedIndependent, ...mappedHospital];
    combined.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

    // Pagination
    const total = combined.length;
    const startIndex = (page - 1) * limit;
    const paginated = combined.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      count: paginated.length,
      total,
      page,
      limit,
      doctors: paginated,
    });
  });

  const getPublicDoctor = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }

    const doctorId = new ObjectId(req.params.id);
    const db = getDb();

    // 1. Search independent doctors
    const indyDoctor = await db.collection('doctorApplications').findOne({
      _id: doctorId,
      status: 'approved',
    });
    if (indyDoctor) {
      res.json({ success: true, doctor: publicDoctorResponse(indyDoctor) });
      return;
    }

    // 2. Search hospital/organization doctors
    const hospitalDoctor = await db.collection('doctorPortalDoctors').findOne({
      _id: doctorId,
      isActive: true,
      verificationStatus: 'approved',
    });
    if (hospitalDoctor) {
      const org = await db.collection('doctorPortalOrganizations').findOne({
        _id: hospitalDoctor.organizationId,
        verificationStatus: 'approved',
      });
      if (org) {
        res.json({ success: true, doctor: publicHospitalDoctorResponse(hospitalDoctor, org) });
        return;
      }
    }

    res.status(404).json({
      success: false,
      message: 'Doctor not found or not available.',
    });
  });

  const listAdminDoctors = asyncRoute(async (req, res) => {
    const result = adminDoctorQuerySchema.safeParse(req.query);
    if (!result.success) return invalid(res, result);
    const { status, page, limit } = result.data;
    const filter = { status };
    const collection = getDb().collection('doctorApplications');
    const [doctors, total] = await Promise.all([
      collection.find(filter).sort({ submittedAt: 1 })
        .skip((page - 1) * limit).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);
    res.json({
      success: true,
      count: doctors.length,
      total,
      page,
      limit,
      doctors: doctors.map(adminDoctorResponse),
    });
  });

  const getAdminDoctor = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }
    const doctor = await getDb().collection('doctorApplications').findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!doctor) {
      res.status(404).json({ success: false, message: 'Doctor application not found.' });
      return;
    }
    res.json({ success: true, doctor: adminDoctorResponse(doctor) });
  });

  const reviewAdminDoctor = asyncRoute(async (req, res) => {
    if (!validObjectId(req.params.id)) {
      res.status(400).json({ success: false, message: 'Invalid doctor ID.' });
      return;
    }
    const result = doctorReviewSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);

    const { status, reviewNote } = result.data;
    const id = new ObjectId(req.params.id);
    const collection = getDb().collection('doctorApplications');
    const current = await collection.findOne({ _id: id });
    if (!current) {
      res.status(404).json({ success: false, message: 'Doctor application not found.' });
      return;
    }
    if (
      current.firebaseProjectId === req.user.firebaseProjectId
      && current.firebaseUid === req.user.uid
    ) {
      res.status(403).json({
        success: false,
        message: 'Administrators cannot review their own doctor application.',
      });
      return;
    }

    const allowedFrom = {
      approved: ['pending_review', 'suspended'],
      rejected: ['pending_review'],
      changes_requested: ['pending_review'],
      suspended: ['approved'],
    }[status];
    if (!allowedFrom.includes(current.status)) {
      res.status(409).json({
        success: false,
        message: `Cannot change application status from ${current.status} to ${status}.`,
      });
      return;
    }

    const now = new Date();
    const doctor = await collection.findOneAndUpdate(
      { _id: id, status: { $in: allowedFrom } },
      {
        $set: {
          status,
          reviewNote: status === 'approved' ? null : reviewNote,
          reviewedBy: req.user.uid,
          reviewedAt: now,
          updatedAt: now,
          approvedAt: status === 'approved' ? now : null,
          suspendedAt: status === 'suspended' ? now : null,
        },
        $push: {
          reviewHistory: {
            decision: status,
            note: status === 'approved' ? null : reviewNote,
            reviewerUid: req.user.uid,
            reviewedAt: now,
          },
        },
      },
      { returnDocument: 'after' },
    );
    if (!doctor) {
      res.status(409).json({
        success: false,
        message: 'The application changed while it was being reviewed. Reload and try again.',
      });
      return;
    }
    res.json({ success: true, doctor: adminDoctorResponse(doctor) });
  });

  return {
    getMyDoctor,
    saveMyDoctor,
    submitMyDoctor,
    listPublicDoctors,
    getPublicDoctor,
    listAdminDoctors,
    getAdminDoctor,
    reviewAdminDoctor,
  };
}
