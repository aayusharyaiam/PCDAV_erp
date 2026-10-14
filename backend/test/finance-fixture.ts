import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { Db } from '../src/db';
import { ApiErrors } from '../src/errors';
import { tokenHash } from '../src/auth';
import { cleanupTestSchool } from './finance-cleanup';

export type Session = { id: string; cookie: string; csrf: string };
export class FinanceFixture {
  app!: INestApplication;
  db!: Db;
  schoolId!: string;
  sessionId!: string;
  classId!: string;
  familyId!: string;
  feeHeadId!: string;
  planId!: string;
  admin!: Session;
  accountant!: Session;
  otherCashier!: Session;
  teacher!: Session;
  superadmin!: Session;
  foreign!: Session;
  foreignSchoolId!: string;
  date = '2026-10-20';

  client = (session: Session, method: 'get' | 'post', path: string) => request(this.app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', session.cookie).set('Origin', process.env.FRONTEND_ORIGIN || 'http://localhost:3000').set('X-CSRF-Token', session.csrf);

  async init() {
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to disposable local PostgreSQL');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    this.app = module.createNestApplication();
    this.app.use(cookieParser()); this.app.setGlobalPrefix('api/v1');
    this.app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    this.app.useGlobalFilters(new ApiErrors());
    await this.app.init(); await this.app.listen(0, '127.0.0.1');
    this.db = this.app.get(Db);
    this.schoolId = (await this.db.school.create({ data: { name: `Finance regression ${randomUUID()}` } })).id;
    this.foreignSchoolId = (await this.db.school.create({ data: { name: `Foreign finance ${randomUUID()}` } })).id;
    this.admin = await this.user('ADMIN'); this.accountant = await this.user('ACCOUNTANT'); this.otherCashier = await this.user('ACCOUNTANT'); this.teacher = await this.user('TEACHER'); this.superadmin = await this.user('SUPERADMIN'); this.foreign = await this.user('ADMIN', this.foreignSchoolId);
    const session = await this.db.academicSession.create({ data: { schoolId: this.schoolId, name: '2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), current: true } });
    this.sessionId = session.id;
    this.classId = (await this.db.classOffering.create({ data: { schoolId: this.schoolId, sessionId: session.id, grade: 'IV', section: 'A', capacity: 500 } })).id;
    this.familyId = (await this.db.family.create({ data: { schoolId: this.schoolId, label: 'Synthetic finance family' } })).id;
    this.feeHeadId = (await this.db.feeHead.create({ data: { schoolId: this.schoolId, code: 'MONTHLY', name: 'Demo monthly tuition', category: 'MONTHLY' } })).id;
    const plan = (await this.client(this.admin, 'post', '/fee-plans').send({ sessionId: this.sessionId, name: 'Demo assessment regression', effectiveFrom: '2026-04-01', rules: [{ feeHeadId: this.feeHeadId, frequency: 'MONTHLY', amountMinor: '1000', dueDay: 5 }] }).expect(201)).body;
    this.planId = plan.plan.id;
    await this.client(this.admin, 'post', `/fee-plans/${this.planId}/publish`).send({ versionNumber: 1, reason: 'Synthetic test assessment' }).expect(201);
    await this.open(this.accountant, this.date, '0');
  }
  async user(role: Role, schoolId = this.schoolId): Promise<Session> {
    const user = await this.db.user.create({ data: { schoolId, role, name: `${role} fixture`, email: `${randomUUID()}@example.test`, passwordHash: 'test-session-provisioned', mustChangePassword: false } });
    const token = randomUUID(); const csrf = randomUUID();
    await this.db.loginSession.create({ data: { tokenHash: tokenHash(token), csrfToken: csrf, userId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, csrf, cookie: `pcdav_session=${token}` };
  }
  async student() {
    const student = await this.db.student.create({ data: { schoolId: this.schoolId, familyId: this.familyId, admissionNumber: randomUUID(), name: 'Synthetic financial student', gender: 'BOY', dateOfBirth: new Date('2016-01-01'), admissionDate: new Date('2026-04-01') } });
    const enrollment = await this.db.enrollment.create({ data: { schoolId: this.schoolId, studentId: student.id, sessionId: this.sessionId, classId: this.classId, startDate: new Date('2026-04-01') } });
    return { studentId: student.id, enrollmentId: enrollment.id };
  }
  async fee(student: { studentId: string; enrollmentId: string }, amount = 1000n, date = '2026-04-05') {
    return this.db.feeObligation.create({ data: { schoolId: this.schoolId, ...student, feeHeadId: this.feeHeadId, periodKey: randomUUID(), dueDate: new Date(date), amountMinor: amount } });
  }
  async quote(studentId: string, amountMinor: string, extra = {}) {
    return (await this.client(this.accountant, 'post', '/payment-quotes').send({ studentId, amountMinor, ...extra }).expect(201)).body;
  }
  electronicBody(quote: any, extra = {}) { return { quoteId: quote.id, quoteVersion: quote.version, receivedAmountMinor: quote.amountMinor, businessDate: this.date, mode: 'MANUAL_ELECTRONIC', payerName: 'Synthetic guardian', electronicChannel: 'UPI', reference: randomUUID(), electronicVerified: true, electronicVerificationNote: 'Synthetic verified demo funds', ...extra }; }
  async capture(studentId: string, amountMinor = '1000', extra = {}) {
    const quote = await this.quote(studentId, amountMinor);
    return (await this.client(this.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(this.electronicBody(quote, extra)).expect(201)).body;
  }
  async cheque(studentId: string, amountMinor = '1000') {
    const quote = await this.quote(studentId, amountMinor);
    return (await this.client(this.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ quoteId: quote.id, quoteVersion: quote.version, receivedAmountMinor: amountMinor, businessDate: this.date, mode: 'CHEQUE', payerName: 'Cheque guardian', chequeNumber: randomUUID(), chequeBank: 'Demo Bank', chequeDate: this.date }).expect(201)).body;
  }
  async open(actor = this.accountant, businessDate = this.date, openingFloatMinor = '1000') { return (await this.client(actor, 'post', '/cashier-shifts').send({ businessDate, openingFloatMinor }).expect(201)).body; }
  async request(paymentId: string, extra = {}) { return (await this.client(this.accountant, 'post', '/finance/requests').set('Idempotency-Key', randomUUID()).send({ paymentId, type: 'REFUND', amountMinor: '100', businessDate: this.date, reason: 'Exact synthetic refund request', ...extra }).expect(201)).body; }
  async policy(extra = {}) {
    const { schoolId, ...before } = (await this.client(this.admin, 'get', '/finance/policy').expect(200)).body;
    return (await this.client(this.admin, 'post', '/finance/policy').send({ ...before, ...extra, reason: 'Configure synthetic demo policy' }).expect(201)).body;
  }
  async statement(studentId: string) { return (await this.client(this.accountant, 'get', `/students/${studentId}/statement`).expect(200)).body; }
  async close() {
    try { if (this.schoolId) await cleanupTestSchool(this.db, this.schoolId); if (this.foreignSchoolId) await cleanupTestSchool(this.db, this.foreignSchoolId); }
    finally { await this.app?.close(); }
  }
}
