# Backend application

The backend is a NestJS + TypeScript modular monolith using Prisma and PostgreSQL.

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

## Implemented levels 1–2

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

## API rules

- All business requests use `/api/v1`.
- `GET /health` is public and contains no school data; Render uses it for readiness checks.
- Authenticated writes require `pcdav_session`, same-origin request, and `X-CSRF-Token`.
- `version` fields are required for mutable student, application, school, and classroom edits.
- Financial modules are not implemented yet. Do not use this Level 1–2 build to record real payments.

## Next backend milestone

Implement Level 3 fee plans and obligations, including versioned Admin-managed fee plans, hostel/transport fee rules, student outstanding balances, and automatic same-student credit.
