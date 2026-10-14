# Frontend application

The frontend is a Next.js + React + TypeScript staff workspace. It is deliberately separate from `backend/` for independent Render deployment.

**Documentation revision:** 0.5 — 14 October 2026. This is a synthetic-data demo implementation, not an approved production payment release. The complete target screens remain in `../design.md`; current acceptance gaps and next work are in `../PROGRESS.md` and `../DEPLOYMENT.md`.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Browser API calls use same-origin `/api/v1` routes; Next.js proxies them to `API_INTERNAL_URL` (default `http://127.0.0.1:4000`) so session cookies and CSRF checks remain same-origin.

## Implemented levels 1–3 and Level 4 demo slice

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
- Payment collection with server-controlled or explicitly selected fee/store allocation, partial payments and advance credit, cash change, manual electronic and cheque modes, and frozen-payload idempotent retries across reloads. Manual electronic capture requires explicit verification and evidence; a rejected retry cannot discard an earlier uncertain payment.
- Receipt register with immutable school/student/payer/allocation snapshots, reasoned reprint events, current-status PDF jobs and download/retry/status actions. Accountants submit correction requests; Admin/Superadmin decisions apply exact corrections once. Accountants can clear cheques; direct bounce/reversal/refund remains Admin/Superadmin-only.
- Cashier shift opening for all payment modes, server expected-cash review, deposits, handovers, Admin expenses, counted cash, and reasoned variance close. Only the cashier or Admin/Superadmin can close a shift.
- Finance request inbox, versioned demo policy editor, fee/store selection, student statements, dues/collection/journal reports, and role-aware Level 4 navigation.
- Accessible focus states, responsive layouts, keyboard-friendly forms, loading/error states, and API reconnect indicator.

## Remaining work and production boundary

- Production-approved financial rules, external bank/refund settlement, private object storage, physical printer/font approval, full school UAT, backups/restore and live migration. The current PDF path is a synthetic demo worker backed by PostgreSQL bytes, not the final production object-storage worker.
- Day-wise attendance and correction approval screens.
- Teacher Promote/Retain screen.
- Withdrawal, certificates, migration, parent/gateway views, and remaining statutory/management reports.

Store issues are included automatically in oldest-due payment allocation. The quote accepts only student and amount; it does not support selecting individual balances. Stock receipts are inventory receipts and are not payment receipts.

For a synthetic demonstration: sign in as Accountant/Admin, open a shift in `/cashier`, review `/finance/policy`, find an assessed student in `/fees/collect`, create/review a selected or automatic quote, record the test payment, inspect `/statements` and `/reports`, submit/approve a correction in `/finance/requests`, open its snapshot in `/receipts`, check PDF status/download/retry, record a movement, and reconcile/close the shift. Never create a fresh collection/refund command to resolve an uncertain response. The generated management Word report is unrelated to payment receipt rendering.

## Build

```bash
npm run build
npm run start
```

## Browser tests

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

The tests cover login, the role-aware dashboard, admission-number student search, Student 360, academic setup, audit navigation, fee/ledger/service workspaces, transport/store workspaces, Level 4 finance screens, and the same-origin API proxy. The API must be running and the frontend must be available at `E2E_BASE_URL` (default `http://localhost:3000`). Set `E2E_EMAIL` and `E2E_PASSWORD` for the local Superadmin account. Playwright browser binaries are environment-specific; set `PLAYWRIGHT_CHROMIUM_PATH` when the normal Playwright installer is unavailable.

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

`tests/level-4-contracts.spec.ts` uses the real UI with mocked responses based on the backend DTOs/controllers/services and Prisma models. It asserts exact request bodies, quote selection/policy rendering, cash/electronic/cheque posting, identical payload/key retries after reload and expiry, advance credit, stale quote/policy rejection, immutable receipt snapshots, reprint/PDF actions, role-sensitive correction requests, policy editing, reports/statements, payout movements and cashier opening/closing. It also checks pagination. These tests do not establish live backend/database integration or verify physical print output; the print dialog is stubbed to verify audit-before-print ordering.

### Level 4 live browser smoke test (opt-in)

Start the API and frontend against the same **local disposable PostgreSQL database**, install both applications' dependencies, and run from `frontend/`:

```bash
E2E_DATABASE_URL='postgresql://pcdav:pcdav_local@localhost:5433/pcdav?schema=public' \
  PLAYWRIGHT_CHROMIUM_PATH=/path/to/installed/chrome \
  npm run test:e2e -- tests/level-4-live.spec.ts tests/level-4-contracts.spec.ts --workers=1
```

The combined Level 4 suites pass 34 tests (33 mocked contracts + 1 live smoke). `level-4-live.spec.ts` provisions a generated Accountant and synthetic school/student/fee/store balance, signs in through the actual browser, collects cash, deposits/handovers cash, submits and approves a correction, verifies reports/journal/statement reconciliation, exercises the receipt PDF path and closes the shift. Because financial history is append-only, the latest run retains synthetic financial history and disables its generated fixture accounts instead of deleting immutable records. It refuses non-local database hosts and skips unless `E2E_DATABASE_URL` is explicitly set. No existing staff password or seed changes are needed; physical printing remains unverified.

## Render service notes

The frontend is deployed as its own Render Web Service with root directory `frontend`. Build with `npm ci && npm run build`; start with `npm start`. Set `API_INTERNAL_URL` to the backend service's private/public URL as described in `../DEPLOYMENT.md`. The frontend can build before the backend exists, but API calls remain unavailable until the backend and database are healthy.
