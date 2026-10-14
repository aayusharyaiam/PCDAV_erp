# Design specification — improved school ERP

**Version:** 0.5, revised 14 October 2026

**Status:** target UX/UI specification with implemented synthetic-demo routes and explicit remaining production gaps
**Requirements:** [prd.md](prd.md)  
**Existing-system evidence:** [feature-audit.md](feature-audit.md)

## Current staging screens versus target design

The staff app now includes `/applications`, `/students`, `/academic`, `/users`, `/audit`, `/fees/plans`, `/fees/ledger`, `/services`, `/transport`, `/store`, `/fees/collect`, `/receipts`, `/cashier`, `/finance/requests`, `/finance/policy`, `/reports` and `/statements`. Screen specifications below describe the complete target experience, not all current UI capabilities.

- Collection uses admission-number search, server quote/review, automatic or selected fee/store allocation, partial/advance credit, cash change, verified manual electronic capture and pending cheque capture. Selection is available for the synthetic demo; school-specific allocation rules still require approval.
- Payment and partial-refund retries preserve the original payload/key after uncertain responses, including reload. A rejected retry does not disprove an earlier commit. Corrupt payment recovery storage blocks a fresh collection until its outcome is resolved.
- `/receipts` combines issued snapshots, pending cheque actions, Accountant correction requests, Admin decisions, reasoned browser reprints and current-status PDF status/download/retry. The PDF worker is bounded inside the API for the synthetic demo; production object storage/worker and printer approval remain open.
- `/cashier` provides shift opening, server expected cash, deposits, handovers, Admin expenses, counted cash and variance close. `/reports` and `/statements` provide the current demo reconciliation views; statutory/report acceptance remains pending.
- Role-aware navigation and API authorization are implemented; the shell's school/session display is still a staging label, not a dynamic historical context selector. Rich dashboard metrics, Student 360 financial tabs, attendance, promotion, leaving and certificate screens remain target work.
- Verification: 33 mocked browser contract tests plus one live synthetic collection/store/receipt/approval/report/PDF/close flow pass. Existing Level 1–3 mobile checks are earlier evidence; physical print, full accessibility and school usability approval remain open. See [PROGRESS.md](PROGRESS.md).

## 1. Design direction

Design an efficient **school-office workspace**: calm, readable, keyboard-friendly, with clear student identity and financial context. Prioritize tasks over the legacy menu hierarchy.

Core principles:

1. Student search and Collect Fee are always easy to reach for authorized cashiers.
2. School, academic session and historical context remain visible.
3. Show **what is owed, what is being paid, and what remains** as separate values.
4. Keep new admission, recurring annual fees, monthly fees, transport fees, and hostel fees visibly distinct.
5. Use plain task labels: “Withdraw student”, “Promote students”, “Reprint receipt”, “Record payment”.
6. Critical edits have explicit save/review and field-level explanations.
7. Errors preserve user input and explain recovery, particularly after a payment timeout.
8. Every important screen links to the underlying student, transaction and history.
9. Admission number is the primary student identifier on search, fee, attendance, promotion, and printed screens.
10. Role boundaries are visible: Superadmin, Admin, Accountant, and Teacher see only the tasks and data permitted to them.

The legacy review inspected HTML and scripts rather than rendered screenshots. This design is an improved proposal, not a pixel-accurate reproduction of the existing portal.

## 2. Information architecture

```text
Home
  Role-specific dashboard
Admissions
  Applications / enquiries
  Follow-ups
  New registration
  Admission decisions
Students
  Directory
  Student 360
  Families / siblings
Fees & Payments
  Collect fee
  Receipt register
  Outstanding & arrears
  Concessions / fines
  Pending payments / cheques
  Reversals / refunds
  Cashier day close
Lifecycle & Documents
  Promotion batches
  Withdrawals / struck-off
  Certificate requests / issued documents
Services
  Transport assignments
  Hostel assignments
Reports
  Collections / financial controls
  Student / admission / enrollment reports
  Service reports
Administration
  Sessions / classes / subjects
  Fee plans / fee heads
  School / document templates
  Users / roles
  Imports / audit
Attendance
  Assigned-class attendance
  Attendance correction requests
Later modules
  Store / Full Finance / Exams / Front Office / Employees / Communication / Timetable / Learning
```

Navigation is permission-filtered. Core menu names are unambiguous; there should not be two unrelated entries called “Payment Receipt”.

## 3. Application shell

- Desktop sidebar: approximately 240 px expanded, icon rail when collapsed.
- Top bar: school identity, session selector, universal search, help and signed-in role/user.
- Session selection changes the user's **view context**. Changing the school's operational default is a separate administrative action.
- When viewing an old session, show a persistent neutral banner: `Viewing 2025–2026 · Historical session`.
- Content header: breadcrumb, task title, secondary description, one primary action, optional overflow actions.
- Student pages include an identity strip: photo/initials, display name, admission number, current class, session, status, family link.
- Transaction screens keep identity and totals visible while scrolling.
- Avoid decorative dashboard widgets without a school task or verifiable metric definition.

## 4. Visual foundation

### Tokens

| Token | Proposed value / treatment |
|---|---|
| Canvas | `#F8FAFC` |
| Surface | `#FFFFFF` |
| Primary/navy | `#1E3A5F` |
| Primary hover | `#172E4D` |
| Text | `#0F172A` |
| Secondary text | `#475569` |
| Border | `#CBD5E1` |
| Success | `#047857`, with pale green surface and text/icon |
| Warning | `#92400E`, with pale amber surface and text/icon |
| Error/danger | `#B91C1C`, with pale red surface and text/icon |
| Focus | Visible 2–3 px blue outline, offset from component |
| Radius | 6–8 px controls; 10–12 px cards |
| Spacing scale | 4, 8, 12, 16, 24, 32 px |
| Body font | Inter or system sans-serif; Devanagari-capable fallback when needed |
| Body size | 14–16 px; financial totals 24–32 px |
| Numeric presentation | Tabular numerals; right-aligned amounts; Indian grouping and ₹ symbol |

Verify contrast in the implemented components; color must never be the only status indicator. School-approved logo/brand colors can refine these tokens without changing information hierarchy.

### Components

- Searchable combobox with server-side lookup, keyboard selection, and clear identifying secondary text.
- Data table with stable header, column controls, sort, filter chips, pagination and export permission.
- Money input showing INR and explicit validation; no spinner-based amount changes.
- Date input that accepts typed dates and provides a calendar; format example always visible.
- Status badge with readable text: Active, Pending, Overdue, Captured, Cheque pending, Voided, Withdrawn.
- Timeline for application, enrollment, payment and document events.
- Review panel showing before/after values and financial effects.
- Inline error summary at top plus linked field errors; focus first invalid field.
- Summary cards with labeled time range and drill-down, not unexplained totals.
- Receipt preview with explicit Preview/Issued/Reprint state.

## 5. Screen inventory and traceability

| Screen ID | Screen / route (target unless noted) | Primary requirements |
|---|---|---|
| S01 | Home `/dashboard` | REP-01, REP-03 |
| S02 | Applications `/applications` (staging) | ADM-01 |
| S03 | Registration form within `/applications` (staging); full wizard target | ADM-02 |
| S04 | Admission review `/applications/:id` (staging) | ADM-03, ADM-04 |
| S05 | Student directory `/students` | STU-01, STU-02 |
| S06 | Student 360 `/students/:id` | STU-01, STU-03 |
| S07 | Fee collection `/fees/collect` | PAY-01–PAY-04 |
| S08 | Receipt detail/register `/receipts` | PAY-05, PAY-06 |
| S09 | Student fee ledger `/fees/ledger` (staging); richer dues target | FEE-04, REP-01 |
| S10 | Fee-plan builder `/fees/plans` (staging) | FEE-01, FEE-02 |
| S11 | Concessions/fines `/fees/adjustments` | FEE-03, FEE-05 |
| S12 | Pending cheques within `/receipts` (staging) | PAY-03, PAY-06 |
| S13 | Cashier shifts `/cashier` (staging); full day-close target | REP-02 |
| S14 | Promotion wizard `/lifecycle/promotions` | LFC-01 |
| S15 | Withdrawal wizard `/lifecycle/withdrawals` | LFC-02, LFC-03 |
| S16 | Documents `/documents` | DOC-01, DOC-02 |
| S17 | Services `/services` | SRV-01, SRV-02 |
| S18 | Reports `/reports` | REP-01–REP-04 |
| S19 | Users/settings `/settings` | FND-01–FND-05 |
| S20 | Import/reconciliation `/settings/imports` | MIG-01–MIG-03 |
| S21 | Teacher attendance `/attendance` | ATT-01–ATT-03 |
| S22 | Promotion decisions `/attendance/promotion-decisions` | ATT-04, LFC-01 |
| S23 | Special-access requests `/access-requests` | FND-05, PAY-06 |
| S24 | Transport management `/transport` | SRV-01, SRV-02 |
| S25 | Store management `/store` | Inventory/issues and shared payment settlement in staging; full financial release follows PAY-01–PAY-06 |
| S26 | Finance requests `/finance/requests` | FND-05, PAY-06; Accountant request and Admin/Superadmin decision |
| S27 | Finance policy `/finance/policy` | FEE-01, PAY-01, PAY-05; versioned synthetic demo defaults |
| S28 | Statements `/statements` | STU-01, REP-01; fee/store/payment/credit lineage |

## 6. Core screen specifications

### S01 — role dashboard

**Accountant:** search by admission number, Collect Fee, today's captured collection by mode, pending cheque count, remaining balances, student credit, recent receipts, open shift/day-close status, and special-access requests.

**Admissions:** follow-ups due, submitted applications awaiting review, confirmed-but-not-enrolled, seats by class, missing documents.

**Admin:** active enrollment, new admissions, collection trend, overdue balances, student credit, outstanding approvals, attendance-correction requests, teacher promotion decisions, and lifecycle exceptions.

**Teacher:** assigned classroom, today's attendance, incomplete attendance, correction-request status, and Promote/Retain decision status for the assigned classroom.

**Superadmin:** school-wide administration, Admin account management, role/permission activity, system health, and all Admin dashboard capabilities.

Every count shows its period/scope and links to the matching filtered list. A separate loading/error state must prevent an API failure from appearing as a zero balance.

### S02–S04 — admission pipeline and wizard

Pipeline list columns: application ID, student name, applied class/session, guardian/contact, stage, document status, next follow-up, assigned staff. Filters: session, stage, applied class, source, date, follow-up state.

Wizard steps:

1. Student and applied class/session.
2. Guardians/contact and verified sibling link.
3. Addresses, previous school and optional supporting information.
4. Required documents checklist.
5. Review and submit.

Save draft visibly; show mandatory/optional fields and conditional guardian requirements. Duplicate suggestions show enough information to identify the match without automatically merging.

Admission decision view shows stage history, verification, class/section capacity, fee category, admission date, and proposed new-admission charges. Action labels are explicit: `Approve application`, `Confirm enrollment`, `Collect first payment`.

An acknowledgment and paid receipt have separate preview links and names.

### S05 — student directory

```text
Students                         Session [2026–2027 v]   [+ New admission]
[Admission no., student, guardian or mobile.......................]
[Class v] [Section v] [Status v] [Fee category v]     Clear filters

Admission no. | Student | Class | Guardian | Status | Due/Credit | Action
ADM-001       | Sample  | VI A  | Sample   | Active | ... | Open

25 per page      1–25 of filtered total             < Previous Next >
```

Former students remain searchable. Mobile prioritizes admission number, name, class/status and Open; secondary columns move into an expandable row.

### S06 — Student 360

Header: identity/admission number, class/session/status and financial summary. Admission number is the primary identifier. Primary action depends on role: Collect Fee, Edit Profile, Mark Attendance, Review Request, or View Promotion Decision.

Tabs:

- Overview: essential profile, contacts, warnings needing action.
- Enrollment history: every session/class placement and outcome.
- Fees & ledger: charges, allocations, pending payments, available credit, running balance.
- Receipts: immutable issued documents and status.
- Family: guardians, communication preference and verified siblings.
- Services: transport/hostel dated assignments and fee status.
- Documents: uploaded/verified files and issued certificates.
- Timeline: auditable profile/lifecycle events.

Sensitive identity/bank/medical fields are permission-controlled and masked where appropriate. Fee staff should not need to open all sensitive profile details to collect a payment.

### S07 — fee collection workspace

Use a desktop split layout: student/charges on the left (~65%), payment summary on the right (~35%). On narrow screens, stack sections and retain a compact sticky summary/action footer.

```text
Collect Fee                    School: PDAV        Session: 2026–2027
[Find admission no., name, guardian or mobile........................]

Sample Student · ADM-001 · VI A · Active           [Open student]
Previous-session dues [₹0]   Available credit [₹0]   Pending [₹0]

CHARGES                                  PAYMENT SUMMARY
Period [October 2026 v]                   Gross charges       ₹1,710
Head             Amount  Concession Net  Concessions            ₹100
Tuition           1,610      100   1,510  Net due              ₹1,610
Computer            100        0     100
                                         Receiving amount   [1,600]
[+ Add approved fee]                     Remaining due          ₹10
                                         Mode [Cash v]
Annual / admission / transport / hostel charges
[Separate eligible items, if any]        Tendered          [2,000]
                                          Change                 ₹400
                                         Date [04/10/2026]
                                         Depositor [............]
                                         Phone     [............]
                                         [Review payment]
```

All data in this wireframe is synthetic. The totals intentionally distinguish assessed amount, concession, receipt amount, cash tender and remaining due.

**Interaction rules:**

- Choose the student before entering money; show name, admission number and class throughout.
- Clearly label selection as months/obligations to pay, not a vague “number of months”.
- Separate prior-session arrears, annual charges, admission charges, transport charges, and hostel charges from the monthly list.
- Show the approved allocation order, apply eligible student credit first, and provide a permitted override with a reason if policy allows.
- Manual electronic and cheque modes reveal only their relevant fields.
- “Review payment” shows final amount, mode, allocation, remaining due/credit and depositor. Confirmation button reads `Record ₹1,600 payment`.
- After submission, display `Recording…`. On timeout, display `Checking payment status…`; query the original command before offering a retry.
- Success displays receipt number and Print/Download; next student is a separate clear action.
- No local success message without a committed server result. A queued render should show `Payment recorded · PDF preparing`; a failed job must show an explicit retry path without changing the payment. Neither state means the payment failed.

### S08 — receipt register/detail

Filters: receipt number, student, dates, session, mode, collector, status. Columns: number/date, admission/student, period, actual received, mode, status, actions.

Detail shows original snapshot, linked allocations/payment, related reversals/refunds and activity. Primary actions: Print original / Download. Authorized correction is in a clearly labeled menu, never a generic trash icon.

Voided receipt remains in search with reason and original number. Refund information is linked; do not silently change “received” on the original document.

### S09/S11/S12 — balances and adjustments

- Outstanding separates overdue, current not-yet-due, future assessed, prior-session dues, transport/hostel dues, and unapplied student credit.
- Concession/fine form: student/group, head, recurrence/period, amount/rate, effective dates, reason and policy-required authority.
- Preview affected students and totals before a bulk assignment; report exceptions individually.
- Pending payments list: cheque/reference, student, amount, submitted date, status, verification/clearance actions and history.
- Reversal/refund dialog shows exact original payment, balance effect, amount/mode/reference and reason. Authority follows school policy; roles without it see request status.

### S10 — fee-plan builder

Tabs: Overview, Rules, Class matrix, Assessment preview, Versions.

Only Admin/Superadmin sees fee-plan create/edit/publish actions. Accountant views the published plan; Teacher has no fee-plan access. Student 360 financial tabs and financial totals are absent from Teacher responses as well as the UI.

Matrix rows are class/category and columns are named heads with frequency badges. Recurrence configuration separately records dates/occurrences and eligibility. Never encode admission-vs-annual behavior only in a column label.

Publishing shows version, effective dates, classes/students affected, changed amounts and any existing obligations requiring explicit adjustments. Invalid schedules, ambiguous registration heads and dates outside allowed policy are highlighted.

### S13 — cashier day close

Show opening float, captured cash, cash refunds/outflows, deposits/handovers, expected cash, counted cash and variance. Cheque pending and verified bank payments are separate panels.

List unmatched/exception transactions with drill-down. Closing requires reason for variance and the configured authority. A closed shift shows original close and later correction history.

### S14 — promotion wizard

1. Source/target session.
2. Class/stream mappings and target fee plans.
3. Load final Teacher decisions: Promote or Retain; Admin resolves Graduate, Withdraw, Review, and exceptional cases.
4. Exceptions: duplicates, capacity, missing targets/plans, pending decisions, debt policy.
5. Review counts and financial effects.
6. Execute and track per-student progress/results.

Teacher decisions are final without a second Admin academic approval. Admin validates execution readiness (target session, plan, capacity, exceptions); readiness must not be labelled approval of the Teacher decision. An Admin correction retains the original decision and records a reason.

Bulk selection never hides exclusions. X→XI stream choice and XII graduation are explicit. Final page reports completed/failed/skipped with downloadable reconciliation.

### S15 — withdrawal / strike-off wizard

1. Select student and action type.
2. Record request, reason, last attendance/effective date.
3. Financial review: dues, credits, pending cheques, transport/hostel/store balances.
4. Charge/service cutoff and adjustments; approved settlement exception if applicable.
5. Review and authorize.
6. Certificate issue/handover.

Show a concise impact summary: active roll status, future billing, services ended, amount remaining and documents to issue. Use `Confirm withdrawal` rather than “Delete student”.

### S16 — document workspace

Separate request, draft preview and issued document lists. Support Review → Approved → Issued and configured handover stages. Number allocated only at issuance. Show status, issuer, date, latest valid version and original/reprint links.

TC fields are prefilled from the appropriate historical enrollment; any override is highlighted and justified. A student's current class must not silently replace their last class on an old TC.

### S21/S22 — Teacher attendance and promotion decisions

- Teacher landing page shows the assigned classroom, academic session, and date.
- Teacher can mark day-wise present/absent status for students in that classroom using admission number and student name as identifying text.
- After submission, a Teacher cannot silently edit attendance. A correction request records the date, student, original value, proposed value, reason, and submitted time.
- Admin receives a notification, reviews the before/after values, and approves or rejects the correction. The original event remains in the timeline.
- Teacher records the final Promote or Retain decision for each student in the assigned classroom. The decision is visible to Admin for batch oversight and reconciliation.
- API authorization denies a Teacher access to another classroom even if a URL or student ID is manually changed.

### S23 — Special-access requests

- Accountant selects the student by admission number and submits a request for an exceptional fee, payment, receipt, refund, or historical correction.
- The request shows the original values, requested values, reason, financial impact, and supporting reference.
- Admin receives a notification and can approve or reject. Approved actions create linked compensating/audited entries rather than silently rewriting history.
- Notification badges and request lists are in-app core features. An approval authorizes only the displayed record/action/version once; it does not unlock all financial edits for the Accountant.

### S20 — import and reconciliation

Steps: Upload authorized export → identify source/version → map fields → validate → review duplicates/exceptions → reconcile control totals → execute approved import → results.

Show imported/skipped/rejected counts, source IDs, errors, amount differences and decision owner. Dry run is visually distinct from commit. “Import complete” is not shown while unexplained financial differences remain.

## 7. Print and document design

### Fee receipt — proposed structure

```text
[School logo]  APPROVED SCHOOL NAME
               Address · Contact · Approved identifiers
                         FEE RECEIPT
Receipt no. __________      Issue date/time __________
Payment date __________     Session __________________
Student _____________       Admission no. ____________
Class/section _______       Depositor _________________

Head / fee period        Assessed   Adjustment   Allocated paid
-------------------------------------------------------------
...
-------------------------------------------------------------
Amount received ₹______    Applied to dues ₹______
Advance credit ₹_______    Remaining due as of issue ₹______
Amount in words _____________________________________________
Mode/submode __________    Payment reference _________________
Collected by __________    Authorized signature / stamp area
Verification reference / approved receipt notes
```

- Final receipt must distinguish the actual money received from gross assessed amounts.
- Original issue date/time, payment business date and print/reprint date are distinct.
- Default A4 with print margins, high-contrast black text and repeating table headers; prevent clipped totals or broken number lines.
- School/parent duplicate copies, A5 or thermal formats depend on actual office printers and sample approval.
- No Aadhaar, bank account or unnecessary medical/family data on receipts.
- Optional verification QR must use a non-guessable/signed reference and reveal only approved minimal information; authenticated full receipt access remains controlled.
- Cancelled/refunded status is unmistakable and references the linked event; no hidden edit to the original amount.

### Admission-related documents

- **Application acknowledgment:** application ID, applied class/session, submitted date, document status, next step; not proof of paid fees.
- **Registration/prospectus payment receipt:** actual charge code, payment, amount and unique receipt number.
- **Admission confirmation:** admission number, enrollment/class/date and approved conditions.
- **Admission charge receipt:** regular payment evidence with admission-related fee heads explicitly itemized.

### SLC/TC and other certificates

Use school-approved letterhead and field order from [reference-data.md](reference-data.md). Include document number, issue date, authorized signatures and immutable data snapshot. Draft previews show `DRAFT`; issued/reprinted documents identify their state appropriately.

## 8. Accessibility, responsive behavior and interaction states

- Full keyboard traversal; Enter selects a search result but does not unexpectedly post payment. Financial confirmation requires an explicit focused action.
- Visible labels and focus; screen-reader-friendly totals, validation and async status announcements.
- Minimum readable type and practical touch targets; do not depend on hover-only controls.
- Desktop ≥1280 px: split financial workspace; 768–1279 px: collapsible nav and stacked secondary panels; below 768 px: single-column forms and compact row summaries.
- Large tables may scroll horizontally while critical identity columns stay visible; show clear scroll affordance.
- Date/month labels include the year where cross-session ambiguity is possible.
- Loading: skeleton/status rather than zero values. Empty: explanation + relevant next action. Error: recovery action and reference ID. Permission denied: clear scope explanation without leaking another record.
- Render demo cold start: show `Backend starting / reconnecting`, retry bounded read-only readiness checks, and retain drafts. After a payment timeout show `Checking original payment` and reuse the existing command key; never automatically post a new payment. Uptime-monitor failure/recovery alerts go to the configured technical owner, with system-health visibility for Superadmin.
- Unsaved edit: prompt on navigation; successful save updates version/timeline. View mode has no autosave side effects.
- Printed documents tested with long names, large amounts, many fee lines, mixed English/Hindi text, and page breaks.

## 9. Prototype and usability validation

Build a clickable prototype for S05 → S06 → S07 → S08 first, then admission, withdrawal and promotion. Use fictional students and records.

Run with an accountant, admission operator and administrator:

1. Find the correct student among similar names.
2. Collect a full month, part payment, annual charge and old-session arrear.
3. Explain tendered versus received versus change.
4. Recover after a simulated timeout without duplicate payment.
5. Find/reprint an old receipt after promotion.
6. Withdraw a student with dues and stop future transport.
7. Promote a class with retained and graduating exceptions.
8. Mark attendance as a Teacher and verify another classroom is inaccessible.
9. Submit an attendance correction and approve it as an Admin.
10. Record the final Promote/Retain decision for an assigned classroom.
11. Submit an exceptional fee correction as an Accountant and approve it as an Admin.

Record completion time, misclicks, misunderstanding, errors and assistance. Revise labels/flow before coding the full UI. Acceptance targets are in the PRD; printer layouts require accountant/school approval.
