# Backend application

The backend is a NestJS + TypeScript modular monolith using Prisma and PostgreSQL.

**Documentation revision:** 0.4 — 13 October 2026. Levels 1–3, transport/store operations and a verified Level 4 staging slice are available. This is not a production financial release; see `../PROGRESS.md` for acceptance gaps and test evidence.

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

## Management-facing API areas

- `/applications`, `/students`, and `/school` — admissions, student records, sessions, classes, and academic setup.
- `/fee-heads`, `/fee-plans`, `/assessments`, `/credits`, and `/students/:id/ledger` — fee configuration, assessment, balance, and credit.
- `/services` — dated hostel and generic service assignments.
- `/transport/routes`, `/transport/vehicles`, `/transport/allocations`, and `/transport/report` — transport masters, student allocation, capacity checks, and operational lists.
- `/store/groups`, `/store/clusters`, `/store/vendors`, `/store/products`, `/store/stock-receipts`, `/store/issues`, and `/store/defaulters` — store inventory and student issue operations.
- `/payment-quotes`, `/payments`, `/receipts`, `/cashier-shifts`, and `/reports/collections` — Level 4 staging collection, receipt snapshots, corrections and cash close.

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

## API rules

- All business requests use `/api/v1`.
- `GET /health` is public and contains no school data; configure it as the Render readiness endpoint when deployment is set up.
- Authenticated writes require `pcdav_session`, same-origin request, and `X-CSRF-Token`.
- `version` fields are required for mutable student, application, school, and classroom edits.
- Level 4 payment and refund commands require `Idempotency-Key`. Amounts are integer-paise strings, not floating-point rupees. Reuse the exact payload/key after an ambiguous response; never collect/refund again with a fresh key until the original outcome is resolved.
- Do not use this build to record real payments: it implements a staging financial slice, not all release controls.

## Level 4 staging API contract

- Open a shift with `POST /cashier-shifts` and `{ businessDate, openingFloatMinor }`.
- Quote with `POST /payment-quotes` and `{ studentId, amountMinor }`. The response has `id`, `version`, `expiresAt`, `allocations`, and projected outstanding/credit totals. Allocation is automatic oldest-due across fees and store; selection overrides are not implemented.
- Capture with `POST /payments`, an `Idempotency-Key` header, and `{ quoteId, quoteVersion, receivedAmountMinor, currency: "INR", businessDate, mode, payerName }`. `payerPhone` is optional. An open shift for that cashier/date is required.
- `CASH` requires `tenderedAmountMinor`. `MANUAL_ELECTRONIC` requires `electronicChannel` (`UPI`, `BANK_TRANSFER`, `CARD`, `OTHER`), `reference`, `electronicVerified: true`, and `electronicVerificationNote`. This is staff-confirmed evidence, not bank integration; school/channel/trimmed references cannot be duplicated, including after reversal.
- `CHEQUE` requires `chequeNumber`, `chequeBank`, `chequeDate`. It remains unallocated with no final receipt until `POST /payments/:id/clear-cheque` with `{ businessDate, reason }`. Pending list: `GET /payments?status=PENDING_CHEQUE`.
- `GET /payments/:id` returns payment, allocations/releases, credit applications, refunds, events and receipt. `GET /receipts` and `GET /receipts/:id` retain originals and current void/refund status. `POST /receipts/:id/print-events` requires `{ reason }`; `/receipts/:id/pdf` honestly reports PDF generation as unavailable.
- Admin/Superadmin corrections: `/payments/:id/bounce`, `/reverse`, `/refunds`, with reason and optional correction business date. Refunds additionally require `amountMinor` and `Idempotency-Key`; `reference` is optional. Cash corrections must use an open payout `shiftId` (or the still-open original shift). Closed shift totals are not rewritten.
- Close with `POST /cashier-shifts/:id/close` and `{ countedCashMinor, reason }`. A nonzero variance needs a reason. Current expected cash is opening float + captured cash − cash corrections; deposits/handovers are not implemented.

## Verification and next milestone

The migration history contains eight migrations. The three Level 4 migrations create payment/receipt/shift records, harden balances and receipt originals, and add refund-command idempotency/electronic-reference uniqueness. Regenerate Prisma after schema changes (`npm run db:generate`) and deploy reviewed migrations (`npm run db:migrate`). Before applying the electronic-reference unique index to an existing dataset, reconcile duplicates; do not delete history to force deployment. Existing records are not retroactively marked verified.

`DATABASE_URL=<local-test-url> npm test -- --runInBand` runs 26 integration tests using isolated synthetic school IDs without reset/truncate. `npm run build` compiles the API. Browser contracts and a live end-to-end synthetic payment test are documented in `../frontend/README.md`.

Remaining Level 4 controls: Accountant request/Admin approval workflow, balanced journal and complete credit-allocation lineage, signed receipt-series/policy configuration, document worker/PDFs, cash movements and full reconciliation. Reversal of already-spent advance is deliberately rejected rather than silently removing paid fees; Level 3 assessment-credit recovery still needs a compensating workflow. Import approved live data only after these gates and accountant review.

The Word file in the repository root is a generated management report, not a financial receipt or evidence that the receipt PDF worker exists.
