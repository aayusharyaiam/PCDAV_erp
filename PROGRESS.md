# PCDAV ERP implementation progress

**Last updated:** 12 October 2026  
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

## In progress — not yet verified

- NestJS/Prisma/PostgreSQL backend and Next.js frontend in separate folders.
- Levels 1–2 features and permission/integration tests.
- The initial uncommitted JSON prototype was replaced with PostgreSQL before implementation; no production financial/student data uses local JSON.

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

Finish and verify Levels 1–2 before starting Level 3. Level 3 adds versioned Admin-managed fee plans, obligations, balances, hostel/transport fee integration, and calculation previews.

## Verification record

Run from the repository root:

```bash
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run test
```

If a session stops during work, update this file with the last completed feature, failed command, changed files, and the next exact task before ending.
