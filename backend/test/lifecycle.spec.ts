import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { Db } from '../src/db';
import { ApiErrors } from '../src/errors';
import { tokenHash } from '../src/auth';
import { cleanupTestSchool } from './finance-cleanup';

describe('Attendance and promotion lifecycle', () => {
  let app: INestApplication;
  let db: Db;
  let schoolId: string;
  let sourceSessionId: string;
  let targetSessionId: string;
  let sourceClassId: string;
  let otherSourceClassId: string;
  let targetClassId: string;
  let teacherId: string;
  let adminId: string;
  let teacher: { cookie: string; csrf: string };
  let admin: { cookie: string; csrf: string };
  let superadmin: { cookie: string; csrf: string };
  let enrollmentOneId: string;
  let enrollmentTwoId: string;
  let studentOneId: string;
  let studentTwoId: string;
  const suffix = randomUUID();
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

  const client = (session: { cookie: string; csrf: string }, method: 'get' | 'post' | 'patch', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', session.cookie).set('Origin', origin).set('X-CSRF-Token', session.csrf);

  async function fixtureUser(role: Role) {
    const user = await db.user.create({ data: { schoolId, role, name: `${role} lifecycle`, email: `${role.toLowerCase()}-${suffix}@example.test`, passwordHash: 'fixture', mustChangePassword: false } });
    const token = randomUUID();
    const csrf = randomUUID();
    await db.loginSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), csrfToken: csrf, expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, cookie: `pcdav_session=${token}`, csrf };
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a disposable test database');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new ApiErrors());
    await app.init();
    db = app.get(Db);

    schoolId = (await db.school.create({ data: { name: `Lifecycle ${suffix}` } })).id;
    const source = await db.academicSession.create({ data: { schoolId, name: `Source ${suffix}`, startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), current: true } });
    const target = await db.academicSession.create({ data: { schoolId, name: `Target ${suffix}`, startDate: new Date('2027-04-01'), endDate: new Date('2028-03-31') } });
    sourceSessionId = source.id;
    targetSessionId = target.id;
    sourceClassId = (await db.classOffering.create({ data: { schoolId, sessionId: source.id, grade: 'VI', section: 'A', capacity: 10 } })).id;
    otherSourceClassId = (await db.classOffering.create({ data: { schoolId, sessionId: source.id, grade: 'VI', section: 'B', capacity: 10 } })).id;
    targetClassId = (await db.classOffering.create({ data: { schoolId, sessionId: target.id, grade: 'VII', section: 'A', capacity: 1 } })).id;
    const familyOne = await db.family.create({ data: { schoolId, label: 'Lifecycle family one' } });
    const familyTwo = await db.family.create({ data: { schoolId, label: 'Lifecycle family two' } });
    const studentOne = await db.student.create({ data: { schoolId, familyId: familyOne.id, admissionNumber: `LIFE-1-${suffix.slice(0, 8)}`, name: 'Lifecycle One', gender: 'BOY', dateOfBirth: new Date('2014-01-01'), admissionDate: new Date('2026-04-01') } });
    const studentTwo = await db.student.create({ data: { schoolId, familyId: familyTwo.id, admissionNumber: `LIFE-2-${suffix.slice(0, 8)}`, name: 'Lifecycle Two', gender: 'GIRL', dateOfBirth: new Date('2014-02-01'), admissionDate: new Date('2026-04-01') } });
    studentOneId = studentOne.id;
    studentTwoId = studentTwo.id;
    enrollmentOneId = (await db.enrollment.create({ data: { schoolId, studentId: studentOne.id, sessionId: source.id, classId: sourceClassId, startDate: source.startDate } })).id;
    enrollmentTwoId = (await db.enrollment.create({ data: { schoolId, studentId: studentTwo.id, sessionId: source.id, classId: sourceClassId, startDate: source.startDate } })).id;
    const teacherUser = await fixtureUser(Role.TEACHER);
    const adminUser = await fixtureUser(Role.ADMIN);
    const superadminUser = await fixtureUser(Role.SUPERADMIN);
    teacherId = teacherUser.id;
    adminId = adminUser.id;
    teacher = teacherUser;
    admin = adminUser;
    superadmin = superadminUser;
    await db.teacherAssignment.create({ data: { schoolId, sessionId: source.id, teacherId: teacherUser.id, classId: sourceClassId, startDate: source.startDate, assignedBy: adminUser.id } });
  });

  afterAll(async () => {
    if (db && schoolId) await cleanupTestSchool(db, schoolId);
    await app?.close();
  });

  it('scopes submitted attendance, preserves the original, and handles stale approval', async () => {
    await client(teacher, 'post', '/attendance').send({ sessionId: sourceSessionId, classId: otherSourceClassId, attendanceDate: '2026-10-20', marks: [] }).expect(403);
    const submitted = await client(teacher, 'post', '/attendance').send({ sessionId: sourceSessionId, classId: sourceClassId, attendanceDate: '2026-10-20', marks: [{ studentId: studentOneId, status: 'PRESENT' }, { studentId: studentTwoId, status: 'ABSENT' }] }).expect(201);
    const firstMark = submitted.body.marks.find((mark: { studentId: string }) => mark.studentId === studentOneId);
    expect(firstMark.status).toBe('PRESENT');
    await client(teacher, 'post', '/attendance').send({ sessionId: sourceSessionId, classId: sourceClassId, attendanceDate: '2026-10-20', marks: [{ studentId: studentOneId, status: 'PRESENT' }, { studentId: studentTwoId, status: 'ABSENT' }] }).expect(409);

    const requestOne = await client(teacher, 'post', `/attendance/${firstMark.id}/correction-requests`).send({ requestedStatus: 'ABSENT', reason: 'Verified register correction' }).expect(201);
    const requestTwo = await client(teacher, 'post', `/attendance/${firstMark.id}/correction-requests`).send({ requestedStatus: 'LATE', reason: 'Second review before decision' }).expect(201);
    await client(admin, 'post', `/attendance/correction-requests/${requestOne.body.id}/approve`).send({ version: requestOne.body.version, reason: 'Approve verified correction' }).expect(201);
    await client(admin, 'post', `/attendance/correction-requests/${requestTwo.body.id}/approve`).send({ version: requestTwo.body.version, reason: 'Reject stale request' }).expect(409);
    expect((await db.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: requestTwo.body.id } })).status).toBe('STALE');
    expect((await db.attendanceMark.findUniqueOrThrow({ where: { id: firstMark.id } })).status).toBe('PRESENT');
    expect((await db.attendanceCorrection.findFirst({ where: { attendanceMarkId: firstMark.id } }))?.correctedStatus).toBe('ABSENT');
    const rejected = await client(teacher, 'post', `/attendance/${firstMark.id}/correction-requests`).send({ requestedStatus: 'EXCUSED', reason: 'Do not apply second change' }).expect(201);
    await client(admin, 'post', `/attendance/correction-requests/${rejected.body.id}/reject`).send({ version: rejected.body.version, reason: 'Correction evidence was insufficient' }).expect(201);
    expect((await db.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: rejected.body.id } })).status).toBe('REJECTED');
    await client(teacher, 'get', `/attendance?sessionId=${sourceSessionId}&classId=${sourceClassId}&attendanceDate=2026-10-20`).expect(200).expect(response => expect(response.body[0].marks.find((mark: { studentId: string }) => mark.studentId === studentOneId).status).toBe('ABSENT'));
  });

  it('accepts only assigned-class teacher decisions and executes an audited target enrollment', async () => {
    await client(teacher, 'post', '/promotion-decisions').send({ sourceSessionId, classId: sourceClassId, decisions: [{ enrollmentId: enrollmentOneId, decision: 'PROMOTE', reason: 'Final classroom decision' }, { enrollmentId: enrollmentTwoId, decision: 'RETAIN', reason: 'Final classroom decision' }] }).expect(201);
    const batch = await client(admin, 'post', '/promotion-batches').send({ sourceSessionId, targetSessionId, items: [{ sourceEnrollmentId: enrollmentOneId, targetClassId }] }).expect(201);
    const validated = await client(admin, 'post', `/promotion-batches/${batch.body.id}/validate`).send({ version: batch.body.version, reason: 'Validate target capacity' }).expect(201);
    expect(validated.body.status).toBe('READY');
    const executed = await client(admin, 'post', `/promotion-batches/${batch.body.id}/execute`).send({ version: validated.body.version, reason: 'Execute approved rollover' }).expect(201);
    expect(executed.body.status).toBe('EXECUTED');
    const source = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentOneId } });
    const target = await db.enrollment.findUniqueOrThrow({ where: { schoolId_studentId_sessionId: { schoolId, studentId: studentOneId, sessionId: targetSessionId } } });
    expect(source.classId).toBe(sourceClassId);
    expect(source.status).toBe('PROMOTED');
    expect(target.classId).toBe(targetClassId);
    expect(target.entryType).toBe('PROMOTED');

    const capacityBatch = await client(admin, 'post', '/promotion-batches').send({ sourceSessionId, targetSessionId, items: [{ sourceEnrollmentId: enrollmentTwoId, targetClassId }] }).expect(201);
    const invalid = await client(admin, 'post', `/promotion-batches/${capacityBatch.body.id}/validate`).send({ version: capacityBatch.body.version, reason: 'Check full target class' }).expect(201);
    expect(invalid.body.status).toBe('INVALID');
    expect(invalid.body.validation.errors[0].errors).toContain('Target classroom capacity would be exceeded');
  });

  it('lets Superadmin manage lower accounts without allowing Superadmin escalation', async () => {
    await client(superadmin, 'post', '/users').send({ name: 'Superadmin Teacher', email: `created-teacher-${suffix}@example.test`, password: 'Lifecycle-password-123', role: 'TEACHER' }).expect(201);
    await client(superadmin, 'post', '/users').send({ name: 'Superadmin Accountant', email: `created-accountant-${suffix}@example.test`, password: 'Lifecycle-password-123', role: 'ACCOUNTANT' }).expect(201);
    const createdAdmin = await client(superadmin, 'post', '/users').send({ name: 'Superadmin Admin', email: `created-admin-${suffix}@example.test`, password: 'Lifecycle-password-123', role: 'ADMIN' }).expect(201);
    await client(superadmin, 'patch', `/users/${createdAdmin.body.id}`).send({ version: 1, role: 'TEACHER', reason: 'Role management' }).expect(200);
    await client(superadmin, 'post', '/users').send({ name: 'Forbidden Superadmin', email: `created-superadmin-${suffix}@example.test`, password: 'Lifecycle-password-123', role: 'SUPERADMIN' }).expect(403);
    expect(adminId).toBeDefined();
    expect(teacherId).toBeDefined();
  });
});
