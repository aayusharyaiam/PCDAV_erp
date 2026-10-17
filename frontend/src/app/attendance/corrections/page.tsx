'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatusBadge, useStaffUser } from '@/components/AppShell';
import { ErrorState, LoadingState } from '@/components/AcademicWorkspace';
import { AcademicSession, AttendanceCorrectionRequest } from '@/lib/api';
import { academicApi, academicPaths, statusLabel, useAcademicResource } from '@/lib/academics';
import { useFrozenCommand } from '@/lib/finance';
import { api } from '@/lib/api';

type ReviewCommand = { version: number; reason: string };

export default function AttendanceCorrectionsPage() {
  return <AppShell><CorrectionInbox /></AppShell>;
}

function CorrectionInbox() {
  const user = useStaffUser();
  const admin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';
  const [status, setStatus] = useState('REQUESTED');
  const [sessionId, setSessionId] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AttendanceCorrectionRequest | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const load = useCallback(() => academicApi.corrections({ status, sessionId: sessionId || undefined, page }), [status, sessionId, page]);
  const requests = useAcademicResource(`corrections:${status}:${sessionId}:${page}`, load);
  const review = useFrozenCommand<ReviewCommand>(`pcdav_attendance_review:${user.schoolId}:${user.id}`, saved => /^\/attendance\/correction-requests\/[^/]+\/(approve|reject)$/.test(saved.path) && saved.body.version > 0 && !!saved.body.reason);

  useEffect(() => { api<AcademicSession[]>('/school/sessions').then(setSessions).catch(() => undefined); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setNotice(''); setError('');
    const result = await review.send<AttendanceCorrectionRequest>(academicPaths.reviewCorrection(selected.id, decision), { version: selected.version, reason: reason.trim() });
    if (result) {
      setSelected(result);
      setNotice(`Server decision: ${statusLabel(result.status)}${result.decisionReason ? ` · ${result.decisionReason}` : ''}`);
      requests.reload();
    } else if (review.error) setError(review.error);
  }

  const pending = review.pending;
  return <>
    <PageHeader eyebrow="Attendance · Admin review" title="Correction review" description={admin ? 'Approve or reject submitted attendance corrections. The original attendance event stays in the audit history.' : 'Track your submitted attendance correction requests and their server decisions.'} action={<button className="button secondary" type="button" onClick={requests.reload} disabled={requests.loading || review.frozen}>Refresh inbox</button>} />
    {(error || requests.error || review.error) && <ErrorState error={error || requests.error || review.error} retry={requests.reload} />}
    {notice && <div className="notice" role="status">{notice}</div>}
    {pending && <div className="notice pending-command" role="status"><div><strong>Unconfirmed review decision</strong><p>Retry the saved decision to learn whether the server applied it.</p></div><button className="button" type="button" disabled={review.busy} onClick={() => void review.send()}>{review.busy ? 'Retrying…' : 'Retry decision'}</button></div>}
    <section className="panel workspace-filters">
      <div className="form-field"><label htmlFor="correction-status-filter">Request status</label><select id="correction-status-filter" className="select" value={status} disabled={review.frozen} onChange={event => { setStatus(event.target.value); setPage(1); setSelected(null); }}><option value="">All statuses</option>{['REQUESTED', 'APPROVED', 'REJECTED'].map(value => <option value={value} key={value}>{statusLabel(value)}</option>)}</select></div>
      <div className="form-field"><label htmlFor="correction-session-filter">Academic session</label><select id="correction-session-filter" className="select" value={sessionId} disabled={review.frozen} onChange={event => { setSessionId(event.target.value); setPage(1); }}><option value="">All sessions</option>{sessions.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>
    </section>
    {requests.loading && <LoadingState label="Loading correction requests…" />}
    {!requests.loading && requests.data && <RequestTable data={requests.data} page={page} frozen={review.frozen} onSelect={item => { setSelected(item); setDecision('approve'); setReason(''); }} onPage={setPage} />}
    {(selected || pending) && <ReviewPanel selected={selected} pending={pending} admin={admin} decision={decision} reason={reason} busy={review.busy} frozen={review.frozen} onDecision={setDecision} onReason={setReason} onSubmit={submit} onClose={() => setSelected(null)} />}
  </>;
}

function RequestTable({ data, page, frozen, onSelect, onPage }: { data: { items: AttendanceCorrectionRequest[]; total: number; page: number; limit: number }; page: number; frozen: boolean; onSelect: (item: AttendanceCorrectionRequest) => void; onPage: (page: number) => void }) {
  return <section className="panel section-panel"><div className="panel-header"><div><h2>Attendance correction requests</h2><span>{data.total} matching requests · Page {data.page}</span></div></div>{data.items.length ? <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Attendance correction requests"><table className="data-table"><thead><tr><th>Attendance mark</th><th>Change requested</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><strong>{item.student?.name ?? item.attendanceMarkId ?? item.studentId ?? 'Attendance mark'}</strong><small>{item.student?.admissionNumber ?? item.attendanceMarkId ?? 'Mark ID'}</small><small>{item.date?.slice(0, 10) ?? 'Date on attendance register'}</small></td><td><span className="status-change"><StatusBadge status={item.beforeStatus} /> <span aria-hidden="true">→</span> <StatusBadge status={item.requestedStatus ?? item.afterStatus ?? item.beforeStatus} /></span><small>{item.beforeNote || 'Original mark retained in history'}</small></td><td>{item.reason}<small>{item.requestedByName ?? item.requestedBy} · {item.requestedAt ? new Date(item.requestedAt).toLocaleString('en-IN') : 'Submitted'}</small></td><td><StatusBadge status={item.status} /><small>{item.decisionReason || 'Awaiting review'}</small></td><td><button className="button secondary small" type="button" disabled={frozen} onClick={() => onSelect(item)}>Review<span className="sr-only"> {item.student?.name ?? item.attendanceMarkId ?? ''}</span></button></td></tr>)}</tbody></table></div> : <EmptyState title="No correction requests" detail="Teacher correction requests will appear here after attendance is submitted." />}<div className="form-actions"><button className="button secondary" type="button" disabled={frozen || page <= 1} onClick={() => onPage(page - 1)}>Previous</button><button className="button secondary" type="button" disabled={frozen || page * data.limit >= data.total} onClick={() => onPage(page + 1)}>Next</button></div></section>;
}

function ReviewPanel({ selected, pending, admin, decision, reason, busy, frozen, onDecision, onReason, onSubmit, onClose }: { selected: AttendanceCorrectionRequest | null; pending: { path: string } | null; admin: boolean; decision: 'approve' | 'reject'; reason: string; busy: boolean; frozen: boolean; onDecision: (value: 'approve' | 'reject') => void; onReason: (value: string) => void; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  if (!selected) return <section className="panel section-panel"><h2>Review request</h2><p className="muted">Unconfirmed decision: {pending?.path}. Retry it above to retrieve the server outcome.</p></section>;
  return <section className="panel section-panel" aria-labelledby="selected-correction-heading"><div className="panel-header"><div><h2 id="selected-correction-heading">Review request</h2><span>{selected.id}</span></div><StatusBadge status={selected.status} /></div><div className="correction-detail"><div className="detail-grid"><div className="detail-item"><label>Attendance mark</label><strong>{selected.student?.name ?? selected.attendanceMarkId ?? selected.studentId ?? 'Attendance mark'}</strong><small>{selected.student?.admissionNumber ?? selected.attendanceMarkId ?? 'Mark ID'}</small></div><div className="detail-item"><label>Attendance date</label><strong>{selected.date?.slice(0, 10) ?? 'See attendance register'}</strong><small>{selected.className ?? selected.classId ?? 'Assigned classroom'}</small></div><div className="detail-item"><label>Requested by</label><strong>{selected.requestedByName ?? selected.requestedBy}</strong><small>{selected.requestedAt ? new Date(selected.requestedAt).toLocaleString('en-IN') : 'Submitted'}</small></div></div><div className="before-after"><div><span>Original mark</span><strong>{statusLabel(selected.beforeStatus)}</strong><small>Original mark retained in history</small></div><div className="before-after-arrow" aria-hidden="true">→</div><div><span>Proposed mark</span><strong>{statusLabel(selected.requestedStatus ?? selected.afterStatus ?? selected.beforeStatus)}</strong><small>Applied only after approval</small></div></div><div className="notice">Reason: {selected.reason}</div>{selected.status === 'REQUESTED' && admin ? <form onSubmit={onSubmit}><fieldset disabled={busy || frozen}><div className="form-grid"><div className="form-field"><label htmlFor="correction-decision">Decision</label><select id="correction-decision" className="select" value={decision} onChange={event => onDecision(event.target.value as 'approve' | 'reject')}><option value="approve">Approve correction</option><option value="reject">Reject correction</option></select></div><div className="form-field"><label htmlFor="correction-decision-reason">Decision reason</label><textarea id="correction-decision-reason" className="textarea" value={reason} onChange={event => onReason(event.target.value)} required minLength={3} maxLength={500} /></div></div></fieldset><div className="form-actions"><button className="button secondary" type="button" onClick={onClose}>Close</button><button className="button" disabled={busy || !reason.trim()}>Submit decision</button></div></form> : <p className="muted">{selected.status === 'REQUESTED' ? 'An Admin must review this request. Your original mark remains unchanged until approval.' : `Decision: ${selected.decisionReason || 'No decision reason returned.'}`}</p>}</div></section>;
}
