# PCDAV School ERP
## Management Overview and Approval Guide

**For:** Principal, school management, office team, admissions team, accountant, and department heads
**Updated:** 13 October 2026 — version 0.4
**Purpose:** explain in simple language what the new website does, what staff will be able to do, what is still being built, and what the school must approve.

> **Important:** This is a staging/prototype implementation using test data. It is not ready to accept real school payments yet.

---

## 1. The short version

The new website is being built as one secure school workspace. Staff will sign in according to their role and will see only the work they are allowed to do.

The main working chain is:

> **Admission → Student record → Class/session → Fee plan → Assessment → Payment/receipt → Reports → Attendance → Promotion or leaving**

The current prototype already covers:

- Secure staff login and four staff roles.
- Admissions and student enrollment.
- Student search by admission number.
- Student 360 profile and history.
- Academic sessions, classes, subjects, and teacher assignments.
- Fee heads, fee plans, assessment previews, balances, and student credit.
- Hostel and transport fee/service assignments.
- Transport routes, vehicles, drivers, student allocation, capacity checks, and reports.
- Store groups, clusters, vendors, products, stock, student issues, and store balances.
- Trial payment collection, fee/store settlement, receipt snapshots and cashier cash close.
- Audit history and responsive desktop/mobile screens.

The core payment journey now works with synthetic test data. Remaining work includes the Accountant-to-Admin approval process, downloadable receipt PDFs, complete financial journal and credit history, cash handovers/deposits, full reconciliation and approved school rules. The school must not use the prototype to record real money until those controls are completed and approved.

---

## 2. What staff will see in the website

| Area | What staff can do now | Status |
|---|---|---|
| Login and security | Sign in, change a temporary password, and use role-based access | Working in prototype |
| Users and roles | Admin/Superadmin can create permitted staff accounts and manage access | Working in prototype |
| Admissions | Register applications, review them, approve, and enroll students | Working in prototype |
| Students | Search by admission number/name and open Student 360 | Working in prototype |
| Academic setup | Manage sessions, classes, subjects, capacity, and teacher assignment | Working in prototype |
| Fee plans | Create fee heads and versioned fee rules for a session | Working in prototype |
| Fee assessment | Preview and create monthly, annual, half-yearly, and one-time obligations | Working in prototype |
| Fee ledger | View assessed amount, outstanding amount, and same-student credit | Working in prototype |
| Hostel/transport services | Assign dated hostel or generic service charges | Working in prototype |
| Transport management | Manage routes, vehicles, drivers, dated allocation, capacity, and operational lists | Working in prototype |
| Store management | Manage groups, clusters, vendors, products, stock receipts, student issues, and defaulters | Working in prototype |
| Collect payment | Preview allocation, record test cash/verified manual electronic payments or pending cheques, leave partial dues or student credit | Working in staging only |
| Receipts and corrections | View original receipt snapshots, record browser reprints, clear cheques; Admin can reverse/refund/bounce | Working in staging; PDFs and approval requests pending |
| Cashier shifts | Open a shift, compare expected/count cash, record variance and close | Basic close working; handovers/deposits and full reconciliation pending |
| Attendance | Teacher day-wise attendance and Admin corrections | Planned |
| Promotion/leaving | Teacher Promote/Retain, Admin batch promotion, withdrawal, TC/SLC | Planned |
| Migration/reports | Import approved live data and complete management reports | Planned after approval |

---

## 3. Staff roles in simple terms

### Superadmin

- Full access to the school workspace.
- Manages Admin accounts.
- Handles exceptional access and school-level control.

### Admin

- Runs school operations.
- Creates and manages Admin, Accountant, and Teacher accounts within the rules.
- Manages admissions, students, classes, fee plans, services, transport, and store operations.
- Can make reasoned, audited financial corrections in staging. The formal request/approval inbox is still to be built.

### Accountant

- Views fee plans, assessments, ledgers, outstanding balances, credit, transport/hostel charges, and store balances.
- Can demonstrate test payment collection, receipt/reprint, cheque clearance and basic cashier close now.
- Cannot directly refund, reverse or bounce payments; those actions are Admin/Superadmin-only. The Accountant request and Admin approval workflow remains unfinished.
- Cannot change fee rules, transport masters, store stock, or staff permissions in the current role model.

### Teacher

- Sees assigned classroom students only.
- Will mark attendance and make Promote/Retain decisions for the assigned classroom.
- Does not see fee, transport-management, or store-management administration.

---

## 4. How the main student journey will work

### Step 1 — Admission

1. Office staff create an application.
2. Staff capture the student, guardian, contact, class, category, and document information.
3. Staff review the application and move it through the agreed stages.
4. Admin approves the application and selects the class/session.
5. The system allocates one permanent admission number.
6. The student becomes available in the registry.

The admission number is the school-facing identity. It is unique and is never reused.

### Step 2 — Enrollment

The same student can have a new enrollment for a new academic session. The previous session, class, fee obligations, and receipts remain in history.

### Step 3 — Fees and services

Admin selects the published fee plan and assesses eligible charges. Monthly, annual, admission, transport, hostel, and other charges remain visibly separate.

### Step 4 — Payment and receipt

This journey is now available for staging review at Collect payment. Open a cashier shift for the business date, find the student, enter an amount and review the server's allocation before saving:

- Current fee dues and open store issues.
- Existing student credit applied to eligible fees.
- Amount received.
- Automatic oldest-due allocation to each fee/period and store issue.
- Remaining balance.
- Student credit, if any.
- Payment mode and reference.

Cash tendered and change are separate from the amount posted. Manual electronic entries require the staff member to confirm receipt of funds and record evidence; the system is not connected to a bank or payment gateway. A pending cheque has no final receipt or settled allocation until clearance.

The server protects against duplicate payment commands, duplicate electronic references, over-allocation and stale quotes. If a response is lost, staff retry the same saved command, not a new collection. Original receipt data is retained even if the student name later changes. Browser reprinting records a reason and does not collect money again. Receipt PDF downloads are not implemented.

The screen currently chooses allocation order automatically; selecting individual obligations or overriding school rules is not available. Full concession/fine rules and production receipt numbering still require implementation and approval.

---

## 5. Fees, balance, and student credit

The system stores money as exact paise values, not rounded screen calculations.

### Example: partial payment

- Fee assessed: ₹9,200.
- Amount paid: ₹9,000.
- Outstanding balance: ₹200.

### Example: extra payment

- Fee assessed: ₹9,200.
- Amount paid: ₹9,500.
- Fee allocated: ₹9,200.
- Student credit: ₹300.

Credit belongs to that student. It is automatically applied to the same student’s oldest eligible future fee. It is not silently transferred to siblings.

### Fee plan options

- Monthly.
- Annual.
- Half-yearly.
- One-time.
- New admission.
- Continuing/promoted/readmission eligibility.
- EWS, general, sibling, staff-child, or other approved categories.
- Class-specific or school-wide rules.
- Effective start and end dates.

The school must approve the exact charge month and eligibility for annual, examination, admission, promoted, internal Class X→XI, readmission, EWS, sibling, and mid-year cases.

---

## 6. Transport management

The live ERP was checked in read-only mode. Its visible transport areas included allocation, transport detail, route/vehicle master information, and print-list options. The new website now has a clearer version of this operational flow.

### Route master

Admin can record:

- Route name.
- Campus.
- Destination or stop.
- Monthly transport charge.
- Optional route capacity.

### Vehicle master

Admin can record:

- Bus number and vehicle name.
- Number of seats.
- Driver 1 name and phone.
- Driver 2 name and phone.

### Student allocation

1. Search for the student by admission number or name.
2. Select the active enrollment.
3. Select a route and, if available, a vehicle.
4. Enter the start date and optional end date.
5. The system checks overlapping allocations and capacity.
6. The route charge is copied into the dated student allocation.

### Operational lists

Staff can filter transport assignments by:

- Month.
- Route.
- Vehicle.
- Class.

The list shows the student, class, route, vehicle, monthly charge, dates, and active/ended status. Stopping transport does not erase historical charges.

### Still required

- Import the school’s actual routes, vehicles, drivers, and current student allocations after an approved data export.
- Confirm mid-session route-change and charge rules.
- Confirm whether transport balances block school leaving or TC/SLC.

---

## 7. Store management

The live ERP was checked in read-only mode. Its visible Store Mgmt. menu included groups, products, clusters, vendors, issues, receipts, collections, defaulters, print lists, and deleted receipts.

The new website now provides the operational inventory and student-issue foundation.

### Store master information

Admin can create:

- **Groups:** for example Books, Uniform, Stationery, or other school-defined categories.
- **Clusters:** reusable bundles such as a class starter kit.
- **Vendors:** supplier name and contact information.
- **Products:** product name, description, group, unit cost, and low-stock alert quantity.

### Stock receiving

1. Select a product.
2. Select a vendor or mark it as a direct purchase.
3. Enter quantity, unit cost, date, and purchase reason/reference.
4. The system increases available stock.
5. A stock receipt and stock movement history are saved.

### Issuing an item to a student

1. Search the student by admission number or name.
2. Select the active enrollment.
3. Select the product and quantity.
4. Enter the issue date and reason.
5. The system checks available stock.
6. Stock decreases and an issue record is created.
7. The amount becomes an open student store balance; the shared staging collection screen can now settle it wholly or partially.

### Cancellation and stock restoration

An Admin can cancel an unpaid open issue with a reason. The product quantity is restored and the original issue remains in history as cancelled. An issue with payments cannot simply be cancelled: its payment allocations must first be resolved through the authorized correction flow. The system does not silently delete stock history.

### Store dashboard and lists

The store workspace shows:

- Number of active products.
- Low-stock products.
- Open student issues.
- Open store balance.
- Groups, clusters, vendors, products, stock receipts, and student issues.
- Store defaulters/open balances.

### Still required

- Import the school’s actual product, quantity, vendor, and historical student-balance data.
- Approve whether store issues should remain in the shared collection screen or use a separate production receipt policy. The staging default includes them in automatic oldest-due allocation.
- Complete store-specific collection reports/approved print formats and financial release controls. Shared receipt snapshots and void/refund history are already present in staging.

---

## 8. What is ready and what is not

| Ready for staging review | Remaining production requirement |
|---|---|
| Login, role boundaries, admissions, enrollment, academic setup | Staff UAT, operational approval and production access review |
| Student registry, Student 360, fee plans and assessment | Approved rates, concessions/fines, eligibility and old-session policies |
| Fee/store partial collection, credit, verified manual electronic payments | Full financial journal, credit-use history/recovery and bank reconciliation |
| Pending/cleared/bounced test cheques | Approved cheque/bounce-charge process and settlement checks |
| Receipt snapshots, browser reprints, Admin reversals and refunds | Accountant request/Admin approval, approved numbering, generated PDFs and printer validation |
| Cashier opening float, counted cash and variance close | Deposits/handovers/other cash movements and full reconciliation |
| Hostel/transport charges and transport allocation | Approved live service data and charge/cutoff policies |
| Store inventory, issues and shared balance settlement | Live store import, store-specific reports and approved receipt policy |
| Synthetic automated workflows | Attendance/promotion/leaving release, migration, backups and cutover sign-off |

The website can be demonstrated with synthetic data. Do not import the live school database or collect real money until the school signs off the remaining controls.

### What was checked on 13 October 2026

- 26 backend/database tests passed, covering the student/fee foundations and payment security, retries, refunds, cheque states, exact amounts and cashier-close boundaries.
- 23 browser tests passed against controlled simulated API responses, checking the real screens and request formats.
- One additional live browser test passed against the local API and PostgreSQL: a synthetic Accountant opened a shift, collected a partial cash payment, settled a store issue, reopened the original receipt after a student-name change, recorded a reprint and closed with the correct cash total.
- Both application builds and database migration/schema checks passed.
- These are developer checks, not school UAT or approval of financial policies. Receipt PDFs, physical printer output, the complete financial journal, standalone lint setup and production recovery remain outstanding.

---

## 9. Decisions needed from management

Please mark each item as **Approved**, **Change required**, or **Need discussion**.

### Fees and payment

- [ ] Monthly rates for every class/section.
- [ ] Annual maintenance and examination charge months.
- [ ] New-student registration and admission charges separately.
- [ ] Promoted, internal X→XI, readmission, and mid-year rules.
- [ ] EWS, sibling, staff-child, and other concessions.
- [ ] Fine amount, grace period, and waiver authority.
- [ ] Cash, bank, online, and cheque rules.
- [ ] Receipt numbering, cancellation, reprint, and refund rules.
- [ ] Oldest-due fee/store allocation, advance credit, and old-session restrictions.
- [ ] Evidence required for manual electronic verification and bank/refund reconciliation.
- [ ] Accountant request/Admin approval authority and cash handover/deposit process.

### Transport

- [ ] Approved route and destination list.
- [ ] Approved monthly amount for each route.
- [ ] Vehicle and driver list.
- [ ] Route/vehicle capacity policy.
- [ ] Mid-session route change and stop policy.
- [ ] Whether transport balance blocks clearance/TC.

### Store

- [ ] Product, group, cluster, and vendor list.
- [ ] Opening stock quantities and values.
- [ ] Whether a student issue creates a payable balance.
- [ ] Whether store items are included in fee receipts or have separate receipts.
- [ ] Return, replacement, cancellation, and damaged-stock rules.
- [ ] Whether store balance blocks clearance/TC.

### Migration and launch

- [ ] Authorised export from the existing vendor/system.
- [ ] Student, enrollment, fee, receipt, transport, store, and balance control totals.
- [ ] Named school testers and final decision owner.
- [ ] Printer formats and receipt paper requirements.
- [ ] Backup, hosting, support contact, and launch date.

---

## 10. Simple next steps

1. **Management review:** confirm the decisions in section 9.
2. **Staging demonstration:** staff test admission, student search, fee-plan preview, transport allocation, store issues, payment quotes, partial/advance payments, original receipts, cheque handling and basic cash close using sample data.
3. **Finish payment controls:** first add the Accountant request/Admin approval workflow; then complete journal/credit history, cash movements, PDF generation, reports and approved financial policies. Existing collection and receipt screens are not a substitute for these controls.
4. **Data preparation:** receive an authorised export and reconcile counts and balances.
5. **User acceptance testing:** accountant, admissions operator, Admin, Teacher, and management test their own journeys.
6. **Go-live rehearsal:** test backup restore, final import, printer output, permissions, and support process.
7. **Production launch:** use one authorised collection system and reconcile every day during the first operating period.

---

## 11. Technical note for the implementation team

The detailed technical documents remain available for development and approval:

- `feature-audit.md` — existing ERP inventory and evidence.
- `reference-data.md` — observed fee, class, field, and dropdown reference.
- `prd.md` — product requirements and acceptance criteria.
- `design.md` — screen and user-journey design.
- `trd.md` — database, financial safety, migration, hosting, and testing requirements.
- `roadmap.md` — delivery phases and go-live gates.
- `PROGRESS.md` — current implementation status and exact verification commands.

The management team does not need to read these documents line by line. They are supporting documents for the development team and future approvals.

---

## Final recommendation

Approve the direction for staging demonstration, not production payment use yet. The prototype now includes student/enrollment and fee foundations, transport/store operations, and a tested payment-to-receipt/basic-close journey. The next implementation task is the Accountant-to-Admin correction approval workflow. The next release gate also requires complete journal/credit history, cash movements, PDFs, reconciliation and the school decisions above. No live records or real collections were used for the local automated verification.

**Report status:** Simplified management overview — ready for comments and staging review.
