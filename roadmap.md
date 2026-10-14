# Implementation procedure and roadmap

**Version:** 0.5, revised 14 October 2026 (legacy audit: 4 October 2026)
**Goal:** replace the core student/fee workflow safely and efficiently, including hostel fees, transport operations, store operations, teacher attendance, teacher classroom promotion decisions, and the confirmed account hierarchy, then expand the ERP in controlled phases.

## Current delivery position

Levels 1–3, the first operational transport/store slices, and the synthetic Level 4 demo controls are implemented. Management can review payment quotes, selected/automatic partial balances/credit, store settlement, cash/verified manual electronic/cheque flows, receipt snapshots/PDF jobs, Accountant requests/Admin decisions, balanced journal, cash movements, reports/statements and cashier close. Level 4 is not production-approved: school policy, external settlement, printer/object-storage/worker approval, UAT and recovery remain. Live migration, attendance release, promotion, and withdrawal are still approval-gated. `PROGRESS.md` records current tests and the Render demo next step.

Level 4 corresponds to the collection-to-receipt and finance-control work in Phase 3 below; level numbers and phase numbers are not interchangeable. The current 76 backend and 34 Level 4 browser tests are developer evidence, not a completed Phase 3 exit or school UAT. Phase windows and the first-week checklist are the original sequencing guidance, not a current forecast or a list of work to redo.

## 1. Recommended sequence

```text
Confirm school rules + obtain export samples
  → approve scope and screen prototype
  → foundation + identity + enrollment model
  → fee assessment engine
  → payment / receipt / reconciliation vertical slice
   → admissions + services + transport/store operations + reports
  → teacher attendance + promotion decisions
  → withdrawal / certificates + promotion batch
  → migration rehearsal + staff UAT
  → final cutover + supported stabilization
  → remaining ERP modules
```

Start data discovery in week 1. Migration, receipt samples, and financial rules should not wait until the UI is finished.

## 2. Decisions required before production business rules are coded

| Decision | Question / deliverable | Owner | Needed before |
|---|---|---|---|
| D01 — P0 | Confirm official school name, school boundaries, 2026–2027 context and first-release modules | Administrator/principal | Foundation |
| D02 — P0 | What creates an active admission? Who assigns admission number? Can payment/documents remain pending? | Admissions + principal | Admission implementation |
| D03 — P0 | Approve every fee head/rate/period/category; annual vs half-yearly/examination schedule; new vs promoted vs internal X→XI vs readmission | Accountant + principal | Fee engine publish rules |
| D04 — P0 | Explain ₹300 matrix registration vs ₹500 miscellaneous registration; two Payment Receipt screens; actual admission receipt samples | Accountant + admissions | Fee catalog and documents |
| D05 — P0 | Approve EWS, sibling/staff/special concessions, stacking/caps, fine dates/rates; explain annual deadline 26 Apr 2027 | Accountant + principal | Assessments |
| D06 — P0 | Approve partial-payment allocation, advance credit, old-session blocking, settlement, cheque bounce, refund/reversal rules | Accountant | Payment engine |
| D07 — P0 | Approve receipt series scope/pattern, imported numbers, provisional cheque document and reprint/cancellation labels | Accountant | Receipt issuance |
| D08 — P0 | Define withdrawal vs strike-off vs graduation, fee/service cutoff, clearance exception and TC fields/numbering | Principal + accountant + office | Lifecycle |
| D09 — P0 | Promotion/retention/stream rules, target-class mapping, capacity, arrears and rollback authority | Principal + class office | Promotion |
| D10 — P0 | Vendor export formats, stable IDs, history range, attachment access, financial control totals; detailed vs opening-balance import | Vendor + school accountant + technical lead | Migration design |
| D11 — P0 | Confirm the four-role hierarchy, Admin creation/deactivation rules, teacher classroom assignment, attendance correction approval, and promotion decision authority | Superadmin + administrator + principal | Permissions/UAT |
| D12 — P0 | Real staff permissions, counters/shifts, correction authority and day-close process | Administrator + accountant | Permissions/UAT |
| D13 — P0 | Hosting budget, backup retention, RPO/RTO, Render plan, health-check endpoint, uptime-alert recipient, internet/printers, support owner, cutover window | School + technical lead | Infrastructure/go-live |
| D14 — P1 | Parent portal, gateway provider, reminder channels and message approvals | School + accountant | Integrations |
| D15 — P1/P2 | Which store/finance/exam/front-office/app modules are genuinely used? Define continuity for each deferred module; attendance day-wise marking is already P0 | Department owners | Scope freeze / expansion |

Maintain a decision log with date, owner, answer, affected requirement and example calculation. An unresolved item should be a visible dependency, not a guessed rule buried in code.

## 3. First working session with the school

Allow approximately 2–3 hours with the accountant, admissions operator and principal/administrator.

### Ask them to explain using existing records or a staging copy

1. One ordinary new admission and one readmission/internal XI admission.
2. One monthly receipt, one annual/admission receipt, one partial payment, one advance and one old-session due.
3. One concession/EWS example, bounced cheque, cancelled receipt and refund if used.
4. One withdrawn/struck-off student and a completed TC/SLC.
5. Last year's class promotion, including retained and graduating students.
6. Transport start/stop and hostel charges, and whether store dues block clearance.
7. Daily cash/bank/cheque reconciliation and month-end reporting.

### Collect artifacts

- Approved fee circular/rate sheet and actual installment calendar.
- Redacted receipt, admission acknowledgment, TC/SLC, fee certificate and report samples.
- Class/section/stream mappings, role list and authorized exception rules.
- Export schema and small representative masked sample; request full export later for migration.
- Current counts and signed outstanding/credit/payment totals at a defined cutoff.
- Printer formats and office network requirements.

Read-only production navigation can illustrate screens; any creation, payment, promotion, withdrawal or cancellation demonstration must use an isolated staging copy or existing evidence.

## 4. Delivery phases and exit criteria

### Phase 0 — discovery closure and data access

**Indicative timing:** weeks 1–2.

- Review this audit and correct terminology with school staff.
- Resolve D01–D15 or mark explicit owners/deadlines for remaining dependencies.
- Agree P0 scope and continuity for deferred modules.
- Obtain redacted artifacts and sample export; assess source quality early.
- Convert PRD IDs into a backlog with acceptance criteria and dependency links.

**Exit:** school-approved core rules, scoped backlog, export strategy and signed definition of financial totals.

### Phase 1 — UX and foundation

**Indicative timing:** weeks 2–4; overlap prototype work with discovery.

- Prototype directory, collection, receipt, admission, teacher attendance, withdrawal and promotion.
- Validate the Accountant journey, Teacher attendance journey, Admin approvals, and printer output with staff.
- Bootstrap the proposed workspace, CI, staging infrastructure and database migrations.
- Implement authentication, the four-account hierarchy, admission-number identity, school/session/class masters, Admin classroom assignments, audit, and private file handling.
- Create synthetic seed data representing all important lifecycle/payment cases.

**Exit:** usable staging foundation; permission boundaries tested; key flows and print templates approved.

### Phase 2 — student/enrollment and fee engine

**Indicative timing:** weeks 4–7.

- Implement permanent student/family identity and session-specific enrollment/history.
- Implement profile search/edit with duplicates and concurrency handling.
- Build Admin-managed fee plans, versioning, period assessment, concessions/fines, dated transport/hostel service-fee rules, transport masters/allocation, initial store inventory/issue operations, and student credit/outstanding calculations.
- Build financial journal, allocation primitives and calculation previews before full payment UI.
- Implement vendor-data staging, mapping and first dry-run validation in parallel.

**Exit:** agreed golden fee examples match exactly; repeated assessment creates no duplicate obligations; enrollment history and import mappings are sound.

### Phase 3 — collection-to-receipt vertical slice

**Indicative timing:** weeks 7–10.

- Implement collection quotes and idempotent transaction commit.
- Support cash, verified manual bank modes, cheque pending/clearance/bounce, partial payments, remaining balances, and automatic same-student advances/credit.
- Implement unique receipt numbering, immutable snapshots, current-status PDF generation/jobs and reprint.
- Add reversals/refunds, cashier shifts/day close, receipt register and student ledger.
- Test concurrency, lost responses, renderer failures and reconciliation.

**Current demo exit evidence:** the synthetic payment cycle passes backend/browser checks and traces charge, payment, allocation, credit, correction, receipt, journal and report values. **Production exit remains open** until accountant review, approved policy, settlement matching, printer/object-storage approval and recovery/UAT are complete.

### Phase 4 — complete core operating workflow

**Indicative timing:** weeks 10–13.

- Complete admissions/follow-ups, document checklist, confirmation and first assessment.
- Finish transport/hostel fee assignments, transport operational reports, store issue/stock reports, dues/collection/enrollment reports, and historical views.
- Implement Teacher day-wise attendance for assigned classrooms and Admin-approved correction requests.
- Implement final Teacher Promote/Retain decisions and Admin-reviewed promotion exceptions.
- Implement withdrawal/strike-off/readmission, clearance and certificate issuance.
- Implement previewable, resumable promotion and next-session fee assignment.
- Create operational help and role-specific training exercises.

**Exit:** end-to-end admission → collection → promotion/withdrawal works against approved scenarios; each deferred module has a documented handoff.

### Phase 5 — migration rehearsal, performance and school UAT

**Indicative timing:** weeks 13–16.

- Run a complete authorized import in staging and reconcile counts/amounts.
- Resolve duplicates, orphan transactions and rate/receipt discrepancies with named owners.
- Validate representative old receipts, histories, pending cheques and balances.
- Test expected load, restore backups, and rehearse final delta/cutover.
- Conduct role-based UAT and printer checks; fix blocking defects.

**Exit:** no unexplained financial differences; UAT approval, successful restore, rehearsed cutover and trained operators.

### Phase 6 — go-live and stabilization

**Indicative timing:** weeks 16–18, depending on data quality and availability.

- Agree and execute the future legacy freeze/final export under school/vendor coordination.
- Reconcile final balances and transaction/document numbering.
- Enable production collection in one authoritative system.
- Support office staff directly during initial collection days.
- Reconcile daily; review errors, payment retries, PDF generation, cash variance and backup status.
- Close stabilization when the school signs off routine operations and support handover.

**Exit:** reliable daily operation, agreed support arrangements and a prioritized expansion backlog.

## 5. Realistic effort and staffing

The above is an **indicative 14–18 week core-release plan** for two capable developers with part-time design/QA/DevOps support and responsive school stakeholders. The phase windows illustrate dependencies/overlap rather than fixed delivery promises.

For a solo developer, budget approximately **24–32 weeks** for comparable scope, verification, migration and rollout. Poor export quality, unclear financial rules, full accounting, extensive historical document recovery or additional daily-use modules can extend either estimate.

P1/P2 features are estimated separately after discovery. Do not promise a complete learning, HR, inventory, accounting, and examination ERP within the core student/fee estimate; day-wise attendance and assigned-class promotion decisions are part of the revised core release.

## 6. First-week execution checklist

### Day 1 — school rules

- Read `feature-audit.md` and `reference-data.md` with school staff.
- Confirm official school identity and P0 scope.
- Assign decision owners; obtain fee circular and receipt/TC samples.

### Day 2 — financial and data contract

- Agree fee applicability and prepare 10–15 representative calculation cases.
- Request export schema/sample and current reconciliation totals.
- Decide proposed receipt numbering and old-history strategy.

### Day 3 — prototype

- Sketch/click through student search → fee collection → receipt.
- Include partial payment, annual/admission charge separation, timeout recovery and day close.
- Include remaining balance, automatic student credit, hostel fee, and Admin special-access approval.
- Validate with the cashier before writing the full frontend.

### Day 4 — technical foundation

- Confirm stack/hosting and bootstrap the workspace described in `trd.md`.
- Confirm Render services, `/health` endpoint, uptime-monitor alert recipient, paid production plan, and backup/recovery approach.
- Implement initial school, session, class, student and enrollment migrations.
- Set up CI and isolated staging with synthetic records.

### Day 5 — first demonstrable slice

- Show authenticated school-scoped student search and Student 360 skeleton.
- Present the fee-rule calculation contract and sample results.
- Review source-data issues, prototype feedback, next sprint backlog and blocking decisions.

The foundation and demonstration work in this original checklist has since been implemented in staging/demo. Use the current delivery position and section 10 to choose remaining work; do not recreate the workspace or repeat completed foundation tasks.

## 7. Suggested backlog order

| Order | Epic | PRD references | Depends on |
|---:|---|---|---|
| 1 | Identity, school scope, masters, audit | FND-01–FND-04 | D01, D11 |
| 2 | Student identity, enrollment, families | STU-01–STU-03 | Class/session model, D02 |
| 3 | Versioned assessments and service charges | FEE-01–FEE-05, SRV-01 | D03–D06 |
| 4 | Payment ledger, partial/advance, modes | PAY-01–PAY-04 | Fee engine, D06 |
| 5 | Receipt/correction/reconciliation | PAY-05–PAY-06, REP-01–REP-02 | D07, payment engine |
| 6 | Admissions and acknowledgment | ADM-01–ADM-04 | Student/enrollment/fee foundation |
| 7 | Withdrawal/certificates/readmission | LFC-02–LFC-03, DOC-01 | D08, financial/service rules |
| 8 | Promotion and rollover | LFC-01 | D09, session/fee model |
| 9 | Core reports and migration readiness | REP-03, MIG-01–MIG-03 | Run migration discovery from epic 1; finalize against complete model |
| 10 | Teacher attendance and promotion decisions | ATT-01–ATT-04, LFC-01 | Role foundation, class assignments, D11 |
| 11 | Parent/gateway/reminders | PAY-07–PAY-08, REP-04, DOC-02, SRV-02 | Stable core, D14 |
| 12 | Remaining operational modules | Separate PRDs after discovery | D15 |

## 8. Go-live gate

### Product and finance

- [ ] School approves rates, periods, concessions, lifecycle rules and document samples.
- [ ] Core UAT scenarios pass for each real office role.
- [ ] Outstanding balances, credits, receipt/payment totals, pending cheques and service balances reconcile.
- [ ] Duplicate-payment/concurrent-cashier, partial/advance and reversal/refund tests pass.
- [ ] Historical receipts/enrollments remain unchanged after rate/class/profile updates.
- [ ] Withdrawal and promotion batches show correct historical and future financial effects.

### Data and operations

- [ ] Every source row is mapped, excluded with reason, or resolved; no unexplained financial exceptions.
- [ ] Final import/delta procedure has been rehearsed and timed.
- [ ] Production permissions, hosting, monitoring, backups and restore meet agreed requirements.
- [ ] Receipt/TC printing works on the actual office printers.
- [ ] Staff have named support contacts, concise task guides and a day-close procedure.
- [ ] Cutover owner and post-transaction rollback/fix-forward process are explicit.

## 9. Risks and practical responses

| Risk | Response |
|---|---|
| Legacy labels imply the wrong rule | Require examples and accountant decisions; preserve audit evidence and unique fee codes |
| Vendor export lacks allocations/history | Choose a signed opening-balance boundary with reference-only legacy receipts, rather than inventing historical allocations |
| UI built before money model | Complete calculation/ledger invariants and a payment vertical slice early |
| Daily-use module omitted from P0 | Obtain department usage confirmation and a reconciled continuity plan before scope freeze |
| Mid-year migration loses prior dues or credits | Preserve source-session/head lineage; reconcile per student and aggregate totals |
| Two systems accept money simultaneously | Single authoritative system; parallel reporting/reconciliation with a documented cutover point |
| Payment recorded but browser/PDF fails | Idempotent status recovery and independent PDF retries |
| Promotion treated as editing the current class | Session-specific enrollment and previewable batch transitions |
| Leaving student deleted | Dated inactive/withdrawn record with retained ledger and certificates |
| Scope expands into all ERP modules | Separate phase/PRD/estimate after core acceptance |

## 10. What to do next

1. **Confirm outstanding school decisions, especially D06/D07/D12.** Review allocation/store settlement, receipt series, correction authority, cashier dates/shifts and bank/refund evidence. Include a Teacher for the still-pending attendance and promotion workflows.
2. **Obtain a vendor export sample and redacted print samples immediately.** This establishes whether the financial history can be migrated faithfully.
3. **Demonstrate the existing Accountant staging flow and fee calculations.** Validate admission-number search, partial payment, store settlement, credit, frozen retries, receipt history and cash close with synthetic data. Attendance and promotion are designs to validate, not delivered screens.
4. **Finish Level 4 controls before expanding.** Start with Accountant correction request → Admin approve/reject, bound to one action/record/version and applied once. Then complete journal/credit lineage, cash movements, PDF worker, reports and signed policy configuration. Add broader modules only after financial acceptance.

The immediate deliverables are a school-approved financial decision log, an approved review of the current synthetic prototype, and completion of the remaining Level 4 acceptance criteria. The unchecked go-live gates above remain release requirements even where narrow automated staging tests already pass.
