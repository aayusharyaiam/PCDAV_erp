'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatCard, StatusBadge, useStaffUser } from '@/components/AppShell';
import { ClassroomPicker, ErrorState, LoadingState, NoClassroom, PendingCommand } from '@/components/AcademicWorkspace';
import { AttendanceCorrectionRequest, AttendanceDay, AttendanceRecord, AttendanceStatus, Student } from '@/lib/api';
import { academicApi, academicPaths, AttendanceCommand, AttendanceCorrectionCommand, attendanceStatuses, classLabel, statusLabel, useAcademicResource, useClassroomScope } from '@/lib/academics';
import { useFrozenCommand } from '@/lib/finance';
import { businessToday } from '@/lib/payments';

export default function AttendancePage() { return <AppShell><AttendanceWorkspace /></AppShell>; }

function AttendanceWorkspace() {
  const user = useStaffUser();
  const teacher = user.role === 'TEACHER';
  const scope = useClassroomScope(user.role, user.id);
  const [date, setDate] = useState(businessToday);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const session = scope.sessions.find(item => item.id === scope.sessionId);
  const maxDate = session ? [session.endDate.slice(0, 10), businessToday()].sort()[0] : businessToday();
  const minDate = session?.startDate.slice(0, 10) ?? '';
  const validDate = !!date && date >= minDate && date <= maxDate;
  useEffect(() => {
    if (session && minDate <= maxDate) setDate(value => value < minDate ? minDate : value > maxDate ? maxDate : value);
  }, [session, minDate, maxDate]);
  const queryKey = `${scope.sessionId}:${scope.classId}:${date}`;
  const load = useCallback(async () => {
    if (!scope.classId || !validDate) return null;
    const query = { sessionId: scope.sessionId, classId: scope.classId, date };
    const [students, day] = await Promise.all([academicApi.students(query), academicApi.attendance(query)]);
    return { students, day };
  }, [scope.sessionId, scope.classId, date, validDate]);
  const register = useAcademicResource(queryKey, load);
  const command = useFrozenCommand<AttendanceCommand | AttendanceCorrectionCommand>(`pcdav_attendance:${user.schoolId}:${user.id}`, saved => (saved.path === academicPaths.attendance && 'marks' in saved.body && Array.isArray(saved.body.marks)) || (/^\/attendance\/[^/]+\/correction-requests$/.test(saved.path) && 'requestedStatus' in saved.body && attendanceStatuses.includes(saved.body.requestedStatus)));
  async function send(path?: string, body?: AttendanceCommand | AttendanceCorrectionCommand) {
    setError(''); setNotice('');
    const correcting = command.pending ? command.pending.path !== academicPaths.attendance : path !== academicPaths.attendance;
    const result = await command.send<AttendanceDay | AttendanceCorrectionRequest>(path, body);
    if (result) {
      setNotice(correcting ? `Correction request recorded · ${'status' in result ? statusLabel(result.status) : 'Requested'}. The attendance register reflects approved changes only.` : 'Attendance submitted. Reloading the saved register.');
      register.reload();
    }
  }
  const frozen = command.frozen || command.busy;
  return <>
    <PageHeader eyebrow="Classroom · Attendance" title="Daily attendance" description={teacher ? 'Mark your assigned classroom one day at a time. Submitted attendance is corrected through an Admin-reviewed request.' : 'Inspect classroom attendance by session and date. Teacher correction requests are reviewed separately.'} action={<Link className="button secondary" href="/attendance/corrections">{teacher ? 'My correction requests' : 'Review corrections'}</Link>} />
    {(error || command.error) && <ErrorState error={error || command.error} />}
    {notice && <div className="notice success" role="status">{notice}</div>}
    <PendingCommand pending={command.pending} busy={command.busy} onRetry={() => void send()} label="attendance request" />
    <ClassroomPicker scope={scope} disabled={frozen}>
      <div className="form-field"><label htmlFor="attendance-date">Attendance date</label><input id="attendance-date" className="input" type="date" value={date} min={minDate} max={maxDate} onChange={event => { setDate(event.target.value); setNotice(''); }} disabled={frozen} required /></div>
      <button className="button secondary" type="button" onClick={register.reload} disabled={register.loading || frozen || !scope.classId}>Refresh register</button>
    </ClassroomPicker>
    {scope.error ? <ErrorState error={scope.error} retry={scope.reload} /> : scope.loading ? <LoadingState label="Loading your classroom scope…" /> : !scope.classId ? <NoClassroom teacher={teacher} /> : !validDate ? <EmptyState title="Choose a date within this session" detail="Attendance can be recorded from the session start date through today, up to the session end date." /> : register.error ? <ErrorState error={register.error} retry={register.reload} /> : register.loading ? <LoadingState label="Loading attendance register…" /> : register.data && <AttendanceRegister key={queryKey} students={register.data.students} day={register.data.day} teacher={teacher} frozen={frozen} className={classLabel(scope.classes.find(item => item.id === scope.classId))} onError={setError} onSubmit={body => void send(academicPaths.attendance, body)} onCorrect={(id, body) => void send(academicPaths.correction(id), body)} />}
  </>;
}

type Mark = { status: AttendanceStatus | '' };
type RosterStudent = Pick<Student, 'id' | 'name' | 'admissionNumber'>;
function AttendanceRegister({ students, day, teacher, frozen, className, onSubmit, onCorrect, onError }: { students: Student[]; day: AttendanceDay; teacher: boolean; frozen: boolean; className: string; onSubmit: (body: AttendanceCommand) => void; onCorrect: (id: string, body: AttendanceCorrectionCommand) => void; onError: (error: string) => void }) {
  const submitted = day.status === 'SUBMITTED' || day.records.length > 0;
  const [marks, setMarks] = useState<Record<string, Mark>>(() => Object.fromEntries(students.map(student => { const record = day.records.find(item => item.studentId === student.id); return [student.id, { status: record?.status ?? '' }]; })));
  const [filter, setFilter] = useState('');
  const [correction, setCorrection] = useState<AttendanceRecord | null>(null);
  const [afterStatus, setAfterStatus] = useState<AttendanceStatus>('PRESENT');
  const [reason, setReason] = useState('');
  const roster: RosterStudent[] = [...students, ...day.records.filter(record => !students.some(student => student.id === record.studentId)).map(record => record.student ?? { id: record.studentId, name: 'Historical student', admissionNumber: record.studentId })];
  const visible = roster.filter(student => `${student.name} ${student.admissionNumber}`.toLowerCase().includes(filter.toLowerCase()));
  const valueOf = (id: string) => submitted ? day.records.find(item => item.studentId === id)?.status : marks[id]?.status;
  const marked = students.filter(student => marks[student.id]?.status).length;
  const present = roster.filter(student => ['PRESENT', 'LATE'].includes(valueOf(student.id) ?? '')).length;
  function update(id: string, patch: Partial<Mark>) { setMarks(current => ({ ...current, [id]: { ...current[id], ...patch } })); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (submitted || !teacher || frozen) return;
    if (marked !== students.length) { onError('Mark every student before submitting attendance. Use the search field to find any unmarked students.'); return; }
    onSubmit({ sessionId: day.sessionId, classId: day.classId, attendanceDate: day.date.slice(0, 10), marks: students.map(student => ({ studentId: student.id, status: marks[student.id].status as AttendanceStatus })) });
  }
  function requestCorrection(event: FormEvent) {
    event.preventDefault();
    if (!correction || frozen || !teacher) return;
    if (afterStatus === correction.status) { onError('Choose a different attendance status before requesting a correction.'); return; }
    if (reason.trim().length < 3) { onError('Enter a correction reason of at least 3 characters.'); return; }
    onCorrect(correction.id, { requestedStatus: afterStatus, reason: reason.trim() });
  }
  if (!roster.length) return <section className="panel section-panel"><EmptyState title="No students enrolled" detail="This classroom has no active students or saved attendance for the selected day." /></section>;
  return <>
    <div className="stats-grid classroom-stats section-panel">
      <StatCard label="Classroom" value={className} detail={`${roster.length} students · ${day.date.slice(0, 10)}`} />
      <StatCard label={submitted ? 'Present / late' : 'Marked'} value={submitted ? present : `${marked} / ${students.length}`} detail={submitted ? `${roster.filter(student => valueOf(student.id) === 'ABSENT').length} absent` : 'All students must be marked'} tone="green" />
      <StatCard label="Register status" value={submitted ? 'Submitted' : 'Not submitted'} detail={submitted ? `Saved${day.submittedAt ? ` · ${new Date(day.submittedAt).toLocaleString('en-IN')}` : ''}` : teacher ? 'Marks are a local draft until submitted' : 'Awaiting teacher submission'} tone="amber" />
    </div>
    <section className="panel section-panel" aria-label="Attendance register">
      <div className="panel-header"><div><h2>Classroom register</h2><p className="muted">{submitted ? 'Submitted marks are read-only.' : teacher ? 'Choose a status for each student.' : 'Only the assigned Teacher can submit attendance.'}</p></div><StatusBadge status={submitted ? 'SUBMITTED' : 'DRAFT'} /></div>
      <div className="search-row"><input className="input" aria-label="Search attendance register" placeholder="Admission number or student name" value={filter} onChange={event => setFilter(event.target.value)} />{teacher && !submitted && <button className="button secondary" type="button" disabled={frozen} onClick={() => setMarks(current => Object.fromEntries(Object.entries(current).map(([id, mark]) => [id, { ...mark, status: mark.status || 'PRESENT' }])))}>Mark unmarked present</button>}</div>
      <form onSubmit={submit}>
        <div className="data-table-wrap" tabIndex={0} role="region" aria-label="Student attendance table"><table className="data-table attendance-table"><thead><tr><th scope="col">Student</th><th scope="col">Attendance</th>{submitted && teacher && <th scope="col">Correction</th>}</tr></thead><tbody>{visible.map(student => {
          const record = day.records.find(item => item.studentId === student.id);
          return <tr key={student.id}><td><strong>{student.name}</strong><small className="muted">{student.admissionNumber}</small></td><td>{submitted || !teacher ? record ? <StatusBadge status={record.status} /> : <span className="muted">Not recorded</span> : <select className="select" aria-label={`Attendance for ${student.name}`} value={marks[student.id]?.status ?? ''} disabled={frozen} onChange={event => update(student.id, { status: event.target.value as AttendanceStatus | '' })}><option value="">Choose status</option>{attendanceStatuses.map(status => <option value={status} key={status}>{statusLabel(status)}</option>)}</select>}</td>{submitted && teacher && <td><button className="button secondary small" type="button" disabled={frozen || !record} onClick={() => { if (record) { setCorrection(record); setAfterStatus(record.status); setReason(''); } }}>Request correction<span className="sr-only"> for {student.name}</span></button></td>}</tr>;
        })}</tbody></table></div>
        {!visible.length && <EmptyState title="No matching students" detail="Clear the search to see the whole register." />}
        {!submitted && teacher && <div className="workspace-footer"><span className="muted">{students.length - marked} unmarked · {marked ? 'Unsaved marks' : 'Ready to mark'}</span><button className="button" disabled={frozen || !students.length}>Submit attendance</button></div>}
      </form>
    </section>
    {correction && <section className="panel section-panel" aria-labelledby="correction-heading"><h2 id="correction-heading">Request attendance correction</h2><p>{roster.find(student => student.id === correction.studentId)?.name} · {day.date.slice(0, 10)} · Current mark: <StatusBadge status={correction.status} /></p><form onSubmit={requestCorrection}><fieldset disabled={frozen} className="plain-fieldset"><div className="form-grid"><div className="form-field"><label htmlFor="correction-status">Proposed attendance</label><select id="correction-status" className="select" value={afterStatus} onChange={event => setAfterStatus(event.target.value as AttendanceStatus)}>{attendanceStatuses.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></div><div className="form-field full"><label htmlFor="correction-reason">Correction reason</label><textarea id="correction-reason" className="textarea" required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></div></div><div className="form-actions"><button className="button secondary" type="button" onClick={() => setCorrection(null)}>Cancel</button><button className="button">Send correction request</button></div></fieldset></form></section>}
  </>;
}
