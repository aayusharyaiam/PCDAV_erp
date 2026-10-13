# Frontend application

The frontend is a Next.js + React + TypeScript staff workspace. It is deliberately separate from `backend/` for independent Render deployment.

**Documentation revision:** 0.4 — 13 October 2026. This is a staging implementation, not an approved production payment release. The complete target screens remain in `../design.md`; current acceptance gaps and next work are in `../PROGRESS.md`.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Browser API calls use same-origin `/api/v1` routes; Next.js proxies them to `API_INTERNAL_URL` (default `http://127.0.0.1:4000`) so session cookies and CSRF checks remain same-origin.

## Implemented levels 1–3 and Level 4 staging slice

- Staff sign-in and forced first-login password change.
- Role-aware navigation for Superadmin, Admin, Accountant, and Teacher.
- Dashboard with school/session context, applications, classrooms, staff, and student summaries.
- User and role management screen with hierarchy-aware account creation/deactivation controls.
- Academic setup screen for sessions, classrooms, capacity, and Admin class-teacher assignment.
- Admissions list, filters, draft registration modal, application review, approval, and enrollment confirmation.
- Student registry with admission-number-first search.
- Student 360 with identity, family/guardians, enrollment history, admission history, and permission-sensitive details.
- Audit history screen.
- Fee-head and versioned fee-plan workspace for Admin/Superadmin, with accountant read access.
- Student fee ledger with assessment preview, outstanding balance, and student-credit display.
- Dated transport/hostel service-assignment workspace.
- Transport management workspace with route/vehicle masters, driver details, student allocation, capacity validation feedback, and operational report filters.
- Store management workspace with group/vendor/product masters, stock receipts, inventory counts, student item issues, cancellations, low-stock visibility, and open issue balances.
- Payment collection with server-controlled oldest-due fee/store allocation, partial payments and advance credit, cash change, manual electronic and cheque modes, and frozen-payload idempotent retries across reloads. Manual electronic capture requires explicit verification and evidence; a rejected retry cannot discard an earlier uncertain payment.
- Receipt register with immutable school/student/payer/allocation snapshots and reasoned reprint events before browser print. Accountants can clear cheques; bounce, reversal, and refund are Admin/Superadmin-only. Cash corrections select an open payout shift. Partial refunds preserve their command/key across uncertain outcomes and reloads.
- Cashier shift opening for all payment modes, server expected-cash review, counted cash, and reasoned variance close. Only the cashier or Admin/Superadmin can close a shift.
- Accessible focus states, responsive layouts, keyboard-friendly forms, loading/error states, and API reconnect indicator.

## Remaining work

- Level 4 approval-request UI, server PDF download, cash handover/deposit controls, and full reconciliation/report screens. Current receipts print from the immutable snapshot in the browser; this is not an approved production receipt/PDF workflow.
- Day-wise attendance and correction approval screens.
- Teacher Promote/Retain screen.
- Reports, withdrawal, certificates, migration, and parent/gateway views.

Store issues are included automatically in oldest-due payment allocation. The quote accepts only student and amount; it does not support selecting individual balances. Stock receipts are inventory receipts and are not payment receipts.

For a synthetic demonstration: sign in as Accountant/Admin, open a shift in `/cashier`, find an assessed student in `/fees/collect`, create/review the quote and record the test payment, then open its snapshot in `/receipts` and reconcile/close the shift. Never create a fresh collection/refund command to resolve an uncertain response. PDF availability is explicitly shown as unavailable; the generated management Word report is unrelated to payment receipt rendering.

## Build

```bash
npm run build
npm run start
```

## Browser tests

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

The tests cover login, the role-aware dashboard, admission-number student search, Student 360, academic setup, audit navigation, fee/ledger/service workspaces, transport/store workspaces, and the same-origin API proxy. The API must be running and the frontend must be available at `E2E_BASE_URL` (default `http://localhost:3000`). Set `E2E_EMAIL` and `E2E_PASSWORD` for the local Superadmin account. Playwright browser binaries are environment-specific; set `PLAYWRIGHT_CHROMIUM_PATH` when the normal Playwright installer is unavailable.

The mobile check uses a 390×844 viewport and verifies the mobile navigation drawer, registry navigation, core search field, and that the document has no horizontal overflow.

### Level 4 frontend contract tests (mocked API)

With the frontend running, no backend/database is required for this suite:

```bash
npx tsc --noEmit
npm run build
npm run start
# In another terminal:
npm run test:e2e -- --list
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e -- tests/level-4-contracts.spec.ts --workers=1
```

`tests/level-4-contracts.spec.ts` uses the real UI with mocked responses based on `backend/src/dto.ts`, `payment.service.ts`, `payments.controller.ts`, and the Prisma payment models. It asserts exact request bodies, quote allocation rendering, cash/electronic/cheque posting, identical payload/key retries after reload and expiry, advance credit, stale-quote rejection, immutable receipt snapshots, reprint reasons, role-sensitive cheque/correction actions, payout shifts, and cashier opening/closing. It also checks pagination. These tests do not establish live backend/database integration or verify the physical print output; the print dialog is stubbed to verify audit-before-print ordering.

### Level 4 live browser smoke test (opt-in)

Start the API and frontend against the same **local disposable PostgreSQL database**, install both applications' dependencies, and run from `frontend/`:

```bash
E2E_DATABASE_URL='postgresql://pcdav:pcdav_local@localhost:5433/pcdav?schema=public' \
  PLAYWRIGHT_CHROMIUM_PATH=/path/to/installed/chrome \
  npm run test:e2e -- tests/level-4-live.spec.ts tests/level-4-contracts.spec.ts --workers=1
```

The combined Level 4 suites pass 24 tests (23 mocked contracts + 1 live smoke). `level-4-live.spec.ts` provisions its own generated Accountant and synthetic school/student/fee/store balance, signs in through the actual browser, collects cash, verifies database settlement, checks snapshot history/reprint and closes the shift. It deletes only its generated records afterward and refuses non-local database hosts. It skips unless `E2E_DATABASE_URL` is explicitly set. No existing staff password or seed changes are needed; physical printing remains unverified.
