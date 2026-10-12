# PCDAV School ERP — School Review and Approval Report

**For:** Principal, school administrator, accountant, admissions office, and department heads  
**Prepared:** 4 October 2026; revised 12 October 2026 (version 0.2)  
**Purpose:** allow the school to understand, verify, correct, and approve the plan before development begins.

---

## 1. One-page summary

The current P DAV Public School ERP is being used as a central system for admissions, student records, fees, receipts, transport, hostel, certificates, finance, store, attendance, examinations, communication, and administration.

The recommended new ERP should first make this chain reliable and easy:

> **New admission → student record → class/session → fees and attendance → payment → receipt → reports → promotion or school leaving**

The new system should not simply copy the old screens. It should keep the useful information while improving:

- Simple student search.
- Clear monthly, annual, and new-admission charges.
- Safe payment posting and receipt generation.
- Complete history when a student changes class or leaves school.
- Proper approval for concessions, refunds, corrections, promotion, and withdrawal.
- Faster reports and smaller, easier screens.

The replacement initially serves one school with one Superadmin and four main account categories: Superadmin, Admin, Accountant, and Teacher. Hostel fees and dated hostel assignments remain included in the replacement scope.

### Decision before building

The school should **not approve the final fee and migration rules until the accountant and principal confirm the decisions listed in section 8**. The technical plan can start with a prototype and synthetic data, but production calculations must use school-approved rules.

---

## 2. What was checked

The review checked:

1. The existing ERP navigation and visible modules.
2. Forms, field names, dropdown options, reports, and fee settings.
3. Student registration, student search, student profile, active/struck-off lists, and certificate fields.
4. The fee collection screen, payment modes, fee periods, concessions, fines, hostel, transport, and receipt history.
5. Session/class settings and the visible promotion link.
6. Transport, finance, store, front office, attendance, examinations, employee, and application screens.
7. The product requirements, technical requirements, design, reference data, and roadmap documents already prepared for this project.

### Important safety boundary

This was a **read-only review**. No student was added, changed, promoted, removed, restored, charged, refunded, or messaged. No fee setting or school setting was saved. No receipt or certificate was issued. Some screens were inspected through their page structure and one standard student search; business actions were not executed on live school data.

---

## 3. What the current ERP contains

| Area | What is visible in the current system | Review status |
|---|---|---|
| Dashboard | Student/admission/employee counters, complaints, follow-ups, fee-unpaid counts, session, demographics, birthdays | Checked |
| School setup | School details, sessions, classes, subjects, access rights, fee settings, transport settings, app/login and other settings | Most checked; some menu pages need confirmation |
| Admissions | Enquiry, prospectus/payment-related page, registration, evaluation, confirmation, follow-up notifications | Page structures checked; complete conversion not executed |
| Student records | Directory, student details, filters, edit master, active and struck-off lists, certificates, print lists | Checked; editing/lifecycle actions not executed |
| Fees | Collect Fee, fee heads, monthly/yearly/new-student structure, dues, defaulters, discounts, fines, hostel, transport adjustments | Core screens checked; final transaction behavior not executed |
| Receipts | Receipt history and deleted-receipt list; receipt print action visible in source | Structure checked; no receipt printed/issued |
| Transport | Routes, destinations, costs, vehicles, seats, drivers, allocation and reports | Main forms/report selectors checked |
| Finance | Accounts, income, expenses, day book, account and income/expense reports | Main forms/report selectors checked |
| Store | Products, stock, student issue search, receipts, collection/defaulter options | Main product/issue/receipt structures checked |
| Office/documents | Document requests and notification channels; visitor, gate pass, postal, complaint and task menu items | Request screen checked; other pages need confirmation |
| Attendance/exams | Attendance reports; award list, admit card, report card, green sheet, UDISE report options | Report selectors checked |
| Employees/application | Employee form; application dashboard and learning-related menu items | Employee form checked; application dashboard contains generic template content |

The full technical inventory is in `feature-audit.md`.

---

## 4. Main school workflows in simple language

### A. Enrolling a new student

The current ERP appears to follow this sequence:

1. Enquiry and follow-up.
2. Prospectus or payment-related record.
3. Registration form.
4. Evaluation.
5. Confirmation: Confirmed, Shortlist, or Waitlist.
6. Student enrollment and fee assignment.
7. Payment and receipt where required.

The registration form can capture the student, applied class, date of birth, gender, category, religion, contact, previous school, medical history, bank details, sibling admission number, father, mother, guardian, addresses, and documents section.

**Recommended improvement:** make this a guided process where staff enter information once, review it, upload/check documents, approve the admission, allocate an admission number, assign class/section/session and fee plan, and then collect any applicable payment. An application acknowledgment must be clearly different from a payment receipt.

### B. Monthly fee payment

The current Collect Fee page allows staff to search by admission number, student/father name, or class. The fee detail page shows a period selector, fee heads, discounts, fines, transport/hostel items, miscellaneous fees, payment date, depositor details, payment mode, and amount given.

Visible payment modes are:

- Cash.
- Cheque, with cheque number, bank, and branch.
- Online/manual modes such as POS Card, POS UPI, QR Code HDFC, NEFT, IMPS, GooglePay, and PhonePe, with transaction number.

**Recommended improvement:** before saving, show a clear review:

- Total assessed.
- Discount or concession.
- Amount being received.
- Amount allocated to each fee/month.
- Remaining balance.
- Any advance credit.
- Payment mode and reference.

The server must recalculate the amount and prevent duplicate payment if the cashier clicks twice or the internet fails after payment.

The fee ledger must preserve partial and extra payments. If a fee is ₹9,200 and the parent pays ₹9,000, the system records ₹200 as outstanding for that student. If the parent pays ₹9,500, it allocates ₹9,200 and records ₹300 as available credit. That credit is automatically applied to the same student's oldest eligible future fee and is displayed separately on the ledger and receipt.

### C. Annual charges and admission charges

The visible fee matrix separates the following:

- **Monthly:** Tuition Fee, Science Fee, Computer Fee.
- **Half-Yearly/Yearly:** Annual Maintenance Fee, Examination Fee.
- **New Student:** Registration Fee, Admission Charge.

This means an annual maintenance/examination charge should not automatically be treated as a new admission charge.

**Important school confirmation required:**

- In which month is each annual charge applied?
- Is the examination charge once a year or in installments?
- Does a promoted student pay a charge?
- What happens for internal Class X to XI admission?
- What happens for mid-year admission or leaving?
- Which charges are waived for EWS, siblings, staff children, or other categories?

### D. Fee receipt

The current fee page includes receipt history and a print action. The exact result of submitting a payment was not tested on live data.

**Recommended receipt:** show school name, receipt number, student/admission number, class, session, date, fee head/period, amount received, discount, balance/credit, payment mode, reference, collector, and authorized details. A reprint must reproduce the original receipt and must not collect money again.

### E. Promoting a student to the next class

The current system has sessions, class/section setup, a Next Class mapping, a Promoted Student fee-head type, and a visible Promote Students link. The promotion action itself was not opened or run.

**Recommended process:** create the next session, check class/stream mappings and capacity, select Promote/Retain/Graduate/Withdraw/Review for each student, preview fee changes, approve the batch, execute it once, and reconcile the result.

Teachers make the final Promote/Retain decision for students in their assigned classroom. Admin oversees the batch and resolves exceptional Graduate, Withdraw, Review, capacity, stream, or policy cases.

The old enrollment, old class, old payments, and old receipts must remain unchanged. The new class should be a new session-specific enrollment.

### F. Student leaving the school

The current Manage Student screen has Active and Stuck-off tabs and source code for strike-off and rollback actions. Those actions were not used.

**Recommended process:** record leaving request, reason, effective date, final attendance date, fees/credits/pending cheques, transport/hostel/store dues if applicable, settlement or approved exception, and certificate details. Then issue the TC/SLC if allowed.

The student should become Former/Withdrawn/Struck-off, not be permanently deleted. The identity, old enrollments, receipts, certificate, and ledger must remain available.

### G. Roles, attendance, and approvals

The replacement role hierarchy is:

- **Superadmin:** one initial account with full operational access to the school; creates, deactivates, resets, and manages Admin accounts. The initial provisioning workflow does not create Accountant/Teacher accounts directly. Only Superadmin deactivates Admin accounts. Future multi-school support can let this Superadmin manage authorized school boundaries; creating another Superadmin is outside the initial workflow.
- **Admin:** may create Admin, Accountant, and Teacher accounts; manages/deactivates Accountant and Teacher accounts; manages fee plans, school finance, attendance approvals, promotion oversight, and all school operations.
- **Accountant:** controls fee accounting, collections, receipts, outstanding balances, student credit, and reconciliation. Exceptional payment, fee, receipt, refund, or historical corrections are submitted to Admin as special-access requests.
- **Teacher:** sees only an Admin-assigned classroom, marks day-wise attendance, requests Admin approval for corrections after submission, and makes the final Promote/Retain decision for students in that classroom.

A Teacher may have no class-teacher assignment or one active class-teacher assignment per academic session. Admission number is the main school-facing student identifier for search, fees, attendance, promotion, reports, and receipts; it is unique within the school and is never reused.

---

## 5. Fee reference check

The detailed reference document contains all **51 visible class-section rows**, grouped into **15 groups with identical rates**. Each group contains the same seven fee columns shown in the current matrix.

### Visible class-wise amounts

| Class group | Monthly tuition | Science | Computer | Annual maintenance | Examination | New registration | New admission |
|---|---:|---:|---:|---:|---:|---:|---:|
| Nursery A–C, LKG A–C | ₹1,290 | ₹0 | ₹0 | ₹2,200 | ₹1,200 | ₹300 | ₹3,000 |
| UKG A–C | ₹1,290 | ₹0 | ₹0 | ₹2,400 | ₹1,200 | ₹300 | ₹3,000 |
| I A–C, II A–C | ₹1,290 | ₹0 | ₹0 | ₹2,400 | ₹1,500 | ₹300 | ₹4,000 |
| III A–C | ₹1,300 | ₹0 | ₹50 | ₹2,400 | ₹1,500 | ₹300 | ₹4,000 |
| IV A–C | ₹1,300 | ₹0 | ₹50 | ₹2,400 | ₹1,500 | ₹300 | ₹5,000 |
| V A–D | ₹1,610 | ₹0 | ₹50 | ₹2,400 | ₹1,500 | ₹300 | ₹5,000 |
| VI A–D | ₹1,610 | ₹0 | ₹100 | ₹2,400 | ₹1,500 | ₹300 | ₹6,000 |
| VII A–D | ₹1,680 | ₹0 | ₹100 | ₹2,400 | ₹1,500 | ₹300 | ₹6,000 |
| VIII A–D | ₹1,740 | ₹0 | ₹100 | ₹2,400 | ₹1,500 | ₹300 | ₹6,000 |
| IX A–C | ₹1,830 | ₹100 | ₹100 | ₹2,400 | ₹1,500 | ₹300 | ₹7,000 |
| X A–C | ₹1,890 | ₹100 | ₹100 | ₹2,400 | ₹2,000 | ₹0 | ₹0 |
| XI Science Math/Bio | ₹2,300 | ₹150 | ₹100 | ₹2,400 | ₹2,000 | ₹300 | ₹9,500 |
| XI Commerce A–B | ₹2,280 | ₹0 | ₹100 | ₹2,400 | ₹2,000 | ₹300 | ₹9,500 |
| XII Science Math/Bio | ₹2,430 | ₹150 | ₹100 | ₹2,400 | ₹2,000 | ₹0 | ₹0 |
| XII Commerce A–B | ₹2,410 | ₹0 | ₹100 | ₹2,400 | ₹2,000 | ₹0 | ₹0 |

### Fee values that need confirmation

| Point found during cross-check | Why it needs a decision |
|---|---|
| Matrix Registration Fee is usually ₹300, but a miscellaneous collection choice shows Registration Fee ₹500 | They may be different charges, or one may be outdated. Give them separate names/codes. |
| Annual last date displays 26 April 2027, while the current session ends 31 March 2027 | Confirm whether this date is intentional or a configuration error. |
| Fee settings include Promoted Student but the visible matrix does not show a separate promoted column | Confirm whether promoted students use regular, annual, new, or special rates. |
| Late-fine amount input was blank but the label says 0 disables it | Confirm whether late fine is disabled, blank, or incomplete. |
| Transport setting says “Not Work in Mid Session” | Define how mid-year route changes and transport charges should work. |
| The current fee screen allows amount fields and client-side totals | New system must verify all totals on the server before posting money. |

The full rate table and all observed dropdown choices are in `reference-data.md`.

---

## 6. Changes recommended before or during development

These are the changes that should be treated as necessary for a reliable new system.

| Priority | Change | Reason |
|---|---|---|
| **Must** | Use one clear name for each type of receipt: application acknowledgment, prospectus/registration receipt, admission payment receipt, fee receipt | The current menu has duplicate Payment Receipt labels and an inconsistent Postal Dispatch heading |
| **Must** | Keep a permanent student identity and create a separate enrollment for each session/class | Prevents old classes, receipts, and history from being overwritten |
| **Must** | Use versioned fee plans with clear head, frequency, applicability, month, due date, and effective session | Prevents annual/admission/monthly confusion |
| **Must** | Add payment review, server-side calculation, duplicate prevention, and receipt snapshot | Protects school money during double clicks, retries, and network failure |
| **Must** | Replace permanent deletion with dated withdrawal/strike-off and linked TC/SLC process | Preserves student history and financial records |
| **Must** | Make promotion a previewable batch with Promote/Retain/Graduate/Withdraw/Review outcomes | Prevents class-year mistakes and duplicate enrollments |
| **Must** | Add day-close and reconciliation for cash, cheque, manual online payments, refunds, and corrections | Lets the accountant verify the school’s money every day |
| **Must** | Keep an audit history for all financial, student, permission, promotion, and withdrawal changes | Shows who changed what, when, and why |
| **Should** | Replace very large dropdown lists with searchable student/class selection and pagination | Improves speed and reduces wrong-student selection |
| **Should** | Add a Student 360 page joining profile, enrollment, fee, receipts, documents, services, and timeline | Reduces movement across many separate menus |
| **Should** | Fix broken/unclear menu items and visible PHP/template errors | Increases staff confidence and reduces incorrect actions |
| **Should** | Use role-specific dashboards and defined report totals | Current application dashboard contains generic template content |
| **Must** | Four-role hierarchy, optional class-teacher assignment, day-wise attendance, and Admin-approved attendance corrections | Matches confirmed school responsibilities |
| **Must** | Final Teacher Promote/Retain decisions without a second Admin academic approval | Preserves teacher authority; Admin prepares sessions and resolves operational exceptions |
| **Must** | Hostel fees, remaining fee balances, and automatic same-student credit | Keeps service charges and all received money traceable |
| **Later** | Add parent portal, gateway payments, store, full Admin-only finance, exams, communication, and learning modules after core validation | These modules need further detailed discovery |

---

## 7. Cross-check results

The following references were checked together before preparing this report:

| Document | Cross-check performed | Result |
|---|---|---|
| `feature-audit.md` | Compared visible module list, workflows, issues, evidence register, and limitations | E01–E40 are listed; verified/inferred/unavailable/proposed labels are used |
| `reference-data.md` | Compared session data, class groups, dropdowns, fee heads, payment fields, and certificate fields | All 51 class-section rows are represented by 15 matching rate groups |
| `prd.md` | Compared required product behavior with school workflows and acceptance scenarios | Core admission, fee, receipt, reporting, promotion, leaving, and migration requirements are present |
| `trd.md` | Compared technology, data model, payment controls, APIs, migration, backup, and testing with PRD | Technology and financial-safety recommendations align with PRD; Recharts was added for dashboard charts |
| `design.md` | Compared screen flow and labels with PRD and observed legacy screens | Student search, fee collection, receipts, admissions, withdrawal, promotion, reports, and import screens are covered |
| `roadmap.md` | Compared phases, school decisions, go-live checks, and implementation order with all other documents | Roadmap starts with decisions, prototype, fee/payment slice, migration rehearsal, and UAT |
| `README.md` | Checked the document index and conclusions against the complete pack | This report has been added to the index |

### Items deliberately marked as not confirmed

The following legacy behaviors were not tested by changing live data and therefore require staging or school confirmation. The replacement policies confirmed above are product requirements, not claims about completed legacy transactions:

- Whether an approved admission automatically becomes an active student.
- Exact admission/registration/prospectus payment process.
- Actual behavior after submitting a fee payment.
- Receipt numbering and printed format.
- Partial payments, advance credits, cheque clearance, bounce, reversals, and refunds.
- Promotion execution and rollback.
- Strike-off, restoration, clearance, and TC/SLC issuance.
- Finance automatic posting and reconciliation.
- Whether every menu item is actively used by the school.

This distinction is important: the report does not present an untested assumption as an existing feature.

---

## 8. School approval checklist

Please mark **Approved**, **Change required**, or **Need more discussion** beside each point.

### Fees and accounts

- [ ] Approve monthly rates for every class/section.
- [ ] Approve annual maintenance and examination fees and the exact charge month(s).
- [ ] Approve new-student registration and admission charges separately.
- [ ] Explain the ₹300 matrix registration fee versus ₹500 miscellaneous registration choice.
- [ ] Approve promoted-student, internal X→XI, XII, readmission, and mid-year rules.
- [ ] Approve EWS, sibling, staff-child, and other concession rules.
- [ ] Approve fine amount, due dates, grace period, and waiver authority.
- [x] Partial payments leave outstanding balances; extra payments create same-student credit applied automatically oldest-eligible-first.
- [ ] Confirm cross-session eligibility, fee-head allocation ties, and any old-session collection block.
- [ ] Approve cheque, online/manual payment, bounce, refund, and correction rules.
- [ ] Approve receipt series, numbering, cancellation, reprint, and provisional cheque receipt policy.

### Student lifecycle

- [x] Admission number is the unique, non-reusable primary school-facing student identifier.
- [x] Hostel fees and dated assignments are included in core scope.
- [x] Teacher makes final Promote/Retain decisions for the assigned classroom.
- [ ] Approve what makes a student officially enrolled.
- [ ] Approve admission-number allocation and historical numbering.
- [ ] Approve promotion, retention, graduation, stream choice, and capacity rules.
- [ ] Approve withdrawal/strike-off/restore/readmission definitions.
- [ ] Approve clearance requirements and TC/SLC fields, signatures, and numbering.
- [ ] Decide whether transport, hostel, store, or finance balances affect clearance.

### Accounts and attendance — confirmed requirements

- [x] One school and one Superadmin initially; retain future school scoping.
- [x] Superadmin inherits all access and may create/manage/reset/deactivate Admin accounts.
- [x] Admin inherits Accountant/Teacher access and may create Admin, Accountant, and Teacher accounts; only Superadmin deactivates Admin accounts.
- [x] Admin manages/deactivates Accountant and Teacher accounts and may make an audited Accountant/Teacher role change; no role-change workaround may remove an Admin.
- [x] Admin manages fee plans and full school finance; Accountant handles fee accounting and requests exceptional corrections.
- [x] Teacher may have zero or one active class-teacher assignment per academic session, assigned by Admin.
- [x] Attendance is day-wise; Teacher corrections after submission require Admin approval.

Checked items record product-owner decisions from 12 October 2026; unchecked items remain school implementation inputs.

### Data and rollout

- [ ] Provide an authorized vendor export sample and data dictionary.
- [ ] Decide detailed history migration versus opening balances plus reference-only history.
- [ ] Provide current control totals for students, enrollments, dues, credits, payments, and receipts.
- [ ] Approve the first-release modules and continuity process for later modules.
- [ ] Nominate school testers and a final decision owner.
- [ ] Approve printer formats, hosting budget, backups, support contact, and rollout window.

### School comments

| Topic | School comment / required change | Owner | Date |
|---|---|---|---|
| Fees |  |  |  |
| Admissions |  |  |  |
| Payments/receipts |  |  |  |
| Promotion/leaving |  |  |  |
| Migration |  |  |  |
| Other |  |  |  |

---

## 9. Technology plan in simple language

The proposed system uses a modern web application. Staff will open it in a browser; the school will not need to install a separate program on every computer.

| Part | Technology | What it does in simple terms |
|---|---|---|
| Frontend | **Next.js + React + TypeScript** | The screens, forms, tables, search, navigation, and staff experience |
| User interface styling | **Tailwind CSS** | Consistent spacing, colors, responsive layouts, and print-friendly styling |
| Accessible controls | **Radix/shadcn-style components** | Reliable buttons, dialogs, tabs, menus, focus behavior, and keyboard support |
| Large tables | **TanStack Table** | Searchable, sortable, filterable, paginated student, fee, receipt, and report tables |
| Forms and validation | **React Hook Form** | Fast forms with clear validation and fewer data-entry mistakes |
| Charts | **Recharts** | Dashboard charts such as admissions, collections, dues, enrollment, and attendance; charts only display data and do not calculate official money totals |
| Backend/API | **NestJS + TypeScript** | The rules behind the screens: permissions, admissions, fees, payments, receipts, reports, and workflows |
| Database | **PostgreSQL** | The main secure record store for students, enrollments, fee obligations, payments, receipts, users, and history |
| Database access | **Prisma plus reviewed SQL migrations** | Connects the backend safely to the database and manages structural changes |
| Background work | **pg-boss or another PostgreSQL-backed job queue** | Handles PDFs, imports, exports, reminders, and other long tasks without blocking payment saving |
| File storage | **Private S3-compatible storage** | Stores photos, documents, receipt PDFs, certificates, and export files securely |
| PDF documents | **HTML/CSS templates rendered by Playwright/Chromium** | Produces consistent A4 receipts, certificates, reports, and printouts |
| API documentation | **REST/OpenAPI** | Documents how the screens and backend communicate and makes testing easier |
| Testing | **PostgreSQL integration tests and Playwright browser tests** | Checks money calculations, permissions, duplicate payments, reports, printing, and complete workflows |
| Hosting | **Render Next.js web service, NestJS API, worker, and PostgreSQL** | Separate frontend/backend deployment, managed TLS, persistent database, and durable background jobs |
| Availability monitoring | **Render HTTP health check plus external uptime monitor** | Checks `/health` every five minutes externally; alerts the technical owner on downtime and recovery |

### Why PostgreSQL for this school ERP?

Fees and receipts require reliable transactions. PostgreSQL is suited to:

- Preventing two staff members from collecting the same dues incorrectly.
- Keeping payment, allocation, receipt, and accounting records together.
- Maintaining history instead of silently replacing old class or fee information.
- Producing reliable reports and supporting backups/restoration.

### What is not being decided yet

Render is the deployment target under evaluation. Its compute/database plans and budget, payment gateway, SMS/WhatsApp provider, domain, backup retention, and printer model remain implementation choices. Uptime-monitor provider and alert destination must be configured at deployment.

### Render sleeping, health checks, and uptime alerts

Official Render documentation was checked on 12 October 2026:

- Free web services spin down after 15 minutes without inbound traffic; waking normally takes about one minute.
- Render's built-in health check detects unhealthy running instances; it is not the external keep-awake monitor.
- Configure an external monitor (for example, UptimeRobot) to send an HTTPS GET to `/health` every five minutes and alert on failure and recovery. These inbound requests can keep a Free demo backend active while they continue; monitor interruptions and Render restarts/limits can still cause downtime or cold starts.
- The frontend must show a waking/reconnecting state and recover the original payment command after a timeout instead of posting a second payment.
- Free hours are shared across web services (750 per workspace/month). Keeping both Next.js and NestJS awake all month can exceed that allowance. A dynamic Next.js frontend is itself a web service; its availability must also be monitored.
- Render local files are ephemeral. Student files, receipts, and certificates belong in private object storage; sessions, balances, requests, and jobs belong in PostgreSQL.
- Free Render Postgres expires after 30 days and has no managed backups. Background workers have no Free instance. A monitor does not solve these limits. Paid always-on services and a recoverable database remain the production recommendation; this is a hosting recommendation, not a purchase already approved.

Sources: [Free services](https://render.com/docs/free), [health checks](https://render.com/docs/health-checks), [background workers](https://render.com/docs/background-workers), and [database recovery](https://render.com/docs/postgresql-backups).

---

## 10. Recommended roadmap

### Step 1 — School decision meeting

Principal, accountant, admissions operator, and administrator review this report and decide the checklist items.

### Step 2 — Prototype with fake data

Build and test only:

> Search student → see dues → select fee periods → review payment → save payment → view receipt.

Use fictional student data. Test cash, partial payment, annual charge, discount, previous-session due, timeout/retry, and receipt reprint.

### Step 3 — Build the safe foundation

Start Level 1 with login, the four-role hierarchy, single-school setup, sessions/classes, user management, classroom assignment, audit, Render readiness endpoints, and uptime alert configuration. Then add admission-number identity, families, enrollment, fee plans, and payment calculations.

### Step 4 — Add the complete core lifecycle

Add admissions, concessions/fines, receipts, partial balances and credit, transport/hostel charges, Accountant correction requests, teacher day-wise attendance, Admin-approved attendance corrections, final teacher promotion decisions, reports, withdrawal/TC, and rollover.

### Step 5 — Migrate in a test environment

Import an authorized data copy, compare student counts and financial totals, investigate every mismatch, and ask the school to approve the results.

### Step 6 — School testing and training

Use actual staff roles and sample tasks. Check screen speed, admission-number identification, calculations, receipt printing, day-wise attendance, correction approval, teacher promotion decisions, reports, permissions, and backup restoration.

### Step 7 — Production cutover

Use an agreed legacy freeze/final export, reconcile the final changes, activate one authoritative collection system, support the office closely, and reconcile collections every day during initial operation.

### Step 8 — Add later modules

After the core is stable, add parent access, online gateway payments, communication, store, full Admin-only finance, exams, timetable, HR, and learning modules according to actual school priority.

### Development levels and feature introduction

| Level | First features introduced | Exit demonstration |
|---|---|---|
| 0 — Inputs/prototype | Confirmed roles, remaining fee-rate inputs, receipt samples, export sample, core mock-ups | School examples mapped to requirements |
| 1 — Foundation | Login, one Superadmin, Admin/Accountant/Teacher management, hierarchy, sessions/classes, optional teacher assignment, audit, Render health and uptime monitoring | Admin creates users; Teacher sees only assigned class; downtime/recovery alerts tested |
| 2 — Students/admissions | Admission-number registry, applications, guardians, siblings, documents, Student 360, enrollment history | Admit and find a student by admission number |
| 3 — Fees/services | Admin fee plans, assessments, concessions/fines, hostel/transport charges, ledger, balance/credit calculations | Approved bills and service cutoffs calculate correctly |
| 4 — Payments | Cash/manual bank/cheques, partial payments, automatic credit allocation, receipts, correction approvals, fee reports and day close | ₹9,200/₹9,000 and ₹9,200/₹9,500 cases reconcile |
| 5 — Teacher workflows | Day-wise attendance, submitted-mark correction approval, final Promote/Retain decisions | Teacher cannot access another class; Admin approves a correction |
| 6 — Oversight/lifecycle | Dashboards, reports, promotion execution, withdrawal/readmission, certificates, service clearance | Teacher decisions execute once with history retained |
| 7 — Rollout | Reconciled migration, permission/load checks, backup restore, Render deployment, staff UAT/training | Rehearsed cutover and operational alerts |
| 8 — Extensions | Parent/gateway/reminders, fuller transport/hostel operations, Admin-only school finance, store, exams, HR, front office, timetable, learning/biometric discovery | Separate requirements and estimates for each module |

Level 3 defines balance/credit calculations; Level 4 introduces actual payment posting. Import discovery and hosting prototypes start early rather than waiting until Level 7. Full finance means income, expenses, accounts, vouchers, and day book; Accountant access remains limited to fee accounting.

---

## 11. Documents for detailed technical review

School staff do not need to read the technical documents line by line. They are included for the development team and future approvals:

- `feature-audit.md` — complete existing-ERP inventory and evidence register.
- `reference-data.md` — detailed current values and field reference.
- `prd.md` — exact product requirements and acceptance tests.
- `design.md` — screen layouts, user journeys, labels, and print design.
- `trd.md` — technology, database, payment safety, migration, hosting, backup, and testing.
- `roadmap.md` — implementation phases, owners, decisions, and go-live gates.

## 12. Final recommendation

**Approve the discovery direction, but approve the fee rules and migration approach only after the accountant/principal complete the checklist.** Begin with a fake-data fee collection prototype and a school review session. Do not begin importing live student/payment data or accepting production payments until the school signs off the financial rules, migration reconciliation, permissions, receipt formats, backups, and go-live test results.

**Report status:** Ready for school review and comments. Not a production approval until the checklist is completed.
