'use client';

import { ReactNode } from 'react';
import { AcademicSession, ClassOffering } from '@/lib/api';
import { classLabel, useClassroomScope } from '@/lib/academics';
import { EmptyState } from './AppShell';

export function ClassroomPicker({ scope, disabled = false, children }: { scope: ReturnType<typeof useClassroomScope>; disabled?: boolean; children?: ReactNode }) {
  return <section className="panel workspace-filters" aria-label="Classroom filters">
    <SessionSelect id="classroom-session" label="Academic session" sessions={scope.sessions} value={scope.sessionId} onChange={scope.setSessionId} disabled={disabled || scope.loading} />
    <ClassSelect id="classroom-class" label="Classroom" classes={scope.classes} value={scope.classId} onChange={scope.setClassId} disabled={disabled || scope.loading} />
    {children}
  </section>;
}

export function SessionSelect({ id, label, sessions, value, onChange, disabled = false }: { id: string; label: string; sessions: AcademicSession[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="form-field"><label htmlFor={id}>{label}</label><select id={id} className="select" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required><option value="">Select a session</option>{sessions.map(item => <option value={item.id} key={item.id}>{item.name}{item.current ? ' · Current' : ''}</option>)}</select></div>;
}

export function ClassSelect({ id, label, classes, value, onChange, disabled = false }: { id: string; label: string; classes: ClassOffering[]; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <div className="form-field"><label htmlFor={id}>{label}</label><select id={id} className="select" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} required><option value="">Select a classroom</option>{classes.map(item => <option value={item.id} key={item.id}>{classLabel(item)}</option>)}</select></div>;
}

export function LoadingState({ label = 'Loading classroom…' }: { label?: string }) {
  return <div className="loading-state" role="status" aria-live="polite"><div className="spinner" aria-hidden="true" /><span>{label}</span></div>;
}

export function ErrorState({ error, retry }: { error: string; retry?: () => void }) {
  return <div className="notice error workspace-error" role="alert"><span>{error}</span>{retry && <button className="button secondary small" onClick={retry} type="button">Try again</button>}</div>;
}

export function NoClassroom({ teacher }: { teacher: boolean }) {
  return <EmptyState title={teacher ? 'No assigned classroom' : 'No classroom selected'} detail={teacher ? 'Ask an Admin to assign your classroom for this academic session, or choose another session.' : 'Choose an academic session and classroom. Classrooms can be added in Academic setup.'} />;
}

export function PendingCommand({ pending, busy, onRetry, label }: { pending: { path: string } | null; busy: boolean; onRetry: () => void; label: string }) {
  if (!pending) return null;
  return <div className="notice pending-command" role="status"><div><strong>Unconfirmed {label}</strong><p>The response was interrupted. Retry the saved request to retrieve its server outcome.</p></div><button className="button" type="button" disabled={busy} onClick={onRetry}>{busy ? 'Retrying…' : `Retry ${label}`}</button></div>;
}
