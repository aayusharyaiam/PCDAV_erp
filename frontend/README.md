# Frontend application

The frontend is a Next.js + React + TypeScript staff workspace. It is deliberately separate from `backend/` for independent Render deployment.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The API defaults to `http://localhost:4000/api/v1`.

## Implemented levels 1–2

- Staff sign-in and forced first-login password change.
- Role-aware navigation for Superadmin, Admin, Accountant, and Teacher.
- Dashboard with school/session context, applications, classrooms, staff, and student summaries.
- User and role management screen with hierarchy-aware account creation/deactivation controls.
- Academic setup screen for sessions, classrooms, capacity, and Admin class-teacher assignment.
- Admissions list, filters, draft registration modal, application review, approval, and enrollment confirmation.
- Student registry with admission-number-first search.
- Student 360 with identity, family/guardians, enrollment history, admission history, and permission-sensitive details.
- Audit history screen.
- Accessible focus states, responsive layouts, keyboard-friendly forms, loading/error states, and API reconnect indicator.

## Not yet present

- Fee-plan, fee, payment, receipt, and day-close screens.
- Day-wise attendance and correction approval screens.
- Teacher Promote/Retain screen.
- Reports, withdrawal, certificates, migration, and parent/gateway views.

## Build

```bash
npm run build
npm run start
```
