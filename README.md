# PCDAV School ERP — discovery and implementation documents

**Prepared:** 4 October 2026  
**Revised:** 29 October 2026 — version 0.6 (re-baselined priorities and review findings)
**Existing portal:** <https://pdav.webanlytic.in/software/login/index>  
**School name displayed by the portal:** P DAV PUBLIC SCHOOL / PDAV PUBLIC SCHOOL  
**Project folder:** repository root

## Start here

## Local setup

Required: Node.js `22.23.3` and PostgreSQL. The repository includes `.nvmrc`, a Dockerfile, and a full local Docker Compose stack.

With Docker:

```bash
make install
docker compose up --build
```

Without Docker, start PostgreSQL with `npm --prefix backend run db:local`, copy the two `.env.example` files to `.env`/`.env.local`, then run the backend and frontend commands below.

Useful checks from the repository root:

```bash
make build
make migrate
make test
```

`make test` uses the local PostgreSQL URL from `DATABASE_URL` and never targets a Render database unless that variable is deliberately changed.

## Implementation status

Levels 1–4, transport/store operational management, and the academic lifecycle workflows are implemented in separate application folders:

- `backend/` — NestJS API, Prisma migrations, and PostgreSQL persistence.
- `frontend/` — Next.js/React staff application.
- `PROGRESS.md` — resume instructions, completed work, remaining work, and the next milestone.
- `backend/README.md` and `frontend/README.md` — application-specific local setup, features, tests, and deployment notes.
- `DEPLOYMENT.md` — beginner-friendly Render deployment and synthetic-data verification steps.

The academic lifecycle workspace includes Teacher attendance, Admin/Superadmin attendance-correction review, Teacher Promote/Retain decisions, and Admin/Superadmin next-session promotion execution.

Run the local applications with:

```bash
npm --prefix backend run start:dev
npm --prefix frontend run dev
```

The development API starts on `http://localhost:4000`; the frontend starts on `http://localhost:3000`. Start PostgreSQL with `docker compose up -d db` or `npm --prefix backend run db:local`, then run the seed described in `backend/README.md`. See `backend/.env.example`, `frontend/.env.example`, `PROGRESS.md`, and `DEPLOYMENT.md` for local and Render workflows.

## Current management status

The staging prototype currently demonstrates:

- Admissions, enrollment, student registry, Student 360, users, academic setup, and audit history.
- Fee heads, versioned fee plans, assessment previews, outstanding balances, and student credit rules.
- Hostel/transport service charges plus a separate Transport Management workspace for routes, vehicles, drivers, student allocation, capacity, and reports.
- A Store Management workspace for groups, clusters, vendors, products, stock receipts, inventory, student issues, cancellations, and open balances.
- Fee-counter collection, receipt register, cashier, finance-request, policy, reports, and statement workspaces: partial payments, overpayment credit, selectable manual Cash/UPI/Bank transfer/Cheque methods, selected fee/store settlement, immutable receipt snapshots, Accountant requests/Admin decisions, deposits/handovers/expenses, balanced journal, current-status PDF jobs, and cashier reconciliation. No payment gateway or bank API is used.
- Student lifecycle and operations: withdrawal/strike-off, transfer/readmission, append-only lifecycle history, synthetic CSV previews/imports for students/transport/store masters and opening stock, enrollment/admission reports, and store operational reports.

**The synthetic deployment is ready for workflow review, but it is not production-approved.** Production policy sign-off, printer/font approval, private object storage, backup/recovery, live migration, school UAT and certificate samples remain. Fee-counter methods are manually recorded; there is no payment gateway or bank integration. Do not use the demo build to collect real money. See `PROGRESS.md` for the exact verified scope and `DEPLOYMENT.md` for the Render demo boundary.

Verification on 17 October 2026: 82 backend tests across nine suites passed, with backend/frontend builds, frontend TypeScript, Prisma validation and a 16-migration local deployment. The browser contract suite must be rerun after the simplified manual-counter UI changes. Standalone lint is unconfigured; physical-printer, school UAT, certificate samples and production recovery checks remain open. Exact commands and test limitations are in `PROGRESS.md`.

| Document | Purpose |
|---|---|
| [feature-audit.md](feature-audit.md) | Existing modules, options, workflows, evidence sources, observed problems, and coverage limitations. |
| [reference-data.md](reference-data.md) | Observed class-wise fees, sessions, dropdown options, student fields, payment fields, and certificate fields. |
| [prd.md](prd.md) | Product requirements: what the improved ERP must do, priorities, business rules, and acceptance criteria. |
| [trd.md](trd.md) | Technical requirements: architecture, database, financial integrity, APIs, migration, operations, and testing. |
| [design.md](design.md) | Information architecture, screen specifications, user journeys, wireframes, components, and print design. |
| [roadmap.md](roadmap.md) | Implementation sequence, school decisions needed, milestones, first-week work, and go-live procedure. |
| [school-review-report.md](school-review-report.md) | Plain-language school-department summary, cross-check results, required changes, technology explanation, approval checklist, and roadmap. |
| [PCDAV_school_ERP_school_review_report.docx](PCDAV_school_ERP_school_review_report.docx) | Word edition of the revised school review report. |

**Recommended reading order:** audit → reference data → PRD → design → TRD → roadmap.

## Important conclusions

1. The existing system has much more than fees: admissions, student records, concessions, fines, hostel, transport, certificates, store, finance, attendance, exams, communication, and school administration.
2. The replacement starts as a **single-school system with one Superadmin** and four main account categories: **Superadmin, Admin, Accountant, and Teacher**. Permissions are hierarchical but enforced at the API and data-scope level.
3. The first release should make **admission → enrollment → billing → collection → receipt → reporting → attendance → promotion/withdrawal** reliable. Hostel fees, transport management, store operations and the synthetic Level 4 finance controls are available for review; payment policy and live migration still require approval.
4. **Admission charges and annual charges are distinct.** The visible fee matrix groups Registration Fee and Admission Charge under **NEW STUDENT**, and Annual Maintenance Fee and Examination Fee under **HALF YEARLY/YEARLY**. Confirm the actual assessment schedule before implementing it.
5. **Admission number is the main school-facing student identifier.** It is unique within the school, used for search and financial operations, and is never reused.
6. Partial payments leave an outstanding balance for the student. Extra payments create student credit that is automatically applied to the student's oldest eligible future fee; credit and outstanding amounts remain separate and auditable.
7. School leaving should preserve the student's identity, prior enrollments, receipts, and ledger. Use dated withdrawal/struck-off states and a leaving-certificate workflow.
8. A new class/session must create a new enrollment, with an explicit fee-plan assignment. It must not overwrite the previous year's class or receipts.
9. Several visible features could not be fully verified without executing business actions. The audit names these explicitly; proposed behavior is not presented as proven legacy behavior.

## Confirmed role model

This is the target authority model. The current synthetic build supports collection, academic lifecycle workflows, imports and Admin financial decisions; certificates remain deferred until current-ERP samples are provided.

- **Superadmin:** one initial platform/school Superadmin with full operational access. Creates, deactivates, resets, and manages Admin, Accountant and Teacher accounts. The workflow never creates or promotes another Superadmin.
- **Admin:** may create Admin, Accountant, and Teacher accounts; may manage and deactivate Accountant/Teacher accounts; oversees school operations, fee plans, users, attendance approvals, promotion, and school finance. Only Superadmin may deactivate an Admin.
- **Accountant:** controls fee accounting, collections, receipts, balances, credits, refunds/reversal requests, and reconciliation. Exceptional changes notify/request Admin approval. Full income/expense school-finance controls are Admin-only.
- **Teacher:** sees assigned classroom data, marks day-wise attendance, submits attendance corrections for Admin approval, and makes the final Promote/Retain decision for students in the assigned classroom. A teacher may have no class-teacher assignment or one active class-teacher assignment per academic session.

## Render deployment decision

The demo deployment is a Render-hosted frontend Web Service, NestJS API Web Service, and Render PostgreSQL database. The PDF worker is currently bounded inside the API for the small synthetic demo; a production deployment should separate durable workers and use private object storage. A `/health` endpoint will be configured as Render's health check so Render can detect unhealthy instances and restart/stop routing to them. An external uptime monitor can periodically request the endpoint, but it does not replace production hosting, database backups, or payment retry-safety. Free Render services are suitable only for development/demo use; production should use an always-on paid API/worker and a paid PostgreSQL plan with recovery. Follow [DEPLOYMENT.md](DEPLOYMENT.md) rather than copying secrets into the repository.

## Original legacy audit method and scope

- The initial legacy audit used an empty project folder for documentation only. Subsequent application development and synthetic local tests are separate from this read-only legacy review.
- Authenticated HTML, form definitions, navigation links, configuration values, and inline JavaScript were inspected. Site JavaScript was not executed.
- Network actions were login requests, view-page GETs, and one standard read-only student-search POST used by the Collect Fee page.
- No admission/payment submission, student update, strike-off, restoration, promotion, fee/configuration save, message send, receipt issuance/reprint, or certificate generation action was submitted. School/session switch actions were not used.
- Normal authentication and access may create server-side sessions/access logs; this review did not intentionally change school business data or configuration. There is no database-level before/after verification.
- Credentials, session cookies, raw student records, and live student identifiers are not included in this documentation pack. Temporary authenticated source material was used only for inspection and removed after document validation.
- This is a **read-only requirements audit**, not a database export, execution test, or pixel-level browser/accessibility audit. All workflow completion checks belong on an isolated staging copy.

## Document status

Version `0.6` — documentation reconciled with Levels 1–4, transport/store operations, academic lifecycle, imports/reports and manual fee-counter collection. Original audit evidence and observed rates remain historical evidence, not approved configuration. Certificates remain deferred pending current ERP samples. `/health` is implemented; Render deployment, external monitoring, hosting size/budget and operational recovery still need configuration and approval.

**Next action:** deploy the latest synthetic-only changes to Render, apply all 16 migrations, run the documented browser/API/database verification, and review the remaining certificate samples and production approvals before any live import or real collection.
