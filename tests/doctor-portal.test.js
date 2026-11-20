import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';

const primaryProjectId = 'sellerportal-2786c';
const records = new Map();
const claims = Object.fromEntries(['admin', 'hospital', 'other-hospital', 'patient', 'doctor', 'clinical-colleague', 'staff', 'other-staff'].map((uid) => [
  uid,
  {
    uid,
    email: `${uid}@example.test`,
    email_verified: true,
    aud: primaryProjectId,
    iss: `https://securetoken.google.com/${primaryProjectId}`,
  },
]));
claims.android = {
  uid: 'android-patient',
  email: 'android-patient@example.test',
  email_verified: true,
  aud: 'project-fitness-species',
  iss: 'https://securetoken.google.com/project-fitness-species',
};
claims.unverified = {
  uid: 'unverified-doctor',
  email: 'doctor@example.test',
  email_verified: false,
  aud: primaryProjectId,
  iss: `https://securetoken.google.com/${primaryProjectId}`,
};

function same(left, right) {
  if (left instanceof ObjectId || right instanceof ObjectId) return String(left) === String(right);
  return left === right;
}

function matches(document, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((clause) => matches(document, clause));
    const actual = key.split('.').reduce((value, part) => value?.[part], document);
    if (expected instanceof RegExp) return expected.test(String(actual || ''));
    if (expected && typeof expected === 'object' && !(expected instanceof ObjectId) && !(expected instanceof Date)) {
      if ('$in' in expected && !expected.$in.some((value) => same(actual, value))) return false;
      if ('$ne' in expected && same(actual, expected.$ne)) return false;
      if ('$exists' in expected && (actual !== undefined) !== expected.$exists) return false;
      if ('$lt' in expected && !(actual < expected.$lt)) return false;
      if ('$gt' in expected && !(actual > expected.$gt)) return false;
      if ('$gte' in expected && actual < expected.$gte) return false;
      if ('$lte' in expected && actual > expected.$lte) return false;
      if ('$regex' in expected && !new RegExp(expected.$regex, expected.$options || '').test(String(actual || ''))) return false;
      return true;
    }
    return same(actual, expected);
  });
}

class TestCollection {
  constructor(name) {
    this.name = name;
    if (!records.has(name)) records.set(name, []);
  }

  items() {
    return records.get(this.name);
  }

  async findOne(query) {
    return this.items().find((item) => matches(item, query)) || null;
  }

  async insertOne(document) {
    const stored = { ...document, _id: document._id || new ObjectId() };
    if (this.name === 'doctorPortalAppointments'
      && this.items().some((item) => item.doctorId === stored.doctorId
        && item.slotKeys?.some((key) => stored.slotKeys?.includes(key)))) {
      const error = new Error('Duplicate slot.');
      error.code = 11000;
      throw error;
    }
    this.items().push(stored);
    return { insertedId: stored._id };
  }

  async findOneAndUpdate(query, update, options = {}) {
    let item = this.items().find((record) => matches(record, query));
    if (!item && options.upsert) {
      const newId = query._id || update.$setOnInsert?._id || new ObjectId();
      if (this.items().some((record) => same(record._id, newId))) {
        const error = new Error('Duplicate key.');
        error.code = 11000;
        throw error;
      }
      item = { ...(update.$setOnInsert || {}), _id: newId };
      this.items().push(item);
    }
    if (!item) return null;
    if (this.name === 'doctorPortalAppointments' && update.$set?.slotKeys?.length) {
      const conflict = this.items().some((record) => record !== item
        && record.doctorId === item.doctorId
        && record.slotKeys?.some((key) => update.$set.slotKeys.includes(key)));
      if (conflict) {
        const error = new Error('Duplicate slot.');
        error.code = 11000;
        throw error;
      }
    }
    for (const [field, value] of Object.entries(update.$set || {})) {
      const parts = field.split('.');
      const leaf = parts.pop();
      let target = item;
      for (const part of parts) {
        target[part] ||= {};
        target = target[part];
      }
      target[leaf] = value;
    }
    for (const field of Object.keys(update.$unset || {})) {
      const parts = field.split('.');
      const leaf = parts.pop();
      let target = item;
      for (const part of parts) target = target?.[part];
      if (target) delete target[leaf];
    }
    for (const [field, amount] of Object.entries(update.$inc || {})) {
      item[field] = (item[field] || 0) + amount;
    }
    for (const [field, value] of Object.entries(update.$push || {})) {
      item[field] ||= [];
      item[field].push(value);
    }
    return item;
  }

  async updateOne(query, update, options = {}) {
    const item = this.items().find((record) => matches(record, query));
    if (!item && options.upsert) {
      const newId = query._id || update.$setOnInsert?._id || new ObjectId();
      const inserted = { ...(update.$setOnInsert || {}), _id: newId };
      for (const [field, value] of Object.entries(update.$set || {})) {
        const parts = field.split('.');
        const leaf = parts.pop();
        let target = inserted;
        for (const part of parts) {
          target[part] ||= {};
          target = target[part];
        }
        target[leaf] = value;
      }
      this.items().push(inserted);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    if (!item) return { matchedCount: 0, modifiedCount: 0 };
    for (const [field, amount] of Object.entries(update.$inc || {})) {
      item[field] = (item[field] || 0) + amount;
    }
    for (const [field, value] of Object.entries(update.$set || {})) {
      const parts = field.split('.');
      const leaf = parts.pop();
      let target = item;
      for (const part of parts) {
        target[part] ||= {};
        target = target[part];
      }
      target[leaf] = value;
    }
    for (const field of Object.keys(update.$unset || {})) {
      const parts = field.split('.');
      const leaf = parts.pop();
      let target = item;
      for (const part of parts) target = target?.[part];
      if (target) delete target[leaf];
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(query, update) {
    for (const item of this.items().filter((record) => matches(record, query))) {
      Object.assign(item, update.$set || {});
    }
    return { modifiedCount: 0 };
  }

  async countDocuments(query) {
    return this.items().filter((item) => matches(item, query)).length;
  }

  find(query) {
    let items = this.items().filter((item) => matches(item, query));
    const cursor = {
      sort(spec) {
        items = [...items].sort((left, right) => {
          for (const [field, direction] of Object.entries(spec)) {
            if (left[field] === right[field]) continue;
            return (left[field] > right[field] ? 1 : -1) * direction;
          }
          return 0;
        });
        return cursor;
      },
      skip(amount) { items = items.slice(amount); return cursor; },
      limit(amount) { items = items.slice(0, amount); return cursor; },
      async toArray() { return [...items]; },
    };
    return cursor;
  }

  aggregate(pipeline) {
    const status = pipeline[0]?.$match?.status;
    const union = pipeline.find((stage) => stage.$unionWith)?.$unionWith;
    const facet = pipeline.find((stage) => stage.$facet)?.$facet;
    if (!union && facet?.totals) {
      const baseFilter = pipeline.find((stage) => stage.$match)?.$match || {};
      const documents = this.items().filter((document) => matches(document, baseFilter));
      const filterFor = (stages) => {
        const filter = stages.find((stage) => stage.$match)?.$match || {};
        return documents.filter((document) => matches(document, filter));
      };
      const rangeAppointments = filterFor(facet.totals);
      const groupBy = (items, keyOf) => {
        const groups = new Map();
        for (const item of items) {
          const key = keyOf(item);
          groups.set(key, [...(groups.get(key) || []), item]);
        }
        return groups;
      };
      const statusCounts = [...groupBy(rangeAppointments, (item) => item.status)]
        .map(([statusName, items]) => ({ _id: statusName, count: items.length }));
      const doctorStats = [...groupBy(rangeAppointments, (item) => item.doctorId)]
        .map(([doctorId, items]) => ({
          _id: doctorId,
          doctorName: items[0].doctorName,
          departmentId: items[0].departmentId,
          count: items.length,
        }));
      const monthStats = [...groupBy(rangeAppointments, (item) => item.appointmentDate?.slice(0, 7))]
        .map(([month, items]) => ({ _id: month, count: items.length }));
      const departmentStats = [...groupBy(rangeAppointments, (item) => item.departmentId?.toString() || null)]
        .map(([departmentId, items]) => ({
          _id: departmentId ? new ObjectId(departmentId) : null,
          count: items.length,
        }));
      const uniquePatients = new Set(rangeAppointments.map((item) => (
        item.patientFirebaseProjectId && item.patientFirebaseUid
          ? `${item.patientFirebaseProjectId}:${item.patientFirebaseUid}`
          : item._id.toString()
      )));
      const todayCount = filterFor(facet.today).length;
      const upcomingCount = filterFor(facet.upcoming).length;
      return {
        async toArray() {
          return [{
            totals: rangeAppointments.length ? [{ appointments: rangeAppointments.length }] : [],
            patients: uniquePatients.size ? [{ count: uniquePatients.size }] : [],
            statuses: statusCounts,
            doctors: doctorStats,
            months: monthStats,
            departments: departmentStats,
            today: todayCount ? [{ count: todayCount }] : [],
            upcoming: upcomingCount ? [{ count: upcomingCount }] : [],
          }];
        },
      };
    }
    if (!union && facet?.patients) {
      const filter = pipeline.find((stage) => stage.$match)?.$match || {};
      const appointments = this.items().filter((document) => matches(document, filter));
      const groups = new Map();
      for (const appointment of appointments) {
        const identity = appointment.patientFirebaseProjectId && appointment.patientFirebaseUid
          ? `${appointment.patientFirebaseProjectId}:${appointment.patientFirebaseUid}`
          : appointment._id.toString();
        groups.set(identity, [...(groups.get(identity) || []), appointment]);
      }
      const patients = [...groups.values()].map((items) => {
        const sorted = [...items].sort((left, right) => (
          left.appointmentDate.localeCompare(right.appointmentDate)
          || left.appointmentTime.localeCompare(right.appointmentTime)
          || left.createdAt - right.createdAt
        ));
        const first = sorted[0];
        const latest = sorted[sorted.length - 1];
        return {
          patientId: first._id,
          patientName: latest.patientName,
          patientGender: latest.patientGender,
          patientAgeAtBooking: latest.patientAgeAtBooking,
          createdAt: first.createdAt,
          latestAppointmentDate: latest.appointmentDate,
          latestAppointmentTime: latest.appointmentTime,
          latestAppointmentId: latest.appointmentId,
          latestStatus: latest.status,
          doctorId: latest.doctorId,
          doctorName: latest.doctorName,
          doctorSpecialization: latest.doctorSpecialization,
          departmentId: latest.departmentId,
          visitCount: items.length,
        };
      });
      const patientFacet = facet.patients;
      const sortStage = patientFacet.find((stage) => stage.$sort)?.$sort || { latestAppointmentDate: -1 };
      const [sortKey, sortOrder] = Object.entries(sortStage)[0];
      patients.sort((left, right) => {
        const leftValue = left[sortKey] || '';
        const rightValue = right[sortKey] || '';
        return (leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0) * sortOrder;
      });
      const offset = patientFacet.find((stage) => stage.$skip)?.$skip || 0;
      const limit = patientFacet.find((stage) => stage.$limit)?.$limit || 25;
      const departments = records.get('doctorPortalDepartments') || [];
      const page = patients.slice(offset, offset + limit).map((patient) => ({
        ...patient,
        patientId: patient.patientId.toString(),
        departmentId: patient.departmentId?.toString() || null,
        departmentName: departments.find((department) => same(department._id, patient.departmentId))?.name,
      }));
      return {
        async toArray() {
          return [{
            patients: page,
            total: patients.length ? [{ count: patients.length }] : [],
          }];
        },
      };
    }
    assert.ok(status, 'Admin queue must filter the individual application status.');
    assert.equal(union?.coll, 'doctorPortalDoctors', 'Admin queue must include hospital doctor records.');
    assert.equal(union.pipeline[0]?.$match?.verificationStatus, status);
    assert.ok(facet, 'Admin queue must paginate and count the combined records.');

    const annotate = (documents, source, statusField) => documents
      .filter((document) => document[statusField] === status)
      .map((document) => ({
        ...document,
        source,
        doctorType: source,
        status: document[statusField],
        sortDate: document.submittedAt || document.createdAt,
      }));
    const documents = [
      ...annotate(this.items(), 'individual', 'status'),
      ...annotate(records.get(union.coll) || [], 'hospital', 'verificationStatus'),
    ].sort((left, right) => (
      new Date(left.sortDate || 0) - new Date(right.sortDate || 0)
      || left._id.toString().localeCompare(right._id.toString())
    ));
    const offset = facet.data[0].$skip;
    const limit = facet.data[1].$limit;
    return {
      async toArray() {
        return [{
          data: documents.slice(offset, offset + limit),
          totalCount: documents.length ? [{ count: documents.length }] : [],
        }];
      },
    };
  }
}

const app = createApp({
  getDb: () => ({ collection: (name) => new TestCollection(name) }),
  getDbStatus: () => 'connected',
  verifyIdToken: async (token) => claims[token],
  primaryFirebaseProjectId: primaryProjectId,
  supportedFirebaseProjectIds: [primaryProjectId, 'project-fitness-species'],
  adminUids: ['admin'],
});

function auth(token) {
  return (method, path, body) => {
    let call = request(app)[method](path).set('Authorization', `Bearer ${token}`);
    if (body !== undefined) call = call.send(body);
    return call;
  };
}

function organization(name, adminName) {
  return {
    name,
    organizationType: 'multispeciality_hospital',
    email: adminName === 'Admin One' ? 'hospital@example.test' : 'other-hospital@example.test',
    phone: '+91 9876543210',
    address: '10 Market Road, Pune',
    city: 'Pune',
    state: 'Maharashtra',
    registrationNumber: `REG-${name}`,
    facilities: ['Emergency care'],
    adminName,
    adminDesignation: 'Administrator',
  };
}

function doctor() {
  return {
    fullName: 'Dr. Portal Doctor',
    gender: 'prefer_not_to_say',
    dateOfBirth: '1985-04-12',
    email: 'doctor@example.test',
    phone: '+91 9876543211',
    specialization: 'Cardiology',
    additionalSpecializations: [],
    qualifications: ['MBBS'],
    medicalRegistrationNumber: 'MCI-PORTAL-1',
    medicalCouncil: 'Maharashtra Medical Council',
    yearsExperience: 12,
    consultationFee: 800,
    consultationMode: 'both',
    workingDays: ['monday'],
    openingTime: '09:00',
    closingTime: '17:00',
    timeZone: 'Asia/Kolkata',
    appointmentDurationMinutes: 30,
    dailyAppointmentLimit: 2,
    breaks: [{ startTime: '13:00', endTime: '14:00' }],
  };
}

async function createApprovedHospitalDoctor({
  hospitalToken = 'hospital',
  organizationName = 'North Hospital',
  adminName = 'Admin One',
  doctorProfile = doctor(),
  linkDoctor = true,
} = {}) {
  const registered = await auth(hospitalToken)(
    'post',
    '/api/doctor-portal/organizations',
    organization(organizationName, adminName),
  );
  const organizationId = registered.body.organization.id;
  await auth('admin')(
    'patch',
    `/api/doctor-portal/admin/organizations/${organizationId}/review`,
    { status: 'approved' },
  );
  const created = await auth(hospitalToken)(
    'post',
    '/api/doctor-portal/organizations/doctors',
    doctorProfile,
  );
  const doctorId = created.body.doctor.id;
  await auth('admin')(
    'patch',
    `/api/doctor-portal/admin/hospital-doctors/${doctorId}/review`,
    { status: 'approved' },
  );
  await auth(hospitalToken)(
    'patch',
    `/api/doctor-portal/organizations/doctors/${doctorId}/active`,
    { isActive: true },
  );
  if (linkDoctor) {
    await auth('doctor')(
      'post',
      '/api/doctor-portal/invitations/accept',
      { doctorId },
    );
  }
  return { organizationId, doctorId };
}

test.beforeEach(() => records.clear());

test('separate portal API registers and verifies an organization and its doctors', async () => {
  const unauthenticated = await request(app).get('/api/doctor-portal/organizations/me');
  assert.equal(unauthenticated.status, 401);

  const missingOrganization = await auth('hospital')('get', '/api/doctor-portal/organizations/me');
  assert.equal(missingOrganization.status, 404);
  assert.equal(missingOrganization.body.code, 'ORGANIZATION_REQUIRED');

  const registered = await auth('hospital')('post', '/api/doctor-portal/organizations', organization('North Hospital', 'Admin One'));
  assert.equal(registered.status, 201);
  assert.equal(registered.body.organization.verificationStatus, 'pending');

  const existingOrganization = await auth('hospital')('get', '/api/doctor-portal/organizations/me');
  assert.equal(existingOrganization.status, 200);
  assert.equal(existingOrganization.body.organization.id, registered.body.organization.id);
  assert.equal(existingOrganization.body.organization.verificationStatus, 'pending');

  const beforeApproval = await auth('hospital')('post', '/api/doctor-portal/organizations/doctors', doctor());
  assert.equal(beforeApproval.status, 403);

  const approval = await auth('admin')('patch', `/api/doctor-portal/admin/organizations/${registered.body.organization.id}/review`, { status: 'approved' });
  assert.equal(approval.status, 200);
  const created = await auth('hospital')('post', '/api/doctor-portal/organizations/doctors', doctor());
  assert.equal(created.status, 201);
  assert.equal(created.body.doctor.verificationStatus, 'pending_review');

  const verified = await auth('admin')('patch', `/api/doctor-portal/admin/hospital-doctors/${created.body.doctor.id}/review`, { status: 'approved' });
  assert.equal(verified.status, 200);
  const activated = await auth('hospital')('patch', `/api/doctor-portal/organizations/doctors/${created.body.doctor.id}/active`, { isActive: true });
  assert.equal(activated.body.doctor.isActive, true);
});

test('unified admin doctor queue reviews organization doctors without duplicating records', async () => {
  records.set('doctorApplications', []);
  const registered = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations',
    organization('North Hospital', 'Admin One'),
  );
  const organizationId = registered.body.organization.id;
  await auth('admin')(
    'patch',
    `/api/doctor-portal/admin/organizations/${organizationId}/review`,
    { status: 'approved' },
  );

  const created = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations/doctors',
    doctor(),
  );
  const doctorId = created.body.doctor.id;
  assert.equal(created.body.doctor.verificationStatus, 'pending_review');
  assert.equal(created.body.doctor.isActive, false);
  assert.equal(records.get('doctorPortalDoctors').length, 1);

  records.get('doctorApplications').push({
    _id: new ObjectId(),
    fullName: 'Dr. Individual Applicant',
    professionalEmail: 'individual@example.test',
    status: 'pending_review',
    submittedAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2025-12-01T00:00:00Z'),
  });

  const pending = await auth('admin')('get', '/api/admin/doctors?status=pending_review');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.total, 2);
  const hospitalApplication = pending.body.doctors.find((item) => item.id === doctorId);
  assert.ok(hospitalApplication);
  assert.equal(hospitalApplication.source, 'hospital');
  assert.equal(hospitalApplication.status, 'pending_review');
  assert.equal(hospitalApplication.professionalEmail, 'doctor@example.test');
  assert.equal(hospitalApplication.primarySpecialty, 'Cardiology');
  assert.deepEqual(hospitalApplication.qualifications, ['MBBS']);
  assert.equal(hospitalApplication.organizationName, 'North Hospital');
  assert.equal(hospitalApplication.organizationVerificationStatus, 'approved');
  assert.equal(hospitalApplication.accountStatus, 'inactive');
  assert.equal(hospitalApplication.submittedAt, created.body.doctor.submittedAt);
  assert.equal(pending.body.doctors.find((item) => item.fullName === 'Dr. Individual Applicant').source, 'individual');

  const prematureActivation = await auth('hospital')(
    'patch',
    `/api/doctor-portal/organizations/doctors/${doctorId}/active`,
    { isActive: true },
  );
  assert.equal(prematureActivation.status, 409);
  assert.equal((await request(app).get('/api/doctor-portal/doctors')).body.total, 0);
  const booking = {
    doctorId,
    patientName: 'Patient One',
    appointmentDate: '2027-11-01',
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  };
  assert.equal(
    (await auth('android')('post', '/api/doctor-portal/appointments/book', booking)).status,
    404,
  );
  assert.equal(
    (await auth('hospital')(
      'patch',
      `/api/admin/doctors/${doctorId}/review`,
      { status: 'approved' },
    )).status,
    403,
  );

  const detail = await auth('admin')('get', `/api/admin/doctors/${doctorId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.doctor.organization.name, 'North Hospital');
  assert.equal(detail.body.doctor.organization.verificationStatus, 'approved');
  assert.equal((await auth('hospital')('get', `/api/admin/doctors/${doctorId}`)).status, 403);

  const approved = await auth('admin')('patch', `/api/admin/doctors/${doctorId}/review`, {
    status: 'approved',
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.doctor.status, 'approved');
  assert.equal(approved.body.doctor.accountStatus, 'inactive');
  assert.equal(approved.body.doctor.isActive, false);
  assert.equal(records.get('doctorPortalOrganizations')[0].verificationStatus, 'approved');
  assert.equal((await request(app).get('/api/doctor-portal/doctors')).body.total, 0);
  assert.equal(
    (await auth('android')('post', '/api/doctor-portal/appointments/book', booking)).status,
    404,
  );

  const hospitalListing = await auth('hospital')('get', '/api/doctor-portal/organizations/doctors');
  assert.equal(hospitalListing.body.doctors[0].verificationStatus, 'approved');
  assert.equal((await request(app).get('/api/doctor-portal/doctors')).body.total, 0);

  const activated = await auth('hospital')(
    'patch',
    `/api/doctor-portal/organizations/doctors/${doctorId}/active`,
    { isActive: true },
  );
  assert.equal(activated.status, 200);
  assert.equal((await request(app).get('/api/doctor-portal/doctors')).body.total, 1);

  const rejectedDoctor = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations/doctors',
    { ...doctor(), email: 'rejected@example.test', medicalRegistrationNumber: 'MCI-PORTAL-2' },
  );
  const rejected = await auth('admin')(
    'patch',
    `/api/admin/doctors/${rejectedDoctor.body.doctor.id}/review`,
    { status: 'rejected', reviewNote: 'Registration could not be verified.' },
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.doctor.status, 'rejected');
  assert.equal(rejected.body.doctor.accountStatus, 'inactive');
  assert.equal(rejected.body.doctor.isActive, false);
});

test('organization doctor reviews are authorized, searchable, and scoped to the selected organization', async () => {
  const firstOrganization = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations',
    organization('North Hospital', 'Admin One'),
  );
  const secondOrganization = await auth('other-hospital')(
    'post',
    '/api/doctor-portal/organizations',
    organization('South Clinic', 'Admin Two'),
  );
  const firstOrganizationId = firstOrganization.body.organization.id;
  const secondOrganizationId = secondOrganization.body.organization.id;
  await auth('admin')('patch', `/api/doctor-portal/admin/organizations/${firstOrganizationId}/review`, { status: 'approved' });
  await auth('admin')('patch', `/api/doctor-portal/admin/organizations/${secondOrganizationId}/review`, { status: 'approved' });
  const department = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations/departments',
    { name: 'Cardiology' },
  );

  const firstDoctor = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations/doctors',
    { ...doctor(), departmentId: department.body.department.id },
  );
  const secondDoctor = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations/doctors',
    {
      ...doctor(),
      fullName: 'Dr. Approved Hospital Doctor',
      email: 'approved@example.test',
      specialization: 'Neurology',
      medicalRegistrationNumber: 'MCI-PORTAL-2',
    },
  );
  const otherOrganizationDoctor = await auth('other-hospital')(
    'post',
    '/api/doctor-portal/organizations/doctors',
    {
      ...doctor(),
      fullName: 'Dr. Other Organization Doctor',
      email: 'other-doctor@example.test',
      medicalRegistrationNumber: 'MCI-PORTAL-3',
    },
  );
  const doctorsPath = `/api/doctor-portal/admin/organizations/${firstOrganizationId}/doctors`;

  assert.equal((await request(app).get(doctorsPath)).status, 401);
  assert.equal((await auth('hospital')('get', doctorsPath)).status, 403);
  const filtered = await auth('admin')('get', `${doctorsPath}?status=pending_review&search=MCI-PORTAL-1`);
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.doctors[0].id, firstDoctor.body.doctor.id);
  assert.equal(filtered.body.doctors[0].organizationId, firstOrganizationId);
  assert.equal(filtered.body.doctors[0].departmentName, 'Cardiology');
  const doctorDetails = await auth('admin')(
    'get',
    `${doctorsPath}/${firstDoctor.body.doctor.id}`,
  );
  assert.equal(doctorDetails.status, 200);
  assert.equal(doctorDetails.body.doctor.departmentName, 'Cardiology');
  assert.equal(
    (await auth('admin')('get', `${doctorsPath}?status=all&search=approved%40example.test`)).body.total,
    1,
  );
  assert.equal(
    (await auth('admin')('get', `${doctorsPath}?status=all&search=Neurology`)).body.total,
    1,
  );
  assert.equal(
    (await auth('admin')('get', `${doctorsPath}?status=all&search=Approved+Hospital+Doctor`)).body.total,
    1,
  );

  const allFirstOrganizationDoctors = await auth('admin')('get', `${doctorsPath}?status=all`);
  assert.equal(allFirstOrganizationDoctors.body.total, 2);
  const secondPage = await auth('admin')(
    'get',
    `${doctorsPath}?status=all&page=2&limit=1`,
  );
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.total, 2);
  assert.equal(secondPage.body.page, 2);
  assert.equal(secondPage.body.limit, 1);
  assert.equal(secondPage.body.doctors.length, 1);
  assert.equal(
    allFirstOrganizationDoctors.body.doctors.some(({ id }) => id === otherOrganizationDoctor.body.doctor.id),
    false,
  );
  const secondOrganizationDoctors = await auth('admin')(
    'get',
    `/api/doctor-portal/admin/organizations/${secondOrganizationId}/doctors?status=all`,
  );
  assert.equal(secondOrganizationDoctors.body.total, 1);
  assert.equal(secondOrganizationDoctors.body.doctors[0].id, otherOrganizationDoctor.body.doctor.id);
  assert.equal(
    (await auth('admin')('get', `${doctorsPath}/${otherOrganizationDoctor.body.doctor.id}`)).status,
    404,
  );

  const wrongOrganizationReview = await auth('admin')(
    'patch',
    `${doctorsPath}/${otherOrganizationDoctor.body.doctor.id}/review`,
    { status: 'approved' },
  );
  assert.equal(wrongOrganizationReview.status, 404);
  assert.equal(
    records.get('doctorPortalDoctors').find(({ _id }) => String(_id) === firstDoctor.body.doctor.id).verificationStatus,
    'pending_review',
  );

  const missingReason = await auth('admin')(
    'patch',
    `${doctorsPath}/${firstDoctor.body.doctor.id}/review`,
    { status: 'rejected', reviewNote: '  ' },
  );
  assert.equal(missingReason.status, 400);
  const rejected = await auth('admin')(
    'patch',
    `${doctorsPath}/${firstDoctor.body.doctor.id}/review`,
    { status: 'rejected', reviewNote: 'Registration could not be verified.' },
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.doctor.verificationStatus, 'rejected');
  assert.equal(rejected.body.doctor.reviewNote, 'Registration could not be verified.');
  assert.equal(rejected.body.doctor.isActive, false);

  const unauthorizedApproval = await auth('patient')(
    'patch',
    `${doctorsPath}/${secondDoctor.body.doctor.id}/review`,
    { status: 'approved' },
  );
  assert.equal(unauthorizedApproval.status, 403);
  const approved = await auth('admin')(
    'patch',
    `${doctorsPath}/${secondDoctor.body.doctor.id}/review`,
    { status: 'approved' },
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.body.doctor.verificationStatus, 'approved');
  assert.equal(approved.body.doctor.isActive, false);

  const approvedFilter = await auth('admin')('get', `${doctorsPath}?status=approved`);
  assert.equal(approvedFilter.body.total, 1);
  assert.equal(approvedFilter.body.doctors[0].id, secondDoctor.body.doctor.id);
  const rejectedFilter = await auth('admin')('get', `${doctorsPath}?status=rejected`);
  assert.equal(rejectedFilter.body.total, 1);
  assert.equal(rejectedFilter.body.doctors[0].id, firstDoctor.body.doctor.id);
});

test('admin organization doctor listing handles empty, invalid, and populated organizations', async () => {
  const registered = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations',
    organization('North Hospital', 'Admin One'),
  );
  const organizationId = registered.body.organization.id;
  const doctorsPath = `/api/doctor-portal/admin/organizations/${organizationId}/doctors`;
  await auth('admin')('patch', `/api/doctor-portal/admin/organizations/${organizationId}/review`, { status: 'approved' });

  assert.equal((await request(app).get(doctorsPath)).status, 401);
  assert.equal((await auth('hospital')('get', doctorsPath)).status, 403);
  assert.equal(
    (await auth('admin')('get', '/api/doctor-portal/admin/organizations/not-an-object-id/doctors')).status,
    400,
  );
  assert.equal(
    (await auth('admin')('get', '/api/doctor-portal/admin/organizations/000000000000000000000001/doctors')).status,
    404,
  );

  const emptyList = await auth('admin')('get', doctorsPath);
  assert.equal(emptyList.status, 200);
  assert.deepEqual(emptyList.body.doctors, []);
  assert.equal(emptyList.body.total, 0);

  const created = await auth('hospital')('post', '/api/doctor-portal/organizations/doctors', doctor());
  const doctorId = created.body.doctor.id;
  const pendingList = await auth('admin')('get', doctorsPath);
  assert.equal(pendingList.body.total, 1);
  assert.equal(pendingList.body.doctors[0].id, doctorId);
  assert.equal(pendingList.body.doctors[0].verificationStatus, 'pending_review');
  assert.equal(pendingList.body.doctors[0].isActive, false);

  const approved = await auth('admin')(
    'patch',
    `${doctorsPath}/${doctorId}/review`,
    { status: 'approved' },
  );
  assert.equal(approved.status, 200);
  const activated = await auth('hospital')(
    'patch',
    `/api/doctor-portal/organizations/doctors/${doctorId}/active`,
    { isActive: true },
  );
  assert.equal(activated.status, 200);

  const activeList = await auth('admin')('get', doctorsPath);
  assert.equal(activeList.body.doctors[0].verificationStatus, 'approved');
  assert.equal(activeList.body.doctors[0].isActive, true);
  assert.equal(records.get('doctorPortalDoctors').length, 1);
});

test('organization management lists each verification status, protects details, and records decisions', async () => {
  const registered = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations',
    organization('North Hospital', 'Admin One'),
  );
  const organizationId = registered.body.organization.id;
  records.get('doctorPortalOrganizations')[0].verificationDocuments = [
    { name: 'Private registration certificate', url: 'https://documents.example/private.pdf' },
  ];

  assert.equal((await request(app).get('/api/doctor-portal/admin/organizations')).status, 401);
  assert.equal((await request(app).get(`/api/doctor-portal/admin/organizations/${organizationId}`)).status, 401);
  assert.equal((await auth('hospital')('get', '/api/doctor-portal/admin/organizations')).status, 403);
  assert.equal((await auth('hospital')('get', `/api/doctor-portal/admin/organizations/${organizationId}`)).status, 403);
  assert.equal(
    (await auth('hospital')('patch', `/api/doctor-portal/admin/organizations/${organizationId}/review`, { status: 'approved' })).status,
    403,
  );

  const invalidFilter = await auth('admin')('get', '/api/doctor-portal/admin/organizations?status=all');
  assert.equal(invalidFilter.status, 400);
  const pending = await auth('admin')('get', '/api/doctor-portal/admin/organizations?status=pending&page=1&limit=1');
  assert.equal(pending.status, 200);
  assert.equal(pending.body.total, 1);
  assert.equal(pending.body.organizations[0].id, organizationId);
  assert.equal(pending.body.organizations[0].verificationDocuments[0].name, 'Private registration certificate');
  assert.equal('adminFirebaseUid' in pending.body.organizations[0], false);

  const missingReason = await auth('admin')(
    'patch',
    `/api/doctor-portal/admin/organizations/${organizationId}/review`,
    { status: 'rejected', reviewNote: '   ' },
  );
  assert.equal(missingReason.status, 400);

  const approved = await auth('admin')(
    'patch',
    `/api/doctor-portal/admin/organizations/${organizationId}/review`,
    { status: 'approved' },
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.body.organization.verificationStatus, 'approved');
  assert.equal(approved.body.organization.reviewedBy, 'admin');
  assert.ok(approved.body.organization.reviewedAt);

  const approvedQueue = await auth('admin')('get', '/api/doctor-portal/admin/organizations?status=approved');
  assert.equal(approvedQueue.body.total, 1);
  assert.equal(approvedQueue.body.organizations[0].id, organizationId);
  const detail = await auth('admin')('get', `/api/doctor-portal/admin/organizations/${organizationId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.organization.email, 'hospital@example.test');
  assert.equal(detail.body.organization.verificationDocuments[0].name, 'Private registration certificate');
  assert.equal(detail.body.organization.reviewedBy, 'admin');
  assert.equal(
    (await auth('admin')('patch', `/api/doctor-portal/admin/organizations/${organizationId}/review`, { status: 'rejected', reviewNote: 'Duplicate' })).status,
    404,
  );

  await auth('other-hospital')(
    'post',
    '/api/doctor-portal/organizations',
    organization('South Clinic', 'Admin Two'),
  );
  const rejected = await auth('admin')(
    'patch',
    `/api/doctor-portal/admin/organizations/${records.get('doctorPortalOrganizations')[1]._id}/review`,
    { status: 'rejected', reviewNote: 'Registration could not be verified.' },
  );
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.organization.reviewNote, 'Registration could not be verified.');
  const rejectedQueue = await auth('admin')('get', '/api/doctor-portal/admin/organizations?status=rejected');
  assert.equal(rejectedQueue.body.total, 1);
  assert.equal(rejectedQueue.body.organizations[0].verificationStatus, 'rejected');

  const legacyPendingQueue = await auth('admin')('get', '/api/doctor-portal/admin/organizations/pending');
  assert.equal(legacyPendingQueue.status, 200);
  assert.equal(legacyPendingQueue.body.organizations.length, 0);
});

test('portal booking reserves overlapping slots atomically and hospital appointment data stays isolated', async () => {
  const registered = await auth('hospital')('post', '/api/doctor-portal/organizations', organization('North Hospital', 'Admin One'));
  const orgId = registered.body.organization.id;
  await auth('admin')('patch', `/api/doctor-portal/admin/organizations/${orgId}/review`, { status: 'approved' });
  const created = await auth('hospital')('post', '/api/doctor-portal/organizations/doctors', doctor());
  const doctorId = created.body.doctor.id;
  await auth('admin')('patch', `/api/doctor-portal/admin/hospital-doctors/${doctorId}/review`, { status: 'approved' });
  await auth('hospital')('patch', `/api/doctor-portal/organizations/doctors/${doctorId}/active`, { isActive: true });

  const booking = {
    doctorId,
    patientName: 'Patient One',
    patientGender: 'female',
    patientAgeAtBooking: 34,
    appointmentDate: '2027-11-01',
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  };
  const createdAppointment = await auth('android')('post', '/api/doctor-portal/appointments/book', booking);
  assert.equal(createdAppointment.status, 201);
  assert.equal(createdAppointment.body.appointment.status, 'requested');
  assert.ok(createdAppointment.body.appointment.appointmentId);
  assert.equal(createdAppointment.body.appointment.patientAgeAtBooking, 34);
  assert.equal('patientFirebaseUid' in createdAppointment.body.appointment, false);

  const overlapping = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    ...booking,
    appointmentTime: '09:15',
  });
  assert.equal(overlapping.status, 409);
  assert.equal(overlapping.body.code, 'APPOINTMENT_SLOT_TAKEN');

  const secondBooking = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    ...booking,
    appointmentTime: '10:00',
  });
  assert.equal(secondBooking.status, 201);
  const overLimit = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    ...booking,
    appointmentTime: '11:00',
  });
  assert.equal(overLimit.status, 409);
  assert.equal(overLimit.body.code, 'DAILY_LIMIT_REACHED');

  const cancelled = await auth('hospital')('patch', `/api/doctor-portal/appointments/${createdAppointment.body.appointment.id}/status`, {
    status: 'cancelled',
    reason: 'Patient requested cancellation',
  });
  assert.equal(cancelled.body.appointment.status, 'cancelled');
  const releasedSlot = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    ...booking,
    appointmentTime: '11:00',
  });
  assert.equal(releasedSlot.status, 201);

  const listed = await auth('hospital')('get', '/api/doctor-portal/appointments');
  assert.equal(listed.body.total, 3);
  const patientList = await auth('hospital')('get', '/api/doctor-portal/patients');
  assert.equal(patientList.status, 200);
  assert.equal(patientList.body.total, 1);
  assert.equal(patientList.body.patients[0].visitCount, 3);
  assert.match(patientList.body.patients[0].patientIdentifier, /^PT-/);
  assert.equal('patientFirebaseUid' in patientList.body.patients[0], false);
  const visitHistory = await auth('hospital')('get', `/api/doctor-portal/patients/${patientList.body.patients[0].patientId}/visits`);
  assert.equal(visitHistory.status, 200);
  assert.equal(visitHistory.body.total, 3);
  assert.equal('patientFirebaseUid' in visitHistory.body.appointments[0], false);
  const summary = await auth('hospital')('get', `/api/doctor-portal/appointments/summary?doctorId=${doctorId}&today=${booking.appointmentDate}`);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.summary.totalAppointments, 3);
  assert.equal(summary.body.summary.totalPatients, 1);
  assert.equal(summary.body.summary.todayAppointments, 2);
  assert.equal(summary.body.summary.byStatus.cancelled, 1);
  assert.equal(summary.body.summary.doctorStats[0].doctorId, doctorId);
  const changed = await auth('hospital')('patch', `/api/doctor-portal/appointments/${secondBooking.body.appointment.id}/status`, { status: 'confirmed' });
  assert.equal(changed.body.appointment.status, 'confirmed');
  const rescheduled = await auth('hospital')('patch', `/api/doctor-portal/appointments/${secondBooking.body.appointment.id}/reschedule`, {
    appointmentDate: booking.appointmentDate,
    appointmentTime: '12:00',
  });
  assert.equal(rescheduled.status, 200);
  assert.equal(rescheduled.body.appointment.appointmentTime, '12:00');
  assert.equal(rescheduled.body.appointment.rescheduleHistory.length, 1);
  const conflictingReschedule = await auth('hospital')('patch', `/api/doctor-portal/appointments/${secondBooking.body.appointment.id}/reschedule`, {
    appointmentDate: booking.appointmentDate,
    appointmentTime: '11:00',
  });
  assert.equal(conflictingReschedule.status, 409);
  const completed = await auth('hospital')('patch', `/api/doctor-portal/appointments/${secondBooking.body.appointment.id}/status`, { status: 'completed' });
  assert.equal(completed.status, 200);
  const invalidTransition = await auth('hospital')('patch', `/api/doctor-portal/appointments/${secondBooking.body.appointment.id}/status`, {
    status: 'cancelled',
    reason: 'Too late to cancel',
  });
  assert.equal(invalidTransition.status, 409);

  await auth('other-hospital')('post', '/api/doctor-portal/organizations', organization('South Hospital', 'Admin Two'));
  const isolated = await auth('other-hospital')('get', '/api/doctor-portal/appointments');
  assert.equal(isolated.body.total, 0);
  const isolatedPatients = await auth('other-hospital')('get', '/api/doctor-portal/patients');
  assert.equal(isolatedPatients.body.total, 0);
  const privateVisitHistory = await auth('other-hospital')('get', `/api/doctor-portal/patients/${patientList.body.patients[0].patientId}/visits`);
  assert.equal(privateVisitHistory.status, 404);
});

test('individual doctors only see their own appointment and patient records', async () => {
  const ownDoctorId = new ObjectId();
  const otherDoctorId = new ObjectId();
  records.set('doctorApplications', [{
    _id: ownDoctorId,
    firebaseProjectId: primaryProjectId,
    firebaseUid: 'doctor',
    status: 'approved',
  }]);
  const appointments = new TestCollection('doctorPortalAppointments');
  const ownAppointment = await appointments.insertOne({
    appointmentId: new ObjectId().toString(),
    doctorId: ownDoctorId.toString(),
    doctorName: 'Dr. Own Practice',
    doctorSpecialization: 'Cardiology',
    organizationId: null,
    organizationName: 'Own Practice',
    patientName: 'Own Patient',
    appointmentDate: '2027-11-01',
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    status: 'confirmed',
    patientFirebaseProjectId: primaryProjectId,
    patientFirebaseUid: 'patient',
    createdAt: new Date('2027-01-01T10:00:00Z'),
    slotKeys: [],
  });
  const otherAppointment = await appointments.insertOne({
    appointmentId: new ObjectId().toString(),
    doctorId: otherDoctorId.toString(),
    doctorName: 'Dr. Other Practice',
    doctorSpecialization: 'Dermatology',
    organizationId: null,
    organizationName: 'Other Practice',
    patientName: 'Other Patient',
    appointmentDate: '2027-11-01',
    appointmentTime: '10:00',
    appointmentType: 'in_person',
    status: 'confirmed',
    patientFirebaseProjectId: primaryProjectId,
    patientFirebaseUid: 'other-patient',
    createdAt: new Date('2027-01-02T10:00:00Z'),
    slotKeys: [],
  });

  const appointmentList = await auth('doctor')('get', '/api/doctor-portal/appointments');
  assert.equal(appointmentList.status, 200);
  assert.equal(appointmentList.body.total, 1);
  assert.equal(appointmentList.body.appointments[0].doctorId, ownDoctorId.toString());
  const patientList = await auth('doctor')('get', '/api/doctor-portal/patients');
  assert.equal(patientList.status, 200);
  assert.equal(patientList.body.total, 1);
  assert.equal(patientList.body.patients[0].patientName, 'Own Patient');
  const ownVisits = await auth('doctor')('get', `/api/doctor-portal/patients/${ownAppointment.insertedId}/visits`);
  assert.equal(ownVisits.status, 200);
  const otherVisits = await auth('doctor')('get', `/api/doctor-portal/patients/${otherAppointment.insertedId}/visits`);
  assert.equal(otherVisits.status, 404);
  const summary = await auth('doctor')('get', '/api/doctor-portal/appointments/summary');
  assert.equal(summary.body.summary.totalAppointments, 1);
  assert.equal(summary.body.summary.totalPatients, 1);
});

test('approved doctor invitations require a verified matching account and public discovery redacts private fields', async () => {
  const registered = await auth('hospital')('post', '/api/doctor-portal/organizations', organization('North Hospital', 'Admin One'));
  const orgId = registered.body.organization.id;
  await auth('admin')('patch', `/api/doctor-portal/admin/organizations/${orgId}/review`, { status: 'approved' });
  const created = await auth('hospital')('post', '/api/doctor-portal/organizations/doctors', doctor());
  const doctorId = created.body.doctor.id;
  await auth('admin')('patch', `/api/doctor-portal/admin/hospital-doctors/${doctorId}/review`, { status: 'approved' });
  await auth('hospital')('patch', `/api/doctor-portal/organizations/doctors/${doctorId}/active`, { isActive: true });
  records.get('doctorPortalOrganizations')[0].verificationDocuments = [
    { name: 'Private registration certificate', url: 'https://documents.example/private.pdf' },
  ];

  const discovery = await request(app).get('/api/doctor-portal/doctors');
  assert.equal(discovery.status, 200);
  const publicDoctor = discovery.body.doctors[0];
  assert.equal(publicDoctor.id, doctorId);
  for (const privateField of ['email', 'phone', 'gender', 'dateOfBirth', 'medicalRegistrationNumber']) {
    assert.equal(privateField in publicDoctor, false);
  }
  for (const privateField of ['email', 'phone', 'registrationNumber', 'adminFirebaseUid', 'verificationDocuments']) {
    assert.equal(privateField in publicDoctor, false);
  }

  const unverified = await auth('unverified')('post', '/api/doctor-portal/invitations/accept', { doctorId });
  assert.equal(unverified.status, 403);
  assert.equal(unverified.body.code, 'VERIFIED_EMAIL_REQUIRED');
  const accepted = await auth('doctor')('post', '/api/doctor-portal/invitations/accept', { doctorId });
  assert.equal(accepted.status, 200);
  assert.equal(records.get('doctorPortalDoctors')[0].assignedFirebaseUid, 'doctor');
  assert.equal('assignedFirebaseUid' in accepted.body.doctor, false);
  assert.equal((await auth('doctor')('get', '/api/doctor-portal/appointments')).status, 200);
});

test('an unaffiliated account cannot read another provider appointment records', async () => {
  const response = await auth('patient')('get', '/api/doctor-portal/appointments');
  assert.equal(response.status, 403);
});

test('hospital staff invitations grant organization-scoped operational appointment access only', async () => {
  const first = await createApprovedHospitalDoctor();
  const second = await createApprovedHospitalDoctor({
    hospitalToken: 'other-hospital',
    organizationName: 'South Hospital',
    adminName: 'Admin Two',
    doctorProfile: {
      ...doctor(),
      email: 'south-doctor@example.test',
      medicalRegistrationNumber: 'MCI-SOUTH-1',
    },
    linkDoctor: false,
  });
  const firstBooking = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    doctorId: first.doctorId,
    patientName: 'First Organization Patient',
    patientGender: 'female',
    patientAgeAtBooking: 40,
    appointmentDate: '2027-11-01',
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  });
  const secondBooking = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    doctorId: second.doctorId,
    patientName: 'Second Organization Patient',
    appointmentDate: '2027-11-01',
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  });
  const appointmentsPath = '/api/doctor-portal/appointments';
  const invitePath = '/api/doctor-portal/organizations/staff/invitations';
  assert.equal((await auth('staff')('post', invitePath, { email: 'staff@example.test' })).status, 403);
  assert.equal((await auth('hospital')('post', invitePath, { email: 'invalid' })).status, 400);
  const invited = await auth('hospital')('post', invitePath, { email: 'staff@example.test' });
  assert.equal(invited.status, 201);
  assert.equal(invited.body.staff.invitationStatus, 'pending');
  assert.equal((await auth('hospital')('post', invitePath, { email: 'staff@example.test' })).status, 409);
  assert.equal(
    (await auth('unverified')(
      'post',
      '/api/doctor-portal/organizations/staff/invitations/accept',
      { staffId: invited.body.staff.id },
    )).status,
    403,
  );
  assert.equal(
    (await auth('other-staff')('post', '/api/doctor-portal/organizations/staff/invitations/accept', {
      staffId: invited.body.staff.id,
    })).status,
    404,
  );
  const accepted = await auth('staff')(
    'post',
    '/api/doctor-portal/organizations/staff/invitations/accept',
    { staffId: invited.body.staff.id },
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.staff.invitationStatus, 'active');
  assert.equal(accepted.body.staff.isActive, true);

  const staffList = await auth('hospital')('get', '/api/doctor-portal/organizations/staff');
  assert.equal(staffList.status, 200);
  assert.equal(staffList.body.staff.length, 1);
  assert.equal(staffList.body.staff[0].email, 'staff@example.test');
  assert.equal('firebaseUid' in staffList.body.staff[0], false);

  const appointments = await auth('staff')('get', appointmentsPath);
  assert.equal(appointments.status, 200);
  assert.equal(appointments.body.total, 1);
  assert.equal(appointments.body.appointments[0].patientName, 'First Organization Patient');
  for (const privateField of ['patientGender', 'patientAgeAtBooking', 'patientFirebaseUid']) {
    assert.equal(privateField in appointments.body.appointments[0], false);
  }
  assert.equal('changedBy' in appointments.body.appointments[0].statusHistory[0], false);
  assert.equal(
    (await auth('staff')('get', `${appointmentsPath}/${secondBooking.body.appointment.id}`)).status,
    404,
  );
  assert.equal((await auth('staff')('get', '/api/doctor-portal/patients')).status, 403);
  assert.equal(
    (await auth('staff')(
      'get',
      `${appointmentsPath}/${firstBooking.body.appointment.id}/consultation`,
    )).status,
    403,
  );
  assert.equal(
    (await auth('staff')(
      'delete',
      `/api/doctor-portal/organizations/staff/${invited.body.staff.id}`,
    )).status,
    403,
  );

  const confirmed = await auth('staff')(
    'patch',
    `${appointmentsPath}/${firstBooking.body.appointment.id}/status`,
    { status: 'confirmed' },
  );
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.appointment.status, 'confirmed');
  assert.equal('patientAgeAtBooking' in confirmed.body.appointment, false);

  const revoked = await auth('hospital')(
    'delete',
    `/api/doctor-portal/organizations/staff/${invited.body.staff.id}`,
  );
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.staff.isActive, false);
  assert.equal((await auth('staff')('get', appointmentsPath)).status, 403);
  for (const action of [
    'organization_staff_invited',
    'organization_staff_invitation_accepted',
    'organization_staff_deactivated',
  ]) {
    assert.ok(records.get('doctorPortalAuditLogs').some((entry) => entry.action === action));
  }
});

test('consultations are upserted by appointment and only available to the treating doctor', async () => {
  const { doctorId } = await createApprovedHospitalDoctor();
  const colleagueCreated = await auth('hospital')(
    'post',
    '/api/doctor-portal/organizations/doctors',
    {
      ...doctor(),
      fullName: 'Dr. Clinical Colleague',
      email: 'clinical-colleague@example.test',
      medicalRegistrationNumber: 'MCI-COLLEAGUE-1',
    },
  );
  const colleagueId = colleagueCreated.body.doctor.id;
  await auth('admin')(
    'patch',
    `/api/doctor-portal/admin/hospital-doctors/${colleagueId}/review`,
    { status: 'approved' },
  );
  await auth('hospital')(
    'patch',
    `/api/doctor-portal/organizations/doctors/${colleagueId}/active`,
    { isActive: true },
  );
  await auth('clinical-colleague')(
    'post',
    '/api/doctor-portal/invitations/accept',
    { doctorId: colleagueId },
  );
  const booked = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    doctorId,
    patientName: 'Clinical Record Patient',
    appointmentDate: '2027-11-01',
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  });
  const consultationPath = `/api/doctor-portal/appointments/${booked.body.appointment.id}/consultation`;
  assert.equal((await auth('hospital')('get', consultationPath)).status, 403);
  assert.equal((await auth('patient')('get', consultationPath)).status, 403);
  assert.equal((await auth('clinical-colleague')('get', consultationPath)).status, 403);

  const empty = await auth('doctor')('get', consultationPath);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.consultation, null);
  const saved = await auth('doctor')('put', consultationPath, {
    diagnosis: 'Test diagnosis',
    notes: 'Private clinical note.',
    prescriptions: [{ medication: 'Medication A', dosage: '10 mg', frequency: 'daily' }],
    followUpDate: '2027-12-01',
    followUpReminderAt: '2026-11-19T09:00:00.000Z',
    followUpInstructions: 'Return for review.',
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.consultation.diagnosis, 'Test diagnosis');
  assert.equal(saved.body.consultation.followUpDate, '2027-12-01');
  assert.equal((await auth('hospital')('get', consultationPath)).status, 403);
  assert.equal((await auth('hospital')('put', consultationPath, { notes: 'Unauthorized change.' })).status, 403);
  const patientFollowUpNotifications = await auth('android')('get', '/api/doctor-portal/notifications');
  assert.equal(patientFollowUpNotifications.body.total, 2);
  const followUpNotification = patientFollowUpNotifications.body.notifications.find(
    ({ type }) => type === 'follow_up_reminder',
  );
  assert.ok(followUpNotification);
  assert.equal(followUpNotification.body.includes('Test diagnosis'), false);

  const access = await auth('doctor')(
    'put',
    `${consultationPath}/access`,
    { doctorIds: [colleagueId] },
  );
  assert.equal(access.status, 200);
  assert.deepEqual(access.body.authorizedDoctorIds, [colleagueId]);
  const otherOrganizationDoctor = await createApprovedHospitalDoctor({
    hospitalToken: 'other-hospital',
    organizationName: 'South Clinical Center',
    adminName: 'Admin Two',
    doctorProfile: {
      ...doctor(),
      email: 'south-clinician@example.test',
      medicalRegistrationNumber: 'MCI-SOUTH-CLINIC-1',
    },
    linkDoctor: false,
  });
  const crossOrganizationGrant = await auth('doctor')(
    'put',
    `${consultationPath}/access`,
    { doctorIds: [otherOrganizationDoctor.doctorId] },
  );
  assert.equal(crossOrganizationGrant.status, 403);
  const colleagueRead = await auth('clinical-colleague')('get', consultationPath);
  assert.equal(colleagueRead.status, 200);
  assert.equal(colleagueRead.body.consultation.diagnosis, 'Test diagnosis');
  assert.equal(
    (await auth('clinical-colleague')(
      'put',
      `${consultationPath}/access`,
      { doctorIds: [] },
    )).status,
    403,
  );
  const updated = await auth('doctor')('put', consultationPath, { notes: 'Updated private note.' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.consultation.notes, 'Updated private note.');
  assert.equal(updated.body.consultation.diagnosis, 'Test diagnosis');
  assert.equal(records.get('doctorPortalConsultations').length, 1);
  const appointment = records.get('doctorPortalAppointments')[0];
  assert.equal('diagnosis' in appointment, false);
  assert.equal('consultation' in appointment, false);
});

test('appointment notifications are scoped to patient, doctor, and hospital recipients', async () => {
  const { doctorId } = await createApprovedHospitalDoctor();
  const booked = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    doctorId,
    patientName: 'Notification Patient',
    appointmentDate: '2027-11-01',
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  });
  assert.equal(booked.status, 201);
  assert.equal(records.get('doctorPortalNotifications').length, 3);

  const patientNotifications = await auth('android')('get', '/api/doctor-portal/notifications?unread=true');
  const doctorNotifications = await auth('doctor')('get', '/api/doctor-portal/notifications');
  const hospitalNotifications = await auth('hospital')('get', '/api/doctor-portal/notifications');
  assert.equal(patientNotifications.body.total, 1);
  assert.equal(doctorNotifications.body.total, 1);
  assert.equal(hospitalNotifications.body.total, 1);
  const patientNotification = patientNotifications.body.notifications[0];
  const doctorNotification = doctorNotifications.body.notifications[0];
  assert.equal(
    (await auth('android')(
      'patch',
      `/api/doctor-portal/notifications/${doctorNotification.id}/read`,
    )).status,
    404,
  );
  const read = await auth('android')(
    'patch',
    `/api/doctor-portal/notifications/${patientNotification.id}/read`,
  );
  assert.equal(read.status, 200);
  assert.ok(read.body.notification.readAt);
  assert.equal(
    (await auth('android')('get', '/api/doctor-portal/notifications?unread=true')).body.total,
    0,
  );

  const confirmed = await auth('hospital')(
    'patch',
    `/api/doctor-portal/appointments/${booked.body.appointment.id}/status`,
    { status: 'confirmed' },
  );
  assert.equal(confirmed.status, 200);
  assert.equal(records.get('doctorPortalNotifications').length, 6);
  assert.equal((await auth('doctor')('get', '/api/doctor-portal/notifications')).body.total, 2);
  assert.equal((await auth('patient')('get', '/api/doctor-portal/notifications')).body.total, 0);
});

test('calendar reads scoped bookings and doctor date overrides govern Android booking', async () => {
  const { doctorId } = await createApprovedHospitalDoctor();
  const availabilityPath = '/api/doctor-portal/availability';
  const overridePath = `${availabilityPath}/overrides`;
  const date = '2027-11-02';
  const override = {
    isAvailable: true,
    openingTime: '09:00',
    closingTime: '11:00',
    breaks: [{ startTime: '10:00', endTime: '10:30' }],
    reason: 'Extra clinic hours.',
  };
  assert.equal(
    (await auth('hospital')('put', `${overridePath}/${date}`, override)).status,
    403,
  );
  const set = await auth('doctor')('put', `${overridePath}/${date}`, override);
  assert.equal(set.status, 200);
  assert.equal(
    (await auth('doctor')('put', `${overridePath}/2027-02-30`, { isAvailable: false })).status,
    400,
  );

  const calendar = await auth('hospital')(
    'get',
    `${availabilityPath}?doctorId=${doctorId}&from=${date}&to=${date}`,
  );
  assert.equal(calendar.status, 200);
  assert.equal(calendar.body.overrides[0].date, date);
  assert.equal('reason' in calendar.body.overrides[0], false);
  assert.deepEqual(calendar.body.appointments, []);

  const bookable = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    doctorId,
    patientName: 'Calendar Patient',
    appointmentDate: date,
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  });
  assert.equal(bookable.status, 201);
  const calendarWithBooking = await auth('hospital')(
    'get',
    `${availabilityPath}?doctorId=${doctorId}&from=${date}&to=${date}`,
  );
  assert.equal(calendarWithBooking.body.appointments.length, 1);
  assert.equal(calendarWithBooking.body.appointments[0].patientName, 'Calendar Patient');

  const closureDate = '2027-11-03';
  const closure = await auth('doctor')(
    'put',
    `${overridePath}/${closureDate}`,
    { isAvailable: false, reason: 'Clinic closed.' },
  );
  assert.equal(closure.status, 200);
  const closedBooking = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    doctorId,
    patientName: 'Closed Date Patient',
    appointmentDate: closureDate,
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  });
  assert.equal(closedBooking.status, 409);
  assert.equal(closedBooking.body.code, 'DOCTOR_UNAVAILABLE');

  const removed = await auth('doctor')('delete', `${overridePath}/${date}`);
  assert.equal(removed.status, 200);
  const restored = await auth('android')('post', '/api/doctor-portal/appointments/book', {
    doctorId,
    patientName: 'Restored Schedule Patient',
    appointmentDate: date,
    appointmentTime: '09:00',
    appointmentType: 'in_person',
    patientConsent: true,
  });
  assert.equal(restored.status, 409);
  assert.equal(restored.body.code, 'DOCTOR_UNAVAILABLE');
});
