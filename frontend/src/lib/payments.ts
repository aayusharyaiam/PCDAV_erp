import { api, ApiError, ElectronicChannel, PaymentMode, PaymentRecord, Role } from './api';

export type ListResponse<T> = { items: T[]; total: number; page: number; limit: number };

// Registers and shift selectors must include more than the API's default 25 rows.
export async function allItems<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const response = await api<ListResponse<T>>(`${path}${path.includes('?') ? '&' : '?'}limit=100&page=${page}`);
    items.push(...response.items);
    if (items.length >= response.total || !response.items.length) return items;
  }
}

export const canCorrectPayments = (role: Role) => role === 'ADMIN' || role === 'SUPERADMIN';

export type PaymentCommand = {
  quoteId: string; quoteVersion: number; receivedAmountMinor: string;
  currency: 'INR'; businessDate: string; mode: PaymentMode; electronicChannel?: ElectronicChannel;
  tenderedAmountMinor?: string; reference?: string; chequeNumber?: string;
  chequeBank?: string; chequeDate?: string; payerName: string; payerPhone?: string;
  electronicVerified?: true; electronicVerificationNote?: string;
};
export type PaymentCorrectionCommand = { reason: string; businessDate?: string; shiftId?: string };
export type PaymentRefundCommand = PaymentCorrectionCommand & { amountMinor: string; reference?: string };
export type RefundAttempt = { payment: PaymentRecord; receiptId: string; command: PaymentRefundCommand; idempotencyKey: string };
export type OpenShiftCommand = { businessDate: string; openingFloatMinor: string };
export type CloseShiftCommand = { countedCashMinor: string; reason: string };

export function businessToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function inputAmount(minor: string): string {
  const value = BigInt(minor);
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, '0')}`;
}

export function messageOf(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'Request failed';
  const requestId = (error as ApiError | null)?.requestId;
  return requestId ? `${detail} · Request ${requestId}` : detail;
}

// A transport error or a server error may occur after a commit. Only explicit
// validation/permission/conflict rejections release a frozen payment/refund command.
export function isDefinitiveRejection(error: unknown): boolean {
  const status = (error as ApiError | null)?.status;
  return !!status && [400, 403, 404, 409, 410, 422].includes(status)
    && !(error instanceof Error && /idempotency/i.test(error.message));
}
