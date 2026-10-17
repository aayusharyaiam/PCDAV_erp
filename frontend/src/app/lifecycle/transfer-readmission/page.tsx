'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge } from '@/components/AppShell';
import { StudentLookup } from '@/components/StudentLookup';
import { api, AcademicSession, ClassOffering, LifecycleActionResult, Student, StudentEnrollment } from '@/lib/api';
import { messageOf } from '@/lib/payments';

type Detail = { student: Student; enrollments: StudentEnrollment[] };
type ActionType = 'TRANSFER' | 'READMISSION';
const today = new Date().toISOString().slice(0, 10);

export default function TransferReadmissionPage() {
  const [actionType, setActionType] = useState<ActionType>('TRANSFER');
  const [student, setStudent] = useState<Student | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<ClassOffering[]>([]);
  const [targetSessionId, setTargetSessionId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [feeCategory, setFeeCategory] = useState('GENERAL');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<LifecycleActionResult | null>(null);

  useEffect(() => {
    api<AcademicSession[]>('/school/sessions').then(items => {
      setSessions(items);
      const current = items.find(item => item.current) ?? items[0];
      if (current) setTargetSessionId(current.id);
    }).catch(cause => setError(messageOf(cause))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!targetSessionId) {
      setClasses([]);
      setTargetClassId('');
      return;
    }
    setLoadingClasses(true);
    setTargetClassId('');
    api<{ items: ClassOffering[] }>(`/school/classes?sessionId=${encodeURIComponent(targetSessionId)}&limit=100`).then(response => setClasses(response.items)).catch(cause => setError(messageOf(cause))).finally(() => setLoadingClasses(false));
  }, [targetSessionId]);

  async function chooseStudent(next: Student) {
    setStudent(next);
    setDetail(null);
    setResult(null);
    setNotice('');
    setError('');
    try {
      setDetail(await api<Detail>(`/students/${encodeURIComponent(next.id)}`));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  function clear() {
    setStudent(null);
    setDetail(null);
    setResult(null);
    setError('');
    setNotice('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!student || !detail || !targetSessionId || !targetClassId) return;
    if (actionType === 'TRANSFER' && !detail.enrollments.some(item => item.status === 'ACTIVE')) {
      setError('Transfer requires an active enrollment. Choose Readmission for a former student.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const path = actionType === 'TRANSFER' ? `/students/${encodeURIComponent(student.id)}/transfer` : `/students/${encodeURIComponent(student.id)}/readmit`;
      const body = actionType === 'TRANSFER'
        ? { sourceEnrollmentId: detail.enrollments.find(item => item.status === 'ACTIVE')?.id, targetSessionId, targetClassId, startDate: effectiveDate, feeCategory, reason: reason.trim() }
        : { targetSessionId, targetClassId, startDate: effectiveDate, feeCategory, reason: reason.trim() };
      const response = await api<LifecycleActionResult>(path, { method: 'POST', body: JSON.stringify(body) });
      setResult(response);
      setNotice(actionType === 'TRANSFER' ? 'Transfer recorded with the existing student identity.' : 'Readmission recorded as a new enrollment linked to the existing student.');
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const activeEnrollment = detail?.enrollments.find(item => item.status === 'ACTIVE');
  const selectedClass = classes.find(item => item.id === targetClassId);

  return <AppShell>
    <PageHeader eyebrow="Lifecycle" title="Transfer or readmit a student" description="Move a current student to a new class/session, or create a new enrollment for a former student without creating a duplicate student record." />
    {error && <div className="notice error" role="alert">{error}</div>}
    {notice && <div className="notice success" role="status">{notice}</div>}
    <section className="panel">
      <div className="panel-header"><div><h2>1. Choose the workflow</h2><span>Transfer keeps the student active. Readmission creates a linked enrollment.</span></div></div>
      <div className="payment-mode-grid lifecycle-choice-grid">
        <label className={`mode-card ${actionType === 'TRANSFER' ? 'selected' : ''}`}><input type="radio" name="lifecycle-action" checked={actionType === 'TRANSFER'} onChange={() => setActionType('TRANSFER')} disabled={busy} /><span><strong>Transfer</strong><small>Move an active student to another class or session.</small></span></label>
        <label className={`mode-card ${actionType === 'READMISSION' ? 'selected' : ''}`}><input type="radio" name="lifecycle-action" checked={actionType === 'READMISSION'} onChange={() => setActionType('READMISSION')} disabled={busy} /><span><strong>Readmission</strong><small>Start a new enrollment using the same student identity.</small></span></label>
      </div>
    </section>
    <section className="panel section-panel">
      <div className="panel-header"><div><h2>2. Find the student</h2><span>Former students are included so readmission can be linked safely.</span></div>{student && <StatusBadge status={student.status} />}</div>
      <StudentLookup selected={student} onSelect={next => void chooseStudent(next)} onClear={clear} disabled={busy} />
      {student && !detail && <div className="loading-state"><div className="spinner" /> Loading enrollment history…</div>}
      {detail && <div className="selected-context"><strong>{detail.student.admissionNumber} · {detail.student.name}</strong>{activeEnrollment ? ` · Current: ${activeEnrollment.className || activeEnrollment.classId}` : ' · No active enrollment'}</div>}
    </section>
    {student && detail && !result && <section className="panel section-panel">
      <div className="panel-header"><div><h2>3. Choose the destination</h2><span>Review the destination and reason before sending the lifecycle request.</span></div></div>
      {loading ? <div className="loading-state"><div className="spinner" /> Loading sessions…</div> : !sessions.length ? <EmptyState title="No academic sessions" detail="Create a target session in Academic setup before transferring or readmitting a student." /> : <form onSubmit={submit}>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="target-session">Target session</label><select className="select" id="target-session" value={targetSessionId} onChange={event => setTargetSessionId(event.target.value)} disabled={busy} required><option value="">Select session</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.name}{session.current ? ' · Current' : ''}</option>)}</select></div>
          <div className="form-field"><label htmlFor="target-class">Target class / section</label><select className="select" id="target-class" value={targetClassId} onChange={event => setTargetClassId(event.target.value)} disabled={busy || loadingClasses || !targetSessionId} required><option value="">{loadingClasses ? 'Loading classes…' : 'Select class'}</option>{classes.map(item => <option key={item.id} value={item.id}>{item.grade} {item.section}{item.stream ? ` · ${item.stream}` : ''} · {item.activeEnrollmentCount}/{item.capacity}</option>)}</select></div>
          <div className="form-field"><label htmlFor="effective-date">Effective date</label><input className="input" id="effective-date" type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} disabled={busy} required /></div>
          <div className="form-field"><label htmlFor="fee-category">Fee category</label><select className="select" id="fee-category" value={feeCategory} onChange={event => setFeeCategory(event.target.value)} disabled={busy}><option>GENERAL</option><option>EWS</option><option>STAFF_CHILD</option><option>SIBLING</option></select></div>
          <div className="form-field full"><label htmlFor="lifecycle-reason">Reason</label><textarea className="textarea" id="lifecycle-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} placeholder={actionType === 'TRANSFER' ? 'Example: family moved to the North campus' : 'Example: student returned after approved leave'} disabled={busy} required /></div>
        </div>
        {targetClassId && <div className="mapping-preview"><strong>{actionType === 'TRANSFER' ? activeEnrollment?.className || 'Current enrollment' : 'Former enrollment'} → {selectedClass ? `${selectedClass.grade} ${selectedClass.section}` : targetClassId}</strong><span>Student identity and historical enrollments remain linked.</span></div>}
        <div className="form-actions"><button className="button" disabled={busy || !targetClassId}>{busy ? 'Saving enrollment…' : actionType === 'TRANSFER' ? 'Confirm transfer' : 'Confirm readmission'}</button></div>
      </form>}
    </section>}
    {result && <section className="panel section-panel" aria-live="polite"><div className="panel-header"><div><h2>{actionType === 'TRANSFER' ? 'Transfer recorded' : 'Readmission recorded'}</h2><span>{result.message || 'The server returned the completed lifecycle action.'}</span></div><StatusBadge status="COMPLETED" /></div><div className="detail-grid"><div className="detail-item"><label>Student</label><strong>{result.student.admissionNumber} · {result.student.name}</strong></div><div className="detail-item"><label>Enrollment</label><strong>{result.enrollment?.className || result.enrollment?.classId || 'Created'}</strong></div><div className="detail-item"><label>Effective date</label><strong>{result.event?.effectiveDate?.slice(0, 10) || effectiveDate}</strong></div></div><p className="muted">{result.closedServiceCount ?? 0} previous service assignment(s) closed.</p><div className="form-actions"><button className="button secondary" onClick={clear}>Choose another student</button></div></section>}
  </AppShell>;
}
