'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '@/components/AppShell';
import { StudentLookup } from '@/components/StudentLookup';
import { api, Ledger, LifecycleActionResult, PaymentRecord, StoreIssue, Student, StudentEnrollment, rupees } from '@/lib/api';
import { messageOf } from '@/lib/payments';

type Service = { id: string; enrollmentId: string; type: string; label: string; amountMinor: string; startDate: string; endDate?: string | null; active: boolean };
type Detail = { student: Student; enrollments: StudentEnrollment[] };
type Impact = { detail: Detail; ledger: Ledger; storeIssues: StoreIssue[]; services: Service[]; pendingChequeMinor: string };

const today = new Date().toISOString().slice(0, 10);

export default function WithdrawalsPage() {
  const [student, setStudent] = useState<Student | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [actionType, setActionType] = useState<'WITHDRAWAL' | 'STRUCK_OFF'>('WITHDRAWAL');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<LifecycleActionResult | null>(null);

  async function loadImpact(next: Student) {
    setStudent(next);
    setImpact(null);
    setResult(null);
    setNotice('');
    setError('');
    setLoadingImpact(true);
    try {
      const [detail, ledger, issueResponse, assignments, pending] = await Promise.all([
        api<Detail>(`/students/${encodeURIComponent(next.id)}`),
        api<Ledger>(`/students/${encodeURIComponent(next.id)}/ledger`),
        api<{ items: StoreIssue[] }>(`/store/issues?status=OPEN&limit=100&q=${encodeURIComponent(next.admissionNumber)}`),
        api<Service[]>('/services/assignments'),
        api<{ items: PaymentRecord[] }>(`/payments?studentId=${encodeURIComponent(next.id)}&status=PENDING_CHEQUE&limit=100`),
      ]);
      const enrollmentIds = new Set(detail.enrollments.map(item => item.id));
      const storeIssues = issueResponse.items.filter(item => item.studentId === next.id);
      const pendingChequeMinor = pending.items.reduce((total, item) => total + BigInt(item.receivedAmountMinor), BigInt(0)).toString();
      setImpact({ detail, ledger, storeIssues, services: assignments.filter(item => item.active && enrollmentIds.has(item.enrollmentId)), pendingChequeMinor });
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoadingImpact(false);
    }
  }

  function clear() {
    setStudent(null);
    setImpact(null);
    setResult(null);
    setError('');
    setNotice('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!student || !impact) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const path = actionType === 'WITHDRAWAL' ? `/students/${encodeURIComponent(student.id)}/withdraw` : `/students/${encodeURIComponent(student.id)}/strike-off`;
      const response = await api<LifecycleActionResult>(path, {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: activeEnrollment?.id, effectiveDate, reason: reason.trim(), version: student.version }),
      });
      setResult(response);
      setNotice(`${actionType === 'WITHDRAWAL' ? 'Withdrawal' : 'Strike-off'} recorded. The student remains searchable with historical balances.`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (student?.status === 'FORMER') setActionType('WITHDRAWAL');
  }, [student]);

  const storeDue = impact?.storeIssues.reduce((total, item) => total + BigInt(item.outstandingMinor), BigInt(0)).toString() ?? '0';
  const activeEnrollment = impact?.detail.enrollments.find(item => item.status === 'ACTIVE');

  return <AppShell>
    <PageHeader eyebrow="Lifecycle" title="Withdraw or strike off a student" description="Record the leaving decision with dates, financial impact, and service cut-off details. This keeps the student history intact instead of deleting the record." />
    {error && <div className="notice error workspace-error" role="alert"><span>{error}</span>{student && <button className="button secondary small" onClick={() => void loadImpact(student)}>Retry</button>}</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    <section className="panel">
      <div className="panel-header"><div><h2>1. Choose the student</h2><span>Search by the permanent admission number first.</span></div>{student && <StatusBadge status={student.status} />}</div>
      <StudentLookup selected={student} onSelect={next => void loadImpact(next)} onClear={clear} disabled={busy} />
    </section>
    {student && <section className="panel section-panel">
      <div className="panel-header"><div><h2>2. Review the leaving impact</h2><span>Check balances and active services before confirming the action.</span></div>{loadingImpact && <span>Loading impact…</span>}</div>
      {loadingImpact ? <div className="loading-state"><div className="spinner" /> Loading student balances and services…</div> : impact ? <>
        <div className="money-summary">
          <div><span>Fee due</span><strong>{rupees(impact.ledger.totals.outstandingMinor)}</strong></div>
          <div><span>Store due</span><strong>{rupees(storeDue)}</strong></div>
          <div><span>Available credit</span><strong>{rupees(impact.ledger.totals.availableCreditMinor)}</strong></div>
          <div><span>Pending cheques</span><strong>{rupees(impact.pendingChequeMinor)}</strong></div>
          <div><span>Active services</span><strong>{impact.services.length}</strong></div>
        </div>
        <div className="detail-grid section-panel">
          <div className="detail-item"><label>Active enrollment</label><strong>{activeEnrollment?.className || 'No active enrollment'}</strong></div>
          <div className="detail-item"><label>Admission number</label><strong>{student.admissionNumber}</strong></div>
          <div className="detail-item"><label>Historical enrollments</label><strong>{impact.detail.enrollments.length}</strong></div>
        </div>
        {impact.services.length ? <div className="data-table-wrap section-panel"><table className="data-table"><thead><tr><th>Service</th><th>Assignment</th><th>Amount</th><th>Status</th></tr></thead><tbody>{impact.services.map(service => <tr key={service.id}><td>{service.type}</td><td><strong>{service.label}</strong><small>{service.startDate.slice(0, 10)}{service.endDate ? ` → ${service.endDate.slice(0, 10)}` : ' → ongoing'}</small></td><td>{rupees(service.amountMinor)}</td><td><StatusBadge status="ACTIVE" /></td></tr>)}</tbody></table></div> : <EmptyState title="No active services" detail="There is no active transport or hostel assignment to stop at this time." />}
      </> : <EmptyState title="Impact is not available" detail="Retry the student lookup to load the balances before recording a leaving action." />}
    </section>}
    {student && impact && !result && <section className="panel section-panel">
      <div className="panel-header"><div><h2>3. Record the decision</h2><span>Use a clear reason. Future charges stop only from the dates confirmed by the server.</span></div></div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="leaving-action">Action</label><select className="select" id="leaving-action" value={actionType} onChange={event => setActionType(event.target.value as 'WITHDRAWAL' | 'STRUCK_OFF')} disabled={busy}><option value="WITHDRAWAL">Withdrawal requested by family</option><option value="STRUCK_OFF">Administrative strike-off</option></select></div>
          <div className="form-field"><label htmlFor="effective-date">Effective leaving date</label><input className="input" id="effective-date" type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} disabled={busy} required /><small className="field-hint">Active transport and hostel assignments close on this date.</small></div>
          <div className="form-field full"><label htmlFor="leaving-reason">Reason</label><textarea className="textarea" id="leaving-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} placeholder="Example: family relocation to another city" disabled={busy} required /></div>
        </div>
        <div className="notice"><strong>Before you confirm:</strong> the enrollment ends on the effective date, active services are closed, and existing dues and credit remain visible for settlement.</div>
        <div className="form-actions"><button className="button" disabled={busy || !activeEnrollment}>{busy ? 'Saving decision…' : `Confirm ${actionType === 'WITHDRAWAL' ? 'withdrawal' : 'strike-off'}`}</button></div>
      </form>
    </section>}
    {result && <section className="panel section-panel" aria-live="polite"><div className="panel-header"><div><h2>Leaving action recorded</h2><span>{result.message || 'The server returned the completed lifecycle action.'}</span></div><StatusBadge status="COMPLETED" /></div><div className="detail-grid"><div className="detail-item"><label>Student</label><strong>{result.student.name}</strong></div><div className="detail-item"><label>Action</label><strong>{result.event?.eventType?.replaceAll('_', ' ') || 'Recorded'}</strong></div><div className="detail-item"><label>Effective date</label><strong>{result.event?.effectiveDate?.slice(0, 10) || effectiveDate}</strong></div></div><p className="muted">{result.closedServiceCount ?? 0} active service assignment(s) closed.</p><div className="form-actions"><button className="button secondary" onClick={clear}>Choose another student</button></div></section>}
  </AppShell>;
}
