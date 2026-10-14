import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { isDefinitiveRejection, messageOf } from './payments';

export type CorrectionRequest = {
  id: string; schoolId: string; paymentId: string; type: 'REFUND' | 'REVERSE' | 'BOUNCE';
  amountMinor: string | null; reason: string; reference: string; businessDate: string | null; shiftId: string | null;
  status: 'REQUESTED' | 'APPLIED' | 'REJECTED' | 'STALE'; requestedBy: string; createdAt: string;
  decidedBy: string | null; decidedAt: string | null; decisionReason: string | null;
};
export type CorrectionCommand = Pick<CorrectionRequest, 'paymentId' | 'type' | 'reason'> & { amountMinor?: string; reference?: string; businessDate?: string; shiftId?: string };
export type CashMovement = { id: string; schoolId: string; shiftId: string; type: 'DEPOSIT' | 'HANDOVER' | 'EXPENSE'; amountMinor: string; reason: string; reference: string; createdBy: string; createdAt: string };
export type MovementCommand = Pick<CashMovement, 'type' | 'amountMinor' | 'reason' | 'reference'>;
export type FinancialPolicy = { schoolId: string; version: number; receiptPrefix: string; receiptScope: 'SCHOOL' | 'FINANCIAL_YEAR'; allowAdvance: boolean; blockPreviousSession: boolean; bounceFeeMinor: string };
export type PdfStatus = { status: string; attempts: number; errorCode: string | null; downloadAvailable: boolean };

type FrozenCommand<T> = { path: string; body: T; key: string };
// Persist before sending. A failed retry never disproves an earlier commit.
// The caller supplies a scoped key and validates restored endpoint/body shapes.
export function useFrozenCommand<T>(storageKey: string, valid: (value: FrozenCommand<T>) => boolean) {
  const [pending, setPending] = useState<FrozenCommand<T> | null>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const posting = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as FrozenCommand<T>;
        if (!saved.key || !valid(saved)) throw new Error('Invalid recovery data');
        setPending(saved);
      }
      setReady(true);
    } catch { setBlocked(true); setError('Unable to restore recovery data. Resolve the previous command outcome before submitting another.'); }
  // Each workspace key is scoped to the authenticated school and user.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  async function send<R>(path?: string, body?: T): Promise<R | undefined> {
    if (posting.current || !ready || blocked) return;
    let next = pending;
    const retry = !!pending;
    let sent = false;
    posting.current = true; setBusy(true); setError('');
    try {
      if (!next) {
        if (!path || !body) throw new Error('No command to send');
        next = { path, body, key: crypto.randomUUID() };
        sessionStorage.setItem(storageKey, JSON.stringify(next));
        setPending(next);
      }
      sent = true;
      const result = await api<R>(next.path, { method: 'POST', headers: { 'Idempotency-Key': next.key }, body: JSON.stringify(next.body) });
      sessionStorage.removeItem(storageKey); setPending(null);
      return result;
    } catch (e) {
      setError(messageOf(e));
      if (sent && !retry && isDefinitiveRejection(e)) { sessionStorage.removeItem(storageKey); setPending(null); }
    } finally { posting.current = false; setBusy(false); }
  }
  return { pending, ready, busy, error, send, frozen: !!pending || !ready || blocked };
}
