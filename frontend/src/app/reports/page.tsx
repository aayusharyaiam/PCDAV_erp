'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { AppShell, EmptyState, PageHeader } from '@/components/AppShell';
import { ReportTotals } from '@/components/ReportTotals';
import { api, PaymentEvent, PaymentRecord, PaymentResult, rupees } from '@/lib/api';
import { allItems, messageOf } from '@/lib/payments';
import { CollectionReport, DueReport, JournalReport } from '@/lib/reports';

type Filters = { fromDate: string; toDate: string; mode: string; cashierId: string; studentId: string; sessionId: string; classId: string; feeHeadId: string; asOf: string };
const empty: Filters = { fromDate: '', toDate: '', mode: '', cashierId: '', studentId: '', sessionId: '', classId: '', feeHeadId: '', asOf: '' };
export default function ReportsPage() { return <AppShell><Reports /></AppShell>; }
function Reports() {
  const [tab, setTab] = useState('collections');
  const [draft, setDraft] = useState(empty);
  const [filters, setFilters] = useState(empty);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [collections, setCollections] = useState<CollectionReport | null>(null);
  const [dues, setDues] = useState<DueReport | null>(null);
  const [journal, setJournal] = useState<JournalReport | null>(null);
  const [events, setEvents] = useState<(PaymentEvent & { studentId: string; receiptId?: string })[] | null>(null);
  const [eventPage, setEventPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const keys: (keyof Filters)[] = tab === 'collections' ? ['fromDate', 'toDate', 'mode', 'cashierId'] : tab === 'dues' ? ['studentId', 'sessionId', 'classId', 'feeHeadId', 'asOf'] : ['fromDate', 'toDate', 'studentId'];
  useEffect(() => {
    const current = ++generation.current; setBusy(true); setError(''); setCollections(null); setDues(null); setJournal(null); setEvents(null);
    const params = new URLSearchParams(tab === 'collections' ? {} : { page: String(page), limit: String(limit) });
    for (const key of keys) if (filters[key]) params.set(key, filters[key]);
    api<CollectionReport | DueReport | JournalReport>(`/reports/${tab}?${params}`).then(data => {
      if (current !== generation.current) return;
      if (tab === 'collections') setCollections(data as CollectionReport);
      else if (tab === 'dues') setDues(data as DueReport); else setJournal(data as JournalReport);
    }).catch(e => { if (current === generation.current) setError(messageOf(e)); }).finally(() => { if (current === generation.current) setBusy(false); });
  }, [tab, filters, page, limit]);
  function apply(event: FormEvent) { event.preventDefault(); setPage(1); setFilters({ ...draft }); }
  async function drilldown() {
    setBusy(true); setError(''); const current = generation.current;
    try {
      // Payment list dates are received dates, not correction-event dates. Do
      // not apply report dates until reading immutable payment events.
      const params = new URLSearchParams(); if (filters.mode) params.set('mode', filters.mode); if (filters.cashierId) params.set('cashierId', filters.cashierId);
      const payments = await allItems<PaymentRecord>(`/payments?${params}`);
      const rows: (PaymentEvent & { studentId: string; receiptId?: string })[] = [];
      for (const payment of payments) {
        const detail = await api<PaymentResult>(`/payments/${payment.id}`);
        rows.push(...detail.events.filter(e => (!filters.fromDate || e.businessDate.slice(0, 10) >= filters.fromDate) && (!filters.toDate || e.businessDate.slice(0, 10) <= filters.toDate)).map(e => ({ ...e, studentId: payment.studentId, receiptId: detail.receipt?.id })));
      }
      if (current === generation.current) { setEvents(rows.sort((a, b) => b.businessDate.localeCompare(a.businessDate))); setEventPage(1); }
    } catch (e) { if (current === generation.current) setError(messageOf(e)); } finally { if (current === generation.current) setBusy(false); }
  }
  const paged = dues ?? journal;
  const labels: Record<keyof Filters, string> = { fromDate: 'From business date', toDate: 'To business date', mode: 'Payment mode', cashierId: 'Original cashier ID', studentId: 'Student ID', sessionId: 'Session ID', classId: 'Class ID', feeHeadId: 'Fee head ID', asOf: 'Aging cutoff (as of)' };
  return <><PageHeader title="Financial reports" description="Server totals cover the full filtered set. Amounts remain exact minor-unit strings." />
    <div className="button-group">{['collections', 'dues', 'journal'].map(name => <button key={name} className={`button ${tab === name ? '' : 'secondary'}`} disabled={busy} onClick={() => { setTab(name); setPage(1); }}>{name.charAt(0).toUpperCase() + name.slice(1)}</button>)}</div>
    <section className="panel section-panel"><form onSubmit={apply}><fieldset className="form-grid" disabled={busy}>{keys.map(key => <div className="form-field" key={key}><label htmlFor={`filter-${key}`}>{labels[key]}</label>{key === 'mode' ? <select className="select" id={`filter-${key}`} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}><option value="">All modes</option>{['CASH', 'MANUAL_ELECTRONIC', 'CHEQUE'].map(mode => <option key={mode}>{mode}</option>)}</select> : <input className="input" id={`filter-${key}`} type={key.endsWith('Date') || key === 'asOf' ? 'date' : 'text'} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })} />}</div>)}</fieldset><div className="form-actions"><button className="button" disabled={busy}>Apply report filters</button></div></form></section>
    {error && <div className="notice error" role="alert">{error}</div>}{busy && <p>Loading report…</p>}
    {collections && <section className="panel section-panel"><h2>Collections · full filtered totals</h2><p>Capture/correction event business dates · {collections.basis}. Pending cheques use current status and received date · {collections.pendingBasis}. Cashier means original collector · {collections.cashierBasis}.</p><p>{collections.paymentCount} payments with events</p><ReportTotals totals={{ capturedMinor: collections.capturedMinor, refundedMinor: collections.refundedMinor, reversedMinor: collections.reversedMinor, bouncedMinor: collections.bouncedMinor, netCapturedMinor: collections.netCapturedMinor, pendingMinor: collections.pendingMinor }} />
      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Mode</th><th>Captured</th><th>Refunded</th><th>Reversed</th><th>Bounced</th><th>Net captured</th><th>Pending</th></tr></thead><tbody>{collections.byMode.map(row => <tr key={row.mode}><td>{row.mode}</td>{[row.capturedMinor, row.refundedMinor, row.reversedMinor, row.bouncedMinor, row.netCapturedMinor, row.pendingMinor].map((value, i) => <td key={i}>{rupees(value)}</td>)}</tr>)}</tbody></table></div>
      <button className="button secondary" disabled={busy} onClick={() => void drilldown()}>Drill down collection events</button>
      {events && <><h3>Filtered payment events · {events.length}</h3><p>Events are filtered by their own business date. Pending received events are not captured money.</p>{events.slice((eventPage - 1) * 25, eventPage * 25).map(event => <div className="report-entry" key={event.id}><strong>{event.type} · {event.amountMinor === null ? 'No money posted' : rupees(event.amountMinor)}</strong><p>{event.businessDate.slice(0, 10)} · {event.reason} · Payment {event.paymentId}</p><a className="text-link" href={`/statements?studentId=${event.studentId}`}>Student statement</a>{event.receiptId && <> · <a className="text-link" href={`/receipts?receiptId=${event.receiptId}`}>Receipt snapshot</a></>}</div>)}<div className="form-actions"><button className="button secondary" disabled={eventPage === 1} onClick={() => setEventPage(p => p - 1)}>Previous events</button><span>Page {eventPage}</span><button className="button secondary" disabled={eventPage * 25 >= events.length} onClick={() => setEventPage(p => p + 1)}>Next events</button></div></>}
    </section>}
    {dues && <section className="panel section-panel"><h2>Dues · full filtered totals</h2><p>Aging cutoff against current balances, not a historical ledger reconstruction.</p><ReportTotals totals={dues.totals} />{dues.items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Student</th><th>Source / due date</th><th>Assessed</th><th>Outstanding</th><th>Aging</th></tr></thead><tbody>{dues.items.map(row => <tr key={`${row.sourceType}:${row.sourceId}`}><td><a className="text-link" href={`/statements?studentId=${row.studentId}&sourceId=${row.sourceId}`}>{row.admissionNumber} · {row.studentName}</a><small>Session {row.sessionId} · Class {row.classId}</small></td><td>{row.label}<small>{row.sourceType} · {row.sourceId} · {row.dueDate.slice(0, 10)}</small></td><td>{rupees(row.assessedMinor)}</td><td>{rupees(row.outstandingMinor)}</td><td>{row.overdue ? 'Overdue' : 'Not overdue'}</td></tr>)}</tbody></table></div> : <EmptyState title="No matching dues" detail="Change the filters to inspect other current balances." />}</section>}
    {journal && <section className="panel section-panel"><h2>Journal · full filtered totals</h2><ReportTotals totals={journal.totals} />{journal.items.length ? journal.items.map(entry => <details className="report-entry" key={entry.id}><summary>{entry.businessDate.slice(0, 10)} · {entry.description} · {entry.sourceType} · {entry.sourceId}</summary><p>Entry {entry.id}</p><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Account</th><th>Student</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{entry.lines.map((line, index) => <tr key={index}><td>{line.account}</td><td>{line.studentId ? <a className="text-link" href={`/statements?studentId=${line.studentId}`}>{line.studentId}</a> : 'School / cash'}</td><td>{rupees(line.debitMinor)}</td><td>{rupees(line.creditMinor)}</td></tr>)}</tbody></table></div></details>) : <EmptyState title="No journal entries" detail="No entries match the selected filters." />}</section>}
    {dues && <p>Aging date: {dues.agingDate} · Due-date cutoff: {dues.asOf ?? 'None'} · {dues.basis}</p>}
    {journal && <p>Journal business-date basis · {journal.basis}. Demo operational accounts: clearing is not bank settlement · {journal.accountBasis}.</p>}
    {paged && <div className="form-actions"><span>{paged.total} matching rows · Page {paged.page}</span><label>Rows per page <select aria-label="Report rows per page" value={limit} disabled={busy} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}><option>25</option><option>50</option><option>100</option></select></label><button className="button secondary" disabled={busy || page <= 1} onClick={() => setPage(p => p - 1)}>Previous page</button><button className="button secondary" disabled={busy || page * paged.limit >= paged.total} onClick={() => setPage(p => p + 1)}>Next page</button></div>}
  </>;
}
