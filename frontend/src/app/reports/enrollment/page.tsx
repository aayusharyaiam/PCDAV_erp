'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell, EmptyState, PageHeader, StatCard, StatusBadge } from '@/components/AppShell';
import { api, AcademicSession, ClassOffering } from '@/lib/api';
import { messageOf } from '@/lib/payments';

type EnrollmentRow = { id: string; studentId: string; sessionId: string; classId: string; status: string; entryType: string; feeCategory: string; startDate: string; endDate?: string | null; className: string; student: { id: string; admissionNumber: string; name: string; status: string } | null; session: { id: string; name: string } | null };
type EnrollmentReport = { denominator: string; total: number; ewsCount: number; byStatus: { status: string; count: number }[]; byEntryType: { entryType: string; count: number }[]; byCategory: { feeCategory: string; count: number }[]; byClass: { classId: string; className: string; count: number }[]; items: EnrollmentRow[]; page: number; limit: number };
type AdmissionRow = { id: string; sessionId: string; studentName: string; appliedGrade: string; source: string; status: string; ews: boolean; studentId?: string | null; createdAt: string; updatedAt: string };
type AdmissionReport = { denominator: string; total: number; byStatus: { status: string; count: number }[]; byGrade: { grade: string; count: number }[]; bySource: { source: string; count: number }[]; items: AdmissionRow[]; page: number; limit: number };

export default function EnrollmentReportsPage() {
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [classes, setClasses] = useState<ClassOffering[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [enrollmentStatus, setEnrollmentStatus] = useState('ACTIVE');
  const [entryType, setEntryType] = useState('');
  const [applicationStatus, setApplicationStatus] = useState('');
  const [enrollmentReport, setEnrollmentReport] = useState<EnrollmentReport | null>(null);
  const [admissionReport, setAdmissionReport] = useState<AdmissionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<AcademicSession[]>('/school/sessions').then(items => {
      setSessions(items);
      setSessionId(items.find(item => item.current)?.id ?? items[0]?.id ?? '');
    }).catch(cause => setError(messageOf(cause)));
  }, []);

  useEffect(() => {
    if (!sessionId) { setClasses([]); return; }
    api<{ items: ClassOffering[] }>(`/school/classes?sessionId=${encodeURIComponent(sessionId)}&limit=100`).then(response => setClasses(response.items)).catch(cause => setError(messageOf(cause)));
  }, [sessionId]);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      const enrollmentParams = new URLSearchParams({ sessionId, limit: '100', page: '1' });
      if (enrollmentStatus) enrollmentParams.set('status', enrollmentStatus);
      if (classId) enrollmentParams.set('classId', classId);
      if (entryType) enrollmentParams.set('entryType', entryType);
      const admissionParams = new URLSearchParams({ sessionId, limit: '100', page: '1' });
      const [enrollments, admissions] = await Promise.all([
        api<EnrollmentReport>(`/reports/enrollments?${enrollmentParams}`),
        api<AdmissionReport>(`/reports/admissions?${admissionParams}`),
      ]);
      setEnrollmentReport(enrollments);
      setAdmissionReport(admissions);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setLoading(false);
    }
  }, [sessionId, classId, enrollmentStatus, entryType]);

  useEffect(() => { void load(); }, [load]);

  const session = sessions.find(item => item.id === sessionId);
  const applications = admissionReport?.items.filter(item => !applicationStatus || item.status === applicationStatus) ?? [];
  const activeClasses = enrollmentReport?.byClass ?? [];

  return <AppShell>
    <PageHeader eyebrow="Reports" title="Enrollment and admission reports" description="Use server totals to review the student roll and admission pipeline by session, class, enrollment type, and stage." action={<button className="button secondary" onClick={() => window.print()}>Print report</button>} />
    {error && <div className="notice error workspace-error" role="alert"><span>{error}</span><button className="button secondary small" onClick={() => void load()}>Retry</button></div>}
    <section className="panel">
      <div className="workspace-filters enrollment-filters">
        <div className="form-field"><label htmlFor="enrollment-session">Academic session</label><select className="select" id="enrollment-session" value={sessionId} onChange={event => setSessionId(event.target.value)}><option value="">Select session</option>{sessions.map(item => <option key={item.id} value={item.id}>{item.name}{item.current ? ' · Current' : ''}</option>)}</select></div>
        <div className="form-field"><label htmlFor="enrollment-class">Class / section</label><select className="select" id="enrollment-class" value={classId} onChange={event => setClassId(event.target.value)}><option value="">All classes</option>{classes.map(item => <option key={item.id} value={item.id}>{item.grade} {item.section}{item.stream ? ` · ${item.stream}` : ''}</option>)}</select></div>
        <div className="form-field"><label htmlFor="enrollment-status">Enrollment status</label><select className="select" id="enrollment-status" value={enrollmentStatus} onChange={event => setEnrollmentStatus(event.target.value)}><option value="ACTIVE">Active enrollment</option><option value="TRANSFERRED">Transferred</option><option value="WITHDRAWN">Withdrawn</option><option value="STRUCK_OFF">Struck off</option><option value="">All statuses</option></select></div>
        <div className="form-field"><label htmlFor="entry-type">Entry type</label><select className="select" id="entry-type" value={entryType} onChange={event => setEntryType(event.target.value)}><option value="">All entry types</option><option value="NEW_ADMISSION">New admission</option><option value="TRANSFER">Transfer</option><option value="READMISSION">Readmission</option><option value="PROMOTED">Promoted</option></select></div>
        <div className="form-field"><label htmlFor="application-status">Admission stage</label><select className="select" id="application-status" value={applicationStatus} onChange={event => setApplicationStatus(event.target.value)}><option value="">All stages</option>{['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'WAITLISTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ENROLLED'].map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></div>
        <button className="button secondary" onClick={() => void load()} disabled={loading}>Refresh report</button>
      </div>
    </section>
    {loading ? <div className="panel section-panel loading-state"><div className="spinner" /> Loading enrollment and admission reports…</div> : session && enrollmentReport && admissionReport ? <>
      <div className="stats-grid section-panel"><StatCard label="Enrollments" value={enrollmentReport.total} detail={`${enrollmentStatus || 'All statuses'} · ${session.name}`} tone="blue" /><StatCard label="Applications" value={applications.length} detail={`${applicationStatus || 'All stages'}`} tone="amber" /><StatCard label="EWS enrollments" value={enrollmentReport.ewsCount} detail="Server-counted in the filtered roll" tone="green" /><StatCard label="Class groups" value={activeClasses.length} detail="Classes with matching enrollments" tone="purple" /></div>
      <div className="split-grid section-panel">
        <section className="panel"><div className="panel-header"><div><h2>Enrollment roll</h2><span>Server report: {enrollmentReport.denominator}. Admission number is the primary identifier.</span></div></div>{enrollmentReport.items.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Admission no.</th><th>Student</th><th>Class</th><th>Entry</th><th>Start</th><th>Status</th></tr></thead><tbody>{enrollmentReport.items.map(row => <tr key={row.id}><td>{row.student ? <a className="text-link" href={`/students/${row.student.id}`}>{row.student.admissionNumber}</a> : row.studentId}</td><td><strong>{row.student?.name || 'Student unavailable'}</strong><small>{row.feeCategory}</small></td><td>{row.className || row.classId}</td><td>{row.entryType.replaceAll('_', ' ')}</td><td>{row.startDate.slice(0, 10)}</td><td><StatusBadge status={row.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="No enrollments in this view" detail="Change the session, class, status, or entry type filters." />}</section>
        <section className="panel"><div className="panel-header"><div><h2>Admission pipeline</h2><span>Applications are filtered to the same session; stage filtering is applied here.</span></div></div>{applications.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Applicant</th><th>Applied class</th><th>Source</th><th>Stage</th></tr></thead><tbody>{applications.map(application => <tr key={application.id}><td><strong>{application.studentName}</strong><small>{application.ews ? 'EWS' : 'Standard category'}</small></td><td>{application.appliedGrade}</td><td>{application.source}</td><td><StatusBadge status={application.status} /></td></tr>)}</tbody></table></div> : <EmptyState title="No applications in this view" detail="Change the admission stage or session filter." />}</section>
      </div>
    </> : <section className="panel section-panel"><EmptyState title="Choose a session" detail="Select an academic session to load enrollment and admission counts." /></section>}
  </AppShell>;
}
