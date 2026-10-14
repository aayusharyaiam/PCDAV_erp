'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge, useStaffUser } from '@/components/AppShell';
import { CashMovements } from '@/components/CashMovements';
import { api, CashierShift, rupees, toPaise } from '@/lib/api';
import { allItems, businessToday, canCorrectPayments, CloseShiftCommand, messageOf, OpenShiftCommand } from '@/lib/payments';

export default function CashierPage() { return <AppShell><CashierWorkspace /></AppShell>; }

function CashierWorkspace() {
  const user = useStaffUser();
  const admin = canCorrectPayments(user.role);
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [businessDate, setBusinessDate] = useState(businessToday());
  const [openingFloat, setOpeningFloat] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [reason, setReason] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [working, setBusy] = useState(false);
  const [movementLocked, setMovementLocked] = useState(true);
  const busy = working || movementLocked;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load(preferredId?: string) {
    const next = await allItems<CashierShift>('/cashier-shifts');
    setShifts(next); setLoaded(true);
    setSelectedId(current => preferredId ?? (next.some(shift => shift.id === current) ? current : next.find(shift => shift.cashierId === user.id && shift.status === 'OPEN')?.id ?? ''));
  }
  useEffect(() => { setBusy(true); load().catch(e => setError(messageOf(e))).finally(() => setBusy(false)); }, []);

  const active = shifts.find(shift => shift.id === selectedId);
  const canClose = active?.status === 'OPEN' && (active.cashierId === user.id || admin);
  const dateExists = shifts.some(shift => shift.cashierId === user.id && shift.businessDate.slice(0, 10) === businessDate);
  let variance: string | null = null;
  try { if (countedCash && active?.expectedCashMinor !== null && active?.expectedCashMinor !== undefined) variance = (BigInt(toPaise(countedCash)) - BigInt(active.expectedCashMinor)).toString(); } catch { /* Incomplete count. */ }

  async function refresh() {
    setBusy(true); setError('');
    try { await load(); } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  async function openShift(event: FormEvent) {
    event.preventDefault(); if (busy || dateExists) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const command: OpenShiftCommand = { businessDate, openingFloatMinor: toPaise(openingFloat) };
      const result = await api<CashierShift>('/cashier-shifts', { method: 'POST', body: JSON.stringify(command) });
      setNotice('Cashier shift opened. All payment modes can now be posted for this business date.');
      setCountedCash(''); setReason(''); await load(result.id);
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  async function closeShift(event: FormEvent) {
    event.preventDefault(); if (!active || !canClose || busy) return;
    setError(''); setNotice('');
    try {
      if (variance === null) throw new Error('Refresh expected cash and enter counted cash before closing.');
      if (variance !== '0' && reason.trim().length < 3) throw new Error('Enter a variance reason before closing with a difference.');
      setBusy(true);
      const command: CloseShiftCommand = { countedCashMinor: toPaise(countedCash), reason: reason.trim() };
      const result = await api<CashierShift>(`/cashier-shifts/${active.id}/close`, { method: 'POST', body: JSON.stringify(command) });
      setShifts(current => current.map(shift => shift.id === result.id ? result : shift));
      setNotice('Cashier shift closed and variance recorded.'); setCountedCash(''); setReason(''); await load(result.id);
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Level 4 · Reconciliation" title="Cashier shifts" description="Open your business-date counter and close using server-calculated expected cash, counted cash, and a variance reason." action={<button className="button secondary" onClick={() => void refresh()} disabled={busy}>Refresh</button>} />
    {error && <div className="notice error" role="alert">{error}</div>}{notice && <div className="notice success" role="status">{notice}</div>}
    <CashMovements shift={active} onLock={setMovementLocked} onSaved={() => load()} />
    <section className="panel"><div className="panel-header"><div><h2>Open cashier shift</h2><span>One shift per cashier/business date, including closed shifts. All payment modes require an open shift.</span></div></div>
      <form onSubmit={openShift}><div className="form-grid"><div className="form-field"><label htmlFor="shift-date">Business date</label><input className="input" id="shift-date" type="date" value={businessDate} onChange={e => setBusinessDate(e.target.value)} required /></div><div className="form-field"><label htmlFor="opening-float">Opening float ₹</label><input className="input" id="opening-float" type="number" min="0" step="0.01" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} required /></div></div>{dateExists && <p>You already have a shift for this date. Select it from history or choose another date.</p>}<div className="form-actions"><button className="button" disabled={busy || !loaded || dateExists}>Open shift</button></div></form>
    </section>
    {active && <section className="panel section-panel" aria-label="Selected shift"><div className="panel-header"><div><h2>Selected shift · {active.businessDate.slice(0, 10)}</h2><span>Shift {active.id} · Cashier {active.cashierId}</span></div><StatusBadge status={active.status} /></div>
      <div className="money-summary"><div><span>Opening float</span><strong>{rupees(active.openingFloatMinor)}</strong></div><div><span>Expected cash</span><strong>{active.expectedCashMinor === null ? '—' : rupees(active.expectedCashMinor)}</strong></div><div><span>Counted cash</span><strong>{active.countedCashMinor === null ? '—' : rupees(active.countedCashMinor)}</strong></div><div><span>Variance</span><strong>{active.varianceMinor === null ? '—' : rupees(active.varianceMinor)}</strong></div></div>
      <div className="money-summary"><div><span>Cash received</span><strong>{rupees(active.cashReceivedMinor)}</strong></div><div><span>Cash refunded</span><strong>{rupees(active.cashRefundedMinor)}</strong></div><div><span>Cash moved</span><strong>{rupees(active.cashMovedMinor)}</strong></div></div>
      {canClose && <form className="close-shift-form" onSubmit={closeShift}><div className="form-grid"><div className="form-field"><label htmlFor="counted-cash">Counted cash ₹</label><input className="input" id="counted-cash" type="number" min="0" step="0.01" value={countedCash} onChange={e => setCountedCash(e.target.value)} required /></div><div className="cash-change"><span>Live variance</span><strong>{variance === null ? '—' : rupees(variance)}</strong></div><div className="form-field full"><label htmlFor="close-reason">Variance reason (required when counted differs)</label><textarea className="textarea" id="close-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></div></div><div className="form-actions"><button className="button" disabled={busy || variance === null}>Close shift</button></div></form>}
      {active.status === 'OPEN' && !canClose && <p>Only this cashier or an Admin/Superadmin can close this shift.</p>}
      {active.status === 'CLOSED' && <p>Closed {active.closedAt ? new Date(active.closedAt).toLocaleString('en-IN') : ''} · {active.closeReason || 'No variance reason needed'}</p>}
    </section>}
    <section className="panel section-panel"><div className="panel-header"><h2>Shift history</h2><span>{shifts.length} shifts</span></div>{shifts.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Date / cashier</th><th>Status</th><th>Opening</th><th>Expected</th><th>Counted</th><th>Variance</th><th /></tr></thead><tbody>{shifts.map(shift => <tr key={shift.id}><td><strong>{shift.businessDate.slice(0, 10)}</strong><small>{shift.cashierId}</small></td><td><StatusBadge status={shift.status} /></td><td>{rupees(shift.openingFloatMinor)}</td><td>{shift.expectedCashMinor === null ? '—' : rupees(shift.expectedCashMinor)}</td><td>{shift.countedCashMinor === null ? '—' : rupees(shift.countedCashMinor)}</td><td>{shift.varianceMinor === null ? '—' : rupees(shift.varianceMinor)}</td><td><button className="button small secondary" disabled={busy} onClick={() => { setSelectedId(shift.id); setCountedCash(''); setReason(''); }}>View shift</button></td></tr>)}</tbody></table></div> : <EmptyState title={busy ? 'Loading shifts…' : 'No shifts yet'} detail="Open a shift before posting a payment or clearing a cheque." />}</section>
  </>;
}
