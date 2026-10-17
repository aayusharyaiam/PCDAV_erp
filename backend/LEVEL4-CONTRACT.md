# Level 4 completion contract — demo implementation

The user approved Admin-configurable **demo defaults** on 13 October 2026, not real school financial rules. Existing authentication, CSRF, BigInt paise strings, school scope, serializable transactions and immutable receipt originals remain mandatory. This document coordinates the backend/frontend additions; update it if an implemented response differs.

## Corrections and approval inbox

- `GET /finance/requests?page=1&limit=25&status=REQUESTED` returns `{ items, total, page, limit }`. Financial roles may read their school; Teachers are denied.
- `POST /finance/requests` requires `Idempotency-Key` and `{ paymentId, type: 'REFUND'|'REVERSE'|'BOUNCE', amountMinor? (required for refund), reason, reference?, businessDate?, shiftId? }`. Returns the request. It records an immutable requested payload and a financial-state fingerprint, without posting money.
- Request shape: `{ id, schoolId, paymentId, type, amountMinor: string|null, reason, reference, businessDate: string|null, shiftId: string|null, status: 'REQUESTED'|'APPLIED'|'REJECTED'|'STALE', requestedBy, createdAt, decidedBy: string|null, decidedAt: string|null, decisionReason: string|null }`.
- `POST /finance/requests/:id/approve` accepts `{ reason }`, Admin/Superadmin only. In one transaction revalidate the frozen financial state, apply the exact correction once, and mark APPLIED. Replay of the same approval does not double-apply. A changed balance/credit/shift/policy requires STALE and a fresh request, not wider permission.
- `POST /finance/requests/:id/reject` accepts `{ reason }`, Admin/Superadmin only. Rejection makes no financial change.
- The inbox's REQUESTED count is the in-app notification. Accountants see Request correction instead of direct correction authority; existing direct Admin endpoints remain audited.

## Cash movements

- `GET /cashier-shifts/:id/movements` returns `{ items }`.
- `POST /cashier-shifts/:id/movements` requires `Idempotency-Key` and `{ type: 'DEPOSIT'|'HANDOVER'|'EXPENSE', amountMinor, reason, reference }`.
- Accountant may deposit/hand over from their own open shift; EXPENSE is Admin/Superadmin-only. All movement types reduce expected cash, must not exceed available cash and require a reference/reason. Closed shifts cannot be changed. Duplicate keys replay, different payloads conflict.
- Movement shape: `{ id, schoolId, shiftId, type, amountMinor, reason, reference, createdBy, createdAt }`.
- Shift responses retain existing fields and add `cashReceivedMinor`, `cashRefundedMinor`, `cashMovedMinor`; expected = opening + captured cash - cash corrections - cash movements.

## Admin financial policy

- `GET /finance/policy` returns `{ schoolId, version, receiptPrefix, receiptScope: 'SCHOOL'|'FINANCIAL_YEAR', allowAdvance, blockPreviousSession, bounceFeeMinor }`.
- `POST /finance/policy` (Admin/Superadmin) accepts the same mutable fields plus `{ version, reason }`; stale version conflicts.
- Demo defaults: receiptPrefix `DEMO/FEE`, SCHOOL sequence scope, allowAdvance true, blockPreviousSession false, bounceFeeMinor `0`. Display that these are demo policies. Prefix/scope changes never overwrite old snapshots or reuse an issued number.
- Quotes accept optional `obligationIds` and `storeIssueIds`; omitted arrays mean all eligible dues, provided arrays mean explicitly selected IDs. Validate student/school ownership, duplicates and stale selection. Credits apply to oldest eligible fees before new tender. Policy changes invalidate an existing quote. Old-session blocking forbids new-session allocations while old-session dues remain unpaid after the proposed allocation.
- A configured bounce fee creates one linked fee obligation on bounce, never a repeated charge on retry. No real school rate is assumed.

## Statements and reports

- Existing `GET /reports/collections` remains the capture/correction-event-date summary. Support `fromDate`, `toDate`, `mode`, `cashierId` and identify the event-date basis.
- `GET /reports/dues?page=1&limit=25&studentId=&sessionId=&classId=&feeHeadId=&asOf=` returns `{ items, total, page, limit, totals }`; items contain `{ sourceType, sourceId, studentId, admissionNumber, studentName, sessionId, classId, feeHeadId: string|null, label, dueDate, assessedMinor, outstandingMinor, overdue }`. Totals describe the full filtered set, not page totals. `asOf` is a due-date/aging cutoff against current balances, not a historical ledger reconstruction; label it honestly.
- `GET /students/:id/statement` returns `{ student, fees, storeIssues, credits, payments, totals }`, including source/link IDs, allocation/release/refund lineage and pending amounts. Define final nested shapes from implementation for the UI.
- `GET /reports/journal?page=1&limit=25&fromDate=&toDate=&studentId=` returns `{ items, total, page, limit, totals: { debitMinor, creditMinor, balanced } }`. Entries have `{ id, businessDate, sourceType, sourceId, description, lines: [{ account, studentId: string|null, debitMinor, creditMinor }] }`.
- Implement a balanced journal for assessments/store issues, credit grants/applications, capture/allocation, release/refund/reversal/bounce and cash movements. Enforce balance in PostgreSQL, preserve history, and reconcile derived receivable/credit to operational balances. Existing balances require explicit opening entries rather than invented historical events.
- Record fee-credit allocation lineage for both assessment and collection. An authorized refund/reversal of advance already used by later assessment must release the traced allocations atomically and restore the correct dues, not become permanently unrecoverable or silently erase fees.

## Receipt PDF jobs (shared schema contract)

Backend schema owner adds `ReceiptPdfJob` with: `id String @id @default(uuid())`, `schoolId String`, `receiptId String`, `receiptStatus String`, `status String @default("PENDING")`, `attempts Int @default(0)`, `content Bytes?`, `sha256 String?`, `errorCode String?`, `requestedBy String`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`, `@@unique([receiptId, receiptStatus])`, `@@index([schoolId, status])`.

The receipt renderer owns separate PDF service/controller files. The existing metadata-only PDF controller route is removed by the backend owner; the parent registers the new controller/worker. Capture/clearance creates a PENDING job atomically with the receipt, but rendering never runs inside a payment transaction. Status corrections create a job for the new status without modifying the original snapshot.

- `GET /receipts/:id/pdf` is an authenticated download of a generated snapshot PDF with current status clearly marked. If not yet ready, return an explicit retryable 503 without undoing payment. A status change must never download an old status as a valid current receipt.
- `POST /receipts/:id/pdf/retry` with `{ reason }` enqueues/retries a failed job for financial roles, scoped by school. `GET /receipts/:id/pdf/status` returns `{ status, attempts, errorCode, downloadAvailable }`.
- A bounded background task within the API processes durable jobs on free Render, supports lease/recovery after restart and avoids racing writes. PDFs are stored as private PostgreSQL bytes for this small synthetic demo, not on ephemeral disk. A production object-store/worker rollout and office-printer approval remain operational gates.
- Renderer unit/integration tests cover immutable identity, multipage allocations, current void/refund overlay, failures/retry, authorization and PDF signature. No external message/payment service is invoked.

## Deployment boundary

Keep NODE_ENV=production and secure cookies. A separate APP_MODE=demo may explicitly disable document uploads if no private object storage is configured; do not permit ephemeral uploads in a publicly hosted demo. Demo is for synthetic data only. Real school rates/receipts, gateway/refund bank execution, vendor import, load/restore/UAT and production release are not approved by this contract.

## Implemented backend response details (coordination)

- Approval/rejection returns the request shape above with HTTP 201. An approval whose frozen financial state changed **commits and returns `status: 'STALE'`**, without posting money. Repeating the same decision/reason returns the already decided request. A conflicting decision/reason returns 409. Optional correction dates/drawers are resolved and frozen when requesting, so `businessDate` and cash `shiftId` in the response may be filled even when omitted on input. Requested and decision reasons remain separate; financial postings retain the requested reason/reference and identify the applying Admin. Requests never expose internal fingerprints/command hashes.
- Cash movement GET/POST returns only the documented public fields. Shift open/list/close responses include all three movement totals and `expectedCashMinor`. Cash refunds/reversals also cannot exceed the selected open drawer's available cash.
- SCHOOL receipts display `PREFIX/SCHOOL/NNNNNN`, continuing the existing school-wide counter across prefix changes. FINANCIAL_YEAR receipts display `PREFIX/FY2026-27/NNNNNN`, with a persisted per-prefix/per-April–March-year counter. Switching scope/prefix back resumes its prior sequence. April–March is an explicitly labeled demo formatting convention. Receipt snapshots add `demoPolicy: { version, receiptPrefix, receiptScope, scopeKey, financialYearStartMonth: 4, label }`; prior snapshots stay unchanged.
- Quotes add `allocationPlan.selection`, `allocationPlan.policyVersion`, and an internal balance fingerprint. Explicitly selected fee IDs define eligible fee-credit targets; within those targets credit applies oldest-first before tender. An empty array selects none of that source type. `projectedOutstandingMinor` remains the **whole student's** remaining fee/store balance, including unselected dues. Pending cheques retain the selected IDs and recalculate their current balances/policy at clearance; already settled selected IDs require no allocation.
- Receipt issuance creates a PENDING job atomically; each correction upserts the current-status job as PENDING and clears stale bytes/hash/error without resetting its fencing attempt count. The metadata-only PDF GET route has been removed. The parent registers the PDF agent's controller/worker separately.

### Statement nested shapes

`GET /students/:id/statement` returns current balances/history for one scoped student:

- `student: { id, admissionNumber, name }`.
- `fees[]`: existing FeeObligation fields (including `id`, `enrollmentId`, `feeHeadId`, `feeRuleId`, `serviceAssignmentId`, `bouncePaymentId`, `periodKey`, `dueDate`, `amountMinor`, `paidMinor`, `creditAppliedMinor`, `status`) plus `sessionId`, `classId`, `feeHeadName`, `outstandingMinor`, `untracedCreditAppliedMinor`, `allocations[]`, `creditAllocations[]`.
- `storeIssues[]`: existing StoreIssue fields plus `sessionId`, `classId`, `outstandingMinor` (zero for VOID), `lines[]` (original store product/quantity/price lines), `allocations[]`.
- `credits[]`: FeeCredit fields (`id`, `studentId`, `sourcePaymentId`, `amountMinor`, `remainingMinor`, `source`, `reason`, actor/date) plus `allocations[]`.
- Direct `allocations[]`: PaymentAllocation fields (`id`, `paymentId`, `targetType`, `targetId`, `amountMinor`, dates) plus `releasedMinor`, `activeMinor`, `releases[]`. Direct releases retain `allocationId`, `paymentId`, `amountMinor`, reason/actor/date.
- Credit `allocations[]`/`creditAllocations[]`: `{ id, schoolId, studentId, creditId, obligationId, paymentId: string|null, legacyApplicationId: string|null, source, amountMinor, createdAt, releasedMinor, activeMinor, releases }`. Credit releases retain `{ id, schoolId, allocationId, correctionPaymentId, amountMinor, restoredToCredit, reason, createdBy, createdAt }`. `source` distinguishes `ASSESSMENT`, `PAYMENT`, and evidenced migrated `ASSESSMENT_AUDIT`. A consumed originating advance is released directly to its refund/reversal (`restoredToCredit: false`), reopening the actual fee.
- `payments[]`: Payment fields plus original `receipt` (or null for pending cheques), direct `allocations[]`, `creditApplications[]` using the credit shape above, `refunds[]`, `events[]`, and `tracedCreditReleases[]` caused by this payment's corrections.
- `totals: { assessedFeeMinor, assessedStoreMinor, feeOutstandingMinor, storeOutstandingMinor, outstandingMinor, availableCreditMinor, pendingChequeMinor, refundedMinor, journal: { feeReceivableMinor, storeReceivableMinor, studentCreditMinor, reconciled } }`. Every money value is a decimal paise string. Refund totals include amounts returned by reversals; bounced cheque funds are identified separately by their events/status.

### Report/accounting definitions

- Dues totals are `{ assessedMinor, outstandingMinor, overdueMinor }` over the full filtered **positive-current-balance** set. Optional `asOf` includes dues dated on/before that date; `overdue` means strictly earlier. Without it all current dues are included and aging uses today's school date. Extra response fields: `asOf`, `agingDate`, `basis: 'CURRENT_BALANCES_WITH_DUE_DATE_CUTOFF_NOT_HISTORICAL'`.
- Journal entries/lines also expose school/source IDs and creation timestamps. Totals cover all filtered entries, including both sides of every selected entry, not only the visible page. `basis: 'JOURNAL_BUSINESS_DATE'`. Demo accounts distinguish `FEE_RECEIVABLE`, `STORE_RECEIVABLE`, `STUDENT_CREDIT`, `CASH`, fee-head income, store income, grants, float funding, and bank/deposit/handover clearing. Clearing records are **not bank settlement confirmation**.
- Migration creates explicit `OPENING_*` entries from existing current balances/assets against `OPENING_EQUITY`, rather than invented historical income/capture events. It reconstructs credit lineage only from existing payment applications/releases and exact assessment-credit audit evidence. Missing historical evidence remains visible as `untracedCreditAppliedMinor`; a correction needing that missing lineage fails atomically with 409, while all newly traced assessment/collection use is releasable.
- PostgreSQL emits journal pairs inside fee/store/credit/payment/refund/cash writes; a deferred constraint rejects empty/unbalanced entries at COMMIT. Posted entries/lines and credit lineage are append-only. Later balanced appends to a committed entry are also rejected. New financial reports use current operational balances and expose reconciliation to journal balances.

### Backend migration and verification record — 14 October 2026

Five new migrations follow the original eight: `20261013120000_level_4_finance`, `20261013121000_balanced_journal`, `20261013122000_journal_lineage_guards`, `20261014100000_financial_history_guards`, and `20261014101000_refund_command_history_guard`. Deploy with Prisma migrate deploy, not schema push, because SQL contains journal posting/constraint triggers, immutable-history guards and evidenced historical backfill. Existing OPEN quotes need a fresh preview after upgrade; pending cheques without a historical selection keep the former all-eligible-dues behavior, subject to current demo policy at clearance. Existing receipt snapshots are retained while current-status PDF jobs are queued.

Commands executed from `backend/`, using `DATABASE_URL='postgresql://pcdav:pcdav_local@localhost:5433/pcdav?schema=public'` where needed:

```text
npx prisma validate
npm run db:generate
npm run db:migrate
npx prisma migrate status
npm run build
npm test -- --runInBand
npm test -- --runInBand test/payments.spec.ts test/financial-ledger.spec.ts test/cash.spec.ts
git diff --check
```

- Prisma validation/generation/build/diff checks passed; local migration status reports **16 migrations, up to date**.
- Full suite: **82 tests / 9 suites passed**. The payment/ledger/cash/PDF/approval/report, lifecycle/import and migration suites pass after the manual counter and immutable-history changes.
- `finance-migration.spec.ts` rehearses upgrade from the original eight migrations with synthetic preexisting receivables, partial settlement, consumed advance/grant evidence, cash and an immutable receipt; it verifies exact opening balances, recovered lineage and queued PDF jobs. It also deploys all migrations into a fresh isolated schema and verifies a second deploy is a no-op.
- Regression evidence includes exact concurrent approval replay, reject-versus-approve, stale balance/assessment/policy/drawer, policy version races, selected/foreign/cancelled dues, retained cheque selection, once-only bounce assessments, deposit/refund/close races, multi-release assessment-consumed advance, same-student scope, deferred empty/unbalanced journal rejection, immutable journal, persistent lineage and full filtered report totals. The receipt-issuance failure test intentionally logs one simulated database error and verifies payment, quote, balances, audit, journal and PDF job rollback.
- Test teardown of append-only fixtures requires the **disposable local PostgreSQL test role** to use connection-local `session_replication_role=replica`; application code has no history-deletion path.
- Parent integration is complete: the PDF controller/worker providers are registered from `src/receipt-pdf.ts` through `src/app.module.ts`. The shared `ReceiptPdfJob` schema exactly follows this contract.
