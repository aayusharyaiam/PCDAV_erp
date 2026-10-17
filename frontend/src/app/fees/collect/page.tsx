'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppShell, PageHeader, StatusBadge, useStaffUser } from '@/components/AppShell';
import { PaymentAllocation } from '@/components/PaymentAllocation';
import { api, Ledger, PaymentMode, PaymentQuote, PaymentResult, rupees, Student, StoreIssue, toPaise } from '@/lib/api';
import { allItems, businessToday, inputAmount, isDefinitiveRejection, ListResponse, messageOf, PaymentCommand } from '@/lib/payments';

type StudentDetail = { student: Student; enrollments: { id: string; status: string; className: string; sessionName: string }[] };
type StoredAttempt = { student: Student; quote: PaymentQuote; command: PaymentCommand; idempotencyKey: string };
type CollectionMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE';

export default function CollectPaymentPage() { return <AppShell><CollectionWorkspace /></AppShell>; }

function CollectionWorkspace() {
  const user = useStaffUser();
  const storageKey = `pcdav_pending_payment_attempt:${user.schoolId}:${user.id}`;
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [storeIssues, setStoreIssues] = useState<StoreIssue[]>([]);
  const [selectDues, setSelectDues] = useState(false);
  const [obligationIds, setObligationIds] = useState<string[]>([]);
  const [storeIssueIds, setStoreIssueIds] = useState<string[]>([]);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [method, setMethod] = useState<CollectionMethod>('CASH');
  const [businessDate, setBusinessDate] = useState(businessToday());
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [reference, setReference] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeBank, setChequeBank] = useState('');
  const [chequeDate, setChequeDate] = useState(businessToday());
  const [payerName, setPayerName] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [attempt, setAttempt] = useState<StoredAttempt | null>(null);
  const [restored, setRestored] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const posting = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(() => Date.now());

  async function loadStudent(id: string) {
    setBusy(true); setError('');
    try {
      const [detail, nextLedger] = await Promise.all([
        api<StudentDetail>(`/students/${encodeURIComponent(id)}`),
        api<Ledger>(`/students/${encodeURIComponent(id)}/ledger`),
      ]);
      const issues = await allItems<StoreIssue>(`/store/issues?status=OPEN&q=${encodeURIComponent(detail.student.admissionNumber)}`);
      setStudent(detail.student); setLedger(nextLedger); setStoreIssues(issues.filter(issue => issue.studentId === id));
      setSelectDues(false); setObligationIds(nextLedger.items.filter(item => BigInt(item.outstandingMinor) > BigInt(0)).map(item => item.id)); setStoreIssueIds(issues.filter(issue => issue.studentId === id && BigInt(issue.outstandingMinor) > BigInt(0)).map(issue => issue.id));
      setStudents([]); setQuote(null); setResult(null); setReceivedAmount(''); setPayerName(''); setPayerPhone(''); setMethod('CASH');
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let raw: string | null;
    try { raw = window.sessionStorage.getItem(storageKey); }
    catch { setRestoreFailed(true); setError('Payment recovery storage is unavailable. Resolve previous payments before collecting again.'); return; }
    setRestored(true);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredAttempt;
        if (!stored.student.id || stored.quote.id !== stored.command.quoteId || !stored.idempotencyKey) throw new Error('Invalid saved attempt');
        setAttempt(stored); setStudent(stored.student); setQuote(stored.quote);
        const selection = stored.quote.allocationPlan.selection;
        setSelectDues(selection?.obligationIds !== undefined || selection?.storeIssueIds !== undefined);
        setObligationIds(selection?.obligationIds ?? []); setStoreIssueIds(selection?.storeIssueIds ?? []);
        setReceivedAmount(inputAmount(stored.command.receivedAmountMinor));
        setBusinessDate(stored.command.businessDate); setMethod(methodFromCommand(stored.command));
        setTenderedAmount(stored.command.tenderedAmountMinor ? inputAmount(stored.command.tenderedAmountMinor) : '');
        setReference(stored.command.reference ?? '');
        setChequeNumber(stored.command.chequeNumber ?? ''); setChequeBank(stored.command.chequeBank ?? ''); setChequeDate(stored.command.chequeDate ?? '');
        setPayerName(stored.command.payerName); setPayerPhone(stored.command.payerPhone ?? '');
        setNotice('An unconfirmed payment was restored. Retry the frozen payload with the same Idempotency-Key.');
        return; // A URL student must never replace an unresolved payment attempt.
      } catch { setRestoreFailed(true); setError('Unable to restore the saved payment. Check the receipt register before collecting again.'); return; }
    }
    const id = new URLSearchParams(window.location.search).get('studentId');
    if (id) void loadStudent(id);
  }, [storageKey]);

  useEffect(() => {
    if (!quote) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quote]);

  const frozen = !!attempt || !restored || restoreFailed;
  const quoteExpired = !!quote && new Date(quote.expiresAt).getTime() <= clock;
  let change: string | null = null;
  try { if (quote && tenderedAmount) change = (BigInt(toPaise(tenderedAmount)) - BigInt(quote.amountMinor)).toString(); } catch { /* Incomplete input. */ }

  async function searchStudents(event: FormEvent) {
    event.preventDefault();
    if (busy || frozen) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api<ListResponse<Student>>(`/students?q=${encodeURIComponent(query.trim())}`);
      setStudents(response.items); setStudent(null); setLedger(null); setQuote(null); setResult(null);
      if (!response.items.length) setNotice('No students match this search.');
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  async function createQuote(event: FormEvent) {
    event.preventDefault();
    if (!student || busy || frozen) return;
    setError(''); setNotice(''); setQuote(null); setBusy(true);
    try {
      const amountMinor = toPaise(receivedAmount);
      if (BigInt(amountMinor) <= BigInt(0)) throw new Error('Enter an amount greater than zero.');
      const next = await api<PaymentQuote>('/payment-quotes', { method: 'POST', body: JSON.stringify({ studentId: student.id, amountMinor, ...(selectDues ? { obligationIds, storeIssueIds } : {}) }) });
      setQuote(next); setClock(Date.now()); setTenderedAmount(inputAmount(next.amountMinor));
      setNotice('Review the server allocation before posting. Demo policy controls advance credit and previous-session blocking.');
    } catch (e) { setError(messageOf(e)); }
    finally { setBusy(false); }
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (!student || !quote || posting.current || !restored || restoreFailed) return;
    setError(''); setNotice('');
    let next = attempt;
    const retrying = !!attempt;
    try {
      if (!next) {
        if (new Date(quote.expiresAt).getTime() <= Date.now()) throw new Error('This quote has expired. Create a fresh quote.');
        if (payerName.trim().length < 2) throw new Error('Enter the payer name (at least two characters).');
        const mode: PaymentMode = method;
        const command: PaymentCommand = { quoteId: quote.id, quoteVersion: quote.version, receivedAmountMinor: quote.amountMinor, currency: 'INR', businessDate, mode, payerName: payerName.trim() };
        if (payerPhone.trim()) {
          if (!/^[+0-9 ()-]{7,25}$/.test(payerPhone.trim())) throw new Error('Enter a valid payer phone (7–25 phone characters).');
          command.payerPhone = payerPhone.trim();
        }
        if (method === 'CASH') {
          command.tenderedAmountMinor = toPaise(tenderedAmount);
          if (BigInt(command.tenderedAmountMinor) < BigInt(quote.amountMinor)) throw new Error('Tendered cash cannot be lower than the payment amount.');
        } else if (method === 'UPI' || method === 'BANK_TRANSFER') {
          if (!reference.trim()) throw new Error(`Enter the ${method === 'UPI' ? 'UPI' : 'bank transfer'} reference.`);
          command.reference = reference.trim();
        } else {
          if (chequeNumber.trim().length < 3 || chequeBank.trim().length < 2 || !chequeDate) throw new Error('Enter the cheque number, bank, and date.');
          command.chequeNumber = chequeNumber.trim(); command.chequeBank = chequeBank.trim(); command.chequeDate = chequeDate;
        }
        next = { student, quote, command, idempotencyKey: window.crypto.randomUUID() };
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
        setAttempt(next);
      }
      posting.current = true; setBusy(true);
      const posted = await api<PaymentResult>('/payments', { method: 'POST', headers: { 'Idempotency-Key': next.idempotencyKey }, body: JSON.stringify(next.command) });
      window.sessionStorage.removeItem(storageKey); setResult(posted);
      setNotice(posted.receipt ? 'Payment posted and receipt issued.' : 'Payment recorded. Open the receipt register for the current payment status.');
    } catch (e) {
      setError(messageOf(e));
      // A rejected retry may fail authentication/validation before looking up
      // the original command. It cannot disprove an earlier ambiguous commit.
      if (posting.current && !retrying && isDefinitiveRejection(e)) {
        window.sessionStorage.removeItem(storageKey); setAttempt(null); setQuote(null);
        setNotice('The server rejected the payment. Create a fresh quote and review the details again.');
      } else if (posting.current) {
        setNotice('Payment outcome is unconfirmed. Retry the identical frozen payload and Idempotency-Key.');
      }
    } finally { posting.current = false; setBusy(false); }
  }

  function newCollection() {
    setAttempt(null); setResult(null); setStudent(null); setLedger(null); setQuote(null); setQuery(''); setReceivedAmount(''); setError(''); setNotice('');
    setMethod('CASH');
  }

  return <>
    <PageHeader eyebrow="Fees & Payments" title="Collect student payment" description="Choose the student, review what will be paid, record a cash, UPI, bank transfer, or cheque payment, and show the receipt." action={result ? <button className="button" onClick={newCollection}>New collection</button> : undefined} />
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    <section className="panel">
       <div className="panel-header"><h2>1. Find student</h2>{student && <StatusBadge status={student.status} />}</div>
      <form className="search-row" onSubmit={searchStudents}><label className="sr-only" htmlFor="student-search">Student search</label><input className="input" id="student-search" placeholder="Admission number, name, or guardian phone" value={query} onChange={e => setQuery(e.target.value)} disabled={busy || frozen} required /><button className="button" disabled={busy || frozen}>Find student</button></form>
      {students.length > 0 && <div className="lookup-results">{students.map(item => <button key={item.id} disabled={busy || frozen} onClick={() => void loadStudent(item.id)}><strong>{item.admissionNumber}</strong><span>{item.name}</span></button>)}</div>}
      {student && <div className="selected-context"><strong>{student.admissionNumber} · {student.name}</strong></div>}
    </section>
    {student && !result && <section className="panel section-panel">
      <div className="panel-header"><div><h2>2. Review balances</h2><span>Existing credit applies to fees first. The server allocates payment across fee and store dues oldest-first.</span></div></div>
      {ledger && <div className="money-summary"><div><span>Fee outstanding</span><strong>{rupees(ledger.totals.outstandingMinor)}</strong></div><div><span>Store outstanding</span><strong>{rupees(storeIssues.reduce((sum, issue) => sum + BigInt(issue.outstandingMinor), BigInt(0)))}</strong></div><div><span>Available credit</span><strong>{rupees(ledger.totals.availableCreditMinor)}</strong></div></div>}
      <fieldset disabled={busy || frozen}><legend>Quote selection</legend><label><input type="checkbox" checked={selectDues} onChange={e => { setSelectDues(e.target.checked); setQuote(null); }} /> Select specific fee obligations and store issues</label>
        {selectDues && <><p>Only checked IDs are sent. An empty selection requests advance credit, subject to server policy. Credit applies to oldest eligible fees first.</p>
          {ledger?.items.filter(item => BigInt(item.outstandingMinor) > BigInt(0)).map(item => <div key={item.id}><label><input type="checkbox" checked={obligationIds.includes(item.id)} onChange={e => { setObligationIds(ids => e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id)); setQuote(null); }} />{item.feeHeadName} · {item.periodKey} · {rupees(item.outstandingMinor)} · {item.id}</label></div>)}
          {storeIssues.filter(item => BigInt(item.outstandingMinor) > BigInt(0)).map(item => <div key={item.id}><label><input type="checkbox" checked={storeIssueIds.includes(item.id)} onChange={e => { setStoreIssueIds(ids => e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id)); setQuote(null); }} />{item.issueNumber} · {rupees(item.outstandingMinor)} · {item.id}</label></div>)}
        </>}
      </fieldset>
      <form className="quote-form" onSubmit={createQuote}><div className="form-field"><label htmlFor="received-amount">Amount received / to post ₹</label><input className="input" id="received-amount" type="number" min="0.01" step="0.01" value={receivedAmount} onChange={e => { setReceivedAmount(e.target.value); setQuote(null); }} disabled={busy || frozen} required /><small className="field-hint">Partial payments leave dues open. A payment with no dues becomes advance credit.</small></div><button className="button" disabled={busy || frozen}>Create quote & review</button></form>
    </section>}
    {quote && <section className="panel section-panel">
       <div className="panel-header"><div><h2>3. Review payment</h2><span>Quote {quote.id} · server-calculated allocation</span></div><span>{quoteExpired ? 'Expired — create a fresh quote' : `Valid until ${new Date(quote.expiresAt).toLocaleTimeString('en-IN')}`}</span></div>
       <div className="money-summary"><div><span>Amount received</span><strong>{rupees(quote.amountMinor)}</strong></div><div><span>Due after payment</span><strong>{rupees(quote.projectedOutstandingMinor)}</strong></div><div><span>Credit after payment</span><strong>{rupees(quote.projectedCreditMinor)}</strong></div></div>
      {quote.allocationPlan.policyVersion !== undefined && <p>Server demo policy version {quote.allocationPlan.policyVersion}</p>}
      {(quote.allocationPlan.selection?.obligationIds !== undefined || quote.allocationPlan.selection?.storeIssueIds !== undefined) && <p className="selected-context">Quoted fee IDs: {quote.allocationPlan.selection.obligationIds === undefined ? 'All eligible fees' : quote.allocationPlan.selection.obligationIds.join(', ') || 'None'} · Quoted store IDs: {quote.allocationPlan.selection.storeIssueIds === undefined ? 'All eligible store issues' : quote.allocationPlan.selection.storeIssueIds.join(', ') || 'None'}. Retries keep this exact quote.</p>}
      {!quote.allocations.length && <p>{BigInt(quote.projectedOutstandingMinor) === BigInt(0) ? 'No outstanding dues. This payment will become student credit.' : 'No selected dues will be paid. This amount becomes advance credit under the server policy.'}</p>}
      <PaymentAllocation lines={quote.allocations} summary={quote} />
       {method === 'CHEQUE' && <p>Cheque allocation is provisional and recalculated at clearance.</p>}
    </section>}
    {quote && !result && <section className="panel section-panel">
       <div className="panel-header"><div><h2>4. Record payment</h2><span>Use the open <a className="text-link" href="/cashier">cashier shift</a> for the business date.</span></div></div>
      <form onSubmit={submitPayment}>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="business-date">Business date</label><input className="input" id="business-date" type="date" value={businessDate} onChange={e => setBusinessDate(e.target.value)} disabled={busy || frozen} required /></div>
          <div className="form-field"><label htmlFor="payer-name">Payer name</label><input className="input" id="payer-name" value={payerName} onChange={e => setPayerName(e.target.value)} minLength={2} maxLength={150} disabled={busy || frozen} required /></div>
          <div className="form-field"><label htmlFor="payer-phone">Payer phone (optional)</label><input className="input" id="payer-phone" type="tel" value={payerPhone} onChange={e => setPayerPhone(e.target.value)} maxLength={25} disabled={busy || frozen} /></div>
        </div>
         <div className="payment-mode-grid collection-method-grid">{([['CASH', 'Cash', 'Record cash received'], ['UPI', 'UPI', 'Record UPI reference'], ['BANK_TRANSFER', 'Bank transfer', 'Record bank reference'], ['CHEQUE', 'Cheque', 'Record cheque details']] as const).map(([value, label, detail]) => <label className={`mode-card ${method === value ? 'selected' : ''}`} key={value}><input type="radio" name="payment-method" checked={method === value} onChange={() => setMethod(value)} disabled={busy || frozen} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div>
         {method === 'CASH' && <div className="form-grid"><div className="form-field"><label htmlFor="tendered-amount">Cash tendered ₹</label><input className="input" id="tendered-amount" type="number" min="0.01" step="0.01" value={tenderedAmount} onChange={e => setTenderedAmount(e.target.value)} disabled={busy || frozen} required /></div><div className="cash-change"><span>Change due</span><strong>{change !== null && BigInt(change) >= BigInt(0) ? rupees(change) : '—'}</strong></div></div>}
         {(method === 'UPI' || method === 'BANK_TRANSFER') && <div className="form-field"><label htmlFor="reference">{method === 'UPI' ? 'UPI reference' : 'Bank transfer reference'}</label><input className="input" id="reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={150} placeholder="Enter the reference shown on the payment record" disabled={busy || frozen} required /></div>}
         {method === 'CHEQUE' && <div className="form-grid"><div className="form-field"><label htmlFor="cheque-number">Cheque number</label><input className="input" id="cheque-number" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} minLength={3} maxLength={80} disabled={busy || frozen} required /></div><div className="form-field"><label htmlFor="cheque-bank">Cheque bank</label><input className="input" id="cheque-bank" value={chequeBank} onChange={e => setChequeBank(e.target.value)} minLength={2} maxLength={150} disabled={busy || frozen} required /></div><div className="form-field"><label htmlFor="cheque-date">Cheque date</label><input className="input" id="cheque-date" type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} disabled={busy || frozen} required /></div></div>}
        <div className="form-actions"><button className="button" disabled={busy || (quoteExpired && !frozen)}>{busy ? 'Posting…' : frozen ? 'Retry payment' : 'Post payment'}</button></div>
      </form>
    </section>}
    {result && <section className="panel section-panel receipt-success" aria-live="polite"><div className="panel-header"><div><h2>{result.receipt ? 'Receipt ready' : 'Cheque recorded'}</h2><span>{result.receipt ? 'Payment saved and the immutable receipt is available.' : 'The cheque is pending clearance; the receipt will be available after clearance.'}</span></div><StatusBadge status={result.payment.status} /></div><div className="money-summary"><div><span>Amount received</span><strong>{rupees(result.payment.receivedAmountMinor)}</strong></div><div><span>Due after payment</span><strong>{quote ? rupees(quote.projectedOutstandingMinor) : '—'}</strong></div><div><span>Credit after payment</span><strong>{quote ? rupees(quote.projectedCreditMinor) : '—'}</strong></div></div><p>Payment {result.payment.id} · {rupees(result.payment.receivedAmountMinor)} · {result.payment.businessDate.slice(0, 10)}</p>{result.receipt ? <a className="text-link" href={`/receipts?receiptId=${encodeURIComponent(result.receipt.id)}`}>View receipt {result.receipt.receiptNumber} →</a> : <p>No final receipt issued yet. Manage clearance in the <a className="text-link" href="/receipts">receipt register</a>.</p>}</section>}
  </>;
}

function methodFromCommand(command: PaymentCommand): CollectionMethod {
  if (command.mode === 'CASH') return 'CASH';
  if (command.mode === 'CHEQUE') return 'CHEQUE';
  if (command.mode === 'BANK_TRANSFER' || command.electronicChannel === 'BANK_TRANSFER') return 'BANK_TRANSFER';
  return 'UPI';
}
