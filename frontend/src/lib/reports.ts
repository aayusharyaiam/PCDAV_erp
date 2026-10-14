import { ListResponse } from './payments';
import { PaymentRecord, PaymentRefund, PaymentEvent, ReceiptRecord } from './api';

export type CollectionTotals = { capturedMinor: string; refundedMinor: string; reversedMinor: string; bouncedMinor: string; netCapturedMinor: string; pendingMinor: string };
export type CollectionReport = CollectionTotals & { fromDate: string | null; toDate: string | null; basis: string; pendingBasis: string; cashierBasis: string; paymentCount: number; byMode: (CollectionTotals & { mode: string })[] };
export type DueItem = { sourceType: string; sourceId: string; studentId: string; admissionNumber: string; studentName: string; sessionId: string; classId: string; feeHeadId: string | null; label: string; dueDate: string; assessedMinor: string; outstandingMinor: string; overdue: boolean };
export type DueReport = ListResponse<DueItem> & { totals: { assessedMinor: string; outstandingMinor: string; overdueMinor: string }; asOf: string | null; agingDate: string; basis: string };
export type JournalEntry = { id: string; businessDate: string; sourceType: string; sourceId: string; description: string; lines: { account: string; studentId: string | null; debitMinor: string; creditMinor: string }[] };
export type JournalReport = ListResponse<JournalEntry> & { totals: { debitMinor: string; creditMinor: string; balanced: boolean }; basis: string; accountBasis: string };
// Verified against statement.service.ts: credit lineage is FeeCreditAllocation,
// not the older PaymentCreditApplication shape. Journal reconciliation is nested.
export type StatementRow = Record<string, unknown> & { id: string };
type Release = StatementRow & { allocationId: string; amountMinor: string; reason: string; createdAt: string };
type Allocation = StatementRow & { paymentId: string; targetType: string; targetId: string; amountMinor: string; releasedMinor: string; activeMinor: string; releases: Release[] };
type CreditAllocation = StatementRow & { creditId: string; obligationId: string; paymentId: string | null; source: string; amountMinor: string; releasedMinor: string; activeMinor: string; releases: (Release & { correctionPaymentId: string; restoredToCredit: boolean })[] };
export type StudentStatement = {
  student: { id: string; admissionNumber: string; name: string };
  fees: (StatementRow & { feeHeadName: string; amountMinor: string; outstandingMinor: string; untracedCreditAppliedMinor: string; allocations: Allocation[]; creditAllocations: CreditAllocation[] })[];
  storeIssues: (StatementRow & { issueNumber: string; totalMinor: string; outstandingMinor: string; lines: StatementRow[]; allocations: Allocation[] })[];
  credits: (StatementRow & { amountMinor: string; remainingMinor: string; allocations: CreditAllocation[] })[];
  payments: (StatementRow & PaymentRecord & { receipt: ReceiptRecord | null; allocations: Allocation[]; creditApplications: CreditAllocation[]; refunds: PaymentRefund[]; events: PaymentEvent[]; tracedCreditReleases: Release[] })[];
  totals: { assessedFeeMinor: string; assessedStoreMinor: string; feeOutstandingMinor: string; storeOutstandingMinor: string; outstandingMinor: string; availableCreditMinor: string; pendingChequeMinor: string; refundedMinor: string; journal: { feeReceivableMinor: string; storeReceivableMinor: string; studentCreditMinor: string; reconciled: boolean } };
};
export const fieldLabel = (key: string) => key.replace(/Minor$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase());
