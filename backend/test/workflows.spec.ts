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
import { cleanupFinance } from './finance-cleanup';

// Uses isolated, generated school IDs in the configured test database. No reset/truncate.
describe('Levels 1–3 PostgreSQL workflows', () => {
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
      await cleanupFinance(db, schoolId);
      await db.storeIssueLine.deleteMany({ where: { schoolId } }); await db.storeIssue.deleteMany({ where: { schoolId } }); await db.storeStockMovement.deleteMany({ where: { schoolId } }); await db.storeStockReceiptLine.deleteMany({ where: { schoolId } }); await db.storeStockReceipt.deleteMany({ where: { schoolId } }); await db.storeClusterLine.deleteMany({ where: { schoolId } }); await db.storeCluster.deleteMany({ where: { schoolId } }); await db.storeProduct.deleteMany({ where: { schoolId } }); await db.storeVendor.deleteMany({ where: { schoolId } }); await db.storeGroup.deleteMany({ where: { schoolId } });
      await db.feeObligation.deleteMany({ where: { schoolId } }); await db.feeCredit.deleteMany({ where: { schoolId } }); await db.serviceAssignment.deleteMany({ where: { schoolId } }); await db.transportVehicle.deleteMany({ where: { schoolId } }); await db.transportRoute.deleteMany({ where: { schoolId } });
      await db.auditEvent.deleteMany({ where: { schoolId } }); await db.document.deleteMany({ where: { schoolId } });
      await db.feeObligation.deleteMany({ where: { schoolId } }); await db.feeCredit.deleteMany({ where: { schoolId } }); await db.serviceAssignment.deleteMany({ where: { schoolId } }); await db.feeRule.deleteMany({ where: { schoolId } }); await db.feePlanVersion.deleteMany({ where: { schoolId } }); await db.feePlan.deleteMany({ where: { schoolId } }); await db.feeHead.deleteMany({ where: { schoolId } });
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

  it('creates Admin fee plans, previews/commits idempotent obligations, applies credit, and assesses hostel service fees', async () => {
    const tuition = await client(admin, 'post', '/fee-heads').send({ code: 'TUITION', name: 'Tuition Fee', category: 'MONTHLY' }).expect(201);
    const hostel = await client(admin, 'post', '/fee-heads').send({ code: 'HOSTEL_MONTHLY', name: 'Hostel Fee', category: 'SERVICE' }).expect(201);
    const plan = await client(admin, 'post', '/fee-plans').send({ sessionId, name: `Core Plan ${suffix.slice(0, 8)}`, effectiveFrom: '2026-01-01', rules: [{ feeHeadId: tuition.body.id, classId, frequency: 'MONTHLY', amountMinor: '920000', dueDay: 26 }] }).expect(201);
    await client(admin, 'post', `/fee-plans/${plan.body.plan.id}/publish`).send({ versionNumber: 1, reason: 'Publish integration fee plan' }).expect(201);
    const enrollment = await db.enrollment.findFirstOrThrow({ where: { schoolId, studentId } });
    await client(admin, 'post', '/credits').send({ studentId, amountMinor: '20000', source: 'OPENING_BALANCE', reason: 'Imported opening credit' }).expect(201);
    const preview = await client(accountant, 'post', '/assessments/preview').send({ enrollmentId: enrollment.id, periods: ['2026-04'] }).expect(201);
    expect(preview.body.grossMinor).toBe('920000'); expect(preview.body.availableCreditMinor).toBe('20000'); expect(preview.body.projectedNetMinor).toBe('900000');
    const commitBody = { enrollmentId: enrollment.id, periods: ['2026-04'], reason: 'Assess April fee' };
    const committed = await client(admin, 'post', '/assessments').send(commitBody).expect(201);
    expect(committed.body.created).toHaveLength(1); expect(committed.body.skipped).toBe(0);
    const retry = await client(admin, 'post', '/assessments').send(commitBody).expect(201);
    expect(retry.body.created).toHaveLength(0); expect(retry.body.skipped).toBe(1);
    const ledger = await client(accountant, 'get', `/students/${studentId}/ledger`).expect(200);
    expect(ledger.body.totals.outstandingMinor).toBe('900000'); expect(ledger.body.totals.availableCreditMinor).toBe('0');
    const service = await client(admin, 'post', '/services/assignments').send({ enrollmentId: enrollment.id, type: 'HOSTEL', label: 'Hostel Block A', amountMinor: '100000', frequency: 'MONTHLY', startDate: '2026-04-01' }).expect(201);
    await client(admin, 'post', `/services/assignments/${service.body.id}/end`).send({ endDate: '2026-05-15', reason: 'Student left hostel' }).expect(201);
    const servicePreview = await client(accountant, 'post', '/assessments/preview').send({ enrollmentId: enrollment.id, periods: ['2026-05'] }).expect(201);
    expect(servicePreview.body.lines.some((line: { serviceAssignmentId?: string; feeHeadId: string }) => line.serviceAssignmentId === service.body.id && line.feeHeadId === hostel.body.id)).toBe(true);
    await client(accountant, 'post', '/assessments').send(commitBody).expect(403);
    await client(teacher, 'get', `/students/${studentId}/ledger`).expect(403);
  });

  it('keeps assessment periods idempotent, versions plans, and applies later credit to older dues', async () => {
    const version = await client(admin, 'post', `/fee-plans/${(await db.feePlan.findFirstOrThrow({ where: { schoolId, name: { startsWith: 'Core Plan' } } })).id}/versions`).send({ sessionId, name: 'Core Plan version 2', effectiveFrom: '2026-06-01', rules: [{ feeHeadId: (await db.feeHead.findFirstOrThrow({ where: { schoolId, code: 'TUITION' } })).id, classId, frequency: 'MONTHLY', amountMinor: '930000', dueDay: 26 }] }).expect(201);
    expect(version.body.version.versionNumber).toBe(2);
    const corePlan = await db.feePlan.findFirstOrThrow({ where: { schoolId, name: { startsWith: 'Core Plan' } } });
    await client(admin, 'post', `/fee-plans/${corePlan.id}/publish`).send({ versionNumber: 2, reason: 'Publish June fee revision' }).expect(201);
    await client(accountant, 'post', '/assessments/preview').send({ enrollmentId: (await db.enrollment.findFirstOrThrow({ where: { schoolId, studentId } })).id, periods: ['2026-04'] }).expect(201).expect(res => expect(res.body.lines.find((line: { feeHeadCode: string }) => line.feeHeadCode === 'TUITION').amountMinor).toBe('920000'));
    await client(accountant, 'post', '/assessments/preview').send({ enrollmentId: (await db.enrollment.findFirstOrThrow({ where: { schoolId, studentId } })).id, periods: ['2026-06'] }).expect(201).expect(res => expect(res.body.lines.find((line: { feeHeadCode: string }) => line.feeHeadCode === 'TUITION').amountMinor).toBe('930000'));
    await client(admin, 'post', '/credits').send({ studentId, amountMinor: '50000', source: 'ADJUSTMENT', reason: 'Later fee adjustment' }).expect(201);
    await client(accountant, 'get', `/students/${studentId}/ledger`).expect(200).expect(res => { expect(res.body.totals.outstandingMinor).toBe('850000'); expect(res.body.totals.availableCreditMinor).toBe('0'); });

    await client(accountant, 'post', '/assessments/preview').send({ enrollmentId: (await db.enrollment.findFirstOrThrow({ where: { schoolId, studentId } })).id, periods: [] }).expect(400);
    const annual = await client(admin, 'post', '/fee-heads').send({ code: 'ANNUAL', name: 'Annual Charge', category: 'ANNUAL' }).expect(201);
    const admission = await client(admin, 'post', '/fee-heads').send({ code: 'ADMISSION_ONE', name: 'Admission Charge', category: 'NEW_ADMISSION' }).expect(201);
    const oneTimePlan = await client(admin, 'post', '/fee-plans').send({ sessionId, name: `One time plan ${suffix.slice(0, 8)}`, effectiveFrom: '2026-01-01', rules: [{ feeHeadId: annual.body.id, classId, frequency: 'ANNUAL', assessmentMonth: 4, amountMinor: '10000', dueDay: 10 }, { feeHeadId: admission.body.id, classId, frequency: 'ONE_TIME', amountMinor: '15000', dueDay: 10 }] }).expect(201);
    await client(admin, 'post', `/fee-plans/${oneTimePlan.body.plan.id}/publish`).send({ versionNumber: 1, reason: 'Publish annual and one-time rules' }).expect(201);
    const assessment = { enrollmentId: (await db.enrollment.findFirstOrThrow({ where: { schoolId, studentId } })).id, feePlanVersionId: oneTimePlan.body.version.id, periods: ['2026-04', '2026-05'] };
    await client(accountant, 'post', '/assessments/preview').send(assessment).expect(201).expect(res => { expect(res.body.grossMinor).toBe('225000'); expect(res.body.lines).toHaveLength(4); });
    await client(admin, 'post', '/assessments').send({ ...assessment, reason: 'Assess annual and one-time rules' }).expect(201);
    await client(accountant, 'post', '/assessments/preview').send({ ...assessment, periods: ['2026-05'] }).expect(201).expect(res => { expect(res.body.grossMinor).toBe('0'); expect(res.body.lines).toHaveLength(1); expect(res.body.lines[0].existingObligationId).toBeDefined(); });
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

  it('manages transport masters, dated allocations, store stock, and student issues', async () => {
    const route = await client(admin, 'post', '/transport/routes').send({ name: `Hethnagar – ${suffix.slice(0, 6)}`, campus: 'Hethnagar Campus', destination: 'Barmasia', monthlyAmountMinor: '180000', capacity: 1 }).expect(201);
    const vehicle = await client(admin, 'post', '/transport/vehicles').send({ name: 'School Bus Test', busNumber: `TEST-${suffix.slice(0, 6)}`, capacity: 1, driver1Name: 'Test Driver', driver1Phone: '9111111111' }).expect(201);
    const enrollment = await db.enrollment.findFirstOrThrow({ where: { schoolId, studentId } });
    const allocation = await client(admin, 'post', '/transport/allocations').send({ enrollmentId: enrollment.id, routeId: route.body.id, vehicleId: vehicle.body.id, startDate: '2026-04-01' }).expect(201);
    await client(admin, 'get', `/transport/report?month=2026-05&routeId=${route.body.id}`).expect(200).expect(res => { expect(res.body).toHaveLength(1); expect(res.body[0].admissionNumber).toBe(admissionNumber); expect(res.body[0].vehicle.busNumber).toBe(vehicle.body.busNumber); });
    await client(teacher, 'get', '/transport/routes').expect(403);
    await client(admin, 'post', '/services/assignments').send({ enrollmentId: enrollment.id, type: 'TRANSPORT', label: 'Duplicate route', amountMinor: '100000', frequency: 'MONTHLY', startDate: '2026-04-01' }).expect(400);

    const group = await client(admin, 'post', '/store/groups').send({ code: `BOOK${suffix.slice(0, 4).toUpperCase()}`, name: 'Books', description: 'Student books' }).expect(201);
    const vendor = await client(admin, 'post', '/store/vendors').send({ name: `Vendor ${suffix.slice(0, 6)}`, phone: '9222222222' }).expect(201);
    const product = await client(admin, 'post', '/store/products').send({ name: `Test Diary ${suffix.slice(0, 6)}`, description: 'School diary', groupId: group.body.id, unitCostMinor: '12500', alertQuantity: 1 }).expect(201);
    const cluster = await client(admin, 'post', '/store/clusters').send({ name: `VI starter kit ${suffix.slice(0, 6)}`, items: [{ productId: product.body.id, quantity: 1 }] }).expect(201);
    await client(admin, 'get', '/store/clusters').expect(200).expect(res => expect(res.body.find((item: { id: string }) => item.id === cluster.body.id).items[0].quantity).toBe(1));
    await client(admin, 'post', '/store/stock-receipts').send({ vendorId: vendor.body.id, receivedAt: '2026-04-01', reason: 'Opening stock', lines: [{ productId: product.body.id, quantity: 3, unitCostMinor: '12500' }] }).expect(201);
    const issued = await client(admin, 'post', '/store/issues').send({ studentId, enrollmentId: enrollment.id, issuedAt: '2026-04-02', reason: 'Issue diary', lines: [{ productId: product.body.id, quantity: 2 }] }).expect(201);
    await client(admin, 'get', '/store/defaulters').expect(200).expect(res => { expect(res.body.items).toHaveLength(1); expect(res.body.items[0].issueNumber).toBe(issued.body.issueNumber); expect(res.body.items[0].outstandingMinor).toBe('25000'); });
    await client(teacher, 'get', '/store/products').expect(403);
    expect((await db.storeProduct.findUniqueOrThrow({ where: { id: product.body.id } })).quantity).toBe(1);
    await client(admin, 'post', `/store/issues/${issued.body.id}/cancel`).send({ reason: 'Returned unused diary' }).expect(201);
    expect((await db.storeProduct.findUniqueOrThrow({ where: { id: product.body.id } })).quantity).toBe(3);
    await client(admin, 'post', `/services/assignments/${allocation.body.id}/end`).send({ endDate: '2026-05-31', reason: 'Route test complete' }).expect(201);
  });
});
