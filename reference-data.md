# Observed configuration and data-field reference

**Snapshot:** 4 October 2026; session 2026–2027. Replacement decisions revised 12 October 2026.  
**Source:** evidence IDs in [feature-audit.md](feature-audit.md).  
These values document the existing screen configuration. They are not automatically approved rates/policies for the replacement. No student-level record data is included. The replacement decisions below are product-owner decisions; they do not claim that the legacy portal already behaved this way.

## 1. Academic structure

| Session | Dates | Visible state |
|---|---|---|
| 2022–2023 | 2022-04-01 to 2023-03-31 | Inactive |
| 2023–2024 | 2023-04-01 to 2024-03-31 | Inactive |
| 2024–2025 | 2024-04-01 to 2025-03-31 | Inactive |
| 2025–2026 | 2025-04-01 to 2026-03-31 | Inactive |
| 2026–2027 | 2026-04-01 to 2027-03-31 | Current; admission active |

**Class/section combinations (51 total):**

- Nursery, LKG, UKG: A, B, C each — 9.
- I, II, III, IV: A, B, C each — 12.
- V, VI, VII, VIII: A, B, C, D each — 16.
- IX, X: A, B, C each — 6.
- XI Science: Math, Bio; XI Commerce: A, B — 4.
- XII Science: Math, Bio; XII Commerce: A, B — 4.

Registration chooses the broader applied class (Nursery/LKG/UKG/I–X/XI Science/XI Commerce/XII Science/XII Commerce). Enrollment needs the actual section/stream combination. Class creation offers sections A–L; available creation options are not the same as populated class combinations.

Academic month labels run **April → March**. Legacy dropdown values for fee scheduling use April = 1 through March = 12; store calendar dates in the replacement instead of relying on this index convention.

## 2. Full visible fee matrix, grouped by identical class rates

**Source E05. Amounts in INR.** Grouping below represents all 51 displayed class rows; sections within each listed group had identical values.

| Class / sections | Monthly tuition | Monthly science | Monthly computer | Annual maintenance* | Examination* | New-student registration | New-student admission |
|---|---:|---:|---:|---:|---:|---:|---:|
| Nursery A–C, LKG A–C | 1,290 | 0 | 0 | 2,200 | 1,200 | 300 | 3,000 |
| UKG A–C | 1,290 | 0 | 0 | 2,400 | 1,200 | 300 | 3,000 |
| I A–C, II A–C | 1,290 | 0 | 0 | 2,400 | 1,500 | 300 | 4,000 |
| III A–C | 1,300 | 0 | 50 | 2,400 | 1,500 | 300 | 4,000 |
| IV A–C | 1,300 | 0 | 50 | 2,400 | 1,500 | 300 | 5,000 |
| V A–D | 1,610 | 0 | 50 | 2,400 | 1,500 | 300 | 5,000 |
| VI A–D | 1,610 | 0 | 100 | 2,400 | 1,500 | 300 | 6,000 |
| VII A–D | 1,680 | 0 | 100 | 2,400 | 1,500 | 300 | 6,000 |
| VIII A–D | 1,740 | 0 | 100 | 2,400 | 1,500 | 300 | 6,000 |
| IX A–C | 1,830 | 100 | 100 | 2,400 | 1,500 | 300 | 7,000 |
| X A–C | 1,890 | 100 | 100 | 2,400 | 2,000 | 0 | 0 |
| XI Science — Math/Bio | 2,300 | 150 | 100 | 2,400 | 2,000 | 300 | 9,500 |
| XI Commerce A–B | 2,280 | 0 | 100 | 2,400 | 2,000 | 300 | 9,500 |
| XII Science — Math/Bio | 2,430 | 150 | 100 | 2,400 | 2,000 | 0 | 0 |
| XII Commerce A–B | 2,410 | 0 | 100 | 2,400 | 2,000 | 0 | 0 |

\* These two columns appear under **HALF YEARLY/YEARLY**. The snapshot does not establish the installment count or assessment dates. Do not multiply these values or charge both each month. Zero registration/admission values in X/XII do not establish a universal free-admission policy.

### Additional fee configuration

| Setting / choice | Visible value or options |
|---|---|
| Previous-session defaulter rule | Block Previous Session Defaulter selected; Allow all Student alternative |
| Transport collection | With Fees selected; Separately in Transport alternative; mid-session warning in label |
| Cheque bounce | Yes selected; adjacent Fine Amount 500 |
| Fee-head types | Monthly; Yearly/Half-Yearly; New Students; Promoted Student |
| Scheduled months | Month 1 and Month 2 selectors, April–March plus blank |
| Late-fine amount | Blank input; label says `Fine Amount (0-disable)` |
| Monthly last dates | 26 Apr, 26 May, 26 Jun, 26 Jul, 26 Aug, 26 Sep, 26 Oct, 26 Nov, 26 Dec 2026; 26 Jan, 26 Feb, 26 Mar 2027 |
| ANNUAL last date | 26 Apr 2027 — must be reviewed against session end |
| Miscellaneous fee choices in sample collection form | T.C Charge 500; Registration Fee 500; Diary 100; CBSE EXAM FEE 2,200 |
| Discount/fine period choices | Monthly – All Month; Yearly – Annual; Yearly – April through March |
| Hostel fields | Admission Month; Admission Amount; Monthly Amount; Remarks |
| Legacy transport amount type | Monthly – All Month |

Transport destination prices and historical fee plans were not exhaustively exported. Import them separately from an authorized master-data export when migration begins.

### Illustrative arithmetic, not a verified school billing rule

- Class VI monthly base from the matrix: `1,610 + 0 + 100 = ₹1,710`, before transport, hostel, concessions, fines, or one-off items.
- If the accountant confirms both displayed annual amounts are charged once, VI annual-head subtotal would be `2,400 + 1,500 = ₹3,900`.
- If a new VI entrant owes both new-student heads, subtotal would be `300 + 6,000 = ₹6,300`.
- These three subtotals describe different scopes. Their dates/eligibility must be configured separately.

## 3. Registration and student profile data dictionary

**Source E10/E15.** “Required” below means an asterisk/HTML requirement on the inspected registration form, not demonstrated backend validation. Existing technical field names are integration clues, not a schema to copy blindly.

| Group | Fields | Observed requirement / note |
|---|---|---|
| Application | Session; source; next calling date; meeting date; meeting time | Session required; source choices below |
| Identity | Student name; applied class; Aadhaar; DOB; birthplace | Name/class/DOB required |
| Demographics | Gender; category; religion; mother tongue; blood group | Gender/category required |
| Main contact | SMS/voice/WhatsApp contact number; email | Contact number required; profile additionally separates WhatsApp number |
| Previous education | Previous school; reason for leaving previous school | Optional in inspected form |
| Health | Medical history | Optional |
| Student bank | Account number; bank name; IFSC | Optional; collect only when needed for a school process |
| Sibling | Existing sibling admission number | Optional; lookup hook present |
| Father | Salutation, name, Aadhaar, contact, qualification, occupation, annual income | Name required |
| Mother | Salutation, name, Aadhaar, contact, qualification, occupation, annual income | Name required |
| Guardian | Is child cared for by guardian? Yes/No; salutation, name, Aadhaar, contact | Conditional area; backend requirements unverified |
| Addresses | Current address; permanent address; same-as-current checkbox | Current address required |
| Documents | Documents Upload section heading; image-upload hook | Actual required document types/file limits not visible in inspected main inputs |
| Enrollment/profile additions | Admission number, admission date, admission class, current session, house | Present in profile/settings; final admission assignment unverified |
| Operational classification | EWS/non-EWS, active/struck-off | Present in dashboards/filters/lifecycle screens; enrollment capture needs confirmation |

**Legacy naming issues:** inputs named `femail` and `memail` represent parent annual income in the registration form; `gemail` represents guardian Aadhaar. Do not assume meaning from field names during migration. Use exported values, labels, and vendor schema together.

### Observed dropdown options

| Master | Options |
|---|---|
| Registration source | School Office; Internet; Newspaper; Website; Teachers; Children; Facebook |
| Filter source | Above plus School Website; blank/all selections also appear |
| Student gender | Boy; Girl |
| Employee gender | Male; Female |
| Category | General; OBC; SC; ST; OTHERS; Minority |
| Religion | Hinduism; Islam; Sikhism; Christianity; Others; Jainism |
| Blood group | A Positive/Negative; B Positive/Negative; O Positive/Negative; AB Positive/Negative |
| Salutations | Mr.; Mrs.; Ms., with field-specific subsets |
| Guardian care | Yes; No |
| EWS filter | All; EWS; Without EWS |
| Age filters | Ages 2–20; below/above; age-as-of date |
| Employee marital status | Married; Unmarried |
| Employee department | English; Hindi; Maths; Science; SST |
| Legacy user roles observed | Admin; Director; Principal; Teacher; Accountant; Exam; Office Incharge; Peon; Driver; Guard; Student |

Replacement masters should be configurable and preserve imported values. Requirements for guardian structure, demographic fields, and document collection must be agreed with the school rather than hard-coded from a legacy limitation.

### Confirmed replacement account model

The replacement starts as a single-school system with one Superadmin. The legacy role list above is reference data only; it does not define replacement permissions.

| Replacement account | Confirmed scope |
|---|---|
| Superadmin | One initial account with full operational access to the school; creates, deactivates, resets, and manages Admin accounts. The initial provisioning workflow does not create Accountant/Teacher accounts directly. Only Superadmin deactivates Admin accounts. The future multi-school model may let this Superadmin manage authorized schools; additional Superadmins are outside initial scope. |
| Admin | Full lower-level access; may create Admin, Accountant, and Teacher accounts; manages/deactivates Accountant and Teacher accounts; manages fee plans, attendance approvals, promotion, and school finance. |
| Accountant | Fee accounting, collection, receipts, outstanding amounts, student credit, and reconciliation. Requests Admin approval for exceptional changes. |
| Teacher | Assigned-class data, day-wise attendance, Admin-approved attendance corrections, and final Promote/Retain decisions for the assigned classroom. |

### Primary student identifier

Admission number is the main school-facing identifier. It is required for normal student search, fee collection, receipts, reports, and classroom lists; it is unique within the school and must never be reused. An internal opaque ID may still be used as the database primary key.

### Classroom responsibility

A teacher may have no class-teacher assignment or one active class-teacher assignment per academic session. The assignment is made by an Admin and is effective-dated. Attendance and promotion access is restricted to the assigned classroom. Attendance submitted by a Teacher can only be changed after an Admin approves a correction request.

### Fee remaining and credit examples

The replacement ledger must represent both states explicitly:

- Fee assessed ₹9,200; fee paid ₹9,000; outstanding ₹200 for the same student.
- Fee assessed ₹9,200; fee paid ₹9,500; ₹9,200 allocated and ₹300 available student credit.

Available credit automatically applies to the same student's oldest eligible future fee. It is not transferred to siblings automatically. Refunds, exceptional reassignment, and historical corrections require Admin authorization.

Hostel admission and monthly hostel charges remain in the replacement scope. The observed hostel fields below are legacy reference data and must be converted into effective-dated assignments and fee obligations rather than copied as an unversioned form.

## 4. Payment, receipt, and reporting fields

| Area | Fields/options observed |
|---|---|
| Student search | Admission number; student/father name; class/section |
| Period | Remaining academic month endpoints; PAY DUE |
| Charge breakdown | Tuition; science; computer; transport; hostel admission; hostel monthly; miscellaneous; discount; fine |
| Totals | Total Amount; Receiving Amount; Amount Given; Returning Amount |
| Payment identity | Collection date; depositor name; depositor phone |
| Payment mode | Cash; Cheque; Online |
| Cheque detail | Cheque number; bank; branch |
| Online submode | POS Card; POS UPI; QR Code HDFC; NEFT; IMPS; GooglePay; PhonePe |
| Online reference | Transaction number |
| Receipt history | Receipt number; date; duration; mode; detail; total; paid; balance; modify/reprint control |
| Receipt list context | Admission number; student name; father name; class, in addition to financial fields |
| Collection report | From/to; mode/all modes; collector/all users; Total/Date wise |
| Dues report | Class |
| Defaulter report | Class/all; through-month; amount threshold |
| Threshold choices | Greater than 0; All Students; greater than 1,000, 2,000, 3,000, 4,000, 5,000, 6,000, 7,000, 8,000, 9,000, 10,000, 15,000, 20,000 |
| Concession/fine history | Student/class/type/amount; assigned detail/remarks/by; deassigned detail/remarks/by; status; action |

The inspected payment form includes client-side totals and hidden classification/period fields. The replacement must compute these server-side from trusted configuration, not accept submitted totals as authoritative.

## 5. Leaving/transfer certificate fields

**Source E18:**

1. SLC number and admission number.
2. Pupil name; father/guardian name; mother name; nationality; SC/ST/OBC classification.
3. First admission date; admission class; date of birth.
4. Last class studied; last school/board examination and result; subjects.
5. Eligibility for promotion and target class.
6. Month through which dues are paid; fee concession and nature.
7. Total working days and days present.
8. Games/extracurricular activities; general conduct.
9. Application date; issue date; reason for leaving; other remarks.

The replacement also needs explicit withdrawal effective date, clearance/exception status, issuer/approver, certificate version, issue/cancellation history, and immutable generated-document reference. These are proposed additions, not all observed legacy fields.

## 6. Other domain data structures

| Domain | Observed fields |
|---|---|
| School | Name, details, address, phone, email, website, logo, letterhead, module-specific headers, header spacing |
| Class | Class/section, sequence, capacity, student count, subjects, next class |
| Subject/activity | Code, name, order, activity type; Written is a visible activity option |
| Route | Destination, cost, main-route flag, parent/main route |
| Vehicle | Type, number, route, seats |
| Driver/bus record | Record name, bus number, two driver names and phone numbers |
| Hostel | Student(s), admission month, admission charge, monthly charge, remarks, assignment history |
| Product | ID, name, description, vendor, vendor cost, group, cost/unit, alert, stock/remaining/add quantity |
| Finance account | Type, name, remarks |
| Finance account types | School Account; Miscellaneous Expenses; Income; Employee Expense; Transport Expense; School Construction Expense; Stationary Expense; School Expense; Loan Account |
| Income/expense | Source account, beneficiary, date, amount, handed to, reference, attachment, voucher number, generated detail/by |
| Employee | Code/username, role, department, name/parents, contacts, DOB, gender, marital status, joining date, designation, emergency contact, addresses, note, qualification, experience, photo |
| Document request | Status, contact/enquiry reference, message/channel; Pending → In Process → Printed → Verified → Signed → At Office → At Reception → Handed to Parent → Closed, plus Deleted Entry |

## 7. Data collection still needed for migration

- Stable school/student/application/enrollment/receipt/payment IDs and their relationships.
- All historical enrollments, class changes, leaving/restoration events, and admission dates.
- Fee-plan versions, assessment dates, actual charges, paid amounts, balances, allocations, concessions, fines, advances, reversals, refunds, and pending cheques.
- Receipt numbers, original issue timestamps, templates, reprint/cancellation history, and attachments.
- Route/vehicle/hostel assignments with dates; product/store debt if within scope.
- Document/certificate files, type metadata, ownership, original numbers, and status history.
- Current row counts and financial control totals per school, session, class, head, payment mode, and date.

This is a migration checklist, not a claim that the live portal offers a complete export. Use the vendor’s authorized export/backup and reconcile it before import.
