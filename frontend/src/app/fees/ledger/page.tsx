'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '@/components/AppShell';
import { api, Ledger, Student, rupees } from '@/lib/api';

export default function FeeLedgerPage() {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [student, setStudent] = useState<Student | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState('');

  async function search() {
    setError('');
    try { const result = await api<{ items: Student[] }>(`/students?limit=25&q=${encodeURIComponent(query)}`); setStudents(result.items); setStudent(null); setLedger(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to search students'); }
  }

  async function select(item: Student) {
    setError('');
    try { setStudent(item); setLedger(await api<Ledger>(`/students/${item.id}/ledger`)); setStudents([]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load ledger'); }
  }

  return <AppShell><PageHeader eyebrow="Fees & Payments" title="Student fee ledger" description="Review assessed obligations, outstanding amounts, and student-specific credit before collecting a controlled Level 4 payment." action={student ? <Link className="button" href={`/fees/collect?studentId=${student.id}`}>Collect payment</Link> : undefined} />{error && <div className="notice error" role="alert">{error}</div>}<section className="panel"><div className="search-row"><input className="input" autoFocus placeholder="Search by admission number or name" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && void search()} /><button className="button" onClick={() => void search()}>Find student</button></div>{students.length > 0 && <div className="lookup-results">{students.map(item => <button key={item.id} onClick={() => void select(item)}><strong>{item.admissionNumber}</strong><span>{item.name}</span></button>)}</div>}</section>{student && ledger && <><div className="ledger-summary"><div className="stat-card"><div className="stat-icon blue">₹</div><div><span>Assessed</span><strong>{rupees(ledger.totals.assessedMinor)}</strong><small>All recorded obligations</small></div></div><div className="stat-card"><div className="stat-icon amber">!</div><div><span>Outstanding</span><strong>{rupees(ledger.totals.outstandingMinor)}</strong><small>Before new payment</small></div></div><div className="stat-card"><div className="stat-icon green">+</div><div><span>Available credit</span><strong>{rupees(ledger.totals.availableCreditMinor)}</strong><small>Same student only</small></div></div></div><section className="panel section-panel"><div className="panel-header"><div><h2>{student.admissionNumber} · {student.name}</h2><span>Assessment and collection remain separate audited actions.</span></div><Link className="button secondary" href={`/fees/collect?studentId=${student.id}`}>Open collection</Link></div><div className="section-heading"><h3>Obligations</h3><span>{ledger.items.length} assessed lines</span></div>{ledger.items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Fee head</th><th>Period</th><th>Due</th><th>Assessed</th><th>Credit</th><th>Paid</th><th>Outstanding</th><th>Status</th></tr></thead><tbody>{ledger.items.map(item => <tr key={item.id}><td><strong>{item.feeHeadName}</strong></td><td>{item.periodKey}</td><td>{item.dueDate.slice(0, 10)}</td><td>{rupees(item.amountMinor)}</td><td>{rupees(item.creditAppliedMinor)}</td><td>{rupees(item.paidMinor)}</td><td className="primary-text">{rupees(item.outstandingMinor)}</td><td><StatusBadge status={item.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="No assessed obligations" detail="This student has no recorded fee obligations." />}</section></>}</AppShell>;
}
