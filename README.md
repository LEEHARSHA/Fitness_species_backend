# Fitness Species Marketplace API

This Node.js/Express API is the shared backend for the Seller Portal and Admin Portal. Both browser apps call this API; neither should connect to MongoDB directly.

## Requirements

- Node.js 20 or newer and npm
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

### MongoDB Atlas network access

In Atlas, confirm the application database username exists under **Database Access** and has the `readWrite` role for only `fitness_species`. Under **Network Access**, allow the local machine's current public IP for local testing and update that entry when it changes. For Render, use the outbound IP addresses/ranges documented for the selected service, region, and plan; allow those production egress addresses, not an assumed Render service URL. Avoid `0.0.0.0/0` in production. Set the database user's URI in `.env` locally or in the host's encrypted environment configuration. The API pings MongoDB and creates its indexes at startup; a listening process alone is not considered ready.

## Run locally

```powershell
npm run dev
```

The API binds to `0.0.0.0` and uses `PORT` (default `5000`). Check readiness:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

The response reports `database.name` and `database.status: connected` only after a real MongoDB ping. A database outage returns HTTP 503. Startup fails rather than opening an HTTP listener when MongoDB cannot be reached. Startup initialization creates missing `sellerProfiles` and `products` collections without replacing existing collections, then ensures the application indexes.

## API overview

- `GET /api/health` — safe server and database readiness
- `GET /api/seller/profile`, `POST /api/seller/profile`, `PATCH /api/seller/profile` — current seller profile
- `GET /api/seller/products`, `POST /api/seller/products`, `GET /api/seller/products/:productId`, `PATCH /api/seller/products/:productId` — seller-owned products
- `GET /api/admin/products?status=pending`, `GET /api/admin/products/:productId`, `PATCH /api/admin/products/:productId/review` — admin review
- `GET /api/products` and `GET /api/products/:productId` — approved public catalog only

All protected routes require `Authorization: Bearer <Firebase ID token>`. The API verifies tokens against the configured Firebase project. Admin access is controlled only by the server's comma-separated `ADMIN_FIREBASE_UIDS` allowlist.

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
   - `FIREBASE_STORAGE_BUCKET=sellerportal-2786c.firebasestorage.app`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` (secure JSON value) **or** `GOOGLE_APPLICATION_CREDENTIALS` pointing to a securely provisioned file
   - `ADMIN_FIREBASE_UIDS`
   - `CORS_ORIGINS=http://localhost:3000,http://localhost:3005,https://seller-lilac-five.vercel.app,https://admin-portal-sepia-chi.vercel.app,https://admin-portal-ikh1gy8kt-leeharshas-projects.vercel.app`
5. In Atlas, allow the Render service's outbound IP and verify `GET /api/health` returns HTTP 200 with `database.status: connected`. Do not treat a successful deployment or a listening port as proof of MongoDB connectivity.

Set `MONGODB_URI` and `MONGODB_DB_NAME=fitness_species` in Render's encrypted environment settings; also preserve the Firebase and administrator settings listed above. Set `CORS_ORIGINS` to the complete comma-separated value above. The backend matches origins exactly, includes the configured origins, and uses localhost defaults when `CORS_ORIGINS` is unset. Wildcard origins are not accepted. Render supplies `PORT`; the backend binds to `0.0.0.0`. Configure `/api/health` as the health check path. No production backend URL exists until Render creates the service.

New seller product submissions must include Firebase download URLs for objects under `sellers/{firebaseUid}/products/{uuid}.{jpg|png|webp}` in the configured bucket. The API verifies HTTPS, bucket, owner UID, object path, file extension, and download-token URL shape before storing the string URLs in MongoDB. The Seller Portal's Firebase Storage rules restrict uploads to the authenticated seller's folder and JPEG/PNG/WebP content types up to 10 MB. Unchanged legacy URLs can remain when a seller edits an existing product; newly added image URLs must use the controlled bucket.

## Authorize the first administrator

In Firebase Console, open project `sellerportal-2786c` → **Authentication** → **Users**, locate your own signed-in account, and copy its **User UID**. Confirm that it is your account through your normal trusted owner onboarding process. In the backend's private local `.env`, set `ADMIN_FIREBASE_UIDS=<your-copied-uid>` (use comma-separated UIDs only when authorizing additional administrators), then restart the backend with `npm run dev` or `npm start`. Keep the UID in backend configuration; do not put it in a portal request or client-side configuration. Leave the value empty until the owner is ready to authorize an account: an empty or missing allowlist denies admin access to everyone.

For production, configure the same `ADMIN_FIREBASE_UIDS` variable in the hosting provider's encrypted environment settings and restart/redeploy the service. The API has no endpoint for users to grant themselves administrator access, and account registration never assigns admin privileges.

## Connect both Vercel portals

Set `NEXT_PUBLIC_API_URL` in the Seller Portal and Admin Portal Vercel project settings to the backend base URL, for example `https://<your-render-service>.onrender.com` (do not append `/api`). Redeploy each frontend after changing the environment variable. The backend always allows the exact deployed Seller and Admin Portal origins; add any local browser development origins to `CORS_ORIGINS`.

After deployment, test the health endpoint, sign in to each portal, save a seller profile, submit a product, and verify that it is visible only to its seller until an allowlisted admin reviews it. These end-to-end steps require real Firebase and MongoDB credentials and have not been run by the automated fixture tests.
