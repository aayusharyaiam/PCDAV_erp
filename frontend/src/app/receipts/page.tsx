'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AppShell, EmptyState, PageHeader, StatusBadge, useStaffUser } from '@/components/AppShell';
import { PaymentAllocation } from '@/components/PaymentAllocation';
import { CorrectionRequestForm } from '@/components/CorrectionRequestForm';
import { ReceiptPdf } from '@/components/ReceiptPdf';
import { api, CashierShift, PaymentRecord, PaymentResult, ReceiptDetail, ReceiptPrintResult, ReceiptRecord, rupees, toPaise } from '@/lib/api';
import { allItems, businessToday, canCorrectPayments, inputAmount, isDefinitiveRejection, messageOf, PaymentCorrectionCommand, PaymentRefundCommand, RefundAttempt } from '@/lib/payments';

type Action = { type: 'clear-cheque' | 'bounce' | 'reverse' | 'refunds'; payment: PaymentRecord };
const actionLabels = { 'clear-cheque': 'Clear cheque', bounce: 'Bounce cheque', reverse: 'Reverse payment', refunds: 'Refund payment' };

export default function ReceiptsPage() { return <AppShell><ReceiptWorkspace /></AppShell>; }

function ReceiptWorkspace() {
  const user = useStaffUser();
  const admin = canCorrectPayments(user.role);
  const storageKey = `pcdav_pending_refund_attempt:${user.schoolId}:${user.id}`;
  const [attempt, setAttempt] = useState<RefundAttempt | null>(null);
  const [restored, setRestored] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const posting = useRef(false);
  const [requestLocked, setRequestLocked] = useState(false);
  const [requestPayment, setRequestPayment] = useState<PaymentRecord | null>(null);
  const frozen = !!attempt || !restored || restoreFailed || requestLocked;
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [pending, setPending] = useState<PaymentRecord[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');
  const [businessDate, setBusinessDate] = useState('');
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [printReason, setPrintReason] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [actionDate, setActionDate] = useState(businessToday());
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReference, setRefundReference] = useState('');
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const [nextReceipts, nextPending] = await Promise.all([
      allItems<ReceiptRecord>('/receipts'),
      allItems<PaymentRecord>('/payments?status=PENDING_CHEQUE'),
    ]);
    setReceipts(nextReceipts); setPending(nextPending);
  }

  useEffect(() => {
    setBusy(true);
    let id = new URLSearchParams(window.location.search).get('receiptId');
    const paymentId = new URLSearchParams(window.location.search).get('paymentId');
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as RefundAttempt;
        if (!saved.payment.id || saved.payment.schoolId !== user.schoolId || !saved.receiptId || !saved.idempotencyKey || !/^\d+$/.test(saved.command.amountMinor) || !saved.command.reason) throw new Error('Invalid saved refund');
        setAttempt(saved); setAction({ type: 'refunds', payment: saved.payment }); id = saved.receiptId;
        setReason(saved.command.reason); setActionDate(saved.command.businessDate ?? ''); setShiftId(saved.command.shiftId ?? '');
        setRefundAmount(inputAmount(saved.command.amountMinor)); setRefundReference(saved.command.reference ?? '');
        setNotice('An unconfirmed refund was restored. Retry the frozen payload with the same Idempotency-Key before starting another correction.');
      }
    } catch { setRestoreFailed(true); setError('Unable to restore the saved refund. Resolve its outcome before starting another correction.'); }
    setRestored(true);
    Promise.all([load(), id ? api<ReceiptDetail>(`/receipts/${encodeURIComponent(id)}`).then(setDetail) : paymentId ? api<PaymentResult>(`/payments/${encodeURIComponent(paymentId)}`).then(async result => {
      if (result.receipt) setDetail(await api<ReceiptDetail>(`/receipts/${result.receipt.id}`));
      else { setRequestPayment(result.payment); setNotice(`Payment ${result.payment.id}: ${result.payment.status}. No final receipt is issued for this payment.`); }
    }) : Promise.resolve()])
      .catch(e => setError(messageOf(e))).finally(() => setBusy(false));
  }, [storageKey, user.schoolId]);

  async function refresh() {
    setBusy(true); setError('');
    try { await load(); if (detail) setDetail(await api<ReceiptDetail>(`/receipts/${detail.receipt.id}`)); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  const filtered = receipts.filter(receipt => {
    const snapshot = receipt.snapshot;
    const needle = query.trim().toLowerCase();
    return (!needle || [receipt.receiptNumber, snapshot.student.name, snapshot.student.admissionNumber, receipt.paymentId, snapshot.payment.reference, snapshot.payment.chequeNumber].some(value => value.toLowerCase().includes(needle)))
      && (!mode || snapshot.payment.mode === mode) && (!status || receipt.status === status)
      && (!businessDate || (snapshot.payment.captureBusinessDate ?? snapshot.payment.businessDate) === businessDate);
  });
  const remainingMinor = detail ? (BigInt(detail.receipt.snapshot.payment.receivedAmountMinor) - detail.refunds.reduce((sum, refund) => sum + BigInt(refund.amountMinor), BigInt(0))).toString() : '0';
  const correctable = detail?.payment && ['CAPTURED', 'CLEARED', 'PARTIALLY_REFUNDED'].includes(detail.payment.status);

  async function inspect(receipt: ReceiptRecord) {
    if (busy || frozen) return;
    setBusy(true); setError(''); setDetail(null); setAction(null); setPrintReason(''); setRequestPayment(null);
    try { setDetail(await api<ReceiptDetail>(`/receipts/${receipt.id}`)); }
    catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  async function reprint(event: FormEvent) {
    event.preventDefault();
    if (!detail || busy) return;
    if (printReason.trim().length < 3) { setError('Enter a reprint reason with at least three characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const printed = await api<ReceiptPrintResult>(`/receipts/${detail.receipt.id}/print-events`, { method: 'POST', body: JSON.stringify({ reason: printReason.trim() }) });
      // Render the returned immutable receipt/status before opening the print dialog.
      flushSync(() => setDetail({ ...detail, receipt: printed.receipt, reprint: printed.reprint, events: [...detail.events, printed.printEvent] }));
      setNotice(`Reprint event recorded for ${printed.receipt.receiptNumber}. No payment was collected.`);
      window.print();
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  async function beginAction(payment: PaymentRecord, type: Action['type']) {
    if (busy || frozen || posting.current) return;
    if (type !== 'clear-cheque' && !admin) return;
    setAction({ payment, type }); setReason(''); setActionDate(businessToday()); setRefundReference('');
    setRefundAmount(inputAmount(remainingMinor)); setError(''); setNotice(''); setShifts([]); setShiftId('');
    if (payment.mode === 'CASH') {
      setBusy(true);
      try {
        const open = (await allItems<CashierShift>('/cashier-shifts?status=OPEN')).filter(shift => shift.businessDate.slice(0, 10) >= (payment.captureBusinessDate ?? payment.businessDate).slice(0, 10));
        setShifts(open);
        const payout = open.find(shift => shift.id === payment.shiftId) ?? open[0];
        if (payout) { setShiftId(payout.id); setActionDate(payout.businessDate.slice(0, 10)); }
      } catch (e) { setError(messageOf(e)); }
      finally { setBusy(false); }
    }
  }

  async function submitAction(event: FormEvent) {
    event.preventDefault();
    if (!action || busy || posting.current || restoreFailed || !restored || (action.type !== 'clear-cheque' && !admin)) return;
    setError(''); setNotice('');
    let next = attempt;
    const retrying = !!attempt;
    try {
      let body: PaymentCorrectionCommand | PaymentRefundCommand;
      if (next) {
        // Current receipt balances or a now-closed shift must not change a retry.
        body = next.command;
      } else {
        if (reason.trim().length < 3) throw new Error('Enter a reason with at least three characters.');
        const command: PaymentCorrectionCommand = { reason: reason.trim(), businessDate: actionDate };
        if (action.payment.mode === 'CASH') {
          if (!shiftId) throw new Error('Select an open payout shift for this cash correction.');
          command.shiftId = shiftId;
        }
        body = command;
        if (action.type === 'refunds') {
          if (!detail || detail.payment?.id !== action.payment.id) throw new Error('Load this receipt before refunding.');
          const amountMinor = toPaise(refundAmount);
          if (BigInt(amountMinor) <= BigInt(0) || BigInt(amountMinor) > BigInt(remainingMinor)) throw new Error('Refund must be positive and cannot exceed the unrefunded amount.');
          body = { ...command, amountMinor, ...(refundReference.trim() ? { reference: refundReference.trim() } : {}) };
          next = { payment: action.payment, receiptId: detail.receipt.id, command: body, idempotencyKey: window.crypto.randomUUID() };
          window.sessionStorage.setItem(storageKey, JSON.stringify(next));
          setAttempt(next);
        }
      }
      posting.current = true; setBusy(true);
      const result = await api<PaymentResult>(`/payments/${next?.payment.id ?? action.payment.id}/${next ? 'refunds' : action.type}`, { method: 'POST', ...(next ? { headers: { 'Idempotency-Key': next.idempotencyKey } } : {}), body: JSON.stringify(body) });
      if (next) { window.sessionStorage.removeItem(storageKey); setAttempt(null); }
      posting.current = false;
      setAction(null);
      setNotice(`${actionLabels[action.type]} recorded. Payment status: ${result.payment.status}.`);
      if (result.receipt) setDetail(await api<ReceiptDetail>(`/receipts/${result.receipt.id}`));
      await load();
    } catch (e) {
      setError(messageOf(e));
      if (posting.current && next) {
        // A rejected retry may have failed validation/auth before command lookup.
        // It cannot establish that an earlier ambiguous attempt did not commit.
        if (!retrying && isDefinitiveRejection(e)) {
          window.sessionStorage.removeItem(storageKey); setAttempt(null); setAction(null);
          setNotice('The server rejected the refund. Refresh the receipt and review a new correction.');
        } else {
          setNotice('Refund outcome is unconfirmed. Retry the identical frozen payload and Idempotency-Key before starting another correction.');
        }
      }
    } finally { posting.current = false; setBusy(false); }
  }

  const snapshot = detail?.receipt.snapshot;
  return <>
    <PageHeader eyebrow="Level 4 · Fees & Payments" title="Receipt register" description="Inspect immutable issued snapshots, record reprints, and manage cheque settlement and Admin corrections." action={<button className="button secondary" onClick={() => void refresh()} disabled={busy}>Refresh register</button>} />
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    {!admin && <CorrectionRequestForm payment={requestPayment ?? detail?.payment ?? null} onLock={setRequestLocked} />}
    {!admin && pending.length > 0 && <div className="panel section-panel"><label htmlFor="request-cheque">Request a pending cheque bounce</label><select id="request-cheque" className="select" disabled={busy || frozen} value={requestPayment?.id ?? ''} onChange={e => setRequestPayment(pending.find(p => p.id === e.target.value) ?? null)}><option value="">Use inspected receipt</option>{pending.map(p => <option key={p.id} value={p.id}>{p.chequeNumber} · {p.payerName} · {p.id}</option>)}</select></div>}
    <section className="panel">
      <div className="panel-header"><h2>Issued receipt register</h2><span>{filtered.length} of {receipts.length} receipts</span></div>
      <div className="filter-row"><input className="input" aria-label="Search receipts" placeholder="Receipt, admission number, student, reference" value={query} onChange={e => setQuery(e.target.value)} /><select className="select" aria-label="Receipt mode" value={mode} onChange={e => setMode(e.target.value)}><option value="">All modes</option><option value="CASH">Cash</option><option value="MANUAL_ELECTRONIC">Manual electronic</option><option value="CHEQUE">Cheque</option></select><select className="select" aria-label="Receipt status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option value="ISSUED">Issued</option><option value="VOID">Void</option><option value="PARTIALLY_REFUNDED">Partially refunded</option><option value="REFUNDED">Refunded</option></select><input className="input" aria-label="Receipt capture business date" type="date" value={businessDate} onChange={e => setBusinessDate(e.target.value)} /></div>
      {filtered.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Receipt</th><th>Student</th><th>Capture date</th><th>Amount</th><th>Mode / reference</th><th>Status</th><th /></tr></thead><tbody>{filtered.map(receipt => {
        const saved = receipt.snapshot;
        return <tr key={receipt.id}><td><strong>{receipt.receiptNumber}</strong><small>Issued {new Date(receipt.issuedAt).toLocaleString('en-IN')}</small></td><td>{saved.student.admissionNumber}<small>{saved.student.name}</small></td><td>{saved.payment.captureBusinessDate ?? saved.payment.businessDate}</td><td>{rupees(saved.payment.receivedAmountMinor)}</td><td>{saved.payment.mode}<small>{saved.payment.reference || saved.payment.chequeNumber || '—'}</small></td><td><StatusBadge status={receipt.status} /></td><td><button className="button small secondary" disabled={busy || frozen} onClick={() => void inspect(receipt)}>Metadata / reprint</button></td></tr>;
      })}</tbody></table></div> : <EmptyState title={busy ? 'Loading receipts…' : 'No receipts match'} detail="Final receipts are issued on capture or cheque clearance." />}
    </section>

    {detail && snapshot && <>
      <section className="panel section-panel receipt-detail" aria-label="Immutable receipt">
        <div className="panel-header"><div><h2>Receipt {detail.receipt.receiptNumber}</h2><span>Immutable issued snapshot · original {new Date(detail.reprint.originalIssuedAt).toLocaleString('en-IN')}</span></div><StatusBadge status={detail.receipt.status} /></div>
        <h3>{snapshot.school.name}</h3><p>{snapshot.school.address} · {snapshot.school.phone} · {snapshot.school.email}</p>
        {snapshot.demoPolicy && <p>{snapshot.demoPolicy.label} · Issued policy version {snapshot.demoPolicy.version} · Sequence {snapshot.demoPolicy.scopeKey}</p>}
        <div className="detail-grid">
          <div className="detail-item"><label>Student / class</label><strong>{snapshot.student.admissionNumber} · {snapshot.student.name} · {snapshot.enrollment?.className ?? 'No active enrollment'}</strong></div>
          <div className="detail-item"><label>Received / capture business date</label><strong>{snapshot.payment.businessDate} / {snapshot.payment.captureBusinessDate ?? '—'}</strong></div>
          <div className="detail-item"><label>Payment</label><strong>{snapshot.payment.id}</strong></div>
          <div className="detail-item"><label>Received</label><strong>{rupees(snapshot.payment.receivedAmountMinor)} {snapshot.currency}</strong></div>
          <div className="detail-item"><label>Mode / reference</label><strong>{snapshot.payment.mode} · {snapshot.payment.channel || '—'} · {snapshot.payment.reference || '—'}</strong></div>
          <div className="detail-item"><label>Payer</label><strong>{snapshot.payer.name} · {snapshot.payer.phone || '—'}</strong></div>
          <div className="detail-item"><label>Collector</label><strong>{snapshot.collector.name}</strong></div>
          <div className="detail-item"><label>Document</label><strong>{detail.receipt.pdfStatus} · {snapshot.templateVersion}</strong></div>
        </div>
        {snapshot.payment.mode === 'CASH' && <p>Cash tendered {snapshot.payment.tenderedAmountMinor === null ? '—' : rupees(snapshot.payment.tenderedAmountMinor)} · Change {rupees(snapshot.payment.changeMinor)}</p>}
        {snapshot.payment.mode === 'CHEQUE' && <p>Cheque {snapshot.payment.chequeNumber} · {snapshot.payment.chequeBank} · {snapshot.payment.chequeDate}</p>}
        <h3>Allocation at issue</h3><PaymentAllocation lines={snapshot.allocation.lines} summary={snapshot.allocation} />
      </section>
      <section className="panel section-panel">
        <h2>Receipt history and actions</h2>
        <p>Reprint events: {detail.events.filter(event => event.type === 'REPRINT').length}. Browser print uses the immutable snapshot below.</p>
        <ReceiptPdf key={`${detail.receipt.id}:${detail.receipt.status}`} receiptId={detail.receipt.id} receiptNumber={detail.receipt.receiptNumber} />
        <form onSubmit={reprint}><div className="form-field"><label htmlFor="print-reason">Reprint reason</label><input className="input" id="print-reason" value={printReason} onChange={e => setPrintReason(e.target.value)} minLength={3} maxLength={500} required /></div><div className="form-actions"><button className="button" disabled={busy}>Print / reprint</button><button type="button" className="button secondary" onClick={() => { setDetail(null); setAction(null); }} disabled={busy || frozen}>Close receipt</button></div></form>
        <p>Current payment status: {detail.payment?.status ?? 'Unavailable'} · Unrefunded amount: {rupees(remainingMinor)}</p>
        {detail.events.map(event => <p key={event.id}>{event.type} · {new Date(event.createdAt).toLocaleString('en-IN')}{typeof event.metadata?.reason === 'string' ? ` · ${event.metadata.reason}` : ''}</p>)}
        {detail.refunds.map(refund => <p key={refund.id}>Refund {rupees(refund.amountMinor)} · {refund.businessDate.slice(0, 10)} · {refund.reason} · {refund.reference}</p>)}
        {admin && detail.payment && <div className="form-actions correction-actions">
          {correctable && <><button className="button secondary" disabled={busy || frozen} onClick={() => void beginAction(detail.payment!, 'reverse')}>Reverse payment</button><button className="button secondary" disabled={busy || frozen} onClick={() => void beginAction(detail.payment!, 'refunds')}>Refund payment</button></>}
          {detail.payment.mode === 'CHEQUE' && detail.payment.status === 'CLEARED' && <button className="button danger" disabled={busy || frozen} onClick={() => void beginAction(detail.payment!, 'bounce')}>Bounce cleared cheque</button>}
        </div>}
        {!admin && <p>Use Request correction above to send this payment to the Admin approval inbox.</p>}
      </section>
    </>}

    <section className="panel section-panel"><div className="panel-header"><div><h2>Pending cheque actions</h2><span>Clearance requires your open shift on the clearance business date. Allocation is recalculated then.</span></div><span>{pending.length} pending</span></div>
      {pending.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Payment / student ID</th><th>Payer</th><th>Cheque</th><th>Amount</th><th>Received date</th><th>Action</th></tr></thead><tbody>{pending.map(payment => <tr key={payment.id}><td><strong>{payment.id}</strong><small><a className="text-link" href={`/students/${payment.studentId}`}>{payment.studentId}</a></small></td><td>{payment.payerName}</td><td>{payment.chequeNumber}<small>{payment.chequeBank} · {payment.chequeDate?.slice(0, 10)}</small></td><td>{rupees(payment.receivedAmountMinor)}</td><td>{payment.businessDate.slice(0, 10)}</td><td><div className="button-group"><button className="button small" disabled={busy || frozen} onClick={() => void beginAction(payment, 'clear-cheque')}>Clear cheque</button>{admin && <button className="button small danger" disabled={busy || frozen} onClick={() => void beginAction(payment, 'bounce')}>Bounce</button>}</div></td></tr>)}</tbody></table></div> : <EmptyState title={busy ? 'Loading pending cheques…' : 'No pending cheques'} detail="Pending cheques have no final receipt until cleared." />}
    </section>
    {action && <section className="panel section-panel correction-box"><h2>{actionLabels[action.type]}</h2><p>Payment {action.payment.id}{action.type !== 'clear-cheque' ? ' · Admin/Superadmin action' : ''}</p>
      <form onSubmit={submitAction}><fieldset className="form-grid" disabled={busy || frozen} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        {action.payment.mode === 'CASH' && <div className="form-field"><label htmlFor="payout-shift">Open payout shift</label><select className="select" id="payout-shift" value={shiftId} onChange={e => { setShiftId(e.target.value); const shift = shifts.find(item => item.id === e.target.value); if (shift) setActionDate(shift.businessDate.slice(0, 10)); }} required><option value="">Select an open shift</option>{attempt?.command.shiftId && !shifts.some(shift => shift.id === attempt.command.shiftId) && <option value={attempt.command.shiftId}>{attempt.command.businessDate} · {attempt.command.shiftId} · frozen payout shift</option>}{shifts.map(shift => <option value={shift.id} key={shift.id}>{shift.businessDate.slice(0, 10)} · {shift.cashierId} · {shift.id}</option>)}</select><small>Closed shifts are immutable. Cash payouts require an open shift dated on or after capture.</small></div>}
        <div className="form-field"><label htmlFor="action-date">{action.type === 'clear-cheque' ? 'Clearance business date' : 'Correction business date'}</label><input className="input" id="action-date" type="date" value={actionDate} min={(action.type === 'clear-cheque' ? [action.payment.businessDate, action.payment.chequeDate ?? ''].sort().at(-1)! : action.payment.captureBusinessDate ?? action.payment.businessDate).slice(0, 10)} onChange={e => setActionDate(e.target.value)} readOnly={action.payment.mode === 'CASH'} required /></div>
        {action.type === 'refunds' && <><div className="form-field"><label htmlFor="refund-amount">Refund amount ₹</label><input className="input" id="refund-amount" type="number" min="0.01" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} required /><small>Unrefunded amount {rupees(remainingMinor)}</small></div><div className="form-field"><label htmlFor="refund-reference">Refund reference (optional)</label><input className="input" id="refund-reference" value={refundReference} onChange={e => setRefundReference(e.target.value)} maxLength={150} /></div></>}
        <div className="form-field full"><label htmlFor="action-reason">Action reason</label><textarea className="textarea" id="action-reason" value={reason} onChange={e => setReason(e.target.value)} minLength={3} maxLength={500} required /></div>
      </fieldset><div className="form-actions"><button className="button" disabled={busy || restoreFailed || !restored || (action.payment.mode === 'CASH' && !shiftId)}>{attempt ? 'Retry refund' : `Confirm ${actionLabels[action.type].toLowerCase()}`}</button><button type="button" className="button secondary" disabled={busy || frozen} onClick={() => setAction(null)}>Cancel action</button></div></form>
    </section>}
  </>;
}
