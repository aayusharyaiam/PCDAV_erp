# PCDAV ERP implementation progress

**Last updated:** 13 October 2026
**Current branch:** `master`  
**Current milestone:** Levels 1–2 implementation

## How to resume this project

1. Read this file first.
2. Read `README.md` for the current local commands.
3. Read `prd.md`, `design.md`, and `trd.md` for the approved product and technical contract.
4. Run `git log --oneline --decorate -10` and `git status` before changing code.
5. Start the backend before the frontend; the frontend uses `NEXT_PUBLIC_API_URL` or `http://localhost:4000/api/v1`.
6. Use the development credentials in `backend/.env.example` only for local development.

## Completed and verified

- Documentation baseline committed as `185bfca`.
- Git repository initialized locally.
- Separate `frontend/` and `backend/` application boundaries created.
- PostgreSQL + Prisma schema and migrations committed in `a144dfe`.
- Level 1 backend: authentication, secure cookie sessions, CSRF, four-role hierarchy, one-school scope, users, temporary-password changes, session revocation, school settings, sessions, classes, teacher assignment, audit events, private document storage adapter, and `/health` readiness endpoint.
- Level 2 backend: admission applications, duplicate suggestions, staged decisions, capacity validation, atomic admission-number allocation, retry-safe enrollment, family/guardian/sibling records, enrollment history, Student 360, Teacher classroom scope, and document metadata/uploads.
- Level 1–2 frontend committed in `e904109`: login/password-change, role-aware dashboard shell, users, academic setup, applications, review/enrollment, student registry, Student 360, audit history, responsive UI, and API reconnect state.
- PostgreSQL integration suite covers six Level 1–2 workflow/security scenarios.
- Word report repaired and regenerated as a standard 22-part DOCX package; ZIP integrity, all XML parts, relationships, required content, and report phrases validate successfully.
- Reproducible Word generation is retained in `tools/`; Microsoft Word COM opened the repaired report successfully and read 32,232 text characters.

## Verified

- `backend` TypeScript/NestJS build passes.
- `frontend` Next.js production build passes.
- Prisma schema validation, migration deployment, and seed pass against temporary local PostgreSQL 18.
- `npm test` passes: 6 tests, including role boundaries, CSRF, idempotent enrollment retry, unique admission numbers, capacity, Teacher scope, stale edits, documents, and session revocation.
- `/health` responds with `{ "status": "ok" }` when API and database are ready.
- Frontend and backend production builds pass after the document repair.
- Playwright browser checks pass: desktop login/dashboard, student registry/Student 360, admissions/academic/audit navigation, and 390×844 mobile navigation/no-overflow.

## Current implementation contract

- Initial deployment is one school with one Superadmin.
- Superadmin has full operational access and manages Admin accounts. The initial provisioning workflow creates Admin accounts only.
- Admin creates Admin, Accountant, and Teacher accounts and manages lower-level accounts.
- Only Superadmin deactivates Admin accounts. Accounts with history are deactivated, never hard-deleted.
- Admission number is the primary school-facing student identifier and is unique/non-reusable within the school.
- A Teacher may have zero or one active class-teacher assignment per academic session.
- Fee plans, payment, attendance, hostel, transport, and promotion details are specified but are not all implemented in this Level 1–2 slice.

## Not yet implemented

- Fee-plan builder and fee assessment engine
- Remaining balance and automatic student-credit allocation
- Accountant payment collection, receipts, reversals, refunds, and day close
- Teacher day-wise attendance and Admin-approved corrections
- Teacher final Promote/Retain workflow
- Hostel/transport operational billing and assignments
- Reports, certificates, withdrawal, promotion batch execution, and migration
- Background worker for future financial/document jobs

## Next coding milestone

Level 1–2 is committed and verified. The next milestone is Level 3: versioned Admin-managed fee plans, obligations, balances, hostel/transport fee integration, and calculation previews. Do not record real payments until Levels 3–4 are implemented and financially tested.

## Commit history for continuation

```text
e904109 feat: add levels 1 and 2 staff frontend
a144dfe feat: implement levels 1 and 2 backend
29af1ef chore: scaffold PostgreSQL backend and resumable workspace
185bfca docs: establish revised ERP requirements baseline
```

After the initial feature commits, the following small fixes were committed:

```text
ddae400 fix: align local seed sign-in hint
6949542 fix: add shared backend date helpers
3831ea0 docs: record levels 1 and 2 progress
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
DATABASE_URL='postgresql://pcdav:pcdav_local@localhost:5433/pcdav?schema=public' npm test -- --runInBand
```

## Verification record

Run from the repository root:

```bash
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run test
```

If a session stops during work, update this file with the last completed feature, failed command, changed files, and the next exact task before ending.
