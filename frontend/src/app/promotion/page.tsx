'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatCard, StatusBadge, useStaffUser } from '@/components/AppShell';
import { ClassSelect, ClassroomPicker, ErrorState, LoadingState, NoClassroom, SessionSelect } from '@/components/AcademicWorkspace';
import { AcademicSession, ClassOffering, PromotionBatch, PromotionBatchDetail, PromotionChoice, PromotionDecision } from '@/lib/api';
import { academicApi, academicPaths, classLabel, CreatePromotionBatchCommand, normalizeBatch, PromotionDecisionCommand, useAcademicResource, useClassroomScope } from '@/lib/academics';
import { useFrozenCommand } from '@/lib/finance';
import { api } from '@/lib/api';
import { messageOf } from '@/lib/payments';

export default function PromotionPage() {
  return <AppShell><PromotionWorkspace /></AppShell>;
}

function PromotionWorkspace() {
  const user = useStaffUser();
  const admin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';
  return <>
    <PageHeader eyebrow="Academic lifecycle" title="Promote / Retain" description={admin ? 'Review teacher decisions, prepare the next session, validate capacity and execute a resumable promotion batch.' : 'Submit the final Promote or Retain outcome for every student in your assigned classroom.'} />
    <TeacherDecisions />
    {admin && <AdminPromotion />}
  </>;
}

function TeacherDecisions() {
  const user = useStaffUser();
  const teacher = user.role === 'TEACHER';
  const scope = useClassroomScope(user.role, user.id);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [decisions, setDecisions] = useState<Record<string, { decision: PromotionChoice | ''; reason: string }>>({});
  const queryKey = `promotion:${scope.sessionId}:${scope.classId}`;
  const load = useCallback(async () => {
    if (!scope.sessionId || !scope.classId) return null;
    const [students, saved] = await Promise.all([
      academicApi.studentsForPromotion({ sessionId: scope.sessionId, classId: scope.classId }),
      academicApi.decisions({ sessionId: scope.sessionId, classId: scope.classId }),
    ]);
    return { students, saved };
  }, [scope.sessionId, scope.classId]);
  const register = useAcademicResource(queryKey, load);
  const command = useFrozenCommand<PromotionDecisionCommand>(`pcdav_promotion_decisions:${user.schoolId}:${user.id}`, saved => saved.path === academicPaths.decisions && saved.body.sourceSessionId === scope.sessionId && saved.body.classId === scope.classId && Array.isArray(saved.body.decisions));

  useEffect(() => {
    if (!register.data) return;
    setDecisions(current => Object.fromEntries(register.data!.students.map(student => {
      const saved = register.data!.saved.find(item => item.studentId === student.id);
      return [student.id, current[student.id] ?? { decision: saved?.decision ?? '', reason: saved?.reason ?? '' }];
    })));
  }, [register.data]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setNotice(''); setError('');
    if (!register.data || !scope.sessionId || !scope.classId) return;
    const missing = register.data.students.filter(student => !decisions[student.id]?.decision);
    if (missing.length) { setError(`Choose Promote or Retain for ${missing.length} student${missing.length === 1 ? '' : 's'} before submitting final decisions.`); return; }
    const retained = register.data.students.find(student => decisions[student.id].decision === 'RETAIN' && decisions[student.id].reason.trim().length < 3);
    if (retained) { setError(`Add a reason for retaining ${retained.name}.`); return; }
    const body: PromotionDecisionCommand = {
      sourceSessionId: scope.sessionId,
      classId: scope.classId,
      decisions: register.data.students.map(student => ({ enrollmentId: student.enrollmentId ?? '', decision: decisions[student.id].decision as PromotionChoice, reason: decisions[student.id].reason.trim() })),
    };
    if (body.decisions.some(item => !item.enrollmentId)) { setError('One or more active enrollments could not be resolved. Refresh the classroom before submitting.'); return; }
    const result = await command.send<PromotionDecision[] | { items: PromotionDecision[] }>(academicPaths.decisions, body);
    if (result) { setNotice('Final classroom decisions submitted. Admins can now include them in a validated promotion batch.'); register.reload(); }
    else if (command.error) setError(command.error);
  }

  const roster = register.data?.students.filter(student => `${student.name} ${student.admissionNumber}`.toLowerCase().includes(filter.toLowerCase())) ?? [];
  const completed = register.data?.students.filter(student => !!decisions[student.id]?.decision).length ?? 0;
  const finalized = !!register.data?.students.length && register.data.saved.length === register.data.students.length;
  return <section className="panel promotion-decisions" aria-labelledby="teacher-decisions-heading">
    <div className="panel-header"><div><h2 id="teacher-decisions-heading">{teacher ? 'Your classroom decisions' : 'Teacher decision register'}</h2><span>{teacher ? 'Final outcomes are recorded against the source session.' : 'Admin view of the selected classroom; teacher ownership is preserved.'}</span></div><StatusBadge status={completed && register.data?.students.length === completed ? 'READY' : 'DRAFT'} /></div>
    {notice && <div className="notice success" role="status">{notice}</div>}
    {(error || register.error || command.error) && <ErrorState error={error || register.error || command.error} retry={register.reload} />}
    <ClassroomPicker scope={scope} disabled={command.frozen} />
    {scope.loading ? <LoadingState label="Loading classroom scope…" /> : scope.error ? <ErrorState error={scope.error} retry={scope.reload} /> : !scope.classId ? <NoClassroom teacher={teacher} /> : register.loading ? <LoadingState label="Loading Promote / Retain decisions…" /> : register.data && !register.data.students.length ? <EmptyState title="No active students" detail="There are no active students in this classroom for the selected session." /> : register.data && <form onSubmit={submit}>
      <div className="promotion-toolbar"><input className="input" aria-label="Search promotion students" placeholder="Admission number or student name" value={filter} onChange={event => setFilter(event.target.value)} /><span className="muted">{completed} / {register.data.students.length} decisions complete</span></div>
      {finalized && <div className="notice success">Final decisions are already recorded by the Teacher. The Admin can include them in a promotion batch.</div>}
      <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Promotion decision register"><table className="data-table promotion-table"><thead><tr><th>Student</th><th>Decision</th><th>Reason / context</th></tr></thead><tbody>{roster.map(student => <tr key={student.id}><td><strong>{student.name}</strong><small className="muted">{student.admissionNumber}</small></td><td><div className="decision-toggle" role="group" aria-label={`Decision for ${student.name}`}><label className={decisions[student.id]?.decision === 'PROMOTE' ? 'selected' : ''}><input type="radio" name={`decision-${student.id}`} value="PROMOTE" checked={decisions[student.id]?.decision === 'PROMOTE'} disabled={!teacher || command.frozen || finalized} onChange={() => setDecisions(current => ({ ...current, [student.id]: { ...current[student.id], decision: 'PROMOTE' } }))} /> Promote</label><label className={decisions[student.id]?.decision === 'RETAIN' ? 'selected retain' : ''}><input type="radio" name={`decision-${student.id}`} value="RETAIN" checked={decisions[student.id]?.decision === 'RETAIN'} disabled={!teacher || command.frozen || finalized} onChange={() => setDecisions(current => ({ ...current, [student.id]: { ...current[student.id], decision: 'RETAIN' } }))} /> Retain</label></div></td><td>{teacher ? <input className="input" aria-label={`Reason for ${student.name}`} placeholder={decisions[student.id]?.decision === 'RETAIN' ? 'Reason required for retain' : 'Optional note'} maxLength={500} value={decisions[student.id]?.reason ?? ''} disabled={command.frozen || finalized} onChange={event => setDecisions(current => ({ ...current, [student.id]: { ...current[student.id], reason: event.target.value } }))} /> : <span>{decisions[student.id]?.reason || '—'}</span>}</td></tr>)}</tbody></table></div>
      {teacher && !finalized && <div className="workspace-footer"><span className="muted">Submitting creates one final decision per active enrollment.</span><button className="button" disabled={command.frozen || !register.data.students.length}>{command.pending ? 'Retry decisions' : 'Submit final decisions'}</button></div>}
    </form>}
  </section>;
}

function AdminPromotion() {
  const user = useStaffUser();
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sourceSessionId, setSourceSessionId] = useState('');
  const [targetSessionId, setTargetSessionId] = useState('');
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [retainedClassId, setRetainedClassId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<PromotionBatchDetail | null>(null);
  const [sourceClasses, setSourceClasses] = useState<ClassOffering[]>([]);
  const [targetClasses, setTargetClasses] = useState<ClassOffering[]>([]);
  const [decisionRows, setDecisionRows] = useState<PromotionDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const create = useFrozenCommand<CreatePromotionBatchCommand>(`pcdav_promotion_batch:${user.schoolId}:${user.id}`, saved => saved.path === academicPaths.batches && !!saved.body.sourceSessionId && !!saved.body.targetSessionId && Array.isArray(saved.body.items) && saved.body.items.length > 0);
  const execute = useFrozenCommand<{ version: number; reason: string }>(`pcdav_promotion_execute:${user.schoolId}:${user.id}`, saved => /^\/promotion-batches\/[^/]+\/execute$/.test(saved.path) && saved.body.version > 0 && !!saved.body.reason);

  useEffect(() => { api<AcademicSession[]>('/school/sessions').then(items => { setSessions(items); const current = items.find(item => item.current) ?? items[0]; if (current) setSourceSessionId(current.id); }).catch(error => setError(messageOf(error))); }, []);
  useEffect(() => { if (!sourceSessionId) return; academicApi.classes(sourceSessionId).then(setSourceClasses).catch(error => setError(messageOf(error))); }, [sourceSessionId]);
  useEffect(() => { if (!targetSessionId) { setTargetClasses([]); return; } academicApi.classes(targetSessionId).then(setTargetClasses).catch(error => setError(messageOf(error))); }, [targetSessionId]);
  useEffect(() => { if (!sourceSessionId || !sourceClassId) { setDecisionRows([]); return; } academicApi.decisions({ sessionId: sourceSessionId, classId: sourceClassId }).then(setDecisionRows).catch(error => setError(messageOf(error))); }, [sourceSessionId, sourceClassId]);
  const loadBatches = useCallback(() => { setLoading(false); }, []);
  const targetOptions = targetClasses.filter(item => item.id !== sourceClassId);
  const selectedSource = sourceClasses.find(item => item.id === sourceClassId);
  const selectedTarget = targetClasses.find(item => item.id === targetClassId);

  async function createBatch(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (!sourceSessionId || !targetSessionId || !sourceClassId || !targetClassId || !retainedClassId) { setError('Choose source/target sessions and target classrooms for promoted and retained students.'); return; }
    if (!decisionRows.length || decisionRows.some(item => !(item.sourceEnrollmentId ?? item.enrollmentId))) { setError('Every active student needs a final teacher decision with a resolvable enrollment.'); return; }
    const body: CreatePromotionBatchCommand = { sourceSessionId, targetSessionId, items: decisionRows.map(item => ({ sourceEnrollmentId: (item.sourceEnrollmentId ?? item.enrollmentId) as string, targetClassId: item.decision === 'PROMOTE' ? targetClassId : retainedClassId })) };
    const result = await create.send<PromotionBatchDetail | PromotionBatch>(academicPaths.batches, body);
    if (result) { setSelected(normalizeBatch(result)); setNotice('Promotion batch prepared. Validate it before execution.'); }
    else if (create.error) setError(create.error);
  }

  async function validateBatch() {
    if (!selected) return; setError(''); setNotice('');
    try {
      const result = await api<PromotionBatchDetail | PromotionBatch>(academicPaths.validateBatch(selected.batch.id), { method: 'POST', body: JSON.stringify({ version: selected.batch.version, reason: 'Admin validation before promotion execution' }) });
      setSelected(normalizeBatch(result)); setNotice('Batch validation completed. Review every error before execution.');
    } catch (error) { setError(messageOf(error)); }
  }

  async function executeBatch() {
    if (!selected) return; setError(''); setNotice('');
    const result = await execute.send<PromotionBatchDetail | PromotionBatch>(academicPaths.executeBatch(selected.batch.id), { version: selected.batch.version, reason: reason.trim() || 'Promotion batch executed after validation' });
    if (result) { setSelected(normalizeBatch(result)); setNotice('Promotion execution completed from the server response.'); }
    else if (execute.error) setError(execute.error);
  }

  return <section className="panel section-panel" aria-labelledby="promotion-execution-heading"><div className="panel-header"><div><h2 id="promotion-execution-heading">Admin promotion execution</h2><span>Prepare a target session, validate capacity and execute only after review.</span></div><button className="button secondary" type="button" onClick={loadBatches} disabled={loading || create.frozen || execute.frozen}>Refresh batches</button></div>
    {(error || create.error || execute.error) && <ErrorState error={error || create.error || execute.error} retry={loadBatches} />}{notice && <div className="notice success" role="status">{notice}</div>}
    <form className="promotion-preparation" onSubmit={createBatch}><div className="form-grid"><SessionSelect id="promotion-source-session" label="Source session" sessions={sessions} value={sourceSessionId} onChange={value => { setSourceSessionId(value); setSourceClassId(''); }} disabled={create.frozen} /><SessionSelect id="promotion-target-session" label="Target session" sessions={sessions.filter(item => item.id !== sourceSessionId)} value={targetSessionId} onChange={value => { setTargetSessionId(value); setTargetClassId(''); setRetainedClassId(''); }} disabled={create.frozen} /><ClassSelect id="promotion-source-class" label="Source classroom" classes={sourceClasses} value={sourceClassId} onChange={value => { setSourceClassId(value); setTargetClassId(''); setRetainedClassId(''); }} disabled={create.frozen || !sourceSessionId} /><ClassSelect id="promotion-target-class" label="Promoted target classroom" classes={targetOptions} value={targetClassId} onChange={setTargetClassId} disabled={create.frozen || !targetSessionId} /><ClassSelect id="promotion-retained-class" label="Retained student classroom" classes={targetClasses} value={retainedClassId} onChange={setRetainedClassId} disabled={create.frozen || !targetSessionId} /><div className="form-field full"><label htmlFor="promotion-reason">Batch reason / execution reason</label><textarea id="promotion-reason" className="textarea" minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Example: annual promotion after teacher decisions" required disabled={create.frozen} /></div></div><div className="mapping-preview"><strong>{selectedSource ? `${classLabel(selectedSource)} → ${selectedTarget ? classLabel(selectedTarget) : 'choose a promoted target'}` : 'Choose a source classroom'}</strong><span>{decisionRows.length} teacher decisions loaded · retained students use the selected retained classroom.</span></div><div className="form-actions"><button className="button" disabled={create.frozen || !create.ready}>{create.pending ? 'Retry batch preparation' : 'Prepare promotion batch'}</button></div></form>
    <div className="batch-list"><div className="section-heading"><h3>Current batch</h3><span>Batch history is opened by ID from the API.</span></div>{selected ? <BatchDetail detail={selected} validating={false} executing={execute.busy} onValidate={() => void validateBatch()} onExecute={() => void executeBatch()} disabled={execute.frozen} /> : <EmptyState title="No batch selected" detail="Prepare a batch from final teacher decisions to review validation and execute new-session enrollments." />}</div>
  </section>;
}

function BatchDetail({ detail, validating, executing, onValidate, onExecute, disabled }: { detail: PromotionBatchDetail; validating: boolean; executing: boolean; onValidate: () => void; onExecute: () => void; disabled: boolean }) {
  const { batch, items, validation } = detail;
  const errors = validation?.errors.flatMap(item => item.errors) ?? batch.validationErrors ?? [];
  const warnings = batch.validationWarnings ?? [];
  return <section className="batch-detail" aria-labelledby="batch-detail-heading"><div className="panel-header"><div><h3 id="batch-detail-heading">Batch {batch.id}</h3><span>Review target enrollments before execution. Existing enrollment history remains unchanged.</span></div><StatusBadge status={batch.status} /></div><div className="stats-grid compact-stats"><StatCard label="Decisions" value={batch.decisionCount ?? items.length} detail="Teacher outcomes" /><StatCard label="Promote" value={batch.promotedCount ?? items.filter(item => item.decision === 'PROMOTE').length} detail="Target enrollment" tone="green" /><StatCard label="Retain" value={batch.retainedCount ?? items.filter(item => item.decision === 'RETAIN').length} detail="Retained classroom" tone="amber" /><StatCard label="Validation" value={errors.length ? 'Blocked' : warnings.length ? 'Review' : 'Ready'} detail={`${errors.length} errors · ${warnings.length} warnings`} tone={errors.length ? 'purple' : 'blue'} /></div>{(errors.length > 0 || warnings.length > 0) && <div className="validation-list">{errors.map(error => <div className="notice error" key={error}>Blocked: {error}</div>)}{warnings.map(warning => <div className="notice" key={warning}>Review: {warning}</div>)}</div>}{items.length ? <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Promotion batch students"><table className="data-table"><thead><tr><th>Student</th><th>Decision</th><th>Target classroom</th><th>Validation</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.studentName ?? item.studentId}</strong><small>{item.admissionNumber ?? item.sourceEnrollmentId}</small></td><td><StatusBadge status={item.decision} /></td><td>{item.targetClassId ?? 'Not assigned'}</td><td>{item.error ? <span className="danger-text">{item.error}</span> : 'Ready'}</td></tr>)}</tbody></table></div> : <EmptyState title="Batch detail is pending" detail="The API did not return student-level rows. Validation will return authoritative errors." />}{batch.status === 'DRAFT' && <div className="form-actions"><button className="button secondary" type="button" disabled={validating} onClick={onValidate}>{validating ? 'Validating…' : 'Validate batch'}</button></div>}{batch.status === 'READY' && <div className="form-actions"><button className="button" type="button" disabled={disabled || executing || errors.length > 0} onClick={onExecute}>{executing ? 'Executing…' : 'Execute promotion batch'}</button></div>}</section>;
}
