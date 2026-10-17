# Backend application

The backend is a NestJS + TypeScript modular monolith using Prisma and PostgreSQL.

**Documentation revision:** 0.6 — 17 October 2026. Core school workflows, academic lifecycle, imports/reports and manual fee-counter collection are available. This is not a production release; see `../PROGRESS.md` and `../DEPLOYMENT.md` for acceptance gaps, test evidence and the Render procedure.

## Local setup

```bash
cp .env.example .env
npm install
# Option A: Docker from the repository root
docker compose up -d db
# Option B: embedded PostgreSQL helper (keeps data in the OS temp directory)
npm run db:local

npm run db:migrate
SEED_SUPERADMIN_PASSWORD='use-a-12-character-local-password' npm run db:seed
# Optional synthetic sample records (development only):
NODE_ENV=development SEED_SUPERADMIN_PASSWORD='use-a-12-character-local-password' npm run db:seed -- --demo
npm run start:dev
```

API: `http://localhost:4000/api/v1`  
Health: `http://localhost:4000/health`

### Local demo login

The seed uses the email `superadmin@pcdav.local` unless `SEED_SUPERADMIN_EMAIL` is set. The password is never stored in the repository or printed by the seed; choose it through `SEED_SUPERADMIN_PASSWORD` when running `npm run db:seed`. The initial account has `mustChangePassword=true`, so the first successful login goes to the change-password screen. The Render demo must use a newly chosen private password; do not reuse a real school password.

## Management-facing API areas

- `/applications`, `/students`, and `/school` — admissions, student records, sessions, classes, and academic setup.
- `/students/:id/withdraw`, `/students/:id/strike-off`, `/students/:id/transfer`, `/students/:id/readmit`, and `/students/:id/lifecycle` — dated leaving, transfer/readmission and append-only lifecycle history; certificates are outside this API slice.
- `/fee-heads`, `/fee-plans`, `/assessments`, `/credits`, and `/students/:id/ledger` — fee configuration, assessment, balance, and credit.
- `/services` — dated hostel and generic service assignments.
- `/transport/routes`, `/transport/vehicles`, `/transport/allocations`, and `/transport/report` — transport masters, student allocation, capacity checks, and operational lists.
- `/store/groups`, `/store/clusters`, `/store/vendors`, `/store/products`, `/store/stock-receipts`, `/store/issues`, and `/store/defaulters` — store inventory and student issue operations.
- `/payment-quotes`, `/payments`, `/receipts`, `/cashier-shifts`, and `/reports/*` — Level 4 collection, receipt snapshots, correction history, statements, dues/journal/collection reports and cash close.
- `/finance/requests` and `/finance/policy` — Accountant correction requests, Admin/Superadmin decisions, and versioned demo financial policy.
- `/attendance` and `/attendance/correction-requests` — assigned-class daily attendance, immutable correction requests, and Admin/Superadmin decisions.
- `/promotion-decisions` and `/promotion-batches` — Teacher Promote/Retain decisions and Admin/Superadmin validation/execution of next-session enrollments.
- `/cashier-shifts/:id/movements` — idempotent deposit, handover and Admin expense movements.
- `/imports/*` — Admin-only CSV preview/commit endpoints for students, transport routes/vehicles/allocations, store vendors/products, and store opening stock.
- `/reports/admissions`, `/reports/enrollments`, `/reports/transport`, `/reports/store`, and `/reports/operational` — admission/enrollment denominators and dated operational lists/totals.

## Implemented levels 1–3

- Secure cookie session login/logout and CSRF protection.
- One-school scope with one initial Superadmin.
- Superadmin/Admin/Accountant/Teacher hierarchy and account lifecycle rules.
- Temporary-password change and session revocation.
- School profile, academic sessions, classrooms, capacity, subjects, and teacher assignments.
- Optional one active class-teacher assignment per teacher/session.
- Audit records for account, academic, admission, student, enrollment, and document changes.
- Admissions pipeline with duplicate suggestions, explicit stage transitions, document metadata, and capacity validation.
- Atomic application-to-enrollment conversion with unique admission numbers and retry-safe committed-result recovery.
- Student registry with admission-number-first search, family/guardian/sibling records, enrollment history, controlled edits, and Teacher classroom scope.
- Private document metadata and local/S3-compatible storage adapter for admission/student documents.
- Admin-managed fee heads and versioned fee plans with effective dates and class/entry/category eligibility.
- Integer-paise assessment previews and idempotent fee-obligation commits for monthly, annual, half-yearly, and one-time rules.
- Student outstanding ledger, oldest-due-first same-student credit allocation, and dated hostel/transport service assignments.
- Transport operational management: route masters, vehicle/driver masters, dated student allocations, capacity checks, and route/class/vehicle/month reports.
- Store operational management: groups, vendors, products, stock receipts, inventory movement history, student issues, low-stock visibility, cancellation/return restoration, and open-balance/defaulter views.
- Student leaving and return management: withdrawal/strike-off reasons and effective dates, dated immutable lifecycle events, permanent admission-number reuse, transfer/readmission enrollment creation, and service cutoffs.
- Synthetic migration slice: durable CSV previews retain invalid row errors; commits are atomic and audited, and imported rows link back to their created student, service, master, or stock receipt.

## API rules

- All business requests use `/api/v1`.
- `GET /health` is public and contains no school data; configure it as the Render readiness endpoint when deployment is set up.
- Authenticated writes require `pcdav_session`, same-origin request, and `X-CSRF-Token`.
- `version` fields are required for mutable student, application, school, and classroom edits.
- Level 4 payment and refund commands require `Idempotency-Key`. Amounts are integer-paise strings, not floating-point rupees. Reuse the exact payload/key after an ambiguous response; never collect/refund again with a fresh key until the original outcome is resolved.
- Do not use this build to record real payments: use synthetic data until school policy, UAT, backups and production approval are complete. Fee-counter methods are manually recorded; no payment gateway or bank API is used.

### Synthetic CSV imports

Each import supports JSON `{ "csv": "...", "reason": "..." }` or a multipart `file` plus `reason`. Preview first, inspect `rows[].error`, then commit with `{ "batchId": "...", "reason": "..." }`. All writes are Admin/Superadmin-only, atomic, audited, and school-scoped. The one-step endpoint (`POST /imports/<kind>` or `POST /imports/<domain>/<resource>`) commits only when `dryRun:false` is explicitly supplied.

Supported paths and required CSV columns are:

- `students`: `name,dateOfBirth,gender,admissionDate`; optional admission number, guardian/contact, `sessionId,classId`, `entryType`, `feeCategory`, and `ews`.
- `transport/routes`: `name,monthlyAmountMinor`; optional campus, destination, capacity.
- `transport/vehicles`: `name,busNumber,capacity`; optional driver names/phones.
- `transport/allocations`: `enrollmentId` or `admissionNumber`, `routeId` or `routeName`, `startDate`; optional vehicle and end date.
- `store/vendors`: `name`; optional contact, address, banking and UPI fields.
- `store/products`: `name,unitCostMinor`; optional group, description and alert quantity.
- `store/stock-opening`: `productId` or `productName`, `quantity,unitCostMinor,receivedAt`; optional vendor.

## Level 4 demo API contract

- Open a shift with `POST /cashier-shifts` and `{ businessDate, openingFloatMinor }`.
- Quote with `POST /payment-quotes` and `{ studentId, amountMinor, obligationIds?, storeIssueIds? }`. The response has `id`, `version`, `expiresAt`, `allocations`, `allocationPlan`, and projected outstanding/credit totals. Omitted arrays use all eligible dues; provided arrays select exact fee/store targets. Credits apply to eligible fees first.
- Capture with `POST /payments`, an `Idempotency-Key` header, and `{ quoteId, quoteVersion, receivedAmountMinor, currency: "INR", businessDate, mode, payerName }`. `payerPhone` is optional. An open shift for that cashier/date is required.
- `CASH`, `UPI`, `BANK_TRANSFER`, and `CHEQUE` are selectable manual counter methods. `CASH` requires `tenderedAmountMinor`; UPI and bank-transfer references are optional notes and do not require gateway/bank verification fields. `MANUAL_ELECTRONIC` remains readable and accepted for old clients, but its historical verification/reference fields are no longer required or manufactured by new captures.
- New `CHEQUE` captures are recorded as `CAPTURED`, allocated immediately, and receive a receipt in the same transaction. Cheque number, bank, and date remain optional manual details. `POST /payments/:id/clear-cheque` and `PENDING_CHEQUE` remain available for rows created by the older pending-clearance flow; they are not part of the normal capture path.
- `GET /reports/collections` and payment/receipt listings accept the four counter methods plus legacy `MANUAL_ELECTRONIC`; collection totals use the recorded capture event business date and retain legacy cheque-clearance events.
- `GET /payments/:id` returns payment, allocations/releases, credit applications, refunds, events and receipt. `GET /receipts` and `GET /receipts/:id` retain originals and current void/refund status. `POST /receipts/:id/print-events` requires `{ reason }`. Receipt PDFs use `GET /receipts/:id/pdf/status`, `POST /receipts/:id/pdf/retry`, and `GET /receipts/:id/pdf`; a not-yet-ready job returns a retryable response without changing payment state.
- Accountants submit `/finance/requests`; Admin/Superadmin approve or reject requests. The approval rechecks the frozen financial state and applies the exact correction once. Direct correction endpoints remain audited Admin/Superadmin controls.
- `GET/POST /finance/policy` exposes the versioned demo policy: receipt prefix/scope, advance-credit behavior, previous-session blocking and bounce fee. Policy changes invalidate stale quotes and do not rewrite old receipt snapshots.
- `GET/POST /cashier-shifts/:id/movements` supports idempotent `DEPOSIT`, `HANDOVER` and Admin-only `EXPENSE` movements. Closed shifts cannot change. Close with `POST /cashier-shifts/:id/close` and `{ countedCashMinor, reason }`; expected cash is opening + captured − refunds/corrections − movements.

## Verification and next milestone

The migration history contains 16 reviewed migrations, including manual counter method compatibility and lifecycle/import records. Regenerate Prisma after schema changes (`npm run db:generate`) and deploy reviewed migrations (`npm run db:migrate`). Do not delete history to force deployment. Existing records are not retroactively marked verified; migration backfills use explicit opening entries and retain untraced-history indicators.

`DATABASE_URL=<fresh-disposable-test-url> npm test -- --runInBand` runs 82 integration tests across nine suites using synthetic school IDs, including lifecycle/import/report coverage. Run this against a fresh disposable database/schema, not the seeded demo schema: the database intentionally permits only one Superadmin. `npm run build` compiles the API. Browser contracts and the live end-to-end synthetic Level 4 test are documented in `../frontend/README.md`.

Remaining production gates: approved financial policy, external bank/refund settlement, school UAT, physical printer/font approval, private object storage, separate production worker, backups/restore, monitoring and live migration. Reversal of already-spent advance is supported only when traceable lineage exists; missing historical evidence remains visible and blocks unsafe correction. Import approved live data only after these gates and accountant review.

The Word file in the repository root is a generated management report, not a financial receipt. The current-status receipt PDF worker exists for the synthetic demo, but its PostgreSQL byte storage and bounded in-API worker are not the production object-storage/worker architecture.

## Render service notes

For a demo deployment, use `NODE_ENV=production`, `APP_MODE=demo`, `DATABASE_URL`, `FRONTEND_ORIGIN`, `PORT` supplied by Render, and secure cookie settings. In demo mode, document uploads are explicitly disabled unless private S3-compatible storage is configured. Run `npm run db:migrate` against the Render database before starting the API; do not use `prisma db push`. The exact service creation, environment-variable and synthetic-seed steps are in `../DEPLOYMENT.md`.
