'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, CashierShift, rupees, toPaise } from '@/lib/api';
import { CashMovement, MovementCommand, useFrozenCommand } from '@/lib/finance';
import { canCorrectPayments, messageOf } from '@/lib/payments';
import { useStaffUser } from './AppShell';

export function CashMovements({ shift, onLock, onSaved }: { shift?: CashierShift; onLock: (locked: boolean) => void; onSaved: () => Promise<void> }) {
  const user = useStaffUser();
  const admin = canCorrectPayments(user.role);
  const recovery = useFrozenCommand<MovementCommand>(`pcdav_cash_movement:${user.schoolId}:${user.id}`, s => /^\/cashier-shifts\/[^/]+\/movements$/.test(s.path) && ['DEPOSIT', 'HANDOVER', 'EXPENSE'].includes(s.body.type) && /^\d+$/.test(s.body.amountMinor) && !!s.body.reason && !!s.body.reference);
  const [items, setItems] = useState<CashMovement[]>([]);
  const [type, setType] = useState<MovementCommand['type']>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const path = recovery.pending?.path ?? (shift ? `/cashier-shifts/${shift.id}/movements` : null);
  useEffect(() => { onLock(recovery.frozen || recovery.busy); }, [recovery.frozen, recovery.busy, onLock]);
  useEffect(() => {
    let cancelled = false; setItems([]); setError('');
    if (path) api<{ items: CashMovement[] }>(path).then(r => { if (!cancelled) setItems(r.items); }).catch(e => { if (!cancelled) setError(messageOf(e)); });
    return () => { cancelled = true; };
  }, [path, shift?.expectedCashMinor]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    try {
      let command: MovementCommand | undefined;
      if (!recovery.pending) {
        const amountMinor = toPaise(amount);
        if (BigInt(amountMinor) <= BigInt(0)) throw new Error('Enter a positive cash movement amount.');
        if (reason.trim().length < 3 || reference.trim().length < 3) throw new Error('Reason and reference must each have at least three characters.');
        command = { type, amountMinor, reason: reason.trim(), reference: reference.trim() };
      }
      const result = await recovery.send<CashMovement>(path ?? undefined, command);
      if (result) {
        setNotice(`${result.type} recorded: ${rupees(result.amountMinor)} · ${result.reference}`);
        setItems(current => [...current.filter(i => i.id !== result.id), result]);
        setAmount(''); setReason(''); setReference(''); await onSaved();
      }
    } catch (e) { setError(messageOf(e)); }
  }
  const allowed = shift?.status === 'OPEN' && (shift.cashierId === user.id || admin);
  return <section className="panel section-panel" aria-label="Cash movements"><h2>Cash movements</h2><p>Deposits, handovers, and Admin expenses reduce server-calculated expected cash. Reason and reference are mandatory.</p>
    {(error || recovery.error) && <div className="notice error" role="alert">{error || recovery.error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    {recovery.pending && <div className="notice"><strong>Unconfirmed movement — frozen for safe retry</strong><p>{recovery.pending.path} · {recovery.pending.body.type} · {rupees(recovery.pending.body.amountMinor)} · {recovery.pending.body.reference} · {recovery.pending.body.reason}</p></div>}
    {(allowed || recovery.pending) && <form onSubmit={submit}>{!recovery.pending && <fieldset className="form-grid" disabled={recovery.frozen || recovery.busy}>
      <div className="form-field"><label htmlFor="movement-type">Movement type</label><select className="select" id="movement-type" value={type} onChange={e => setType(e.target.value as MovementCommand['type'])}><option value="DEPOSIT">Deposit</option><option value="HANDOVER">Handover</option>{admin && <option value="EXPENSE">Expense</option>}</select></div>
      <div className="form-field"><label htmlFor="movement-amount">Movement amount ₹</label><input className="input" id="movement-amount" type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
      <div className="form-field"><label htmlFor="movement-reference">Movement reference</label><input className="input" id="movement-reference" value={reference} onChange={e => setReference(e.target.value)} required minLength={3} maxLength={150} /></div>
      <div className="form-field"><label htmlFor="movement-reason">Movement reason</label><input className="input" id="movement-reason" value={reason} onChange={e => setReason(e.target.value)} required minLength={3} maxLength={500} /></div>
    </fieldset>}<div className="form-actions"><button className="button" disabled={recovery.busy || !recovery.ready}>{recovery.pending ? 'Retry cash movement' : 'Record cash movement'}</button></div></form>}
    {!shift && !recovery.pending && <p>Select a shift to view its movements.</p>}
    {items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Type / ID</th><th>Amount</th><th>Reason / reference</th><th>Recorded</th></tr></thead><tbody>{items.map(i => <tr key={i.id}><td>{i.type}<small>{i.id}</small></td><td>{rupees(i.amountMinor)}</td><td>{i.reason}<small>{i.reference}</small></td><td>{new Date(i.createdAt).toLocaleString('en-IN')}<small>{i.createdBy}</small></td></tr>)}</tbody></table></div> : <p>No cash movements loaded.</p>}
  </section>;
}
