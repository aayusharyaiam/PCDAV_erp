const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export type ApiError = Error & { status?: number; requestId?: string };

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = typeof window === 'undefined' ? '' : window.localStorage.getItem('pcdav_csrf') ?? '';
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(options.method?.toUpperCase() ?? 'GET')) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/password' && typeof window !== 'undefined') {
      window.localStorage.removeItem('pcdav_user');
      window.localStorage.removeItem('pcdav_csrf');
      if (window.location.pathname !== '/login') window.location.replace('/login');
    }
    const error = new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Request failed') as ApiError;
    error.status = response.status; error.requestId = body.requestId; throw error;
  }
  return body as T;
}

export async function login(email: string, password: string) {
  const result = await api<{ user: User; csrfToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  window.localStorage.setItem('pcdav_csrf', result.csrfToken);
  window.localStorage.setItem('pcdav_user', JSON.stringify(result.user));
  return result;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } finally { window.localStorage.removeItem('pcdav_csrf'); window.localStorage.removeItem('pcdav_user'); window.location.href = '/login'; }
}

export async function downloadReceiptPdf(id: string, filename: string) {
  const response = await fetch(`${API_URL}/receipts/${encodeURIComponent(id)}/pdf`, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/pdf' } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) { window.localStorage.removeItem('pcdav_user'); window.localStorage.removeItem('pcdav_csrf'); window.location.replace('/login'); }
    const error = new Error(body.message ?? 'PDF download failed; check the current job status.') as ApiError;
    error.status = response.status; error.requestId = body.requestId; throw error;
  }
  if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('The server did not return a PDF. Refresh its status.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${filename.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type Role = 'SUPERADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'TEACHER';
export type User = { id: string; schoolId: string; name: string; email: string; role: Role; active: boolean; version: number; mustChangePassword: boolean; createdAt?: string };
export type School = { id: string; name: string; address: string; phone: string; email: string; timezone: string; admissionPrefix: string; nextAdmission: number; version: number };
export type AcademicSession = { id: string; name: string; startDate: string; endDate: string; current: boolean; admissionsOpen: boolean };
export type ClassOffering = { id: string; sessionId: string; grade: string; section: string; stream: string; capacity: number; activeEnrollmentCount: number; version: number; teacherId?: string };
export type Application = { id: string; sessionId: string; studentName: string; dateOfBirth: string; gender: string; guardianName: string; guardianPhone: string; appliedGrade: string; source: string; status: string; ews: boolean; version: number; createdAt: string; updatedAt: string };
export type Student = { id: string; admissionNumber: string; name: string; dateOfBirth: string; gender: string; guardianName?: string; guardianPhone?: string; currentClassId?: string; status: string; version: number; admissionDate: string; address?: string; permanentAddress?: string; previousSchool?: string };
export type FeeHead = { id: string; code: string; name: string; category: string; active: boolean; version: number };
export type FeeRule = { id?: string; feeHeadId: string; classId?: string; frequency: string; amountMinor: string; assessmentMonth?: number; entryType?: string; category?: string; dueDay?: number };
export type FeePlanVersion = { id: string; versionNumber: number; status: string; effectiveFrom: string; effectiveTo?: string; publishedAt?: string; rules?: FeeRule[] };
export type FeePlan = { id: string; sessionId: string; name: string; status: string; versions: FeePlanVersion[] };
export type Ledger = { student: { id: string; admissionNumber: string; name: string }; items: { id: string; feeHeadName: string; periodKey: string; dueDate: string; amountMinor: string; creditAppliedMinor: string; paidMinor: string; outstandingMinor: string; status: string }[]; credits: { id: string; amountMinor: string; remainingMinor: string; source: string; reason: string }[]; totals: { assessedMinor: string; outstandingMinor: string; availableCreditMinor: string } };
export type AssessmentPreview = { enrollmentId: string; studentId: string; feePlanVersionId: string; grossMinor: string; availableCreditMinor: string; projectedNetMinor: string; lines: { feeHeadId: string; feeHeadName: string; feeHeadCode: string; periodKey: string; dueDate: string; amountMinor: string; serviceAssignmentId?: string; existingObligationId?: string }[] };
export type TransportRoute = { id: string; name: string; campus: string; destination: string; monthlyAmountMinor: string; capacity?: number; active: boolean };
export type TransportVehicle = { id: string; name: string; busNumber: string; capacity: number; driver1Name: string; driver1Phone: string; driver2Name: string; driver2Phone: string; active: boolean };
export type TransportAllocation = { id: string; enrollmentId: string; routeId?: string; vehicleId?: string; amountMinor: string; startDate: string; endDate?: string; active: boolean; admissionNumber: string; studentName: string; className: string; route?: TransportRoute | null; vehicle?: TransportVehicle | null };
export type StoreGroup = { id: string; code: string; name: string; description: string; active: boolean };
export type StoreVendor = { id: string; name: string; phone: string; email: string; address: string; active: boolean };
export type StoreCluster = { id: string; name: string; active: boolean; items: { productId: string; productName: string; quantity: number }[] };
export type StoreProduct = { id: string; name: string; description: string; groupId?: string; groupName?: string; unitCostMinor: string; alertQuantity: number; quantity: number; active: boolean };
export type StoreIssue = { id: string; issueNumber: string; studentId: string; issuedAt: string; status: string; totalMinor: string; paidMinor: string; outstandingMinor: string; admissionNumber: string; studentName: string };
// Level 4 wire contracts: dto.ts, payment.service.ts and the payment models.
// Money stays in decimal-string minor units, including JSON receipt snapshots.
export type PaymentQuoteLine = { targetType: 'FEE' | 'STORE'; targetId: string; reference: string; description: string; dueDate: string; beforeOutstandingMinor: string; creditAppliedMinor: string; paymentAllocatedMinor: string; afterOutstandingMinor: string };
export type AllocationSummary = { creditAppliedMinor: string; paymentAllocatedMinor: string; projectedOutstandingMinor: string; projectedCreditMinor: string };
export type CreditApplication = { creditId: string; targetId: string; amountMinor: string };
export type AllocationPlan = AllocationSummary & { amountMinor: string; availableCreditMinor: string; newCreditMinor: string; lines: PaymentQuoteLine[]; creditApplications: CreditApplication[]; selection?: { obligationIds?: string[]; storeIssueIds?: string[] }; policyVersion?: number; balanceFingerprint?: string };
export type PaymentQuote = AllocationSummary & { id: string; schoolId: string; studentId: string; createdBy: string; version: number; status: 'OPEN' | 'CONSUMED'; amountMinor: string; availableCreditMinor: string; allocationPlan: AllocationPlan; allocations: PaymentQuoteLine[]; creditApplications: CreditApplication[]; expiresAt: string; createdAt: string };
export type PaymentMode = 'CASH' | 'MANUAL_ELECTRONIC' | 'CHEQUE';
export type ElectronicChannel = 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'OTHER';
export type PaymentStatus = 'PENDING_CHEQUE' | 'CAPTURED' | 'CLEARED' | 'BOUNCED' | 'REVERSED' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type PaymentRecord = { id: string; schoolId: string; studentId: string; cashierId: string; shiftId: string; quoteId: string | null; idempotencyKey: string; requestHash: string; businessDate: string; mode: PaymentMode; status: PaymentStatus; currency: string; receivedAmountMinor: string; tenderedAmountMinor: string | null; changeMinor: string; payerName: string; payerPhone: string; reference: string; electronicChannel: ElectronicChannel | ''; chequeNumber: string; chequeBank: string; chequeDate: string | null; createdAt: string; updatedAt: string; capturedAt: string | null; captureBusinessDate: string | null; captureShiftId: string | null };
export type ReceiptSnapshot = {
  receiptNumber: string; currency: string; templateVersion: string;
  demoPolicy?: { version: number; receiptPrefix: string; receiptScope: 'SCHOOL' | 'FINANCIAL_YEAR'; scopeKey: string; financialYearStartMonth: number; label: string };
  school: { id: string; name: string; address: string; phone: string; email: string };
  student: { id: string; name: string; admissionNumber: string };
  enrollment: { id: string; sessionId: string; classId: string; className: string } | null;
  payer: { name: string; phone: string }; collector: { id: string; name: string };
  payment: { id: string; businessDate: string; captureBusinessDate: string | null; issuedAt: string; mode: PaymentMode; channel: ElectronicChannel | ''; reference: string; chequeNumber: string; chequeBank: string; chequeDate: string | null; receivedAmountMinor: string; tenderedAmountMinor: string | null; changeMinor: string };
  allocation: AllocationSummary & { lines: PaymentQuoteLine[] };
};
export type ReceiptRecord = { id: string; schoolId: string; paymentId: string; studentId: string; receiptNumber: string; status: 'ISSUED' | 'VOID' | 'PARTIALLY_REFUNDED' | 'REFUNDED'; pdfStatus: string; templateVersion: string; snapshot: ReceiptSnapshot; issuedAt: string };
export type PaymentRefund = { id: string; schoolId: string; paymentId: string; shiftId: string | null; businessDate: string; amountMinor: string; reason: string; reference: string; createdBy: string; createdAt: string };
export type PaymentEvent = { id: string; schoolId: string; paymentId: string; type: string; amountMinor: string | null; reason: string; actorId: string; businessDate: string; metadata: Record<string, unknown> | null; createdAt: string };
export type ReceiptEvent = { id: string; schoolId: string; receiptId: string; type: string; actorId: string; metadata: Record<string, unknown> | null; createdAt: string };
export type ReprintMetadata = { receiptId: string; receiptNumber: string; originalIssuedAt: string; pdfStatus: string; templateVersion: string; downloadAvailable: boolean };
export type ReceiptDetail = { receipt: ReceiptRecord; payment: PaymentRecord | null; events: ReceiptEvent[]; paymentEvents: PaymentEvent[]; refunds: PaymentRefund[]; reprint: ReprintMetadata };
export type ReceiptPrintResult = { receipt: ReceiptRecord; printEvent: ReceiptEvent; reprint: ReprintMetadata };
export type PaymentResult = { payment: PaymentRecord; receipt: ReceiptRecord | null; refunds: PaymentRefund[]; events: PaymentEvent[]; pdfStatus: string };
export type CashierShift = { id: string; schoolId: string; cashierId: string; businessDate: string; status: 'OPEN' | 'CLOSED'; openingFloatMinor: string; expectedCashMinor: string | null; countedCashMinor: string | null; varianceMinor: string | null; openedAt: string; closedAt: string | null; closeReason: string; cashReceivedMinor: string; cashRefundedMinor: string; cashMovedMinor: string };
export const rupees = (minorAmount: string | bigint) => { const signed = BigInt(minorAmount); const value = signed < BigInt(0) ? -signed : signed; const hundred = BigInt(100); return `${signed < BigInt(0) ? '-' : ''}₹${(value / hundred).toLocaleString('en-IN')}.${String(value % hundred).padStart(2, '0')}`; };
export function toPaise(value: string): string {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with at most two decimal places');
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'))).toString();
}
