const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type ApiError = Error & { status?: number; requestId?: string };

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = typeof window === 'undefined' ? '' : window.localStorage.getItem('pcdav_csrf') ?? '';
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (csrf && !['GET', 'HEAD', 'OPTIONS'].includes(options.method?.toUpperCase() ?? 'GET')) headers.set('X-CSRF-Token', csrf);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(Array.isArray(body.message) ? body.message.join(', ') : body.message ?? 'Request failed') as ApiError;
    error.status = response.status; error.requestId = body.requestId; throw error;
  }
  return body as T;
}

export async function login(email: string, password: string) {
  const result = await api<{ user: User; csrfToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  window.localStorage.setItem('pcdav_csrf', result.csrfToken);
  window.localStorage.setItem('pcdav_user', JSON.stringify(result.user));
  return result;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } finally { window.localStorage.removeItem('pcdav_csrf'); window.localStorage.removeItem('pcdav_user'); window.location.href = '/login'; }
}

export type Role = 'SUPERADMIN' | 'ADMIN' | 'ACCOUNTANT' | 'TEACHER';
export type User = { id: string; schoolId: string; name: string; email: string; role: Role; active: boolean; version: number; mustChangePassword: boolean; createdAt?: string };
export type School = { id: string; name: string; address: string; phone: string; email: string; timezone: string; admissionPrefix: string; nextAdmission: number; version: number };
export type AcademicSession = { id: string; name: string; startDate: string; endDate: string; current: boolean; admissionsOpen: boolean };
export type ClassOffering = { id: string; sessionId: string; grade: string; section: string; stream: string; capacity: number; activeEnrollmentCount: number; version: number; teacherId?: string };
export type Application = { id: string; sessionId: string; studentName: string; dateOfBirth: string; gender: string; guardianName: string; guardianPhone: string; appliedGrade: string; source: string; status: string; ews: boolean; version: number; createdAt: string; updatedAt: string };
export type Student = { id: string; admissionNumber: string; name: string; dateOfBirth: string; gender: string; guardianName?: string; guardianPhone?: string; currentClassId?: string; status: string; version: number; admissionDate: string; address?: string; permanentAddress?: string; previousSchool?: string };
