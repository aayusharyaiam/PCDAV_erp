'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '@/components/AppShell';
import { ReportTotals } from '@/components/ReportTotals';
import { api, rupees, Student } from '@/lib/api';
import { ListResponse, messageOf } from '@/lib/payments';
import { fieldLabel, StatementRow, StudentStatement } from '@/lib/reports';

// Statement lineage is read-only server data. Preserve every source/link field
// (including nested allocation releases) rather than reconstructing balances.
export default function StatementPage() { return <AppShell><StatementWorkspace /></AppShell>; }

function StatementWorkspace() {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [data, setData] = useState<StudentStatement | null>(null);
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load(id: string) {
    setBusy(true); setError(''); setData(null);
    try {
      const result = await api<StudentStatement>(`/students/${encodeURIComponent(id)}/statement`);
      if (!result.student || !['fees', 'storeIssues', 'credits', 'payments'].every(key => Array.isArray(result[key as keyof StudentStatement]))) throw new Error('Unsupported student statement response. Refresh after the API update.');
      setData(result); setStudents([]);
    } catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search); const id = params.get('studentId'); setSourceId(params.get('sourceId') ?? '');
    if (id) void load(id);
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setData(null); setSourceId('');
    try { setStudents((await api<ListResponse<Student>>(`/students?q=${encodeURIComponent(query.trim())}&limit=25&page=1`)).items); }
    catch (e) { setError(messageOf(e)); } finally { setBusy(false); }
  }
  return <><PageHeader title="Student statement" description="Current balances and full allocation, credit, release, refund, and pending-payment lineage from the server." action={data && <button className="button secondary" disabled={busy} onClick={() => void load(data.student.id)}>Refresh statement</button>} />
    {error && <div className="notice error" role="alert">{error}</div>}
    <section className="panel"><form className="search-row" onSubmit={search}><label className="sr-only" htmlFor="statement-search">Statement student search</label><input className="input" id="statement-search" placeholder="Admission number or student name" value={query} onChange={e => setQuery(e.target.value)} required disabled={busy} /><button className="button" disabled={busy}>Find statement student</button></form>{students.length > 0 && <div className="lookup-results">{students.map(s => <button key={s.id} disabled={busy} onClick={() => void load(s.id)}>{s.admissionNumber} · {s.name}</button>)}</div>}{busy && <p>Loading statement…</p>}</section>
    {data && <><section className="panel section-panel"><h2>{data.student.admissionNumber} · {data.student.name}</h2><p>Student {data.student.id} · <a className="text-link" href={`/students/${data.student.id}`}>Student profile</a> · <a className="text-link" href={`/fees/collect?studentId=${data.student.id}`}>Collect payment</a></p><h3>Full statement totals</h3><ReportTotals totals={Object.fromEntries(Object.entries(data.totals).filter(([key]) => key !== 'journal')) as Record<string, string>} /><h3>Journal reconciliation</h3><ReportTotals totals={data.totals.journal} /><p>Clearing accounts describe recorded funds, not confirmed bank settlement. Untraced credit is shown explicitly where legacy allocation lineage is unavailable.</p><label htmlFor="statement-source">Source / lineage filter</label><input className="input" id="statement-source" value={sourceId} onChange={e => setSourceId(e.target.value)} placeholder="Source ID, receipt, payment, or reason" /><p>This filter narrows displayed lineage only. Totals remain the complete server statement.</p></section>
      <StatementSection title="Fee obligations" rows={data.fees} filter={sourceId} />
      <StatementSection title="Store issues" rows={data.storeIssues} filter={sourceId} />
      <StatementSection title="Credits and applications" rows={data.credits} filter={sourceId} />
      <StatementSection title="Payments, refunds and releases" rows={data.payments} filter={sourceId} />
    </>}
  </>;
}

function StatementSection({ title, rows, filter }: { title: string; rows: StatementRow[]; filter: string }) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, rows]);
  const filtered = rows.filter(row => !filter || JSON.stringify(row).toLowerCase().includes(filter.toLowerCase()));
  return <section className="panel section-panel"><h2>{title}</h2><p>{filtered.length} matching records · Page {page}</p>{filtered.length ? filtered.slice((page - 1) * 25, page * 25).map(row => {
    const label = ['label', 'feeHeadName', 'issueNumber', 'receiptNumber', 'reason'].map(key => row[key]).find(value => typeof value === 'string' && value) as string | undefined;
    return <details className="report-entry" key={row.id} open={!!filter}><summary>{label ?? row.id}{typeof row.status === 'string' && <> · <StatusBadge status={row.status} /></>}{typeof row.outstandingMinor === 'string' && <> · Outstanding {rupees(row.outstandingMinor)}</>}</summary><StatementFields value={row} /></details>;
  }) : <EmptyState title="No matching records" detail="No records in this section match the lineage filter." />}<div className="form-actions"><button className="button secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous {title.toLowerCase()}</button><button className="button secondary" disabled={page * 25 >= filtered.length} onClick={() => setPage(p => p + 1)}>Next {title.toLowerCase()}</button></div></section>;
}

function StatementFields({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>—</span>;
  if (Array.isArray(value)) return value.length ? <div>{value.map((item, i) => <div className="report-entry" key={typeof item?.id === 'string' ? item.id : i}><StatementFields value={item} /></div>)}</div> : <span>None</span>;
  if (typeof value !== 'object') return <span>{String(value)}</span>;
  return <dl className="statement-fields">{Object.entries(value).filter(([key]) => !['requestHash', 'idempotencyKey', 'snapshot'].includes(key)).map(([key, item]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{key.endsWith('Minor') && typeof item === 'string' && /^-?\d+$/.test(item) ? rupees(item) : key === 'receipt' && item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' ? <><a className="text-link" href={`/receipts?receiptId=${encodeURIComponent(item.id)}`}>Open immutable receipt</a><StatementFields value={item} /></> : key === 'receiptId' && typeof item === 'string' ? <a className="text-link" href={`/receipts?receiptId=${encodeURIComponent(item)}`}>{item}</a> : <StatementFields value={item} />}</dd></div>)}</dl>;
}
