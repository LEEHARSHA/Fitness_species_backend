# Payment Integration Audit - Phases 1 and 2

## Scope

Audit of the existing Android app and Node.js/MongoDB backend. No live payment was activated and no real-money flow was implemented.

## Existing technical contracts

### Android

- Shop UI exists for cart, delivery address, payment-method selection, order confirmation, and order history.
- Android currently keeps cart and order history in DataStore and constructs confirmed orders locally.
- The Shop checkout computes subtotal and delivery fee locally and offers UPI, cards, and cash-on-delivery labels.
- Doctor UI includes discovery, detail, booking, confirmation, and appointment history screens.
- Android has `PaymentRepository` and `PaymentViewModel` Retrofit wrappers for Razorpay order creation, signature verification, payment history, and Google Play subscription-token verification.
- Android already declares Razorpay Checkout `1.6.38` and Google Play Billing Library `7.0.0`.
- Android billing target SDK is 36 and compile SDK is 37.
- The subscription screen contains hard-coded monthly/yearly prices and sends a locally generated fake purchase token for backend verification.
- Android has no implemented Play Billing purchase client, purchase acknowledgment, restore, or entitlement refresh flow.

### Backend

- Express mounts existing payment endpoints under `/api/payments` and `/api/admin/payments`.
- Razorpay order creation calculates the payment amount from an existing product order or doctor fee record, but some fallback amounts remain.
- The backend verifies Razorpay HMAC signatures and can mark existing product orders or doctor appointments paid.
- Existing payment records use the `payments` collection.
- Google Play subscription verification currently creates an active entitlement from the submitted token without Google Developer API verification.
- The Razorpay webhook has no mandatory secret requirement and currently verifies a re-serialized JSON body rather than the raw request body.
- The refund endpoint records a refund status but does not call Razorpay or reconciliation APIs.
- No backend shop order creation or cart validation endpoint exists in the marketplace routes.
- No product stock reservation or temporary appointment slot hold is implemented in the payment flow.
- Doctor appointment booking is implemented in `doctor-portal`, with slot keys and daily capacity reservation, but payment is separate and no hold/payment linkage is enforced.
- Individual doctors use `doctorApplications`; hospital doctors use `doctorPortalDoctors`; organizations use `doctorPortalOrganizations`.
- Firebase authentication is used for patients and role-based portals.
- MongoDB initialization currently does not ensure payment, subscription entitlement, payment audit, order hold, or idempotency collections.

## Critical audit findings

1. Android shop checkout is not connected to a backend order and is not a verified purchase.
2. Android cart, stock, final price, and product approval are not authoritative in the backend.
3. The Razorpay implementation has development-secret fallbacks and must not run with placeholder credentials.
4. Signature verification accepts test-order IDs, so this branch cannot be treated as a production verification path.
5. Webhook verification is not based on Express raw bytes and signature secret enforcement is not mandatory.
6. Google Play premium activation trusts a local fake token and does not consult Google Play.
7. Subscription UI prices are local display values and must come from Play Console/base-plan data.
8. Product order, refund, payment, hold, and entitlement data lack unified audit/state guarantees.
9. Admin payment access exists, while seller and doctor payment isolation still require purpose-specific authorization.

## Payment SKU classification

| SKU category | Backend purpose | Provider | Notes |
|---|---|---|---|
| Physical fitness products | `shop` | Razorpay | Final price and stock must be calculated by backend |
| Qualifying individual/hospital consultation | `appointment` | Razorpay | Fee from approved trusted doctor/organization records; confirm slot after capture |
| Monthly/yearly digital premium | `subscription` | Google Play | No Razorpay direct payment; Play token and backend entitlement are authoritative |

Digital premium access is not a physical or healthcare consultation payment. Google Play is mandatory by default for Play-distributed Android premium digital purchases unless applicable alternative-billing eligibility is reviewed and implemented.

## Shared payment contract

One payment document should contain:

- internal `paymentId`
- Firebase user reference
- purpose/category
- provider
- provider order/transaction IDs
- amount and currency
- payment status
- related product order or appointment
- idempotency key
- timestamps
- refund references
- failure details
- audit event references

Subscription records should additionally contain the Play product ID/base-plan ID, purchase token reference, acknowledgement state, entitlement state, expiry, grace-period state, account-hold state, and revocation state.

## Payment state machine

Implemented as a backend policy contract:

`created -> authorized | pending | failed | cancelled | expired`

`authorized/pending -> paid | failed | cancelled | expired`

`paid -> fulfilled | refund_pending | partially_refunded | refunded`

`fulfilled -> refund_pending | partially_refunded | refunded`

`refund_pending -> paid | partially_refunded | refunded`

Terminal states: `failed`, `cancelled`, `expired`, `refunded`.

## Remaining dependencies

- Razorpay test credentials and webhook secret
- Google Play developer account and service-account credential
- Actual Play Console subscription product/base-plan IDs
- Android Play Billing implementation and package signing details
- Seller settlement and payout policy approval
- Merchant refund and cancellation policy
