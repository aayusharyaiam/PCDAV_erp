# Product Requirements Document — improved school ERP

**Version:** 0.6, revised 17 October 2026 (legacy audit: 4 October 2026)

**Status:** target product contract with a verified synthetic Level 4 demo subset; financial release, school UAT and production policies remain open
**Evidence:** [feature-audit.md](feature-audit.md), [reference-data.md](reference-data.md)

## Current delivery coverage

This PRD describes the required release, not a claim that every requirement is complete. [PROGRESS.md](PROGRESS.md) is the current verification/handoff record.

| Requirement area | Implemented staging behavior | Remaining release criteria |
|---|---|---|
| Foundation/admissions/students | Four-role access, enrollment, unique admission numbers, history, academic setup, documents, audit, withdrawal/transfer/readmission and lifecycle history | Operational UAT, certificates from approved samples and live migration |
| FEE-01–FEE-05 / SRV | Versioned heads/plans, periodic assessment, balances/credit, dated hostel/transport, transport masters and store inventory/issues | Complete concession/fine policies, production rate approval and live import |
| PAY-01–PAY-04 | Server quote, automatic or selected fee/store allocation, partial/advance payment, cash change, selectable manually recorded Cash/UPI/Bank transfer/Cheque methods, retry/concurrency protection and configurable demo policy | Approved old-session/rate rules and production policy sign-off; no gateway or bank API is planned for counter collection |
| PAY-05–PAY-06 | Immutable numbered receipt snapshots, browser reprint audit, Accountant request/Admin decision, idempotent corrections/refunds, current-status PDF jobs and download/retry/status | Approved receipt series/font/printer, object-storage worker and bank/refund settlement matching |
| REP-01–REP-02 | Receipt register, student statements, fee/store dues, collection/journal reports, opening float, cash movements, counted cash and variance close | School-approved report definitions, backups/recovery and full statutory/management acceptance |
| Attendance/lifecycle/migration | Teacher attendance/corrections/Promote-Retain, promotion batches, withdrawal/transfer/readmission, CSV imports and operational reports | Certificate templates/samples, live migration rehearsal and go-live controls |

Evidence on 17 October 2026: 82 backend integration tests across nine suites passed, alongside backend/frontend builds, typechecks and 16 migrations. These do not constitute school approval, physical PDF/printer validation, certificate approval, live migration or production readiness. Requirement IDs and acceptance criteria below remain the target.

## 1. Product objective

Deliver a fast, understandable, auditable ERP for school office staff to manage a student's complete lifecycle: enquiry, admission, class/session enrollment, fee assessment, collection, receipts, concessions, services, reports, promotion, and leaving.

The replacement must preserve historical records and financial correctness while reducing repeated data entry, unclear labels, slow large lists, and dependence on manual reconciliation.

## 2. Users, account hierarchy, and jobs

The initial product is for **one school with one Superadmin**. That Superadmin has full access to the school's data and is the only initial Superadmin account. The database should retain a school boundary so that the same Superadmin can administer multiple schools later without redesigning identity, financial, or permission records. Creating additional Superadmin accounts is outside the initial workflow and requires an explicit future security decision.

The four main account categories are fixed for the initial product:

| Account | Primary jobs and authority |
|---|---|
| Superadmin | Full access; create, deactivate, reset, and manage Admin accounts; manage all school configuration and data. Only the Superadmin may deactivate an Admin. |
| Admin | Full operational access below Superadmin; create Admin, Accountant, and Teacher accounts; manage/deactivate Accountant and Teacher accounts; manage fee plans, school finance, users, classes, attendance approvals, promotion, migration, and oversight. |
| Accountant | Fee accounting: find students, explain dues, collect payments, issue/reprint receipts, manage remaining balances and student credit, reconcile collections, and submit special-access requests. No direct fee-plan or historical-payment overwrite. |
| Teacher | Access assigned classroom data; mark day-wise attendance; request post-submission attendance corrections for Admin approval; make final Promote/Retain decisions for students in the assigned classroom. No fee or unrelated-class access. |

Operational duties such as admission processing, certificate handling, transport/hostel operations, and front office work are assigned to Admin accounts through explicit permissions. A Teacher may have no class-teacher assignment or one active class-teacher assignment per academic session. Teachers can only access students in their assigned classroom for classroom tasks. Admission number is the primary school-facing student identifier.

Account lifecycle rules:

- Superadmin inherits all operational Admin, Accountant, and Teacher access and can view/manage all data in the initial school, but the account-provisioning boundary is explicit: Superadmin creates and manages Admin accounts; Admin creates Admin, Accountant, and Teacher accounts. In a future multi-school version, the Superadmin can manage Admin accounts and data across authorized school boundaries. No application workflow creates a second Superadmin initially.
- Admin can create Admin, Accountant, and Teacher accounts and can manage/deactivate Accountant and Teacher accounts.
- Admin can create another Admin, but only Superadmin can deactivate an Admin.
- Admin may perform audited Accountant/Teacher role changes and reset their credentials. Admin account reset, deactivation, or demotion remains under Superadmin management; role changes must not bypass this boundary. Deactivation or scope changes revoke affected sessions/access.
- Accounts with historical activity are deactivated rather than hard-deleted.
- Every account, role, permission, assignment, and deactivation change is audited.
- The API enforces these rules; hiding a menu item is not a security boundary.

## 3. Scope and priorities

The core operational workflow (Levels 1–4, transport/store operational management, academic lifecycle, student lifecycle, and CSV imports) is fully implemented and verified in the prototype. Priorities are re-baselined into:

**P0 — Production readiness gates and critical technical fixes:**
- Devanagari and Unicode script font embedding in Receipt PDF generator (`PDFKit`) to eliminate `UNSUPPORTED_TEXT` exceptions on Hindi/Sanskrit names.
- School financial circular approval, installment calendar, concession stacking, bounce charges, and production receipt series prefix (`PDAV/...`).
- Private S3-compatible object storage provisioning for admissions, student records, and document uploads.
- Automated cleanup/pruning for expired `LoginAttempt` rate-limiting records.
- Prisma schema index mapping cleanup on `Family` (`map: "Family_id_school_unique"`).
- Physical printer and hardware testing (80mm thermal receipt rolls and standard A4 laser printers).
- Role-based School User Acceptance Testing (Principal, Accountant, Admissions, Teacher).
- Production data migration rehearsal and financial opening balance reconciliation.

**P1 — Immediate operational extensions:**
- School certificates (Transfer Certificate TC/SLC, Character Certificate, Bonafide Certificate) from approved physical samples.
- Digital payment collection: Online UPI QR, payment gateway, and BBPS integration for parent online payments.
- Automated parent communication: SMS and WhatsApp notifications for daily student absence, fee due reminders, and payment receipts.
- Dedicated background worker queue (e.g., pg-boss or BullMQ) for decoupled job processing.

**P2 — Expanded ERP modules:**
- Examinations and grading: Marks entry, grading rules, and CBSE-compliant report card printing.
- HR, payroll, and staff management: Staff directory, leave workflows, biometric attendance, and monthly salary disbursement slips.
- Timetable and substitutions: Master class/teacher schedules, room allocations, and daily absent-teacher substitution tracking.
- External accounting sync: Double-entry journal voucher export into accounting software (Tally or Zoho Books).

**Continuity rule:** a used legacy module cannot simply disappear. For a deferred module, explicitly retain an agreed operational process, reconcile its financial balances, and specify the integration/manual handoff. Store, transport, and hostel dues required for clearance must remain visible even if their full operational modules are deferred. Hostel fee assessment and dated hostel assignments remain in the replacement scope.

## 4. Success measures

Targets below are proposed acceptance targets, not measured legacy baselines.

| Outcome | Target and measurement |
|---|---|
| Faster collection | Trained cashier completes a simple known-student cash collection in ≤45 seconds, excluding counting cash/physical printing; observe 20 representative tasks |
| Find the right student | Search results returned within 1 second p95 at agreed load; support admission number, name, guardian/mobile, class |
| Correct money | Zero unexplained difference in imported opening balances, day close, receipt totals, and payment/ledger reconciliation |
| No duplicate posting | Double-click, retry, timeout recovery, and duplicate provider event produce one payment/receipt |
| Historical integrity | Changing current name/class/rates does not alter an already-issued receipt or past enrollment |
| Staff usability | ≥90% completion of core UAT tasks without assistance after training; record failure reasons |
| Reliable rollover | Every eligible student accounted for exactly once as promoted/retained/graduated/withdrawn/exception |
| Recoverability | Demonstrated restore meets the agreed recovery targets in the TRD |

## 5. Core product rules

1. **Permanent student identity, session-specific enrollment.** Admission number is the primary school-facing identifier, is school-scoped and unique under an agreed historical numbering policy, and is never reused; class/session history is never overwritten.
2. **School and session context are explicit.** Historical views and cross-session balances must identify their source. School data is isolated.
3. **Fee configuration is versioned.** Published changes affect explicitly selected effective periods; past assessments/receipts stay stable.
4. **Assessment is distinct from collection.** What is owed, what was received, where it was allocated, and what was receipted are separate concepts.
5. **New-admission charges are distinct from recurring annual charges.** Confirm applicability for new, continuing, internal X→XI, readmitted, EWS, and mid-year entrants.
6. **Every amount has a reason and source.** No unexplained manual balance overwrites. Corrections use linked adjustments, reversals, or refunds.
7. **All financial writes are atomic and retry-safe.** A receipt cannot claim payment that was not committed.
8. **No hard deletion of posted financial history or enrolled students.** Status transitions and compensating entries preserve traceability.
9. **Business-rule changes are explicit.** Approval requirements, cutoff dates, thresholds, and authorities follow school policy and are configurable.
10. **Viewed data is not silently saved.** Critical edits use an explicit save/review step and show changed values.
11. **Outstanding and credit are separate student-ledger states.** A partial payment leaves the unpaid amount outstanding. An overpayment creates student-specific available credit, which is automatically allocated to the student's oldest eligible future fee through an audited allocation event.
12. **Role hierarchy is explicit.** Superadmin controls Admin accounts; Admin controls Accountant and Teacher accounts and fee plans; Accountant controls fee accounting; Teacher controls assigned-class attendance and final promotion decisions only within the assigned classroom.

## 6. Functional requirements and acceptance criteria

### 6.1 Foundation and masters

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| FND-01 / P0 | Authenticate staff; enforce the Superadmin → Admin → Accountant/Teacher hierarchy and school scope | Unauthorized API access is denied even through a copied URL; account creation/deactivation follows the hierarchy; session expiry preserves recoverable non-sensitive drafts; audit identifies actor |
| FND-02 / P0 | Manage academic sessions, class/sections/streams, capacity, subject and next-class mapping | Invalid dates/mappings are flagged; current session is unique per school; historical sessions can be viewed without changing operational defaults |
| FND-03 / P0 | Admin configures school branding, numbering, templates, date/currency and contact masters | Approved legal school name appears consistently; test print preview can be reviewed without issuing a document |
| FND-04 / P0 | Maintain activity/change history and authorized exports | Record actor/time/reason and relevant before/after values; exported data respects filters and permissions; credentials are never exported |
| FND-05 / P0 | Admin approval inbox and in-app notifications | Accountant financial requests notify Admin; the demo approval is bound to the exact operation/record/version, applied once, and audited. Teacher attendance-correction notifications remain future work; approval never grants a permanent broader role |

### 6.2 Admissions

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| ADM-01 / P0 | Enquiry/application pipeline with follow-ups and configured stages | Search/filter by class, session, source, stage and follow-up; duplicates are surfaced using normalized identity/contact signals; no automatic merge solely by name |
| ADM-02 / P0 | Guided registration and document checklist | Student/family/address details can be reviewed before submission; conditional guardian fields work; validation names the exact field; draft and submitted states are clear |
| ADM-03 / P0 | Convert an approved application to enrollment and first assessment | Exactly one student/enrollment per confirmation; admission number allocated once; section/stream/session/date and fee category explicit; retry creates no duplicate charges |
| ADM-04 / P0 | Distinguish application acknowledgment from payment receipt | A registration acknowledgment contains no false “paid” claim; any prospectus/registration payment links to an actual payment and separate charge code |

### 6.3 Student registry and services

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| STU-01 / P0 | Student 360 profile and searchable registry using admission number as the primary school-facing identifier | Admission number is unique within the school and cannot be reused; active/former filters; identity, family, enrollments, dues, receipts, documents, services and timeline accessible from one record |
| STU-02 / P0 | Controlled profile edits and bulk correction/import preview | Admission-number collisions blocked; concurrent edits detected; changes show before/after and actor; failed import rows do not silently disappear |
| STU-03 / P0 | Family/sibling linkage | Staff link verified existing students to a family; concessions are separate explicit rules; unrelated same-name students remain distinct |
| SRV-01 / P0 | Effective-dated transport and hostel fee/service assignments | Start/end dates and price version determine charge eligibility; a route/hostel assignment change or service stop preserves prior charges and exposes any adjustment |
| SRV-02 / P1 | Transport/hostel operational lists | Route/class/vehicle/hostel/month lists reflect dated assignments; seat/room constraints and exceptions are visible; bus pass or hostel list is derived from authorized assignment |

### 6.4 Assessment and concessions

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| FEE-01 / P0 | Admin-managed versioned class/category fee plans and named heads | Only Admin/Superadmin can create, edit, or publish plans; Accountants have read access; monthly, annual, half-yearly, one-time admission, promoted/readmission and optional heads supported; preview shows who/when/why before publish |
| FEE-02 / P0 | Idempotent periodic assessment | Re-running the same assessment does not duplicate a charge; each obligation retains session, enrollment, head, period, rule version and due date |
| FEE-03 / P0 | Student-specific concession, waiver and fine policies | Fixed/percentage rules where approved; head/period eligibility, cap, stacking order, effective dates and approval recorded; totals cannot become invalid through overlap |
| FEE-04 / P0 | Arrears, annual fees, new-admission fees and mid-year changes | Prior-session balance visible with source; annual/new-student charges shown separately; proration/cutoffs follow signed rules; no hidden carry-forward duplicate |
| FEE-05 / P0 | Miscellaneous fees with controlled catalog and override | T.C, diary, board exam or other fee uses unique code, reason and applicable student/class; similarly named registration fees do not auto-duplicate |

### 6.5 Payment and receipt

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| PAY-01 / P0 | Fast single-student collection with allocation preview | Select dues/periods; show charges, concessions, fines, arrears and total; enter amount/mode/depositor; preview allocations and remaining balance before commit |
| PAY-02 / P0 | Partial payment, student-specific outstanding balance, and automatic advance credit | Amount below due leaves a visible outstanding amount for the student's next collection; overpayment becomes explicit credit owned by that student and automatically applies to the oldest eligible future fee; credit never silently transfers to a sibling; cash tendered/change is distinct from amount posted |
| PAY-03 / P0 | Cash, manual electronic payment and cheque lifecycle | Required mode details validated; electronic payment reference retained and verified under school process; pending cheque is not silently treated as settled cash |
| PAY-04 / P0 | Idempotent atomic payment posting | Repeat submission returns the original committed result; two cashiers cannot over-allocate the same charge; failed transaction issues no valid receipt |
| PAY-05 / P0 | Receipt issuance, retrieval, print/download and search | Unique number; immutable financial/identity snapshot; original issue date and payment references; reprint never collects money again or changes number |
| PAY-06 / P0 | Reversal, refund, bounced cheque and correction | Mandatory reason and school-configured authority; Accountant requests exceptional changes and Admin approves/rejects them; original remains visible; balances and collections reflect linked compensating entries; no number reuse |
| PAY-07 / P1 | Online gateway payment and reconciliation | Signed server event is authoritative; repeated events harmless; failed/abandoned flow issues no paid receipt; gateway settlement matched separately from payment capture |
| PAY-08 / P1 | Optional family payment | One tender can allocate to authorized siblings with a transparent split; receipt policy defines family receipt or linked per-student receipts; no cross-child ambiguity |

### 6.6 Reporting and close

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| REP-01 / P0 | Receipt register, student ledger, dues/aging, defaulters, collection and adjustment reports | Filter by school/session/class/date/head/mode/collector/status; totals use defined accounting event dates; linked drill-down explains amounts |
| REP-02 / P0 | Cashier day close and reconciliation | Opening float + cash received − authorized cash outflows − deposited/handed-over cash equals expected cash; counted variance and reason retained; corrections after close are controlled |
| REP-03 / P0 | Enrollment and admission reports | Counts by class/section/status/category/EWS and admission/continuing type reconcile to enrollment records; “student” versus “enrollment” denominators are stated |
| REP-04 / P1 | Notifications/reminders | Preview audience, balances and message; deduplicate sends; record delivery/failure and retries; silent data edits never trigger unexpected messages |

### 6.7 Promotion, school leaving and documents

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| LFC-01 / P0 | Preview and execute new-session promotion | Teacher final Promote/Retain decisions require no second Admin academic approval; Admin prepares target session/fees and executes or schedules the validated batch; section/stream and capacity validated; one target enrollment per run/student; graduation/withdrawal exceptions remain Admin actions |
| LFC-02 / P0 | Dated withdrawal and administrative strike-off | Reason/date/authority, open balances, services and future charges shown before confirmation; history remains searchable; no automatic destruction of receivables |
| LFC-03 / P0 | Readmission and correction/restoration | Permanent identity reused; new enrollment or audited correction chosen explicitly; fees assigned under approved policy; old receipts unchanged |
| DOC-01 / P0 | SLC/TC, character and fee certificate | Populate from verified data, allow justified overrides, review/authorize/issue using unique numbering; PDF snapshot retained; reprint linked to original |
| DOC-02 / P1 | Document request workflow and additional print outputs | Request progresses through configured office stages; responsible user and handover recorded; ID cards, class lists and other outputs have clear labels |

### 6.8 Migration and continuity

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| MIG-01 / P0 | Repeatable import with dry run, mapping, validation and exceptions | Preserve legacy IDs and lineage; produce row counts and financial reconciliation; each source row is imported, explicitly excluded, or an unresolved exception |
| MIG-02 / P0 | Historical records and opening balances | School chooses detailed or opening-balance migration; no duplicate counting of historical payments/charges; original receipts remain referenceable with original numbers |
| MIG-03 / P0 | Controlled cutover and operational fallback | Named cutover owner; final delta reconciled; one authoritative collection system; rollback/fix-forward procedure accounts for every post-cutover payment |

### 6.9 Attendance and classroom responsibility

| ID / priority | Requirement | Acceptance criteria |
|---|---|---|
| ATT-01 / P0 | Assign zero or one active class-teacher classroom to a Teacher for each academic session | Admin creates, changes, ends, and audits assignments; a teacher cannot have two active class-teacher assignments in the same session; an unassigned teacher has no classroom attendance scope |
| ATT-02 / P0 | Teacher marks day-wise attendance for the assigned classroom | Teacher sees only the assigned class/session and enrolled students; attendance records identify date, classroom, actor, and submission state; duplicate marking is prevented or opened as a controlled correction |
| ATT-03 / P0 | Correct submitted attendance only after Admin approval | Teacher submits a correction request with reason and before/after values; Admin approves/rejects; the original mark remains in history and the correction is audited |
| ATT-04 / P0 | Teacher makes final Promote/Retain decision for assigned students | Teacher can submit final Promote/Retain outcomes for the assigned classroom; Admin can review the batch and handle capacity, stream, withdrawal, or exceptional cases without silently changing teacher history |

## 7. Required workflows

### 7.1 New admission

Create enquiry/application → check duplicates → capture/verify student and guardian data → review documents → decide admission → allocate the unique admission number → allocate session/class/section → assign applicable fee plan/category/transport/hostel services → preview first bill → collect separately if payment is required → issue acknowledgment and applicable payment receipt → student becomes available in the active registry.

**Exceptions:** missing documents, waitlist, duplicate applicant, rejected application, payment failure, seat unavailable, special fee waiver, late joining. School decides whether admission activation requires payment; the product must make that state explicit.

### 7.2 Monthly or annual fee collection

Find student by admission number → verify identity/class/session → view all dues, remaining balance, available student credit, and pending payments → choose period/obligations → server quote → apply eligible credit → select amount/mode → review allocations → commit once → show immutable receipt → print/download → reconcile cash/bank entry.

**Exceptions:** previous-session collection block, partial amount, excess credit, already-paid period, pending cheque, negative/zero amount, expired quote, double click, network timeout after successful commit, cancelled receipt, duplicate transaction reference.

### 7.3 School leaving

Open leaving request → set final attendance/effective leaving date → review dues, advances and services → settle/approve exception → decide charge cutoff and future adjustments → approve withdrawal → issue TC/SLC → record handover → maintain former-student profile and ledger.

**Important distinction:** withdrawal, administrative strike-off, graduation, and record correction are different events. Outstanding balance is a financial state, not proof of an enrollment status.

### 7.4 Class promotion

Admin creates target session and publishes fee plans → verify class mappings/streams → load eligible enrollments → Teacher submits final Promote/Retain decisions → resolve operational exceptions → preview all changes and financial effects → mark batch ready for execution → execute resumable batch → reconcile results → open new-session collection after readiness checks. Batch readiness is an operational check, not a second approval of the Teacher's academic decision. Any subsequent Admin correction is a separate reasoned event preserving the Teacher decision.

**Exceptions:** retained students, XII graduation, X→XI stream selection, missing target class, duplicate target enrollment, outstanding dues, student already withdrawn, target capacity exceeded.

### 7.5 Receipt correction

Locate original → review actual payment and allocations → choose reversal, allocation correction, or refund → obtain configured authorization → post linked compensating entries → issue correction/refund evidence where applicable → preserve original number/status/history → reconcile report effect.

## 8. Product state models

```text
Application: Draft → Submitted → UnderReview → Waitlisted / Approved / Rejected / Withdrawn
Enrollment: Pending → Active → Promoted / Retained / Graduated / Withdrawn / StruckOff
Cheque payment: Pending → Cleared → (Reversed if required); Pending → Bounced / Cancelled
Other payment: PendingVerification → Captured / Failed; Captured → Reversed / PartiallyRefunded / Refunded
Receipt: Issued → Voided (original retained); refunds linked separately
Certificate: Draft → Reviewed → Approved → Issued → Cancelled/Superseded
Promotion batch: Draft → Validated → ReadyToExecute → Running → Completed / CompletedWithExceptions
Attendance: Draft → Submitted; corrections: Requested → ApprovedAndApplied / Rejected / Cancelled / Stale
Special-access request: Requested → Approved → Applied / Stale; Requested → Rejected / Cancelled
```

“Promoted/Retained” describes the source enrollment outcome; the destination enrollment is Active. Financial balances survive enrollment transitions. A failed PDF render does not reverse a successful payment; it becomes a document-generation retry.

## 9. Reports and definitions

| Report | Definition / reconciliation basis |
|---|---|
| Student statement | Charges and adjustments, payments/allocations, credit, refunds, running outstanding by session and head |
| Collection summary | Captured/cleared payment amounts by business date/mode/collector; pending and reversed separated; cash/bank settlement dates also available |
| Receipt register | All issued numbers and statuses, including voided entries; no silent omission of cancelled numbers |
| Outstanding/aging | Unpaid assessed obligations as of date; future-not-due and overdue separated; unapplied credit shown separately |
| Defaulters | Positive overdue balance at chosen cutoff after approved adjustments; administrative labels do not alter debt |
| Concession/fine | Authorized assignment and actual assessed adjustment, with effective periods and reasons |
| Refund/reversal | Original payment, amount, reason, approver, event date, cash/bank reference, and balance effect |
| Admission/enrollment | Applications versus confirmed enrollments; new versus continuing; active/former status; class/section/session |
| Promotion | Source/destination mapping, decisions, success/exceptions, new enrollments, assessed fees and prior balances |
| Day close | Cash, cheque pending/cleared, manual bank, reversals/refunds, handover/deposit, counted amount and variance |

## 10. Release acceptance scenarios

Use synthetic data and approved rules. These examples are product tests, not claimed live transactions.

| Scenario | Expected result |
|---|---|
| ₹1,000 obligation, ₹600 cash received | Receipt ₹600; allocated ₹600; remaining due ₹400 |
| ₹1,000 obligation, ₹1,200 received with advance permitted | ₹1,000 allocated; ₹200 credit; receipt shows actual ₹1,200 received |
| ₹9,200 obligation, ₹9,000 received | Receipt shows ₹9,000 received and allocated; ₹200 remains outstanding for the same student's next collection |
| ₹9,200 obligation, ₹9,500 received | ₹9,200 allocated; ₹300 student credit; the next eligible fee preview applies ₹300 automatically and shows ₹4,700 payable for a ₹5,000 fee |
| Cash tendered ₹1,500 against ₹1,200 received | Change ₹300; payment remains ₹1,200, not ₹1,500 |
| Retry the same successful payment after timeout | Original payment and receipt returned; no second posting |
| Two cashiers pay the same ₹1,000 due concurrently | Allocation cannot exceed ₹1,000; stale quote/conflict or explicit credit behavior |
| Cheque entered but not cleared | Clearly pending; settled collections unchanged; acknowledgment distinct from final receipt under approved policy |
| Cheque bounces | Pending amount released; approved bounce fee assessed once; no false settled receipt |
| ₹1,000 captured and allocated, later refunded fully | Allocation released, ₹1,000 due restored unless separately waived, actual refund recorded; original payment preserved |
| Class VI→VII promotion | Old VI enrollment and documents unchanged; one VII target enrollment; approved new fees and arrears visible |
| Student leaves mid-session | Billing follows effective-date policy; previous receipts and receivables preserved; transport/hostel cutoff explicit |
| Reprint after student changes class/name | Original financial/identity snapshot preserved; reprint marked as such |
| Import historical receipts plus opening balance | No double-counting; imported legacy reference totals and operational opening balance independently reconcile |
| Teacher marks assigned classroom attendance | Teacher can mark only the assigned classroom for the selected date; unrelated classrooms are denied by the API |
| Teacher requests an attendance correction | Submitted mark remains unchanged until Admin approval; approved before/after values and reason are audited |
| Teacher submits Promote/Retain decisions | Final decisions are recorded for the assigned classroom; Admin can review exceptions without changing the teacher's original decision event |

## 11. Non-functional product requirements

- Keyboard-friendly, desktop-first cashier workflow; usable on tablet/mobile without tiny controls.
- Accessibility target: WCAG 2.2 AA for core screens; visible focus, labels, contrast, and understandable errors.
- Indian currency/date conventions; locale display separate from stored values; Asia/Kolkata business timezone.
- Reliable A4 output; additional A5/thermal formats only after printer/sample validation.
- Low-bandwidth-friendly pagination and progressive loading; no giant student dropdowns.
- No offline finalization of financial transactions in P0. Drafts may be saved, but “payment received” requires server acknowledgment.
- Backups, recovery, monitoring and permission tests are release requirements, not optional final polish.
- Render `/health` checks plus an external five-minute uptime monitor provide downtime/recovery notifications. The monitor can reduce Free-tier sleeping but does not guarantee service availability; cold-start/restart recovery must retain original financial command keys. In-app Admin request notifications are P0; external SMS/WhatsApp reminders remain P1.

## 12. Dependencies and approval

P0 implementation depends on approved business rules, redacted receipt/certificate examples, a vendor export specification/sample, nominated school owners, agreed production hosting, and test access to an isolated staging copy if legacy workflows must be demonstrated.

**Approval owners:** principal/administrator for scope and lifecycle; accountant for money, periods, numbering and reconciliation; admissions operator for registration; technical lead for migration and operational readiness. Unresolved decisions are tracked in [roadmap.md](roadmap.md).
