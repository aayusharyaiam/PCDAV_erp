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

## Browser tests

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

The tests cover login, the role-aware dashboard, admission-number student search, Student 360, academic setup, and audit navigation. The API must be running and the frontend must be available at `E2E_BASE_URL` (default `http://localhost:3000`). Set `E2E_EMAIL` and `E2E_PASSWORD` for the local Superadmin account. Playwright browser binaries are environment-specific; set `PLAYWRIGHT_CHROMIUM_PATH` when the normal Playwright installer is unavailable.

The mobile check uses a 390×844 viewport and verifies the mobile navigation drawer, registry navigation, core search field, and that the document has no horizontal overflow.
