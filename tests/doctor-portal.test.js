import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/app.js';

const primaryProjectId = 'sellerportal-2786c';
const records = new Map();
const claims = Object.fromEntries(['admin', 'hospital', 'other-hospital', 'patient', 'doctor'].map((uid) => [
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
    const actual = document[key];
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
        && item.slotKeys.some((key) => stored.slotKeys.includes(key)))) {
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
      if (this.items().some((record) => same(record._id, query._id))) {
        const error = new Error('Duplicate key.');
        error.code = 11000;
        throw error;
      }
      item = { ...(update.$setOnInsert || {}), _id: query._id };
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
    Object.assign(item, update.$set || {});
    for (const [field, amount] of Object.entries(update.$inc || {})) {
      item[field] = (item[field] || 0) + amount;
    }
    for (const [field, value] of Object.entries(update.$push || {})) {
      item[field] ||= [];
      item[field].push(value);
    }
    return item;
  }

  async updateOne(query, update) {
    const item = this.items().find((record) => matches(record, query));
    if (!item) return { modifiedCount: 0 };
    for (const [field, amount] of Object.entries(update.$inc || {})) {
      item[field] = (item[field] || 0) + amount;
    }
    return { modifiedCount: 1 };
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
    appointmentDate: '2026-11-02',
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
  const changed = await auth('hospital')('patch', `/api/doctor-portal/appointments/${secondBooking.body.appointment.id}/status`, { status: 'confirmed' });
  assert.equal(changed.body.appointment.status, 'confirmed');
  const rescheduled = await auth('hospital')('patch', `/api/doctor-portal/appointments/${secondBooking.body.appointment.id}/reschedule`, {
    appointmentDate: booking.appointmentDate,
    appointmentTime: '12:00',
  });
  assert.equal(rescheduled.status, 200);
  assert.equal(rescheduled.body.appointment.appointmentTime, '12:00');
  assert.equal(rescheduled.body.appointment.rescheduleHistory.length, 1);

  await auth('other-hospital')('post', '/api/doctor-portal/organizations', organization('South Hospital', 'Admin Two'));
  const isolated = await auth('other-hospital')('get', '/api/doctor-portal/appointments');
  assert.equal(isolated.body.total, 0);
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
