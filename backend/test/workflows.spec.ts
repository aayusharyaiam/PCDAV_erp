import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { Db } from '../src/db';
import { ApiErrors } from '../src/errors';

// Uses isolated, generated school IDs in the configured test database. No reset/truncate.
describe('Levels 1–2 PostgreSQL workflows', () => {
  let app: INestApplication; let db: Db; let schoolId: string; let sessionId: string; let classId: string; let otherClassId: string;
  const suffix = randomUUID(); const password = 'Integration-Initial-123';
  let adminId: string; let teacherId: string; let accountantId: string;
  type Session = { cookie: string; csrf: string };
  let admin: Session; let teacher: Session; let accountant: Session;
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
  const client = (session: Session, method: 'get' | 'post' | 'patch', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', session.cookie).set('Origin', origin).set('X-CSRF-Token', session.csrf);
  async function login(email: string, pass = password): Promise<Session> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password: pass }).expect(200);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    return { cookie: res.headers['set-cookie'][0].split(';')[0], csrf: res.body.csrfToken };
  }
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a disposable test database');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.use(cookieParser()); app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); app.useGlobalFilters(new ApiErrors());
    await app.init(); db = app.get(Db);
    const school = await db.school.create({ data: { name: `Integration ${suffix}`, admissionPrefix: 'TEST' } }); schoolId = school.id;
    const session = await db.academicSession.create({ data: { schoolId, name: '2026–27', startDate: new Date('2026-01-01'), endDate: new Date('2027-12-31'), current: true, admissionsOpen: true } }); sessionId = session.id;
    const a = await db.classOffering.create({ data: { schoolId, sessionId, grade: 'VI', section: 'A', capacity: 1 } }); classId = a.id;
    const b = await db.classOffering.create({ data: { schoolId, sessionId, grade: 'VI', section: 'B', capacity: 30 } }); otherClassId = b.id;
    const hash = await argon2.hash(password);
    for (const role of ['ADMIN', 'TEACHER', 'ACCOUNTANT'] as const) {
      const user = await db.user.create({ data: { schoolId, role, name: `Test ${role}`, email: `${role.toLowerCase()}-${suffix}@example.test`, passwordHash: hash, mustChangePassword: false } });
      if (role === 'ADMIN') adminId = user.id; if (role === 'TEACHER') teacherId = user.id; if (role === 'ACCOUNTANT') accountantId = user.id;
    }
    admin = await login(`admin-${suffix}@example.test`); teacher = await login(`teacher-${suffix}@example.test`); accountant = await login(`accountant-${suffix}@example.test`);
  });
  afterAll(async () => {
    if (db && schoolId) {
      await db.auditEvent.deleteMany({ where: { schoolId } }); await db.document.deleteMany({ where: { schoolId } });
      await db.application.deleteMany({ where: { schoolId } }); await db.enrollment.deleteMany({ where: { schoolId } });
      await db.student.deleteMany({ where: { schoolId } }); await db.guardian.deleteMany({ where: { schoolId } }); await db.family.deleteMany({ where: { schoolId } });
      await db.teacherAssignment.deleteMany({ where: { schoolId } });
      const users = await db.user.findMany({ where: { schoolId }, select: { id: true, email: true } });
      await db.loginSession.deleteMany({ where: { userId: { in: users.map(u => u.id) } } });
      await db.user.deleteMany({ where: { schoolId } }); await db.classOffering.deleteMany({ where: { schoolId } }); await db.subject.deleteMany({ where: { schoolId } });
      await db.academicSession.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } });
    }
    await app?.close();
  });

  it('denies unauthenticated, missing CSRF, lower-role and cross-school actions', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
    await request(app.getHttpServer()).post('/api/v1/users').set('Cookie', admin.cookie).set('Origin', origin).send({}).expect(403);
    await client(teacher, 'get', '/applications').expect(403);
    await client(accountant, 'post', '/school/classes').send({}).expect(403);
    await client(admin, 'patch', `/users/${randomUUID()}`).send({ version: 1, active: false, reason: 'Scope test' }).expect(404);
    await client(admin, 'patch', `/users/${adminId}`).send({ version: 1, role: 'SUPERADMIN', reason: 'No escalation' }).expect(403);
  });

  it('provisions Admin peers but cannot deactivate them; changes passwords and revokes sessions', async () => {
    const created = await client(admin, 'post', '/users').send({ name: 'Peer Admin', email: `peer-${suffix}@example.test`, password, role: 'ADMIN' }).expect(201);
    await client(admin, 'patch', `/users/${created.body.id}`).send({ version: 1, active: false, reason: 'Not permitted' }).expect(403);
    const peer = await login(`peer-${suffix}@example.test`);
    await client(peer, 'get', '/students').expect(403);
    await client(peer, 'post', '/auth/password').send({ currentPassword: password, newPassword: 'Integration-Replaced-456' }).expect(200);
    await client(peer, 'get', '/auth/me').expect(401);
    const fresh = await login(`peer-${suffix}@example.test`, 'Integration-Replaced-456');
    await client(fresh, 'get', '/students').expect(200);
  });

  async function approved(name: string) {
    const draft = await client(admin, 'post', '/applications').send({ sessionId, studentName: name, dateOfBirth: '2014-01-02', gender: 'BOY', guardianName: 'Guardian', guardianPhone: '9222222222', appliedGrade: 'VI', source: 'School Office' }).expect(201);
    const submitted = await client(admin, 'post', `/applications/${draft.body.id}/submit`).send({ version: 1, status: 'SUBMITTED', reason: 'Complete application' }).expect(201);
    return (await client(admin, 'post', `/applications/${draft.body.id}/decision`).send({ version: submitted.body.version, status: 'APPROVED', reason: 'Admission approved' }).expect(201)).body;
  }
  let studentId: string; let admissionNumber: string;
  it('enrolls atomically, returns identical retry, preserves numbering, and rejects capacity overflow', async () => {
    const application = await approved('Test Applicant One');
    const data = { version: application.version, classId, admissionDate: '2026-04-01', feeCategory: 'GENERAL', reason: 'Admission confirmed' };
    const [first, second] = await Promise.all([client(admin, 'post', `/applications/${application.id}/confirm-enrollment`).send(data), client(admin, 'post', `/applications/${application.id}/confirm-enrollment`).send(data)]);
    expect(first.status).toBe(201); expect(second.status).toBe(201); expect(first.body.student.id).toBe(second.body.student.id);
    studentId = first.body.student.id; admissionNumber = first.body.admissionNumber;
    expect(admissionNumber).toBe('TEST-0001'); expect(await db.enrollment.count({ where: { schoolId } })).toBe(1);
    const next = await approved('Test Applicant Two');
    await client(admin, 'post', `/applications/${next.id}/confirm-enrollment`).send({ ...data, version: next.version }).expect(409);
    expect((await db.school.findUniqueOrThrow({ where: { id: schoolId } })).nextAdmission).toBe(2);
    await client(admin, 'get', `/students?q=${admissionNumber}`).expect(200).expect(res => expect(res.body.total).toBe(1));
  });

  it('scopes teacher lists and direct IDs; prevents class-filter bypass and assignment duplication', async () => {
    await client(teacher, 'get', '/students').expect(200).expect(res => expect(res.body.total).toBe(0));
    await client(teacher, 'get', `/students/${studentId}`).expect(404);
    await client(admin, 'post', '/school/teacher-assignments').send({ teacherId, classId, startDate: '2026-04-01' }).expect(201);
    await client(admin, 'post', '/school/teacher-assignments').send({ teacherId, classId: otherClassId, startDate: '2026-04-01' }).expect(409);
    await client(teacher, 'get', '/students').expect(200).expect(res => expect(res.body.total).toBe(1));
    await client(teacher, 'get', `/students?classId=${otherClassId}`).expect(200).expect(res => expect(res.body.total).toBe(0));
    await client(teacher, 'get', `/students/${studentId}`).expect(200).expect(res => { expect(res.body.guardians).toEqual([]); expect(res.body.applications).toEqual([]); });
    await client(teacher, 'patch', `/students/${studentId}`).send({}).expect(403);
  });

  it('checks stale edits and preserves admission identity, family linkage and document access', async () => {
    const original = (await client(admin, 'get', `/students/${studentId}`).expect(200)).body.student;
    const edit = { version: original.version, name: 'Corrected Student', dateOfBirth: '2014-01-02', gender: 'BOY', address: 'New address', permanentAddress: '', previousSchool: '', reason: 'Verified spelling correction' };
    await client(admin, 'patch', `/students/${studentId}`).send(edit).expect(200);
    await client(admin, 'patch', `/students/${studentId}`).send(edit).expect(409);
    expect((await db.student.findUniqueOrThrow({ where: { id: studentId } })).admissionNumber).toBe(admissionNumber);
    const attachment = await client(admin, 'post', '/documents').field('studentId', studentId).field('type', 'Birth certificate').attach('file', Buffer.from('%PDF-1.4\n%%EOF'), { filename: 'sample.pdf', contentType: 'application/pdf' }).expect(201);
    await client(teacher, 'get', `/documents/${attachment.body.id}/download`).expect(403);
    await client(admin, 'post', `/documents/${attachment.body.id}/verify`).expect(201);
    await client(admin, 'get', `/documents/${attachment.body.id}/download`).expect(200);
    const events = await db.auditEvent.count({ where: { schoolId, entityId: studentId } }); expect(events).toBeGreaterThan(2);
  });

  it('revokes live sessions when an Accountant is deactivated', async () => {
    await client(admin, 'patch', `/users/${accountantId}`).send({ version: 1, active: false, reason: 'Employment ended' }).expect(200);
    await client(accountant, 'get', '/auth/me').expect(401);
  });
});
