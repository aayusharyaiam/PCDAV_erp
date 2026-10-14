'use client';

import { FormEvent, useEffect, useState } from 'react';
import { CashierShift, PaymentRecord, rupees, toPaise } from '@/lib/api';
import { allItems, businessToday, messageOf } from '@/lib/payments';
import { CorrectionCommand, CorrectionRequest, useFrozenCommand } from '@/lib/finance';
import { StatusBadge, useStaffUser } from './AppShell';

export function CorrectionRequestForm({ payment, onLock }: { payment: PaymentRecord | null; onLock: (locked: boolean) => void }) {
  const user = useStaffUser();
  const recovery = useFrozenCommand<CorrectionCommand>(`pcdav_correction_request:${user.schoolId}:${user.id}`, saved => saved.path === '/finance/requests' && !!saved.body.paymentId && ['REFUND', 'REVERSE', 'BOUNCE'].includes(saved.body.type) && !!saved.body.reason);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CorrectionCommand['type']>('REFUND');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(businessToday());
  const [shiftId, setShiftId] = useState('');
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CorrectionRequest | null>(null);
  useEffect(() => { onLock(recovery.frozen); }, [recovery.frozen, onLock]);
  useEffect(() => {
    setOpen(false); setResult(null); setError('');
  }, [payment?.id]);
  async function begin() {
    setOpen(true); setResult(null); setError(''); setReason(''); setReference(''); setAmount('');
    setType(payment?.status === 'PENDING_CHEQUE' ? 'BOUNCE' : 'REFUND');
    if (payment?.mode === 'CASH') {
      try { setShifts(await allItems<CashierShift>('/cashier-shifts?status=OPEN')); }
      catch (e) { setError(messageOf(e)); }
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      let command: CorrectionCommand | undefined;
      if (!recovery.pending) {
        if (!payment) return;
        if (reason.trim().length < 3) throw new Error('Enter a correction reason.');
        command = { paymentId: payment.id, type, reason: reason.trim(), reference: reference.trim(), businessDate: date };
        if (type === 'REFUND') { command.amountMinor = toPaise(amount); if (BigInt(command.amountMinor) <= BigInt(0)) throw new Error('Refund must be positive.'); }
        if (payment.mode === 'CASH') { if (!shiftId) throw new Error('Select an open payout shift.'); command.shiftId = shiftId; }
      }
      const saved = await recovery.send<CorrectionRequest>('/finance/requests', command);
      if (saved) { setResult(saved); setOpen(false); window.dispatchEvent(new Event('finance-requests-changed')); }
    } catch (e) { setError(messageOf(e)); }
  }
  const eligible = payment && ['CAPTURED', 'CLEARED', 'PARTIALLY_REFUNDED', 'PENDING_CHEQUE'].includes(payment.status);
  return <section className="panel section-panel" aria-label="Correction request">
    <h2>Request correction</h2><p>Accountant requests require Admin approval. Submitting a request does not move money.</p>
    {(error || recovery.error) && <div className="notice error" role="alert">{error || recovery.error}</div>}
    {result && <div role="status">Request {result.id}: <StatusBadge status={result.status} /> · <a className="text-link" href="/finance/requests">Open approval inbox</a></div>}
    {recovery.pending && <div className="notice"><strong>Unconfirmed request — frozen for safe retry</strong><p>Payment {recovery.pending.body.paymentId} · {recovery.pending.body.type} {recovery.pending.body.amountMinor ? rupees(recovery.pending.body.amountMinor) : ''} · {recovery.pending.body.reason}</p></div>}
    {!open && !recovery.pending && eligible && <button className="button secondary" disabled={recovery.frozen} onClick={() => void begin()}>Request correction</button>}
    {!eligible && !recovery.pending && <p>Inspect a correctable receipt or select a pending cheque to request a correction.</p>}
    {(open || recovery.pending) && <form onSubmit={submit}>
      {!recovery.pending && <fieldset className="form-grid" disabled={recovery.frozen || recovery.busy}>
        <div className="form-field"><label htmlFor="request-type">Correction type</label><select className="select" id="request-type" value={type} onChange={e => setType(e.target.value as CorrectionCommand['type'])}>{payment?.status !== 'PENDING_CHEQUE' && <><option value="REFUND">Refund</option><option value="REVERSE">Reverse</option></>}{payment?.mode === 'CHEQUE' && <option value="BOUNCE">Bounce</option>}</select></div>
        {type === 'REFUND' && <div className="form-field"><label htmlFor="request-amount">Requested refund ₹</label><input className="input" id="request-amount" value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0.01" step="0.01" required /></div>}
        <div className="form-field"><label htmlFor="request-date">Requested business date</label><input className="input" id="request-date" type="date" value={date} onChange={e => setDate(e.target.value)} required /></div>
        {payment?.mode === 'CASH' && <div className="form-field"><label htmlFor="request-shift">Requested payout shift</label><select className="select" id="request-shift" value={shiftId} onChange={e => { setShiftId(e.target.value); const shift = shifts.find(s => s.id === e.target.value); if (shift) setDate(shift.businessDate.slice(0, 10)); }} required><option value="">Select open shift</option>{shifts.map(s => <option key={s.id} value={s.id}>{s.businessDate.slice(0, 10)} · {s.cashierId} · {s.id}</option>)}</select></div>}
        <div className="form-field"><label htmlFor="request-reference">Request reference</label><input className="input" id="request-reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={150} /></div>
        <div className="form-field full"><label htmlFor="request-reason">Request reason</label><textarea className="textarea" id="request-reason" value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={500} required /></div>
      </fieldset>}
      <div className="form-actions"><button className="button" disabled={recovery.busy || !recovery.ready}>{recovery.pending ? 'Retry correction request' : 'Submit correction request'}</button>{!recovery.pending && <button className="button secondary" type="button" onClick={() => setOpen(false)}>Cancel request</button>}</div>
    </form>}
  </section>;
}
