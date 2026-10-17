# PCDAV ERP implementation progress

**Last updated:** 17 October 2026
**Documentation revision:** 0.6 — synchronized with academic lifecycle, imports, manual counter collection and Render guidance
**Application revisions:** academic lifecycle at `2a95b1b`; current core-school workflow changes are pending commit/push in this session
**Current branch:** `main`
**Current milestone:** Core school workflow slice implemented: lifecycle, imports, reports and manual fee-counter collection; Render synthetic-data deployment is active

## How to resume this project

1. Read this file first.
2. Read `README.md` for the current local commands.
3. Read `prd.md`, `design.md`, and `trd.md` for the approved product and technical contract.
4. Run `git log --oneline --decorate -10` and `git status` before changing code.
5. Start the backend before the frontend for a live local flow; the frontend uses same-origin `/api/v1` requests proxied to `API_INTERNAL_URL` (default `http://127.0.0.1:4000`).
6. Use the development credentials in `backend/.env.example` only for local development.

## Completed and verified

- Documentation baseline committed as `185bfca`.
- Git repository initialized locally.
- Separate `frontend/` and `backend/` application boundaries created.
- PostgreSQL + Prisma schema and migrations committed in `a144dfe`.
- Level 1 backend: authentication, secure cookie sessions, CSRF, four-role hierarchy, one-school scope, users, temporary-password changes, session revocation, school settings, sessions, classes, teacher assignment, audit events, private document storage adapter, and `/health` readiness endpoint.
- Level 2 backend: admission applications, duplicate suggestions, staged decisions, capacity validation, atomic admission-number allocation, retry-safe enrollment, family/guardian/sibling records, enrollment history, Student 360, Teacher classroom scope, and document metadata/uploads.
- Level 1–2 frontend committed in `e904109`: login/password-change, role-aware dashboard shell, users, academic setup, applications, review/enrollment, student registry, Student 360, audit history, responsive UI, and API reconnect state.
- PostgreSQL integration suite covers 76 Level 1–4 and financial-control workflow/security scenarios across seven suites.
- Word report regenerated from `school-review-report.md` at revision 0.5; it now explains the synthetic Level 4 payment/approval/report/PDF/close flow and the unfinished production gates alongside students, fees, transport and store.
- Reproducible Word generation and standard-library package/source-text validation are retained in `tools/`. An earlier report revision was opened with Word COM; the current revision has structural/text validation only, not a fresh visual Word/printer review.
- Level 3 backend: Admin-managed fee heads and versioned fee plans, integer-paise rules, effective dates, monthly/annual/half-yearly/one-time periods, class/entry/category eligibility, assessment previews, idempotent obligation commits, outstanding ledger totals, same-student credit, and dated hostel/transport service assignments.
- Level 3 frontend: fee-plan, student-ledger, and transport/hostel workspaces with role-aware navigation, amount validation, assessment preview, and mobile-safe layouts.
- Level 3 safeguards: invalid periods are rejected; class-specific rules override global rules; annual and one-time rules do not repeat; service assignments retain historical obligations; credit is allocated oldest-outstanding-first; and assessment retries remain idempotent.
- Management feedback was cross-referenced against the authorized live ERP read-only: Transport Mgmt. includes allocation, route/vehicle-driver master records, and route/vehicle/class/month print-list selectors; Store Mgmt. includes groups, products, clusters, vendors, stock/issues, receipts, collections, defaulters, print list, and deleted receipts. No live data was changed.
- Transport management: route and vehicle masters, driver details, dated student allocations, route/vehicle capacity checks, transport reports, and stop-allocation history.
- Store management: group/cluster/vendor/product masters, stock receipts, atomic stock movements, low-stock visibility, student item issues, auditable cancellation/stock restoration, and outstanding student issue/defaulter lists.
- Fee-counter backend: server quotes with selected fee/store targets, atomic/idempotent payment capture, explicit allocation and credit lineage, partial balances, same-student overpayment credit, cash tender/change, selectable manual Cash/UPI/Bank transfer/Cheque methods, configurable demo policy, immutable receipt snapshots, audited reprints, correction requests/Admin decisions, cash deposits/handovers/expenses, balanced journal, statements, dues/collection/journal reports, and cashier close. Legacy electronic-verification and pending-cheque records remain readable for compatibility; new counter captures do not require bank verification.
- Fee-counter frontend: `/fees/collect`, `/receipts`, `/cashier`, `/finance/requests`, `/finance/policy`, `/reports`, and `/statements`, connected to actual API contracts. Store issues settle through selected/automatic payment allocation; stock receipts remain separate inventory records.
- Academic lifecycle: assigned Teachers can submit daily attendance for every active student, submit immutable correction requests, and record final Promote/Retain decisions. Admin/Superadmin can review correction requests and prepare, validate, and execute capacity-checked next-session promotion batches while preserving enrollment history.
- Superadmin account management: Superadmin can provision Admin, Accountant and Teacher accounts, reset/deactivate lower accounts, and cannot create or promote another Superadmin.
- Frontend academic workspace: responsive Attendance, Correction review and Promote/Retain screens with retry-safe writes, loading/error/empty states, keyboard focus states, animations and reduced-motion support.
- Core school operations: Admin/Superadmin withdrawal and strike-off, transfer/readmission, append-only lifecycle history, dry-run/commit CSV imports for students/transport/store data, admissions/enrollment/transport/store reports, and responsive workflow screens.
- Fee-counter collection: Cash, UPI, Bank transfer and Cheque are selectable manual methods. Partial balances, overpayment credit, receipts, cashier totals and ledger history remain server-controlled. No payment gateway or bank API is integrated.
- Receipt PDF jobs now run durably inside the API for the small synthetic demo, store private bytes in PostgreSQL, support lease/retry/status/download, and render the current receipt status. Unsupported Devanagari/combining text is rejected rather than corrupted; physical printer approval remains open.
- Safety checks include stale quote/policy/selection rejection, concurrent settlement/approval/refund/deposit limits, receipt/journal/PDF rollback, append-only financial history, credit lineage, duplicate electronic-reference prevention, verification evidence, and frozen command/key recovery after ambiguous responses.
- Existing Level 3/transport/store changes were preserved and combined with the academic lifecycle, lifecycle/import, manual-counter and report implementations. Certificates remain deferred pending current ERP samples.

## Verified

- `backend` TypeScript/NestJS build passes.
- `frontend` Next.js production build passes.
- Prisma schema validation and local migration status pass for the 16-migration deployment path. The latest migrations add manual counter method compatibility and lifecycle/import records.
- `npm test -- --runInBand` passes: 82 tests across nine backend suites, including lifecycle/import/report and manual counter payment coverage.
- `/health` responds with `{ "status": "ok" }` when API and database are ready.
- Frontend and backend production builds pass for the current staging implementation.
- Earlier Level 1–3 browser checks passed for desktop/mobile navigation and the original workspaces. Those six seed-account browser scenarios were not rerun in this recovery session.
- The frontend TypeScript check and production build pass. The existing browser contract fixtures were updated for the simplified manual-counter methods; the full browser contract run is the remaining check before this commit.
- The browser contract run was attempted but could not launch because this environment does not have the Playwright Chromium binary installed. Run `npx playwright install chromium` on a machine with browser-download access, then rerun the contract suite.
- Backend build, frontend production build, frontend app/test TypeScript checks and PDF/backend suites pass. Standalone lint remains unconfigured (`next lint` requests interactive setup). PDF content is developer-verified; physical printer output, school UAT, external bank/refund settlement and production recovery remain open.
- Documentation source and Word artifact are kept together: edit `school-review-report.md`, run `npm --prefix tools run build-school-report`, then validate the generated `PCDAV_school_ERP_school_review_report.docx` before committing.
- Current management DOCX validation passes: 22 ZIP parts, XML and internal relationships valid, all 301 source-text fragments present, 19,233 extracted text characters. Run `python3 tools/validate-school-report.py` after regeneration. This is a management artifact, separate from the synthetic receipt PDF worker.

## Current implementation contract

- Initial deployment is one school with one Superadmin.
- Superadmin has full operational access and manages Admin accounts. The initial provisioning workflow creates Admin accounts only.
- Admin creates Admin, Accountant, and Teacher accounts and manages lower-level accounts.
- Only Superadmin deactivates Admin accounts. Accounts with history are deactivated, never hard-deleted.
- Admission number is the primary school-facing student identifier and is unique/non-reusable within the school.
- A Teacher may have zero or one active class-teacher assignment per academic session.
- Fee-plan/assessment foundations are Level 3. Level 4 demo controls are implemented and verified, but this build remains synthetic-data-only. Do not record real payments or import live balances.

## Not yet implemented or not production-approved

- External bank/gateway/refund execution and settlement matching are intentionally out of scope for fee-counter collection; manual UPI/bank-transfer entries are recorded as staff-entered methods.
- Production-approved financial rules, receipt series, old-session policy, bounce fee, live rates and school authority sign-off
- Devanagari-capable/office-approved receipt fonts and physical printer approval
- Production object storage for documents, managed worker separation, backups/restore and deployment monitoring
- Full statutory/management report acceptance and school UAT
- Live-data import/migration rehearsal and production reconciliation
- Certificate screens/templates (waiting for current ERP samples)
- School-approved report definitions and statutory formats
- Background worker for future financial/document jobs

## Next milestone

Deploy the current core-school slice safely to Render with a separate frontend Web Service, backend Web Service and PostgreSQL database. Apply all 16 migrations, run the synthetic browser flow, then guide manual acceptance of admissions, students, lifecycle, fee plans, transport, store, imports, collection, receipts, attendance, promotion, approvals, statements and reports.

Current demo defaults: automatic/selected oldest-due fee/store allocation, existing credit applied to eligible fees, one shift per cashier/business date, manual counter methods (Cash/UPI/Bank transfer/Cheque), configurable receipt prefix/scope default `DEMO/FEE/SCHOOL`, and PostgreSQL-backed PDF job bytes. These are not signed school financial rules. APP_MODE=demo disables document uploads unless private S3 storage is configured.

## Commit history for continuation

The last pre-recovery revision was `b15d39a` (`test: verify levels 1 and 2 and repair report`). The recovered application, migrations and tests are committed in `29d4c44`. This documentation/report refresh is a separate commit; use `git log --oneline -10` for its hash, since this file intentionally does not embed the hash of the commit that contains itself.

```text
e904109 feat: add levels 1 and 2 staff frontend
a144dfe feat: implement levels 1 and 2 backend
29af1ef chore: scaffold PostgreSQL backend and resumable workspace
185bfca docs: establish revised ERP requirements baseline
```

After the initial feature commits, the following fixes and verification updates were committed:

```text
ddae400 fix: align local seed sign-in hint
6949542 fix: add shared backend date helpers
3831ea0 docs: record levels 1 and 2 progress
c8d86c2 docs: include complete implementation commit log
b15d39a test: verify levels 1 and 2 and repair report
```

## Exact resume commands

```bash
git status
git log --oneline --decorate -10
cd backend
npm install
# Start a disposable local database using Docker or: npm run db:local
npm run db:migrate
SEED_SUPERADMIN_PASSWORD='at-least-12-characters' npm run db:seed
npm run start:dev
# In another terminal:
cd frontend
npm install
npm run dev
```

The first local sign-in must use the email configured by `SEED_SUPERADMIN_EMAIL` and the password supplied to `SEED_SUPERADMIN_PASSWORD`. The seed never overwrites an existing password. Do not commit `.env` files, local uploads, or database data.

The integration test command requires the same database variable:

```bash
DATABASE_URL='<fresh-disposable-test-url>' npm test -- --runInBand
```

## Verification record

Run from the repository root:

```bash
npm --prefix backend run build
npm --prefix frontend run build
DATABASE_URL='<fresh-disposable-test-url>' npm --prefix backend test -- --runInBand
```

Level 4 browser verification (from `frontend/`, with a production frontend and API using the same disposable database; the latest run used ports 3100/4100):

```bash
npx tsc --noEmit
E2E_DATABASE_URL='postgresql://pcdav:pcdav_local@localhost:5433/pcdav?schema=public' \
  PLAYWRIGHT_CHROMIUM_PATH=/path/to/installed/chrome \
  npm run test:e2e -- tests/level-4-live.spec.ts tests/level-4-contracts.spec.ts --workers=1
```

The live test requires both applications' dependencies and rejects non-local database hosts. No production credentials or seed-password changes are needed. Thirteen migrations are present. The latest combined run passed 34 tests: 33 mocked Level 4 contract tests and one live synthetic flow covering collection, cash movement, correction approval, reports/statements, PDF status and shift close. Because financial history is append-only, the live run retains generated synthetic history and disables fixture accounts instead of deleting immutable records. The expected receipt-issuance-failure regression logs one simulated database error while still passing its rollback assertions. Backend integration tests must use a fresh disposable schema because the seeded demo schema already contains the one permitted Superadmin.

Current verification on 14 October 2026: backend build, frontend production build, frontend app/test TypeScript, Prisma validation/deployment, 76 backend tests across seven suites, 33 mocked browser contracts, one live browser/API/PostgreSQL flow and report-source validation passed. Standalone lint is still unconfigured; Word visual review, physical-printer approval, school UAT, external settlement and production recovery were not run.

Report refresh commands (repository root):

```bash
npm --prefix tools run build-school-report
python3 tools/validate-school-report.py
git diff --check
```

If a session stops during work, update this file with the last completed feature, failed command, changed files, and the next exact task before ending.
