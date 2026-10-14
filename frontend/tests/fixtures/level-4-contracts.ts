// MOCKED API fixtures, transcribed from backend/src/payment.service.ts and
// backend/prisma/schema.prisma. Deliberately independent of frontend wire types:
// invented frontend aliases must not silently become the test's contract.
export const date = '2026-10-13';
export const timestamp = `${date}T10:00:00.000Z`;
export const student = { id: 'student-1', admissionNumber: 'PDAV-0001', name: 'Current Student', dateOfBirth: '2015-01-02', gender: 'BOY', status: 'ACTIVE', version: 1, admissionDate: '2026-04-01' };
export const ledger = {
  student: { id: student.id, admissionNumber: student.admissionNumber, name: student.name },
  items: [{ id: 'fee-1', feeHeadName: 'Tuition', periodKey: '2026-04', dueDate: '2026-04-05', amountMinor: '12000', creditAppliedMinor: '0', paidMinor: '0', outstandingMinor: '12000', status: 'OPEN' }],
  credits: [{ id: 'credit-1', amountMinor: '1000', remainingMinor: '1000', source: 'IMPORT', reason: 'Opening credit' }],
  totals: { assessedMinor: '12000', outstandingMinor: '12000', availableCreditMinor: '1000' },
};
export const storeIssue = { id: 'store-1', issueNumber: 'SI-001', studentId: student.id, issuedAt: '2026-04-03', status: 'OPEN', totalMinor: '3000', paidMinor: '0', outstandingMinor: '3000', admissionNumber: student.admissionNumber, studentName: student.name };
export const allocations = [
  { targetType: 'STORE', targetId: 'store-1', reference: 'SI-001', description: 'Store issue SI-001', dueDate: '2026-04-03', beforeOutstandingMinor: '3000', creditAppliedMinor: '0', paymentAllocatedMinor: '3000', afterOutstandingMinor: '0' },
  { targetType: 'FEE', targetId: 'fee-1', reference: '2026-04:head-1', description: 'Tuition · 2026-04', dueDate: '2026-04-05', beforeOutstandingMinor: '12000', creditAppliedMinor: '1000', paymentAllocatedMinor: '11000', afterOutstandingMinor: '0' },
];
export function quote(overrides = {}) {
  const plan = { amountMinor: '15000', availableCreditMinor: '1000', creditAppliedMinor: '1000', paymentAllocatedMinor: '14000', projectedOutstandingMinor: '0', projectedCreditMinor: '1000', newCreditMinor: '1000', lines: allocations, creditApplications: [{ creditId: 'credit-1', targetId: 'fee-1', amountMinor: '1000' }], selection: {}, policyVersion: 1, balanceFingerprint: 'synthetic-balance-fingerprint' };
  return { id: 'quote-1', schoolId: 'school-1', studentId: student.id, createdBy: 'cashier-1', version: 3, status: 'OPEN', amountMinor: plan.amountMinor, availableCreditMinor: plan.availableCreditMinor, creditAppliedMinor: plan.creditAppliedMinor, paymentAllocatedMinor: plan.paymentAllocatedMinor, projectedOutstandingMinor: plan.projectedOutstandingMinor, projectedCreditMinor: plan.projectedCreditMinor, allocationPlan: plan, allocations, creditApplications: plan.creditApplications, expiresAt: new Date(Date.now() + 900_000).toISOString(), createdAt: timestamp, ...overrides };
}
export const payment = {
  electronicVerifiedAt: null as string | null, electronicVerifiedBy: null as string | null, electronicVerificationNote: null as string | null,
  id: 'payment-1', schoolId: 'school-1', studentId: student.id, cashierId: 'cashier-1', shiftId: 'shift-1', quoteId: 'quote-1', idempotencyKey: 'fixture-payment-key', requestHash: 'fixture-hash', businessDate: `${date}T00:00:00.000Z`, mode: 'CASH', status: 'CAPTURED', currency: 'INR', receivedAmountMinor: '15000', tenderedAmountMinor: '16000', changeMinor: '1000', payerName: 'Original Guardian', payerPhone: '9222222222', reference: '', electronicChannel: '', chequeNumber: '', chequeBank: '', chequeDate: null, createdAt: timestamp, updatedAt: timestamp, capturedAt: timestamp, captureBusinessDate: `${date}T00:00:00.000Z`, captureShiftId: 'shift-1',
};
export const snapshot = {
  receiptNumber: 'PDAV/FEE/2026/000001', currency: 'INR',
  school: { id: 'school-1', name: 'School at issue', address: 'Original school address', phone: '9111111111', email: 'school@example.test' },
  student: { id: student.id, admissionNumber: 'PDAV-0001', name: 'Student at issue' },
  enrollment: { id: 'enrollment-1', sessionId: 'session-1', classId: 'class-1', className: 'V A' },
  payer: { name: 'Original Guardian', phone: '9222222222' },
  payment: { id: payment.id, businessDate: date, captureBusinessDate: date, issuedAt: timestamp, mode: 'CASH', channel: '', reference: '', chequeNumber: '', chequeBank: '', chequeDate: null as string | null, receivedAmountMinor: '15000', tenderedAmountMinor: '16000' as string | null, changeMinor: '1000' },
  allocation: { lines: allocations, creditAppliedMinor: '1000', paymentAllocatedMinor: '14000', projectedOutstandingMinor: '0', projectedCreditMinor: '1000' },
  collector: { id: 'cashier-1', name: 'Collector at issue' }, templateVersion: 'receipt-v1',
};
export const receipt = { id: 'receipt-1', schoolId: 'school-1', paymentId: payment.id, studentId: student.id, receiptNumber: snapshot.receiptNumber, status: 'ISSUED', pdfStatus: 'PENDING', templateVersion: 'receipt-v1', snapshot, issuedAt: timestamp };
export const issuedEvent = { id: 'receipt-event-1', schoolId: 'school-1', receiptId: receipt.id, type: 'ISSUED', actorId: 'cashier-1', metadata: { receiptNumber: receipt.receiptNumber, pdfStatus: 'PENDING', templateVersion: 'receipt-v1' }, createdAt: timestamp };
export const reprint = { receiptId: receipt.id, receiptNumber: receipt.receiptNumber, originalIssuedAt: timestamp, pdfStatus: 'PENDING', templateVersion: 'receipt-v1', downloadAvailable: false };
export const detail = { receipt, payment, events: [issuedEvent], paymentEvents: [], refunds: [], reprint };
export const pendingCheque = { ...payment, id: 'cheque-1', mode: 'CHEQUE', status: 'PENDING_CHEQUE', tenderedAmountMinor: null, changeMinor: '0', chequeNumber: '123456', chequeBank: 'Test Bank', chequeDate: '2026-10-12T00:00:00.000Z', capturedAt: null, captureBusinessDate: null, captureShiftId: null };
export const shift = { id: 'shift-1', schoolId: 'school-1', cashierId: 'cashier-1', businessDate: `${date}T00:00:00.000Z`, status: 'OPEN', openingFloatMinor: '1000', expectedCashMinor: '16000' as string | null, countedCashMinor: null as string | null, varianceMinor: null as string | null, openedAt: timestamp, closedAt: null as string | null, closeReason: '', cashReceivedMinor: '15000', cashRefundedMinor: '0', cashMovedMinor: '0' };
export const paymentResult = { payment, receipt, allocations: allocations.map((line, index) => ({ id: `allocation-${index}`, schoolId: 'school-1', paymentId: payment.id, targetType: line.targetType, targetId: line.targetId, amountMinor: line.paymentAllocatedMinor, createdAt: timestamp })), creditApplications: [{ id: 'credit-application-1', schoolId: 'school-1', paymentId: payment.id, creditId: 'credit-1', targetId: 'fee-1', amountMinor: '1000', createdAt: timestamp }], allocationReleases: [], creditReleases: [], overpaymentCredit: { id: 'new-credit-1', schoolId: 'school-1', studentId: student.id, amountMinor: '1000', remainingMinor: '1000', source: 'PAYMENT_OVERPAYMENT', sourcePaymentId: payment.id, reason: `Payment overpayment ${payment.id}`, createdBy: 'cashier-1', createdAt: timestamp }, refunds: [], events: [{ id: 'payment-event-1', schoolId: 'school-1', paymentId: payment.id, type: 'PAYMENT_CAPTURED', amountMinor: '15000', reason: 'Payment captured', actorId: 'cashier-1', businessDate: payment.businessDate, metadata: quote().allocationPlan, createdAt: timestamp }], pdfStatus: 'PENDING' };
export const verifiedEvidence = { electronicVerifiedAt: timestamp, electronicVerifiedBy: 'cashier-1', electronicVerificationNote: 'Matched credit in school bank statement' };
export const electronicPayment = { ...payment, ...verifiedEvidence, mode: 'MANUAL_ELECTRONIC', electronicChannel: 'UPI', reference: 'TXN-001', tenderedAmountMinor: null, changeMinor: '0' };
export const electronicReceipt = { ...receipt, snapshot: { ...snapshot, payment: { ...snapshot.payment, mode: 'MANUAL_ELECTRONIC', channel: 'UPI', reference: 'TXN-001', tenderedAmountMinor: null, changeMinor: '0' } } };
export function pageOf<T>(items: T[], page = 1, total = items.length) { return { items, total, page, limit: 100 }; }
export const pdfStatus = { status: 'PENDING', attempts: 0, errorCode: null, downloadAvailable: false };
export const correctionRequest = { id: 'request-1', schoolId: 'school-1', paymentId: 'payment-1', type: 'REFUND', amountMinor: '2000', reason: 'Synthetic refund request', reference: 'REQ-001', businessDate: date, shiftId: 'shift-1', status: 'REQUESTED', requestedBy: 'cashier-1', createdAt: timestamp, decidedBy: null as string | null, decidedAt: null as string | null, decisionReason: null as string | null };
export const movement = { id: 'movement-1', schoolId: 'school-1', shiftId: 'shift-1', type: 'DEPOSIT', amountMinor: '2000', reason: 'Synthetic bank deposit', reference: 'DEP-001', createdBy: 'cashier-1', createdAt: timestamp };
export const policy = { schoolId: 'school-1', version: 1, receiptPrefix: 'DEMO/FEE', receiptScope: 'SCHOOL', allowAdvance: true, blockPreviousSession: false, bounceFeeMinor: '0' };
// Verified against reports.service.ts and statement.service.ts, including the
// nested journal reconciliation and traced FeeCreditAllocation release shape.
export const collectionTotals = { capturedMinor: '15000', refundedMinor: '2000', reversedMinor: '0', bouncedMinor: '0', netCapturedMinor: '13000', pendingMinor: '15000' };
export const collections = { fromDate: null, toDate: null, basis: 'EVENT_BUSINESS_DATE', pendingBasis: 'CURRENT_STATUS_BY_RECEIVED_DATE', cashierBasis: 'ORIGINAL_COLLECTOR', paymentCount: 1, ...collectionTotals, byMode: [{ mode: 'CASH', ...collectionTotals }] };
export const due = { sourceType: 'FEE', sourceId: 'fee-1', studentId: 'student-1', admissionNumber: student.admissionNumber, studentName: student.name, sessionId: 'session-1', classId: 'class-1', feeHeadId: 'head-1', label: 'Tuition · 2026-04', dueDate: '2026-04-05T00:00:00.000Z', assessedMinor: '12000', outstandingMinor: '2000', overdue: true };
export const journal = { items: [{ id: 'journal-1', businessDate: `${date}T00:00:00.000Z`, sourceType: 'PAYMENT_CAPTURE', sourceId: 'payment-1', description: 'Synthetic captured funds', lines: [{ id: 'line-1', account: 'CASH', studentId: 'student-1', debitMinor: '15000', creditMinor: '0' }, { id: 'line-2', account: 'STUDENT_CREDIT', studentId: 'student-1', debitMinor: '0', creditMinor: '15000' }] }], total: 1, page: 1, limit: 25, totals: { debitMinor: '15000', creditMinor: '15000', balanced: true }, basis: 'JOURNAL_BUSINESS_DATE', accountBasis: 'DEMO_OPERATIONAL_ACCOUNTS; CLEARING_IS_NOT_BANK_SETTLEMENT' };
const allocationRelease = { id: 'release-1', schoolId: 'school-1', paymentId: 'payment-1', allocationId: 'allocation-1', amountMinor: '2000', reason: 'Synthetic approved refund', createdBy: 'admin-1', createdAt: timestamp };
const tracedRelease = { id: 'traced-release-1', schoolId: 'school-1', allocationId: 'traced-1', correctionPaymentId: 'payment-1', amountMinor: '500', restoredToCredit: false, reason: 'Synthetic traced advance release', createdBy: 'admin-1', createdAt: timestamp };
const tracedAllocation = { id: 'traced-1', schoolId: 'school-1', studentId: 'student-1', creditId: 'credit-1', obligationId: 'fee-1', paymentId: null, legacyApplicationId: null, source: 'ASSESSMENT', amountMinor: '1000', releasedMinor: '500', activeMinor: '500', createdAt: timestamp, releases: [tracedRelease] };
const statementAllocation = { id: 'allocation-1', schoolId: 'school-1', paymentId: 'payment-1', targetType: 'FEE', targetId: 'fee-1', amountMinor: '10000', releasedMinor: '2000', activeMinor: '8000', createdAt: timestamp, releases: [allocationRelease] };
export const statement = {
  student: ledger.student,
  fees: [{ ...ledger.items[0], amountMinor: '12000', paidMinor: '8000', creditAppliedMinor: '500', outstandingMinor: '3500', untracedCreditAppliedMinor: '0', sessionId: 'session-1', classId: 'class-1', allocations: [statementAllocation], creditAllocations: [tracedAllocation] }],
  storeIssues: [{ ...storeIssue, sessionId: 'session-1', classId: 'class-1', lines: [], allocations: [] }],
  credits: [{ ...ledger.credits[0], remainingMinor: '0', allocations: [tracedAllocation] }],
  payments: [{ ...payment, receipt, allocations: [statementAllocation], creditApplications: [], refunds: [{ id: 'refund-1', schoolId: 'school-1', paymentId: 'payment-1', amountMinor: '2500', reason: 'Synthetic approved refund', reference: 'REF-001', businessDate: date, createdBy: 'admin-1', createdAt: timestamp }], events: paymentResult.events, tracedCreditReleases: [tracedRelease] }, { ...pendingCheque, receipt: null, allocations: [], creditApplications: [], refunds: [], events: [], tracedCreditReleases: [] }],
  totals: { assessedFeeMinor: '12000', assessedStoreMinor: '3000', feeOutstandingMinor: '3500', storeOutstandingMinor: '3000', outstandingMinor: '6500', availableCreditMinor: '0', pendingChequeMinor: '15000', refundedMinor: '2500', journal: { feeReceivableMinor: '3500', storeReceivableMinor: '3000', studentCreditMinor: '0', reconciled: true } },
};
