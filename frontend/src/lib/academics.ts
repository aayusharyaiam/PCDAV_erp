import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, AcademicSession, AttendanceCorrectionRequest, AttendanceDay, AttendanceRecord, AttendanceStatus, ClassOffering, PromotionBatch, PromotionBatchDetail, PromotionBatchItem, PromotionChoice, PromotionDecision, PromotionValidation, Role, Student, TeacherAssignment } from './api';
import { ListResponse, messageOf } from './payments';

// Existing contracts: /school/sessions, /school/classes, /school/teacher-assignments,
// /students. Lifecycle writes follow trd.md §9. GET shapes and /promotion-decisions
// are inferred pending backend implementation; keep that integration boundary here.
export type ClassroomQuery = { sessionId: string; classId: string };
export type AttendanceCommand = ClassroomQuery & { attendanceDate: string; marks: { studentId: string; status: AttendanceStatus }[] };
export type AttendanceCorrectionCommand = { requestedStatus: AttendanceStatus; reason: string };
export type ReviewAttendanceCommand = { reason: string };
export type PromotionDecisionCommand = { sourceSessionId: string; classId: string; decisions: { enrollmentId: string; decision: PromotionChoice; reason: string }[] };
export type CreatePromotionBatchCommand = { sourceSessionId: string; targetSessionId: string; items: { sourceEnrollmentId: string; targetClassId: string }[] };
export type ExecutePromotionBatchCommand = { reason: string };
export const academicPaths = {
  attendance: '/attendance',
  correction: (id: string) => `/attendance/${encodeURIComponent(id)}/correction-requests`,
  reviewCorrection: (id: string, decision: 'approve' | 'reject') => `/attendance/correction-requests/${encodeURIComponent(id)}/${decision}`,
  decisions: '/promotion-decisions',
  batches: '/promotion-batches',
  validateBatch: (id: string) => `/promotion-batches/${encodeURIComponent(id)}/validate`,
  executeBatch: (id: string) => `/promotion-batches/${encodeURIComponent(id)}/execute`,
};

export const attendanceStatuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
export const statusLabel = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
export const classLabel = (item?: ClassOffering) => item ? `${item.grade} ${item.section}${item.stream ? ` · ${item.stream}` : ''}` : 'Classroom';
export const isAcademicAdmin = (role: Role) => role === 'ADMIN' || role === 'SUPERADMIN';
export const queryString = (query: Record<string, string | number | undefined>) => new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== '').map(([key, value]) => [key, String(value)])).toString();

type Collection<T> = T[] | ListResponse<T>;
async function academicRequest<T>(path: string): Promise<T> {
  try { return await api<T>(path); }
  catch (error) {
    if ((error as ApiError)?.status === 404 && /^\/(attendance|promotion-)/.test(path)) {
      throw new Error('This attendance or promotion endpoint is not available on the connected API yet. Retry after the backend is deployed.');
    }
    throw error;
  }
}

// School endpoints return both plain arrays (sessions/assignments) and paged lists.
async function collection<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const result = await academicRequest<Collection<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=100`);
    if (Array.isArray(result)) return result;
    if (!Array.isArray(result.items)) throw new Error('The API returned an unexpected list response.');
    items.push(...result.items);
    if (!result.items.length || items.length >= result.total) return items;
  }
}

export const academicApi = {
  sessions: () => academicRequest<AcademicSession[]>('/school/sessions'),
  classes: (sessionId: string) => collection<ClassOffering>(`/school/classes?${queryString({ sessionId })}`),
  assignments: (sessionId: string) => collection<TeacherAssignment>(`/school/teacher-assignments?${queryString({ sessionId })}`),
  students: (scope: ClassroomQuery) => collection<Student>(`/students?${queryString({ ...scope, sessionId: scope.sessionId, status: 'ACTIVE' })}`),
  async studentsForPromotion(scope: ClassroomQuery): Promise<Student[]> {
    const students = await academicApi.students(scope);
    const detailed = await Promise.all(students.map(async student => {
      const detail = await academicRequest<{ enrollments?: { id: string; sessionId: string; classId: string; status: string }[] }>(`/students/${encodeURIComponent(student.id)}`);
      const enrollment = detail.enrollments?.find(item => item.sessionId === scope.sessionId && item.classId === scope.classId && item.status === 'ACTIVE');
      return { ...student, enrollmentId: enrollment?.id };
    }));
    return detailed;
  },
  async attendance(scope: ClassroomQuery & { date: string }): Promise<AttendanceDay> {
    const response = await academicRequest<{ id: string; sessionId: string; classId: string; attendanceDate: string; submittedAt?: string; markedBy?: string; status?: string; marks: AttendanceRecord[] }[]>(`/attendance?${queryString({ sessionId: scope.sessionId, classId: scope.classId, attendanceDate: scope.date })}`);
    const submission = response.find(item => item.attendanceDate.slice(0, 10) === scope.date);
    return submission ? { date: submission.attendanceDate, sessionId: submission.sessionId, classId: submission.classId, status: 'SUBMITTED', records: submission.marks, submittedAt: submission.submittedAt, submittedBy: submission.markedBy } : { ...scope, status: 'DRAFT', records: [] };
  },
  async corrections(filters: { status: string; sessionId?: string; page: number }): Promise<ListResponse<AttendanceCorrectionRequest>> {
    const response = await academicRequest<AttendanceCorrectionRequest[] | ListResponse<AttendanceCorrectionRequest>>(`/attendance/correction-requests?${queryString({ status: filters.status || undefined })}`);
    if (!Array.isArray(response)) return response;
    const start = (filters.page - 1) * 25;
    return { items: response.slice(start, start + 25), total: response.length, page: filters.page, limit: 25 };
  },
  decisions: (scope: ClassroomQuery) => collection<PromotionDecision>(`/promotion-decisions?${queryString(scope)}`),
  batches: (page: number) => academicRequest<ListResponse<PromotionBatch>>(`/promotion-batches?page=${page}&limit=25`),
  async batch(id: string): Promise<PromotionBatchDetail> {
    return normalizeBatch(await academicRequest<PromotionBatchDetail | PromotionBatch>(`/promotion-batches/${encodeURIComponent(id)}`));
  },
};

export function normalizeBatch(value: PromotionBatchDetail | (PromotionBatch & { items?: PromotionBatchItem[]; validation?: PromotionValidation })): PromotionBatchDetail {
  if ('batch' in value) return value;
  return { batch: value, items: value.items ?? [], validation: value.validation };
}

// Clear data on a query change and ignore late responses from previous classrooms.
export function useAcademicResource<T>(key: string, load: () => Promise<T>) {
  const generation = useRef(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: string }>({ key, data: null, loading: true, error: '' });
  useEffect(() => {
    const current = ++generation.current;
    setState({ key, data: null, loading: true, error: '' });
    load().then(data => { if (generation.current === current) setState({ key, data, loading: false, error: '' }); })
      .catch(error => { if (generation.current === current) setState({ key, data: null, loading: false, error: messageOf(error) }); });
    return () => { generation.current++; };
  }, [key, load, attempt]);
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  return { ...(state.key === key ? state : { data: null, loading: true, error: '' }), reload };
}

export function useClassroomScope(role: Role, teacherId: string) {
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const sessions = useAcademicResource('sessions', academicApi.sessions);
  useEffect(() => {
    if (!sessionId && sessions.data?.length) setSessionId((sessions.data.find(item => item.current) ?? sessions.data[0]).id);
  }, [sessions.data, sessionId]);
  const load = useCallback(async () => {
    if (!sessionId) return [];
    const classes = await academicApi.classes(sessionId);
    if (role !== 'TEACHER') return classes;
    const assignments = await academicApi.assignments(sessionId);
    return classes.filter(item => assignments.some(assignment => assignment.teacherId === teacherId && assignment.classId === item.id && !assignment.endedAt));
  }, [sessionId, role, teacherId]);
  const classrooms = useAcademicResource(`classes:${sessionId}`, load);
  useEffect(() => {
    if (classrooms.data && !classrooms.data.some(item => item.id === classId)) setClassId(classrooms.data[0]?.id ?? '');
  }, [classrooms.data, classId]);
  return {
    sessionId, classId: classrooms.data?.some(item => item.id === classId) ? classId : '',
    sessions: sessions.data ?? [], classes: classrooms.data ?? [],
    loading: sessions.loading || classrooms.loading, error: sessions.error || classrooms.error,
    setSessionId: (value: string) => { setSessionId(value); setClassId(''); }, setClassId,
    reload: () => { sessions.reload(); classrooms.reload(); },
  };
}
