import express from 'express';
import { requireAdmin, requireFirebaseAuth } from '../marketplace/auth.js';
import { createDoctorPortalControllers } from './controllers.js';

export function createDoctorPortalRoutes(dependencies) {
  const router = express.Router();
  const controllers = createDoctorPortalControllers(dependencies);
  const authenticate = requireFirebaseAuth(dependencies.verifyIdToken, [
    dependencies.primaryFirebaseProjectId || process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c',
  ]);
  const bookingAuthenticate = requireFirebaseAuth(
    dependencies.verifyIdToken,
    dependencies.supportedFirebaseProjectIds || [
      dependencies.primaryFirebaseProjectId || process.env.FIREBASE_PROJECT_ID || 'sellerportal-2786c',
    ],
  );
  const authorizeAdmin = requireAdmin(dependencies.adminUids);

  router.post('/organizations', authenticate, controllers.registerOrganization);
  router.get('/doctors', controllers.listPublicHospitalDoctors);
  router.get('/doctors/:doctorId', controllers.getPublicHospitalDoctor);
  router.get('/organizations/me', authenticate, controllers.getMyOrganization);
  router.patch('/organizations/me', authenticate, controllers.updateMyOrganization);
  router.get('/organizations/doctors', authenticate, controllers.listHospitalDoctors);
  router.post('/organizations/doctors', authenticate, controllers.addHospitalDoctor);
  router.patch('/organizations/doctors/:doctorId', authenticate, controllers.updateHospitalDoctor);
  router.patch('/organizations/doctors/:doctorId/active', authenticate, controllers.setHospitalDoctorActive);
  router.delete('/organizations/doctors/:doctorId', authenticate, controllers.removeHospitalDoctor);
  router.get('/organizations/departments', authenticate, controllers.listDepartments);
  router.post('/organizations/departments', authenticate, controllers.createDepartment);
  router.patch('/organizations/departments/:departmentId', authenticate, controllers.updateDepartment);
  router.delete('/organizations/departments/:departmentId', authenticate, controllers.deactivateDepartment);

  router.post('/appointments/book', bookingAuthenticate, controllers.bookAppointment);
  router.post('/invitations/accept', authenticate, controllers.acceptDoctorInvitation);
  router.get('/appointments', authenticate, controllers.listAppointments);
  router.get('/appointments/:appointmentId', authenticate, controllers.getAppointment);
  router.patch('/appointments/:appointmentId/status', authenticate, controllers.updateAppointmentStatus);
  router.patch('/appointments/:appointmentId/reschedule', authenticate, controllers.rescheduleAppointment);

  router.patch('/admin/organizations/:organizationId/review', authenticate, authorizeAdmin, controllers.reviewOrganization);
  router.patch('/admin/hospital-doctors/:doctorId/review', authenticate, authorizeAdmin, controllers.reviewHospitalDoctor);
  router.get('/admin/organizations/pending', authenticate, authorizeAdmin, controllers.listPendingOrganizations);
  router.get('/admin/hospital-doctors/pending', authenticate, authorizeAdmin, controllers.listPendingHospitalDoctors);
  return router;
}
