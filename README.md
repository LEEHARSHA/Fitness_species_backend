# Fitness Species Marketplace API

This Node.js/Express API is the shared backend for the Seller Portal and Admin Portal. Both browser apps call this API; neither should connect to MongoDB directly.

## Requirements

- Node.js 22 or newer and npm
- A MongoDB Atlas database and network access for the backend
- A Firebase service account from Firebase project `sellerportal-2786c`

## Install and configure on Windows

In PowerShell:

```powershell
Set-Location D:\FitnessSpeciesBackend
npm install
Copy-Item .env.example .env
New-Item -ItemType Directory -Force secrets
```

Edit `.env` and set `MONGODB_URI` to the Atlas connection string and `MONGODB_DB_NAME=fitness_species`. Use an Atlas database user restricted to this database; never put credentials in source files or commit `.env`. When a username or password contains reserved URI characters, percent-encode the username/password component (for example, encode the password with `encodeURIComponent`); do not encode the complete URI.

### Firebase Admin credentials

In Firebase Console, open project `sellerportal-2786c` → **Project settings** → **Service accounts** → **Generate new private key**. Keep the downloaded file private. Copy it to `D:\FitnessSpeciesBackend\secrets\firebase-service-account.json`; the file is ignored by Git. Leave `GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-service-account.json` in `.env`. The service account's project ID must match `FIREBASE_PROJECT_ID`.

For production, prefer setting `FIREBASE_SERVICE_ACCOUNT_JSON` in the hosting provider's encrypted environment settings rather than uploading a key file. It must contain the service-account JSON for `sellerportal-2786c`. Do not print or commit the JSON. The API validates the credential source and project ID and does not log credential values.

The Android client uses Firebase project `project-fitness-species`. Seller Portal, Admin Portal, and Doctor Portal use the primary project `sellerportal-2786c`; their administrative routes remain restricted to that project. To enable Android routes, including AI Coach and appointment booking, set `FIREBASE_SERVICE_ACCOUNT_JSON_PROJECT_FITNESS_SPECIES` as a separate encrypted hosting secret containing credentials from `project-fitness-species`. Each ID token is verified only by the Firebase Admin app for the exact configured project, and records are scoped by project and UID.

### MongoDB Atlas network access

In Atlas, confirm the application database username exists under **Database Access** and has the `readWrite` role for only `fitness_species`. Under **Network Access**, allow the local machine's current public IP for local testing and update that entry when it changes. For Render, use the outbound IP addresses/ranges documented for the selected service, region, and plan; allow those production egress addresses, not an assumed Render service URL. Avoid `0.0.0.0/0` in production. Set the database user's URI in `.env` locally or in the host's encrypted environment configuration. The API pings MongoDB and creates required marketplace, community, and user indexes at startup; a listening process alone is not considered ready.

## Run locally

```powershell
npm run dev
```

The API binds to `0.0.0.0` and uses `PORT` (default `5000`). Check readiness:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

The response reports `database.name` and `database.status: connected` only after a real MongoDB ping. A database outage returns HTTP 503. Startup fails rather than opening an HTTP listener when MongoDB cannot be reached. Startup initialization creates required marketplace, community, doctor, notification, and workout-session collections without replacing existing collections, then ensures the application indexes.

## AI Coach Gemini configuration

The authenticated `POST /api/ai-coach/chat` route uses Google Gemini server-side through the official `@google/genai` SDK. Set `GEMINI_API_KEY` in the local `.env` file or hosting secret manager and optionally set `GEMINI_MODEL` (the default is `gemini-3.5-flash-lite`, verified with this integration). Keep the key out of source control and Android/client applications. The API key is required only when the AI Coach route is invoked; the backend can start without it. Google identifies Gemini 3.5 Flash-Lite as a free-tier model; usage quotas still apply.

## API overview

- `GET /api/health` — safe server and database readiness
- `PATCH /api/users/me/photo` — authenticated multipart upload, with the image in the `photo` field
- `GET /api/users/photos/:id` — retrieve a stored profile image
- `GET /api/seller/profile`, `POST /api/seller/profile`, `PATCH /api/seller/profile` — current seller profile
- `GET /api/seller/products`, `POST /api/seller/products`, `GET /api/seller/products/:productId`, `PATCH /api/seller/products/:productId` — seller-owned products
- `GET /api/admin/products?status=pending`, `GET /api/admin/products/:productId`, `PATCH /api/admin/products/:productId/review` — admin review
- `GET /api/products` and `GET /api/products/:productId` — approved public catalog only
- `/api/community/*` — organizer applications, event review/public discovery, participant registrations, and registration history
- `GET /api/notifications` — authenticated, project-and-UID-scoped in-app notification feed
- `POST /api/workouts/sessions`, `GET /api/workouts/sessions?limit=100` — authenticated, project-and-UID-scoped completed workout sessions
- `GET /api/doctors`, `GET /api/doctors/:id` — approved individual doctors and approved, active doctors from approved hospitals
- `GET /api/doctors/me`, `PUT /api/doctors/me`, `POST /api/doctors/me/submit` — authenticated doctor profile lifecycle
- `GET /api/admin/doctors?status=pending_review&page=1&limit=25`, `GET /api/admin/doctors/:id`, `PATCH /api/admin/doctors/:id/review` — unified, allowlisted administrator doctor verification queue
- `/api/doctor-portal/*` — additive hospital management, doctor invitations, public hospital-doctor discovery, and appointment APIs

Profile images are limited to 5 MB and accepted only as JPEG, PNG, or WebP. The API verifies the file signature, stores image bytes in the persistent MongoDB GridFS `profilePhotos` bucket, and stores only the returned `/api/users/photos/:id` reference in the user profile. The download URL is public so the Android image loader can display it without exposing an ID token; photo updates remain Firebase-authenticated and scoped to the matching Firebase project and UID. No Render filesystem or external image-provider credentials are used.

## In-app notifications

`GET /api/notifications?page=1&limit=20&category=all` merges authenticated user notifications with due appointment notifications. Categories are `all`, `appointments`, `orders`, `challenges`, and `fitness`; the response includes `total`, `page`, `limit`, `hasMore`, and an unfiltered `unreadCount`. Use `PATCH /api/notifications/:id/read?source=notifications|doctorPortalNotifications`, `PATCH /api/notifications/read-all`, and `DELETE /api/notifications/:id?source=notifications|doctorPortalNotifications` for recipient-owned records. Notification creation is backend-only; there is no client notification-create endpoint. Community registration, verified Shop payment/refunds, and appointment lifecycle/payment events write user-scoped, idempotent records. FCM push delivery, reminder scheduling, and fulfillment/challenge lifecycle events without existing backend workflows are not configured.

Doctor applications are stored in `doctorApplications`, uniquely scoped by Firebase project ID and UID. Doctor routes accept only primary-project Firebase ID tokens; submission requires a verified Firebase email claim. Applications begin as drafts, can be submitted after required profile and availability validation, and can be edited only while draft or changes-requested. Rejected applications cannot be resubmitted. Administrators use the existing `ADMIN_FIREBASE_UIDS` allowlist to approve, reject, request changes, suspend approved doctors, and reactivate suspended doctors; decisions and reviewer identifiers are recorded in server-controlled review history. The public `/api/doctors` directory combines individual profiles approved in `doctorApplications` with hospital-linked profiles approved and active in `doctorPortalDoctors` whose organization is approved in `doctorPortalOrganizations`. Its hospital records carry the organization ID/name in addition to the existing clinic name/location fields, and public responses exclude registration numbers, contact details, Firebase identifiers, and review data. Directory queries support `specialty`, `city`, `page`, and `limit` for both doctor sources. Add the Doctor Portal's exact production origin to the existing CORS configuration before browser deployment without removing current portal origins. This phase does not collect Aadhaar data or support document uploads.

Workout sessions are accepted only after every submitted exercise reports all planned sets completed. Each record is keyed by the authenticated Firebase project/UID and client session ID, so retries are idempotent and multiple same-day sessions remain distinct. The Android app keeps completed sessions locally when the backend is unavailable and syncs them when signed in; the server history endpoint returns at most 100 records per request.

## Workout exercise images

The retained 42-entry Gym split is a source inventory, not a published catalog. The SVG files currently in `src/workouts/exercise-images` are generic labeled illustrations and are not approved instructional images; the backend intentionally excludes them. `GET /api/workouts/exercises?environment=Gym` reports all 42 source entries as unavailable and returns no exercises until each has verified exercise-specific imagery, licensing, and technique metadata. `POST /api/workouts/generate` only persists plans built from that verified catalog. The image endpoint is `/api/workouts/exercise-images/:assetId`; Home Workout and Calisthenics remain separate and currently return empty catalogs. Android loads images on demand and validates canonical exercise IDs before displaying an assigned exercise.

The unified `GET /api/admin/doctors` queue reads individual applications from `doctorApplications.status` and hospital-linked applications from `doctorPortalDoctors.verificationStatus`. It returns one normalized admin response per stored doctor; hospital doctors are not copied into `doctorApplications`. Hospital doctor responses include their organization name and verification status, doctor verification status, application date, and inactive/active account state. Organization approval and doctor approval are independent; hospital doctors remain inactive and unavailable for discovery/booking until both approvals are complete and the organization administrator activates the doctor. Existing `/api/doctor-portal/admin/hospital-doctors/pending` and its review route remain available for compatibility.

## Doctor Portal API

The Doctor Portal API is a separate, additive namespace. It does not change the existing `/api/doctors`, Android event APIs, or their request/response contracts. Protected routes use Firebase ID tokens in `Authorization: Bearer <token>`; hospital administration, doctor management, and appointment access accept only the primary Firebase project. Organization approval and doctor approval are controlled by the existing `ADMIN_FIREBASE_UIDS` allowlist. Public discovery routes require no token.

| Method and path | Access | Purpose |
|---|---|---|
| `POST /api/doctor-portal/organizations` | Primary-project account | Register a hospital or clinic; starts pending review |
| `GET`, `PATCH /api/doctor-portal/organizations/me` | Organization administrator | Read or update the administrator's organization |
| `GET /api/doctor-portal/organizations/doctors` | Organization administrator | List/search hospital doctors |
| `POST /api/doctor-portal/organizations/doctors` | Organization administrator | Add a doctor (pending review) |
| `PATCH /api/doctor-portal/organizations/doctors/:doctorId` | Organization administrator | Update a doctor profile |
| `PATCH /api/doctor-portal/organizations/doctors/:doctorId/active` | Organization administrator | Activate/deactivate a doctor |
| `DELETE /api/doctor-portal/organizations/doctors/:doctorId` | Organization administrator | Remove a doctor from the organization |
| `GET`, `POST /api/doctor-portal/organizations/departments` | Organization administrator | List/create departments |
| `PATCH`, `DELETE /api/doctor-portal/organizations/departments/:departmentId` | Organization administrator | Update/deactivate a department |
| `GET /api/doctor-portal/doctors`, `GET /api/doctor-portal/doctors/:doctorId` | Public | Discover approved, active hospital doctors; responses omit DOB, gender, registration numbers, and direct contact details |
| `POST /api/doctor-portal/invitations/accept` | Verified primary-project account | Link an approved hospital-doctor profile by matching its email |
| `POST /api/doctor-portal/appointments/book` | Configured Firebase project | Book an approved provider after explicit patient consent |
| `GET /api/doctor-portal/appointments`, `GET /api/doctor-portal/appointments/:appointmentId` | Authorized doctor, hospital administrator, or active hospital staff | List/filter or read appointments within the caller's scope; staff/admin responses contain operational fields only |
| `GET /api/doctor-portal/appointments/summary` | Authorized doctor, hospital administrator, or active hospital staff | Dashboard counts and appointment analytics scoped to the caller |
| `GET /api/doctor-portal/patients`, `GET /api/doctor-portal/patients/:patientId/visits` | Authorized doctor or hospital administrator | Patient directory and appointment history; operational staff are denied these routes |
| `PATCH /api/doctor-portal/appointments/:appointmentId/status` | Authorized doctor, hospital administrator, or active hospital staff | Confirm (after required payment verification), complete, cancel, or mark no-show, subject to allowed transitions |
| `PATCH /api/doctor-portal/appointments/:appointmentId/reschedule` | Authorized doctor, hospital administrator, or active hospital staff | Reschedule a requested or confirmed appointment |
| `GET /api/doctor-portal/availability?doctorId=...&from=...&to=...` | Authorized doctor, hospital administrator, or active hospital staff | Read weekly availability, date overrides, and operational bookings for up to 90 days |
| `PUT`, `DELETE /api/doctor-portal/availability/overrides/:date` | Approved, active doctor | Set/remove a date-specific opening-hours override or closure |
| `GET`, `PUT /api/doctor-portal/appointments/:appointmentId/consultation` | Treating or explicitly authorized same-organization approved doctor | Read/upsert the private consultation record and follow-up metadata |
| `PUT /api/doctor-portal/appointments/:appointmentId/consultation/access` | Treating doctor | Grant/revoke access for approved doctors in the same organization |
| `GET /api/doctor-portal/notifications`, `PATCH /api/doctor-portal/notifications/:notificationId/read` | Notification recipient | List due in-app appointment/follow-up notifications and mark a recipient-owned notification read |
| `GET /api/doctor-portal/organizations/staff`, `POST /api/doctor-portal/organizations/staff/invitations` | Organization administrator | List staff and invite a verified-email staff account |
| `POST /api/doctor-portal/organizations/staff/invitations/accept` | Verified invited account | Accept the matching hospital staff invitation |
| `DELETE /api/doctor-portal/organizations/staff/:staffId` | Organization administrator | Revoke staff access immediately |
| `GET /api/doctor-portal/admin/organizations?status=pending\|approved\|rejected&page=1&limit=25` | Allowlisted primary-project administrator | List organizations by verification status |
| `GET /api/doctor-portal/admin/organizations/:organizationId` | Allowlisted primary-project administrator | Read private organization registration and review details |
| `GET /api/doctor-portal/admin/organizations/pending` | Allowlisted primary-project administrator | Backward-compatible pending organization queue |
| `PATCH /api/doctor-portal/admin/organizations/:organizationId/review` | Allowlisted primary-project administrator | Approve or reject a pending organization |
| `GET /api/doctor-portal/admin/hospital-doctors/pending`, `PATCH /api/doctor-portal/admin/hospital-doctors/:doctorId/review` | Allowlisted primary-project administrator | Backward-compatible hospital-doctor review endpoints; the Admin Portal uses the unified `/api/admin/doctors` queue |

JSON request bodies are strict and reject unknown fields. Organization registration requires `name`, `organizationType`, `email`, `phone`, `address`, `city`, `state`, `registrationNumber`, `adminName`, and `adminDesignation`; `website`, `logoUrl`, `description`, and `facilities` are optional. Hospital-doctor creation requires the identity/demographic, contact, specialization, qualification/registration, experience, fee, daily limit, consultation mode, and availability fields defined by `hospitalDoctorSchema` in `src/doctor-portal/validation.js`. Department bodies use `name` and optional `description`. Use the validation schema as the source of truth for all exact bounds and enums.

Organization records are stored in `doctorPortalOrganizations`; registration starts with `verificationStatus: "pending"`. Admin listing accepts only `pending`, `approved`, or `rejected`, with a page from 1 and a limit from 1 to 100. Review requests use `{ status: "approved" }` or `{ status: "rejected", reviewNote }`; rejection requires a non-empty reason of at most 1000 characters. Decisions record `reviewedBy`, `reviewedAt`, `reviewNote`, and `updatedAt`, and only pending records can be reviewed. Admin list and detail routes require a verified primary-project Firebase ID token and a UID in `ADMIN_FIREBASE_UIDS`. The current organization registration schema does not accept or create verification documents; the admin detail view displays a `verificationDocuments` field only when one is already present on a stored record. Public doctor discovery uses explicit fields and never returns organization contact details, registration identifiers, administrator identifiers, or verification documents.

Appointment booking requires `doctorId`, `patientName`, ISO date `appointmentDate`, 24-hour `appointmentTime`, `appointmentType` (`online` or `in_person`), and `patientConsent: true`; optional patient fields are `patientGender` and `patientAgeAtBooking`. Rescheduling requires `appointmentDate` and `appointmentTime`. Status updates require a `status`; cancellation and no-show updates also require a `reason`. Appointment listing supports `from`, `to`, `doctorId`, `departmentId`, `status`, `appointmentType`, `search`, `page`, and `limit`. Successful booking returns HTTP 201 and `{ success, appointment }`; list responses return `{ success, appointments, total, page, limit }`. Validation errors return HTTP 400 with `message` and field `issues`; unavailable, full, and conflicting slots return HTTP 409 with a machine-readable `code`.

The backend creates the Doctor Portal collections, including `doctorPortalStaff`, `doctorPortalConsultations`, and `doctorPortalNotifications`, without altering existing appointment records. Consultations are stored separately and keyed uniquely by the existing appointment ID. Only the treating doctor and doctors explicitly authorized by that doctor can read or update clinical notes; explicit grants are limited to approved doctors in the appointment's organization. Hospital administrators and operational staff cannot access these clinical records. Follow-up dates and reminder times are stored with the consultation and do not create appointments.

Hospital staff invitations are separate from doctor invitations. Acceptance requires a verified Firebase email matching the invitation; active staff membership is scoped to its organization and can be revoked by that organization's administrator. Staff can manage operational appointments and receive a limited appointment response, but cannot access the patient directory, visit histories, or consultation records. Doctor calendar overrides are stored on the existing doctor profile, are writable only by that approved active doctor, and are applied during booking and rescheduling checks. Appointment lifecycle and due follow-up reminders are persisted as in-app notifications scoped to the recipient's Firebase project and UID; push delivery is not configured by this API.

Unique indexes enforce organization-admin ownership, doctor-account assignment, per-organization staff email, one consultation per appointment, idempotent notification events, and per-minute doctor slot exclusivity. Daily appointment limits use atomic per-doctor/per-date counters. Appointment reads and mutations are scoped server-side to the assigned doctor, individual approved doctor, hospital organization, or active staff membership; client-supplied identity and role data are not trusted. Successful booking, review, invitation, consultation, availability, and appointment-management actions are audit logged.

The inspected Android source has no hospital-doctor discovery or appointment-booking backend integration. These endpoints are not an Android API migration: Android clients must explicitly adopt the new public discovery and booking contract before they can use it. To accept booking tokens from another Firebase project, initialize and validate that project's Firebase Admin credentials at startup and include its ID in `supportedFirebaseProjectIds`; do not change the primary-project authentication requirements for portal administration.

Community registration endpoints require a Firebase ID token from an explicitly initialized Firebase project. Registration requires the participant's name, email, and phone; authenticated name/email claims are used as defaults when available. Participant identity combines the verified Firebase project ID and UID so same-valued UIDs from different projects cannot read or alter each other's registrations. Only primary-project accounts can manage organizer events, attendee lists, seller data, or administrator routes. `GET /api/community/events/:eventId/registrations` returns contact details only to the authenticated owner of that event.

The backend's primary Firebase project is `FIREBASE_PROJECT_ID` (default `sellerportal-2786c`) and its Admin credentials must belong to that project. To also accept Android ID tokens from `project-fitness-species`, provision a second service account for that exact Firebase project as the Render secret `FIREBASE_SERVICE_ACCOUNT_JSON_PROJECT_FITNESS_SPECIES` (or securely provision a file and set `GOOGLE_APPLICATION_CREDENTIALS_PROJECT_FITNESS_SPECIES`). Startup validates the second credential's `project_id`; the verifier only accepts tokens that Firebase Admin validates against one of the initialized apps. Do not list a project as supported without its matching credentials, and never weaken audience, issuer, signature, or expiry checks.

All protected routes require `Authorization: Bearer <Firebase ID token>`. The API verifies tokens against the matching initialized Firebase project. Admin access is controlled only by the server's comma-separated `ADMIN_FIREBASE_UIDS` allowlist and primary-project authentication.

New seller profiles are stored in `sellerProfiles`, which has a unique `firebaseUid` index. Existing records in the legacy `sellers` collection are read and updated in place to avoid duplicate profiles; the API does not migrate or delete existing seller records. Product ownership remains compatible with the existing `sellerId` field and new records also carry `sellerUid`. Sellers must complete all of these fields before submitting products: business name, owner/contact name, verified Firebase account email, phone, and business address, city, state, country, and postal code. The backend computes `profileComplete`; client-provided completion flags and identities are not trusted.

New products always start as `pending`. An admin can approve or reject a pending product; rejected products can be edited and resubmitted, which resets them to `pending`. The public catalog never returns pending or rejected products.

The public catalog supports `category`, `subCategory`, `brand`, `search`, `minPrice`, `maxPrice`, `page`, and `limit` query parameters. List responses use `{ success, count, total, page, limit, products }`; product details use `{ success, product }`. Public product objects include catalog fields such as `name`, `brand`, `category`, `description`, `price`, `stock`, `images`, `variants`, and `specifications`, and omit seller identifiers and internal review or database fields.

## Run tests and checks

```powershell
npm test
npm run check
npm run db:check
```

The automated tests use isolated fixtures and injected authentication/database adapters; they do not delete or modify real seller/product records. They verify collection/index initialization, routes, ownership, validation, CORS, admin authorization, catalog filtering, and unavailable-database behavior. `npm run db:check` loads `.env`, pings the explicitly selected `fitness_species` database, idempotently initializes the required collections/indexes, verifies them, and reports record counts without exposing personal data or credentials. `npm run db:persistence-check` writes a uniquely keyed temporary document to the dedicated `backend_persistence_checks` collection, reads it back, deletes only that document, and closes the connection. Run these database commands only after confirming that `MONGODB_URI` points to the intended Atlas cluster. Automated fixture tests do not prove that Firebase credentials, production deployment, or end-to-end portal connection work.

## Deploy to Render

1. Create a Render **Web Service** for this backend repository.
2. Set the build command to `npm install` and the start command to `npm start`.
3. Set the health check path to `/api/health`.
4. Add production environment variables in Render's environment settings:
   - `NODE_ENV=production`
   - `PORT` (Render supplies this automatically)
   - `MONGODB_URI`
   - `MONGODB_DB_NAME=fitness_species`
   - `FIREBASE_PROJECT_ID=sellerportal-2786c`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (secure JSON value) **or** `GOOGLE_APPLICATION_CREDENTIALS` pointing to a securely provisioned file
   - `FIREBASE_SERVICE_ACCOUNT_JSON_PROJECT_FITNESS_SPECIES` (secure service-account JSON for the Android app's `project-fitness-species` project)
   - `GEMINI_API_KEY` (Google AI Studio API key)
   - `GEMINI_MODEL=gemini-3.5-flash-lite`
   - `ADMIN_FIREBASE_UIDS`
   - `CORS_ORIGINS=http://localhost:3000,http://localhost:3005,https://seller-lilac-five.vercel.app,https://admin-portal-sepia-chi.vercel.app,https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app,https://fitness-species-community.vercel.app`
5. In Atlas, allow the Render service's outbound IP and verify `GET /api/health` returns HTTP 200 with `database.status: connected`. Do not treat a successful deployment or a listening port as proof of MongoDB connectivity.

Set `MONGODB_URI` and `MONGODB_DB_NAME=fitness_species` in Render's encrypted environment settings; also preserve the Firebase and administrator settings listed above. Set `CORS_ORIGINS` to the complete comma-separated value above. The backend matches origins exactly, includes the configured origins, and uses localhost defaults when `CORS_ORIGINS` is unset. Wildcard origins are not accepted. Render supplies `PORT`; the backend binds to `0.0.0.0`. Configure `/api/health` as the health check path. The current backend base URL is `https://fitness-species-backend.onrender.com`; frontend API configuration should not append `/api`.

New seller product submissions include one or more direct HTTPS image URLs in the existing `images: string[]` field. The backend validates URL syntax and HTTPS protocol, rejects embedded credentials and unsupported protocols, and stores the URL strings without fetching them. Product creation remains authenticated, seller-owned, and pending admin review. The public catalog returns URLs only for approved products.

## Authorize the first administrator

In Firebase Console, open project `sellerportal-2786c` → **Authentication** → **Users**, locate your own signed-in account, and copy its **User UID**. Confirm that it is your account through your normal trusted owner onboarding process. In the backend's private local `.env`, set `ADMIN_FIREBASE_UIDS=<your-copied-uid>` (use comma-separated UIDs only when authorizing additional administrators), then restart the backend with `npm run dev` or `npm start`. Keep the UID in backend configuration; do not put it in a portal request or client-side configuration. Leave the value empty until the owner is ready to authorize an account: an empty or missing allowlist denies admin access to everyone.

For production, configure the same `ADMIN_FIREBASE_UIDS` variable in the hosting provider's encrypted environment settings and restart/redeploy the service. The API has no endpoint for users to grant themselves administrator access, and account registration never assigns admin privileges.

## Connect both Vercel portals

Set `NEXT_PUBLIC_API_URL` in the Seller Portal and Admin Portal Vercel project settings to the backend base URL, for example `https://<your-render-service>.onrender.com` (do not append `/api`). Redeploy each frontend after changing the environment variable. The backend always allows the exact deployed Seller and Admin Portal origins; add any local browser development origins to `CORS_ORIGINS`.

After deployment, test the health endpoint, sign in to each portal, save a seller profile, submit a product, and verify that it is visible only to its seller until an allowlisted admin reviews it. These end-to-end steps require real Firebase and MongoDB credentials and have not been run by the automated fixture tests.

## Community organizer API

The Organizer Portal and Fitness Species mobile app use the same `/api/community` backend and canonical MongoDB records. The backend creates `communityOrganizers`, `communityEvents`, `communityRegistrations`, and `communityModerationLogs` if missing, and ensures unique organizer/registration indexes, event status/date indexes, a `2dsphere` event-location index, and moderation-history indexes during the existing startup initialization. Coordinates are stored as GeoJSON points in `[longitude, latitude]` order.

Public routes are `GET /api/community/events` and `GET /api/community/events/:eventId`. They return only approved events belonging to approved organizers; nearby searches use a server-side geospatial radius, with optional nearest-distance sorting. Authenticated Firebase routes include organizer apply/profile, event create/list/edit/submit/cancel, organizer-owned registration lists, participant registration/cancellation, and `GET /api/community/registrations/mine` for mobile joined-event history. Draft and pending-review events remain private. Creating and submitting events requires an approved organizer; approved-event edits return to pending review. Firebase UID ownership, participant identity, event status, capacity, deadlines, duplicate registrations, and admin permissions are enforced by the API, not browser state.

Admin moderation is available in the Admin Portal at `/community` and is protected by `ADMIN_FIREBASE_UIDS`. Rejection and changes-requested actions require review notes; each successful organizer/event decision is recorded with its reason, reviewer UID, and timestamp. Administrators who also organize events cannot review their own applications or events. The Organizer Portal production origin, `https://fitness-species-community.vercel.app`, is in the backend CORS allowlist; preserve it and the existing seller/admin origins when changing `CORS_ORIGINS`. Do not use wildcard CORS. Add the same hostname to Firebase Authentication's authorized domains before enabling organizer sign-in.

The community backend test suite uses isolated in-memory fixtures and exercises approval gates, public visibility, event ownership, paid/free validation, geo radius/distance sorting, duplicate and capacity-protected registration, cancellation, and request limits. It does not connect to production MongoDB or Firebase.
