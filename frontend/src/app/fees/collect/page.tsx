'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppShell, PageHeader, StatusBadge, useStaffUser } from '@/components/AppShell';
import { PaymentAllocation } from '@/components/PaymentAllocation';
import { api, ElectronicChannel, Ledger, PaymentMode, PaymentQuote, PaymentResult, rupees, Student, StoreIssue, toPaise } from '@/lib/api';
import { allItems, businessToday, inputAmount, isDefinitiveRejection, ListResponse, messageOf, PaymentCommand } from '@/lib/payments';

type StudentDetail = { student: Student; enrollments: { id: string; status: string; className: string; sessionName: string }[] };
type StoredAttempt = { student: Student; quote: PaymentQuote; command: PaymentCommand; idempotencyKey: string };

export default function CollectPaymentPage() { return <AppShell><CollectionWorkspace /></AppShell>; }

function CollectionWorkspace() {
  const user = useStaffUser();
  const storageKey = `pcdav_pending_payment_attempt:${user.schoolId}:${user.id}`;
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [storeIssues, setStoreIssues] = useState<StoreIssue[]>([]);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [electronicChannel, setElectronicChannel] = useState<ElectronicChannel>('UPI');
  const [electronicVerified, setElectronicVerified] = useState(false);
  const [electronicVerificationNote, setElectronicVerificationNote] = useState('');
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
      setStudents([]); setQuote(null); setResult(null); setReceivedAmount(''); setPayerName(''); setPayerPhone('');
      setElectronicVerified(false); setElectronicVerificationNote('');
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
        setReceivedAmount(inputAmount(stored.command.receivedAmountMinor));
        setBusinessDate(stored.command.businessDate); setMode(stored.command.mode);
        setTenderedAmount(stored.command.tenderedAmountMinor ? inputAmount(stored.command.tenderedAmountMinor) : '');
        setElectronicChannel(stored.command.electronicChannel ?? 'UPI'); setReference(stored.command.reference ?? '');
        setElectronicVerified(stored.command.electronicVerified === true); setElectronicVerificationNote(stored.command.electronicVerificationNote ?? '');
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
      const next = await api<PaymentQuote>('/payment-quotes', { method: 'POST', body: JSON.stringify({ studentId: student.id, amountMinor }) });
      setQuote(next); setClock(Date.now()); setTenderedAmount(inputAmount(next.amountMinor));
      setElectronicVerified(false);
      setNotice('Review the server allocation before posting. Excess payment becomes student credit.');
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
        const command: PaymentCommand = { quoteId: quote.id, quoteVersion: quote.version, receivedAmountMinor: quote.amountMinor, currency: 'INR', businessDate, mode, payerName: payerName.trim() };
        if (payerPhone.trim()) {
          if (!/^[+0-9 ()-]{7,25}$/.test(payerPhone.trim())) throw new Error('Enter a valid payer phone (7–25 phone characters).');
          command.payerPhone = payerPhone.trim();
        }
        if (mode === 'CASH') {
          command.tenderedAmountMinor = toPaise(tenderedAmount);
          if (BigInt(command.tenderedAmountMinor) < BigInt(quote.amountMinor)) throw new Error('Tendered cash cannot be lower than the payment amount.');
        } else if (mode === 'MANUAL_ELECTRONIC') {
          if (!reference.trim()) throw new Error('Enter the transaction reference.');
          if (!electronicVerified || electronicVerificationNote.trim().length < 3) throw new Error('Confirm verified receipt of funds and enter verification evidence.');
          command.electronicChannel = electronicChannel; command.reference = reference.trim();
          command.electronicVerified = true; command.electronicVerificationNote = electronicVerificationNote.trim();
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
      setNotice(posted.receipt ? 'Payment posted and receipt issued.' : 'Cheque recorded pending clearance. No dues or credit are reserved until clearance.');
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
    setElectronicVerified(false); setElectronicVerificationNote('');
  }

  return <>
    <PageHeader eyebrow="Level 4 · Fees & Payments" title="Collect student payment" description="Verify the student, review automatic oldest-due fee/store allocation, and post a retry-safe payment." action={result ? <button className="button" onClick={newCollection}>New collection</button> : undefined} />
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    <section className="panel">
      <div className="panel-header"><h2>1. Find and verify student</h2>{student && <StatusBadge status={student.status} />}</div>
      <form className="search-row" onSubmit={searchStudents}><label className="sr-only" htmlFor="student-search">Student search</label><input className="input" id="student-search" placeholder="Admission number, name, or guardian phone" value={query} onChange={e => setQuery(e.target.value)} disabled={busy || frozen} required /><button className="button" disabled={busy || frozen}>Find student</button></form>
      {students.length > 0 && <div className="lookup-results">{students.map(item => <button key={item.id} disabled={busy || frozen} onClick={() => void loadStudent(item.id)}><strong>{item.admissionNumber}</strong><span>{item.name}</span></button>)}</div>}
      {student && <div className="selected-context"><strong>{student.admissionNumber} · {student.name}</strong></div>}
    </section>
    {student && !result && <section className="panel section-panel">
      <div className="panel-header"><div><h2>2. Review balances</h2><span>Existing credit applies to fees first. The server allocates payment across fee and store dues oldest-first.</span></div></div>
      {ledger && <div className="money-summary"><div><span>Fee outstanding</span><strong>{rupees(ledger.totals.outstandingMinor)}</strong></div><div><span>Store outstanding</span><strong>{rupees(storeIssues.reduce((sum, issue) => sum + BigInt(issue.outstandingMinor), BigInt(0)))}</strong></div><div><span>Available credit</span><strong>{rupees(ledger.totals.availableCreditMinor)}</strong></div></div>}
      <form className="quote-form" onSubmit={createQuote}><div className="form-field"><label htmlFor="received-amount">Amount received / to post ₹</label><input className="input" id="received-amount" type="number" min="0.01" step="0.01" value={receivedAmount} onChange={e => { setReceivedAmount(e.target.value); setQuote(null); }} disabled={busy || frozen} required /><small className="field-hint">Partial payments leave dues open. A payment with no dues becomes advance credit.</small></div><button className="button" disabled={busy || frozen}>Create quote & review</button></form>
    </section>}
    {quote && <section className="panel section-panel">
      <div className="panel-header"><div><h2>3. Review quote</h2><span>Quote {quote.id} · version {quote.version}</span></div><span>{quoteExpired ? 'Expired — fresh payments need a new quote' : `Valid until ${new Date(quote.expiresAt).toLocaleTimeString('en-IN')}`}</span></div>
      <p>Amount to post: <strong>{rupees(quote.amountMinor)}</strong></p>
      {!quote.allocations.length && <p>No outstanding dues. This payment will become student credit.</p>}
      <PaymentAllocation lines={quote.allocations} summary={quote} />
      {mode === 'CHEQUE' && <p>Cheque allocation is provisional and recalculated at clearance.</p>}
    </section>}
    {quote && !result && <section className="panel section-panel">
      <div className="panel-header"><div><h2>4. Capture payment</h2><span>All modes require your <a className="text-link" href="/cashier">open cashier shift</a> for the business date.</span></div></div>
      <form onSubmit={submitPayment}>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="business-date">Business date</label><input className="input" id="business-date" type="date" value={businessDate} onChange={e => setBusinessDate(e.target.value)} disabled={busy || frozen} required /></div>
          <div className="form-field"><label htmlFor="payer-name">Payer name</label><input className="input" id="payer-name" value={payerName} onChange={e => setPayerName(e.target.value)} minLength={2} maxLength={150} disabled={busy || frozen} required /></div>
          <div className="form-field"><label htmlFor="payer-phone">Payer phone (optional)</label><input className="input" id="payer-phone" type="tel" value={payerPhone} onChange={e => setPayerPhone(e.target.value)} maxLength={25} disabled={busy || frozen} /></div>
        </div>
        <div className="payment-mode-grid">{([['CASH', 'Cash'], ['MANUAL_ELECTRONIC', 'Manual electronic'], ['CHEQUE', 'Cheque']] as const).map(([value, label]) => <label className={`mode-card ${mode === value ? 'selected' : ''}`} key={value}><input type="radio" name="payment-mode" checked={mode === value} onChange={() => { setMode(value); setElectronicVerified(false); }} disabled={busy || frozen} /><strong>{label}</strong></label>)}</div>
        {mode === 'CASH' && <div className="form-grid"><div className="form-field"><label htmlFor="tendered-amount">Cash tendered ₹</label><input className="input" id="tendered-amount" type="number" min="0.01" step="0.01" value={tenderedAmount} onChange={e => setTenderedAmount(e.target.value)} disabled={busy || frozen} required /></div><div className="cash-change"><span>Change due</span><strong>{change !== null && BigInt(change) >= BigInt(0) ? rupees(change) : '—'}</strong></div></div>}
        {mode === 'MANUAL_ELECTRONIC' && <>
          <div className="form-grid"><div className="form-field"><label htmlFor="channel">Electronic channel</label><select className="select" id="channel" value={electronicChannel} onChange={e => { setElectronicChannel(e.target.value as ElectronicChannel); setElectronicVerified(false); }} disabled={busy || frozen}><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer (NEFT / RTGS / IMPS)</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></div><div className="form-field"><label htmlFor="reference">Transaction reference</label><input className="input" id="reference" value={reference} onChange={e => { setReference(e.target.value); setElectronicVerified(false); }} maxLength={150} disabled={busy || frozen} required /></div></div>
          <p>Manual staff verification only; this does not connect to or confirm funds with a bank automatically.</p>
          <div className="form-field"><label htmlFor="electronic-evidence">Verification evidence</label><textarea className="textarea" id="electronic-evidence" value={electronicVerificationNote} onChange={e => { setElectronicVerificationNote(e.target.value); setElectronicVerified(false); }} minLength={3} maxLength={500} placeholder="How you verified the credit to the school account, e.g. statement entry or merchant settlement" disabled={busy || frozen} required /></div>
          <label><input type="checkbox" checked={electronicVerified} onChange={e => setElectronicVerified(e.target.checked)} disabled={busy || frozen} required /> I verified receipt of these funds in the school account</label>
        </>}
        {mode === 'CHEQUE' && <div className="form-grid"><div className="form-field"><label htmlFor="cheque-number">Cheque number</label><input className="input" id="cheque-number" value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} minLength={3} maxLength={80} disabled={busy || frozen} required /></div><div className="form-field"><label htmlFor="cheque-bank">Cheque bank</label><input className="input" id="cheque-bank" value={chequeBank} onChange={e => setChequeBank(e.target.value)} minLength={2} maxLength={150} disabled={busy || frozen} required /></div><div className="form-field"><label htmlFor="cheque-date">Cheque date</label><input className="input" id="cheque-date" type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} disabled={busy || frozen} required /></div></div>}
        <div className="form-actions"><button className="button" disabled={busy || (quoteExpired && !frozen)}>{busy ? 'Posting…' : frozen ? 'Retry payment' : 'Post payment'}</button></div>
      </form>
    </section>}
    {result && <section className="panel section-panel" aria-live="polite"><div className="panel-header"><h2>{result.receipt ? 'Payment posted' : 'Cheque pending clearance'}</h2><StatusBadge status={result.payment.status} /></div><p>Payment {result.payment.id} · {rupees(result.payment.receivedAmountMinor)} · {result.payment.businessDate.slice(0, 10)}</p>{result.receipt ? <a className="text-link" href={`/receipts?receiptId=${encodeURIComponent(result.receipt.id)}`}>View immutable receipt {result.receipt.receiptNumber}</a> : <p>No final receipt issued yet. Manage clearance in the <a className="text-link" href="/receipts">receipt register</a>.</p>}</section>}
  </>;
}
