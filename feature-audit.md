# Existing ERP feature and workflow audit

**Review date:** 4 October 2026; replacement decisions revised 12 October 2026  
**Portal:** <https://pdav.webanlytic.in/software/login/index>  
**Visible academic session:** 2026–2027  
**Purpose:** establish a traceable baseline for an improved school ERP.

**Implementation cross-reference updated:** 13 October 2026. This remains a historical, read-only audit of the legacy ERP, not a current application feature checklist. The replacement now has Levels 1–3, transport/store operations and a tested Level 4 staging payment slice; see [PROGRESS.md](PROGRESS.md) for current evidence and gaps. No legacy payment/refund action was performed to obtain that implementation evidence. The new code's synthetic tests do not turn the legacy findings marked I/M/U into verified legacy behavior, and do not authorize production collection.

## 1. How to interpret this audit

| Mark | Meaning |
|---|---|
| **V — verified structure** | Page HTML, configuration, fields, table headings, or controls were directly inspected. This does not prove successful execution of a write operation. |
| **I — inferred behavior** | Supported by navigation, field relationships, or client-side code, but completion/backend rules were not tested. |
| **M — menu only** | Link exists; the underlying feature and actual school usage were not verified. |
| **U — unavailable** | Request returned an error or timed out during this review. |
| **P — proposed** | Recommended replacement-system behavior; not a claim about the existing implementation. |

Evidence IDs refer to the source register in section 12. All source paths are relative to `https://pdav.webanlytic.in/software/`. Route names are retained as found, including spelling errors. Student IDs in routes are replaced by placeholders.

### Boundaries

No record/configuration-changing action was submitted. Printing, issuing receipts/certificates, promotion, student strike-off/restoration, editing, and notification sending were not exercised. A read-only student-search request and a sample student/fee detail page were inspected. No bulk record export was performed.

The school’s actual operating procedures, database schema, server-side calculations, payment-provider integration, and usage frequency cannot be established solely from available HTML. A listed module may be unused, partially implemented, or a template. These documents distinguish that from verified functionality.

## 2. School and session context

**V, E01–E04**

- Branding displayed: **P DAV PUBLIC SCHOOL**; another label uses **PDAV PUBLIC SCHOOL**. Confirm the official name and the intended `PCDAV` project naming.
- Current visible session: **2026–2027**, starting **1 April 2026**, ending **31 March 2027**; admission is marked active.
- Historical sessions visible: **2022–2023 through 2025–2026**; they are marked inactive in the session record.
- The header offers school and session switching. Another school is listed. Neither switch was used. The replacement must make the active school/session explicit and isolate data by school.
- Class selection contains **51 class/section/stream combinations**, from Nursery to XII Science/Commerce.
- The main dashboard displayed 1,343 students, 439 new admissions, 66 EWS students, 7 employees, and 42 subjects. These are **screen-reported snapshot values**, not reconciled database totals.
- Dashboard counts also cover enquiry/registration follow-ups, complaints, fee-unpaid students, tasks, gender/religion/category charts, session overview, and birthdays.

## 3. Complete visible top-level menu inventory

This table records the visible navigation and distinguishes detailed inspection from menu presence. All listed options should be discussed during scope confirmation.

| Module | Visible options | Coverage / evidence |
|---|---|---|
| Home | Dashboard, session overview, demographics, birthdays, operational counters | V, E01 |
| Manage School | School Details; Session Record; General Settings; Access Rights; Login Settings; Class & Subject; Notification Setting; Fee Settings; Fee Official Settings; Exam Settings; Transport Settings; App Access; App Settings; Biometric Settings; Working Day | School/session/general/access/class/fee/transport inspected; Fee Official Settings U; others M. E02–E07, E27 |
| Front Office | Dashboard; Gate Pass; Request Manager; Request Document; Visitor Book; Call Log; Postal Dispatch; Postal Receive; Complain; Task manager; To Do List | Dashboard and Request Document V; other entries M. E32 |
| Admission Mgmt. | Dashboard; Enquiry; Payment Receipt; Registration; Evaluation; Confirmation; a second Payment Receipt | All page structures V; final admission conversion I. E08–E14 |
| Sibling Management | Dashboard; Add Sibling; Print List | Dashboard U; others M. A sibling admission-number field exists in registration. E10, E28 |
| Fee Management | Dashboard; Manage Hostal; Collect Fee; Fee Receipt; Manage Collection; Fee Defaulter; Fee Payment Details; Fee Dues; Manage Discount; Struck-off Defaulters; Manage Transport Old; Manage Fine; Fee Deleted Receipt; Allow App; Reminder | Most core screens V; dashboard/receipt index timed out; struck-off report U; Allow App/Reminder M. E19–E26 |
| Store Mgmt. | Dashboard; Manage Issue; Manage Receipt; Manage Collection; Manage Defaulter; Manage Group; Manage Product; Manage Cluster; Manage Vendor; Print List; Deleted Receipt | Product, issue search, receipt list V; other entries M. E31 |
| Student Mgmt. | Dashboard; Student Detail; Manage Student; Edit Master; Student Filter; Generate Certificate; Print List | All except dashboard inspected. E15–E18 |
| Exam Management | Dashboard; Manage Marks; Manage Attendance; Manage Height Weight; Manage Datesheet; Print List | Report selectors V; remaining pages M. “Manage Height Weight” links to `Import_test_marks`. E34 |
| Application Management | Dashboard; Gallery; Syllabus; Callender; Classroom; Diary; Online Class; Online Exam; Courses | Dashboard V but contains generic template content; remaining options M. E37 |
| Time Table | Manage Time Slot; Manage Time Table; Manage Arrangement | M, E01 |
| Communication Mgmt. | Dashboard; Announcements; WhatsApp Chat; Mail Box; SMS Log; Voice Call Log; WhatsApp Log; Email Log; Notification Log | M; notification forms embedded in admission/front-office pages V. E09, E11–E13, E32 |
| Transport Mgmt. | Dashboard; Allocate Transport; Transport Detail; Edit Master; Print List | Allocation search, vehicle/driver record, report selectors V; dashboard/master M. E29, E35 |
| Finance Mgmt. | Dashboard; Deleted Voucher; Account Group; Manage Income; Manage Expense; Print List | All except Deleted Voucher inspected. E30 |
| Employee Mgmt. | Dashboard; Add Employee; Employee Directory; Manage Employee; Edit Master | Add Employee form V; other entries M. E36 |
| Manual Attendance | Dashboard; Mark Attendance; Attendance Overview; Report | Report selectors V; other entries M. E33 |

Global controls include menu filtering, admission/student search, display/theme/layout controls, fullscreen, browser print, language translation, account lock, and logout. Configuration controls may save immediately; none were changed.

## 4. Admissions: enrolling a new student

### 4.1 Existing admission pipeline

**V/I, E08–E14**

```text
Enquiry / follow-up
  → prospectus/payment-receipt record
  → Registration (full student + family data)
  → Evaluation
  → Confirmation (Confirmed / Shortlist / Waitlist)
  → active enrollment and first fee collection [conversion details unverified]
```

The order is inferred from the modules; whether enquiry, prospectus purchase, or evaluation is mandatory remains unverified.

1. **Enquiry:** filter by session, applied class, category, source, calling/meeting/update dates, missed-call/meeting type, and status. Available status choices include Pending, Interested, Registered, Not Interested, Duplicate Entry, and Deleted Entry. Some combined filter choices group multiple statuses.
2. **Follow-up:** next call, meeting date/time, missed-call and missed-meeting counters appear in the admission module. A notification dialog supports SMS, WhatsApp API, WhatsApp Web, email, and voice call.
3. **Prospectus/payment receipt:** the first menu item named Payment Receipt opens **Filter Prospectus**, including Issued, Deleted, and All filters. This is not sufficient evidence that it is the final admission-charge receipt.
4. **Registration:** capture a full applicant profile, applied class, family, sibling reference, and addresses. Required fields and options are recorded in [reference-data.md](reference-data.md).
5. **Evaluation:** filters include Pending/Interested, Duplicate Entry, Not Interested, Rejected, and Deleted Entry. No evaluation scoring or selection submission was performed.
6. **Confirmation:** Confirmed, Shortlist, and Waitlist filters are present. Assignment of admission number, class/section, admission date, EWS status, and conversion into an active student requires demonstration on staging.
7. **Payment:** the separate fee matrix has New Student charges. The exact link from admission confirmation to the first bill was not executed.

### 4.2 Second “Payment Receipt” page

**V, E14**

The second entry (`admission_mgnt/admision_exam`) contains:

- Student name, applied class, parent/guardian name and salutation, contact number, date.
- A table with serial number, ID, student name, class, parent/guardian name, number, date, action.
- A page heading **Postal Dispatch**, although the form posts to an admissions endpoint.
- No amount/mode field in the inspected main form.

**Open issue:** determine whether this is a prospectus receipt, registration acknowledgment, examination payment entry, or an incomplete/customized screen. Obtain redacted samples of the school’s actual admission-related receipts.

### 4.3 Replacement workflow

**P:** a guided application → document review → admission decision → enrollment → first assessment → payment/receipt flow. Reuse applicant data rather than re-entering it. Keep an acknowledgment distinct from proof of payment. See PRD `ADM-01`–`ADM-03`.

## 5. Student records and school leaving

### 5.1 Student directory and profile

**V, E15–E17**

- Search by admission number, student name or father’s name, or class/section.
- Global search also advertises employee ID, parent name, and mobile number.
- Profile contains admission number/class/date, student details, separate SMS/voice and WhatsApp numbers, family/guardian details, addresses, bank details, medical history, house, and demographic information.
- The inspected profile also included session selection and examination-result content. Changing session or editing data was not performed.
- Student Filter supports class, category, gender, religion, admission session, EWS/non-EWS, age below/above, and age-as-of date.
- Edit Master offers New Admission, All Students, and class filters. Its JavaScript performs field updates on change/blur and handles an admission-number-unavailable response. The actual editable grid was not loaded or edited.
- Bulk/profile updates need an audit trail and explicit save behavior in the replacement.

### 5.2 Removing a student from the active school roll

**V/I, E16, E18**

Manage Student has **Active** and **Stuck-off** tabs. Columns include admission number, name, father’s name, class, contact number, and actions; the inactive list also includes date/time.

Client-side code exposes:

- Student detail view.
- A strike-off action with a generic “Are you sure?” prompt.
- A rollback/restoration action with a similar prompt.

These were not invoked. It is not established whether strike-off automatically stops fees, retains past receivables, removes transport, issues a certificate, disables app access, or is reversible without side effects.

**P — recommended leaving procedure:**

1. Record parent request, reason, last attendance date, and effective leaving date.
2. Show outstanding fees, unallocated advances, concessions, deposits if applicable, pending cheques, transport/hostel dues, and store dues.
3. Apply the school-approved settlement rule; retain any recoverable balance. Do not erase debt by deleting a student.
4. End future enrollment/service billing at the approved cutoff; separately adjust already-assessed future periods.
5. Approve withdrawal or administrative strike-off using distinct reason codes.
6. Issue the SLC/TC through a documented workflow and retain a snapshot and certificate number.
7. Keep the student searchable under Former/Withdrawn/Struck-off with complete historical records.
8. Readmission is a new enrollment linked to the same student identity. Restoration is a separately audited correction.

### 5.3 Certificates and printed student outputs

**V, E18**

Certificate tabs: Transfer Certificate, Character Certificate, Fee Certificate, two generically named Certificate tabs, and Event Certificate. Form action names additionally suggest absence and sports certificates; exact labels/layouts need confirmation.

SLC/TC data includes identity and admission details, DOB, last studied class, exam/result, subjects, promotion eligibility/next class, fee-paid-through month, concessions, working days/attendance, activities, conduct, application/issue dates, leaving reason, remarks, and SLC number.

Student Print options: Class Details, EWS Students, General Detail, Students Update Detail (date range), UDICE Detail, Cover Profile, Student Profile, and ID card.

No certificate or print output was generated. An undefined-variable PHP notice was visible in the certificate page.

## 6. Fee management and monthly payment

### 6.1 Configuration

**V, E05**

Four settings tabs: **General Setting, Fee Head, Fee Structure, Late Fine**.

- Current visible previous-session rule: **Block Previous Session Defaulter**; alternative Allow all Student.
- Transport charging: **With Fees** selected; alternative Separately in Transport. Label warns “Not Work in Mid Session.”
- Cheque-bounce charge: Yes selected; adjacent fine amount **₹500**. The collection/accounting treatment was not exercised.
- New fee-head types: Monthly, Yearly/Half-Yearly, New Students, Promoted Student.
- Two month selectors exist for scheduled fee heads.
- Fee matrix shows seven heads; full amounts are in [reference-data.md](reference-data.md).
- Late-fine amount input was blank. A label says `0-disable`; a blank cannot be assumed to mean zero or disabled.
- Monthly last dates are the 26th of each academic month. The ANNUAL last date is **26 April 2027**, outside the displayed session end; school confirmation is required.

### 6.2 Observed collection screen

**V/I, E19–E20**

1. Open Fee Management → Collect Fee.
2. Search admission number, student/father name, or class.
3. Open the selected student’s fee detail.
4. A period selector offers remaining month endpoints and **PAY DUE**. The inspected example offered October through March. The code requests a fresh period calculation after selection; multi-month accumulation is inferred but was not exercised.
5. A breakdown shows Tuition Fee, Science Fee, Computer Fee, Transport, Hostel Admission Fee, Hostel Fee, Miscellaneous Fee, Discount, and Fine. Additional annual/new-admission heads may depend on the student’s unpaid periods; they were not present in this sample’s current monthly breakdown.
6. Add Miscellaneous Fee offers named, amount-bearing items. Observed examples: T.C Charge ₹500, Registration Fee ₹500, Diary ₹100, CBSE EXAM FEE ₹2,200. These are selectable choices, not proof every student owes them.
7. Total Amount is displayed separately from editable Receiving Amount; collection date, payment mode, depositor name/number, and Amount Given are available.
8. JavaScript computes Returning Amount = Amount Given − Receiving Amount. This is cash tender/change assistance, not a refund workflow.
9. Payment choices:
   - **Cash**.
   - **Cheque:** cheque number, bank name, branch; bank is marked required in the injected form.
   - **Online:** POS Card, POS UPI, QR Code HDFC, NEFT, IMPS, GooglePay, PhonePe; transaction number.
10. Submit posts a fee-update/payment form. **It was not submitted.** Receipt creation, ledger updates, notices, and failure handling after submission are unverified.

The separate total/received fields and receipt balance column suggest partial payment support. Server allocation order, advance-credit behavior, overpayment validation, settlement dates, and per-head allocations remain unverified. “Online” is a manual mode label; a connected payment gateway was not demonstrated.

### 6.3 Annual charges versus admission charges

**V/I, E05, E20**

The matrix groups:

- **MONTHLY:** Tuition Fee, Science Fee, Computer Fee.
- **HALF YEARLY/YEARLY:** Annual Maintenance Fee, Examination Fee.
- **NEW STUDENT:** Registration Fee, Admission Charge.

Thus “yearly admission charges” must be clarified. A continuing student’s annual maintenance/examination assessment is not automatically the same as a new student’s admission charge. The product supports a Promoted Student fee-head type, but no separate promoted-student column was visible in this configured matrix.

**Unresolved:** annual billing month(s), whether examination amount is annual total or per occurrence, readmission rules, mid-year admission proration, EWS exemptions, and rules for X→XI internal admissions. The miscellaneous Registration Fee ₹500 also differs from the matrix Registration Fee ₹300 in most classes.

### 6.4 Concessions, fines, hostel, and old transport

**V, E23–E25**

- Discount and Fine screens support one or multiple students, type, amount, and mandatory remarks.
- Types: Monthly – All Month; Yearly – Annual; and Yearly – each month April through March.
- Lists include assigned detail/remarks/by, deassigned detail/remarks/by, status, and action.
- Old transport screen has the same assignment pattern with Monthly – All Month.
- Hostel screen has student selection, admission month (Annual or individual month), admission amount, monthly amount, and remarks; it retains assignment/deassignment metadata.
- Exact concession stacking, effective dates, EWS treatment, fine waiver precedence, and refund/reversal semantics were not tested.

### 6.5 Receipts and reports

**V/I/U, E20–E26**

- A sample student’s fee page contains receipt history: receipt number, date, duration, mode, detail, total, paid, balance, modify.
- A reprint function is defined in source and posts an existing receipt ID to a print endpoint in a new tab. It was not invoked, so paper format and any print counter are unverified.
- The main Fee Receipt index timed out during review. The deleted-receipt list did load, with admission/student/class context and financial columns.
- Deleted receipts remain listed somewhere in the UI; whether financial reversals and original details are preserved is unverified.
- Manage Collection: Total and Date wise tabs; from/to dates, Cash/Cheque/Online/all modes, and collector/all users.
- Fee Payment Details: class/all classes and admission number; source references current and old detail lookups.
- Fee Dues: class selector.
- Fee Defaulter: class, through-month, and amount threshold; separate defaulter/reminder report forms.
- Struck-off Defaulters returned HTTP 404. Reminder and Allow App appear in navigation but were not invoked.

**P:** one searchable receipt register, immutable payment snapshots, controlled reversal/refund, reliable reprints, and report totals reconciled to the same ledger. See PRD `PAY-01`–`REP-02`.

## 7. Class upgrade and new academic year

**V/I, E03–E04, E17**

Observed prerequisites and controls:

- Session Record stores name, short name, start/end dates, current-session flag, admission-open flag.
- A **Promote Students** link exists under Session Record.
- Class & Subject includes class/section, student limit, student count, subjects, and Next Class mapping.
- Edit Master source references a promotion-related update endpoint.
- Admission dashboard reports New Admission and Promoted Students by class.

**The Promote Students link was not opened**, because its name could denote a state-changing operation. Destination selection, retained students, alumni handling, stream allocation, debt carry-forward, rollback, and bulk-validation behavior are unverified.

**P — recommended rollover:** configure target session → verify fee plans and next-class mappings → choose promote/retain/graduate/withdraw per student → resolve stream/section/capacity exceptions → preview new charges and prior balances → confirm batch → create new enrollments once → reconcile counts and amounts. Graduation is not an automatic XII→nonexistent-class promotion.

## 8. Related operational modules

### Transport — V, E07, E29, E35

- Route setup: destination, cost, main-route indicator, parent/main route.
- Route labels include Hethnagar Campus and Bus Stand Campus destinations.
- Vehicle setup: type, number, route, seat count.
- Transport Detail: record name, bus number, up to two driver names and phone numbers.
- Allocate Transport starts with student search; allocation/deallocation completion was not performed.
- Reports: Route List, vehicle Sheet, Bus Pass; route/sub-route, class, month, and vehicle selectors.
- Preserve dated service assignment, route-price history, start/stop dates, capacity, and billing integration in the replacement.

### Finance — V, E30

- Account groups/types include school accounts, income, several expense categories, and loan account.
- Income/expense forms use from account, beneficiary, date, amount, handed-to person, reference, and attached document.
- Voucher tables record number, accounts, amount, generated detail/by, and actions.
- Print List includes Day Book, Expense Report, Account Report, Income Report with dates and beneficiary filters.
- Automatic linkage between fee collections and finance vouchers was not verified. Do not assume these two modules already reconcile.

### Store — V/M, E31

- Product list includes ID, name, description, vendor, vendor cost, group, sale cost/unit, alert, quantity, remaining quantity, add quantity, and action.
- Student issue screen searches admission number, student name, or class.
- Receipt list includes student, mode, detail, total, paid, balance, and action.
- Group/vendor/cluster/collection/defaulter/report/deleted-receipt options are menu-visible.
- Stock adjustment, issue, receipt cancellation, and financial linkage were not executed.

### Front office and documents — V/M, E32

- Document request states: Pending, In Process, Printed, Verified, Signed, At Office, At Reception, Handed to Parent, Closed, Deleted Entry.
- Notification dialog supports SMS, WhatsApp, email, predefined SMS/message and contact reference; a Hindi/English input shortcut is advertised.
- Gate passes, visitors, calls, postal records, complaints, and tasks are present in the menu; operational details remain to be validated.

### Attendance, examinations, employees, application — V/M, E33–E37

- Attendance reports: Class Overview, Student Report, User Overview, Employee Report; date-range and class/user selectors.
- Exam print selectors: Award List, Loose sheet, Admit Card, Report Card, Green Sheet, UDISE Report; Term I/II where applicable.
- Employee form: code/username, role, department, name/parents, contact/email, DOB/gender/marital status, joining date/designation, emergency contact, addresses, note, qualification, experience, photo.
- Application dashboard contains generic marketing/sales/customer-table text and currency examples. Its presence is not evidence of a functional parent/learning dashboard.
- Learning, timetable, messaging, biometric, and app-access features require module-specific discovery if included in scope.

## 9. Administration and permissions

**V, E02, E04, E06, E27**

- School configuration includes logo, letterhead, school name/details/address/contact/website, header spacing, A4/fee/store/transport/miscellaneous headers, and upload-location fields.
- General masters: salutations, user type, department, designation, gender, marital status, category, religion, blood group, student house, enquiry source.
- Class/subject assignment supports multiple selections and activity type; classes have order, section, capacity, subject, and next class.
- Access Rights has Manage Access and Assign Access tabs, roles, module assignment, menu/submenu order, and View/Add/Edit/Delete columns.
- Login Settings and several integration/settings modules are menu-visible only. Authentication storage, actual backend authorization, backup, and security implementation were not inspected.

## 10. Observed issues and improvement opportunities

| ID | Evidence-backed finding | Consequence / replacement requirement |
|---|---|---|
| GAP-01 | Two Admission Payment Receipt links, with different routes; one page heading says Postal Dispatch | Distinct application acknowledgment, prospectus/registration payment, admission payment, and school fee receipt labels. |
| GAP-02 | Registration ₹300 in class matrix versus ₹500 miscellaneous choice | Establish applicability; distinct fee codes; prevent accidental double assessment. |
| GAP-03 | Annual deadline 26 April 2027 lies after session end | Validate annual schedules and date boundaries; flag exceptions before publishing. |
| GAP-04 | Fee-head list headings do not meaningfully explain its numeric cells; matrix grouping is clearer | Explicit fee frequency, eligibility, assessment month, and effective session. |
| GAP-05 | Several settings/master fields save on blur/change | Explicit draft/save with meaningful change summary for financial and student data. |
| GAP-06 | Fee dashboard and receipt index requests timed out | Establish real performance baseline; paginate/search server-side; index reports. One request is not proof of persistent outage. |
| GAP-07 | Fee Official Settings, Sibling dashboard, Struck-off Defaulters returned 404 | Verify required features; remove broken navigation or implement functional equivalents. |
| GAP-08 | PHP notices visible on student profile and certificate page | Production error handling; structured logs; resilient templates. |
| GAP-09 | Strike-off/restoration use generic confirmation prompts in source | Show student, date, reason, balance, service cutoff, and exact consequences. |
| GAP-10 | Large server-rendered student/store lists and repeated page shell | Server-side pagination, compact responses, shared interface shell, debounced search. |
| GAP-11 | Duplicate/legacy transport concepts and warning on mid-session mode change | Single dated service-assignment model and explicit billing migration. |
| GAP-12 | Application dashboard contains generic template material | Role-specific school metrics with validated definitions. |
| GAP-13 | Receiving amount editable; several totals are client-side fields | Server recalculation, idempotent payment commit, transactional allocation and receipts. Existing backend validation is unknown. |
| GAP-14 | Many related tasks spread across modules | Student 360 view linking enrollment, dues, payments, documents, services, and history. |

## 10.1 Confirmed replacement decisions

The following decisions apply to the replacement ERP and are not claims about the legacy portal:

- The initial deployment is for one school with one Superadmin. The data model should preserve a school boundary for a possible future multi-school version.
- The four main replacement account categories are Superadmin, Admin, Accountant, and Teacher. Legacy role names in the observed portal remain reference values only.
- Superadmin has full access and manages Admin accounts. Admin may create Admin, Accountant, and Teacher accounts; only Superadmin may deactivate Admin accounts. Admin manages/deactivates Accountant and Teacher accounts.
- Accountants control fee accounting. Exceptional payment, fee, receipt, refund, or historical corrections are submitted to Admin as special-access requests and are audited.
- Full school-finance operations beyond fee accounting are Admin-only when enabled.
- Teachers mark day-wise attendance only for their Admin-assigned classroom. A teacher may have no class-teacher assignment or one active assignment per academic session. Submitted attendance can be corrected only after Admin approval.
- Teachers make the final Promote/Retain decision for students in their assigned classroom. Admin handles batch oversight and exceptional cases.
- Admission number is the primary school-facing student identifier, unique within the school and never reused.
- Partial payments leave a visible student-specific outstanding balance. Extra payment creates student-specific credit, automatically applied to the same student's oldest eligible future fee. Credit is not transferred to siblings automatically.
- Hostel fees and dated hostel assignments remain included in the replacement scope. Hostel is not removed; its rules must be versioned and integrated with the fee ledger.

## 11. Questions that block a faithful replacement

1. What precisely turns Confirmed into an active enrollment, and who allocates the admission number?
2. Are Registration Fee, prospectus payment, and the second Payment Receipt distinct charges?
3. When are annual/examination charges assessed? Are the shown examination amounts per year or per installment?
4. What is charged on promotion, internal X→XI admission, readmission, mid-year joining, and mid-year leaving?
5. Which fee heads are waived for EWS, siblings, staff children, or special concessions?
6. How do partial payments, old-session dues, advance credits, bounced cheques, reversals, and refunds work?
7. Are receipts per student, family, counter, school, session, or financial year? May numbers contain gaps?
8. Does withdrawal require clearance, allow authorized pending dues, or differ from administrative strike-off?
9. Do transport/hostel/store balances affect leaving certificates? What are their cutoff/proration rules?
10. Are finance vouchers automatically linked to fees or entered manually?
11. What historical detail and documents can the existing vendor export, with original IDs and timestamps?
12. Which non-core modules are genuinely used daily, and which can be phased later?

Owners and decision gates are provided in [roadmap.md](roadmap.md).

## 12. Evidence source register

Dates refer to this review; source views can change after inspection. Raw pages and personal records are not part of the deliverables.

| Evidence | Relative source path(s) | Result / material inspected |
|---|---|---|
| E01 | `admin/view_dashboard`; navigation in authenticated shell | V: dashboard, counters, full module navigation; `admin/dashboard` also returned route-selection scripts. |
| E02 | `admin_setting/school_detail` | V: school/session selector, branding/header fields. |
| E03 | `admin_setting/session_detail` | V: session data in script, promotion link. Promotion action not followed. |
| E04 | `admin_setting/add_class` | V: classes, subjects, activity, limits, next-class controls. |
| E05 | `admin_setting/fee_settings` | V: fee heads, complete visible 51-row matrix, settings and deadlines. |
| E06 | `admin_setting/manage_user` | V: general master structures. |
| E07 | `admin_setting/transport_settings` | V: route and vehicle setup. |
| E08 | `admission_mgnt/add_dashboard` | V: funnel/follow-up/class summary structures. |
| E09 | `admission_mgnt/view_enquiry` | V: enquiry filters and notification form. |
| E10 | `admission_mgnt/add_registration` | V: blank registration form, options, required fields. |
| E11 | `admission_mgnt/add_evaluation` | V: evaluation filters/statuses. |
| E12 | `admission_mgnt/add_confirmation` | V: confirmation filters/statuses. |
| E13 | `admission_mgnt/view_prospectus` | V: prospectus filters/receipt-related navigation. |
| E14 | `admission_mgnt/admision_exam` | V: second Payment Receipt form; inconsistent heading. |
| E15 | `student_mgnt/student_detail`; `student_mgnt/get_student_detail?sid=<sample>` | V: directory search and one profile structure. |
| E16 | `student_mgnt/manage_student` | V: active/struck-off tables and action definitions. |
| E17 | `student_mgnt/edit_master`; `student_mgnt/student_filter` | V: filters, source-defined autosave/promotion-related updates. |
| E18 | `student_mgnt/student_certificate`; `student_mgnt/student_Print` | V: certificate fields and report selectors; no generation. |
| E19 | `fee_mgnt/collect_fee`; `ajax/view_student` | V: search screen and standard read-only class lookup. |
| E20 | `fee_mgnt/get_fee_detail?sid=<sample>` | V: sample collection form, modes, miscellaneous choices, receipt history, source-defined reprint. |
| E21 | `fee_mgnt/fee_collection_detail`; `fee_mgnt/fee_payment_details` | V: collection and payment report selectors. |
| E22 | `fee_mgnt/fee_dues`; `fee_mgnt/fee_defaulter` | V: dues, defaulter and reminder report selectors. |
| E23 | `fee_mgnt/fee_discount`; `fee_mgnt/fee_fine` | V: assignment forms and history columns. |
| E24 | `fee_mgnt/manage_hostel` | V: hostel fee assignment form and history. |
| E25 | `fee_mgnt/fee_discount_tr` | V: legacy transport amount assignment. |
| E26 | `fee_mgnt/fee_del_receipt` | V: deleted receipt list and reprint/action definitions. |
| E27 | `admin_setting/manage_module` | V: access-rights matrix and assignment form. |
| E28 | `sibling_mgnt/home_sibling` | U: HTTP 404. |
| E29 | `transport_mgnt/manage_students`; `transport_mgnt/transport_detail` | V: search/allocation entry and driver/bus form. |
| E30 | `finance_mgnt/finance_dashboard`; `account_group`; `voucher`; `ledger`; `cash_book` (same controller) | V: dashboard, accounts, income/expense forms, report selectors. |
| E31 | `store_mgnt/store_product`; `store_issue`; `store_receipt` (same controller) | V: products, issue search, receipt table. |
| E32 | `front_office/front_dashboard`; `front_office/request_document` | V: dashboard and document states/notification form. |
| E33 | `attendance/attendance_report` | V: attendance report selectors. |
| E34 | `exam_mgnt/exam_print_list` | V: exam document/report selectors. |
| E35 | `transport_mgnt/print_list` | V: transport report selectors. |
| E36 | `employee_mgnt/add_emp` | V: employee form. |
| E37 | `app_mgnt/dashboard` | V: generic template-like dashboard content. |
| E38 | `admin_setting/fee_settings_official` | U: HTTP 404. |
| E39 | `fee_mgnt/fee_struck_off_defaulters` | U: HTTP 404. |
| E40 | `fee_mgnt/fee_dashbord`; `fee_mgnt/fee_receipt` | U: read requests timed out at 60 and 45 seconds respectively; no successful index inspection. |

## 13. Coverage still requiring staging or school evidence

- Completed enquiry-to-enrollment conversion, document uploads, duplicate rejection, and numbering.
- All transaction outcomes: payment success/failure, receipt issuance/reprint, reversals/refunds, bounced cheques, notices, certificate issuance.
- Promotion execution and rollback, withdrawal settlement, restore/readmission, historical-session behavior.
- Visual rendering, responsive behavior, accessibility, real user timings, concurrent collections, and backend permissions.
- Database/API exports, full route-price master, historical fee schedules, supporting documents, ledger reconciliation, and integration credentials/configuration.

The audit is comprehensive for the inspected structures and visible menu inventory; these gaps prevent claiming a fully verified end-to-end specification of every legacy module.
