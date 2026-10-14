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

describe('Level 4 payment-to-receipt workflows', () => {
  let app: INestApplication;
  let db: Db;
  let schoolId: string;
  let studentId: string;
  let enrollmentId: string;
  let feeHeadId: string;
  let accountantId: string;
  let adminId: string;
  let accountant: Session;
  let admin: Session;
  let teacher: Session;
  const suffix = randomUUID();
  const password = 'Payment-Integration-123';
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';

  type Session = { cookie: string; csrf: string };
  const client = (session: Session, method: 'get' | 'post', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Cookie', session.cookie).set('Origin', origin).set('X-CSRF-Token', session.csrf);

  async function login(email: string): Promise<Session> {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin).send({ email, password }).expect(200);
    return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: response.body.csrfToken };
  }

  async function freshStudent() {
    const original = await db.student.findUniqueOrThrow({ where: { id: studentId } });
    const originalEnrollment = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    const student = await db.student.create({ data: { schoolId, familyId: original.familyId, admissionNumber: randomUUID(), name: 'Independent payment student', dateOfBirth: original.dateOfBirth, gender: original.gender, admissionDate: original.admissionDate } });
    const enrollment = await db.enrollment.create({ data: { schoolId, studentId: student.id, sessionId: originalEnrollment.sessionId, classId: originalEnrollment.classId, startDate: originalEnrollment.startDate } });
    return { studentId: student.id, enrollmentId: enrollment.id };
  }

  async function quoteFor(id: string, amountMinor: string) {
    return (await client(accountant, 'post', '/payment-quotes').send({ studentId: id, amountMinor }).expect(201)).body;
  }

  const electronicBody = (quote: { id: string; version: number; amountMinor: string }, extra = {}) => ({ quoteId: quote.id, quoteVersion: quote.version, receivedAmountMinor: quote.amountMinor, businessDate: '2026-10-14', mode: 'MANUAL_ELECTRONIC', payerName: 'Test Guardian', electronicChannel: 'UPI', reference: randomUUID(), electronicVerified: true, electronicVerificationNote: 'Matched credit in school bank statement', ...extra });

  async function electronicFor(id: string, amountMinor: string) {
    const quote = await quoteFor(id, amountMinor);
    return (await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(quote)).expect(201)).body;
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
    await app.listen(0, '127.0.0.1');
    db = app.get(Db);

    const school = await db.school.create({ data: { name: `Payments ${suffix}`, admissionPrefix: 'PAYT' } });
    schoolId = school.id;
    const session = await db.academicSession.create({ data: { schoolId, name: '2026–27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31'), current: true, admissionsOpen: true } });
    const classroom = await db.classOffering.create({ data: { schoolId, sessionId: session.id, grade: 'V', section: 'P', capacity: 20 } });
    const family = await db.family.create({ data: { schoolId, label: `Payment family ${suffix}` } });
    const student = await db.student.create({ data: { schoolId, admissionNumber: `PAYT-${suffix.slice(0, 8)}`, name: 'Payment Student', dateOfBirth: new Date('2015-01-02'), gender: 'BOY', familyId: family.id, admissionDate: new Date('2026-04-01') } });
    studentId = student.id;
    const enrollment = await db.enrollment.create({ data: { schoolId, studentId, sessionId: session.id, classId: classroom.id, startDate: new Date('2026-04-01') } });
    enrollmentId = enrollment.id;
    const feeHead = await db.feeHead.create({ data: { schoolId, code: 'PAY_TUITION', name: 'Payment tuition', category: 'MONTHLY' } });
    feeHeadId = feeHead.id;
    await db.feeObligation.createMany({ data: [
      { schoolId, studentId, enrollmentId, feeHeadId, periodKey: '2026-04', dueDate: new Date('2026-04-05'), amountMinor: 5000n, status: 'OPEN' },
      { schoolId, studentId, enrollmentId, feeHeadId, periodKey: '2026-05', dueDate: new Date('2026-05-05'), amountMinor: 7000n, status: 'OPEN' },
    ] });
    const hash = await argon2.hash(password);
    const adminUser = await db.user.create({ data: { schoolId, name: 'Payment Admin', email: `payment-admin-${suffix}@example.test`, passwordHash: hash, role: 'ADMIN', mustChangePassword: false } });
    adminId = adminUser.id;
    const accountantUser = await db.user.create({ data: { schoolId, name: 'Payment Accountant', email: `payment-accountant-${suffix}@example.test`, passwordHash: hash, role: 'ACCOUNTANT', mustChangePassword: false } });
    accountantId = accountantUser.id;
    await db.feeCredit.create({ data: { schoolId, studentId, amountMinor: 1000n, remainingMinor: 1000n, source: 'IMPORT', reason: 'Opening test credit', createdBy: adminId } });
    const teacherUser = await db.user.create({ data: { schoolId, name: 'Payment Teacher', email: `payment-teacher-${suffix}@example.test`, passwordHash: hash, role: 'TEACHER', mustChangePassword: false } });
    accountant = await login(accountantUser.email);
    admin = await login(adminUser.email);
    teacher = await login(teacherUser.email);
  });

  afterAll(async () => {
    if (db && schoolId) {
      await cleanupFinance(db, schoolId);
      await db.receiptEvent.deleteMany({ where: { schoolId } });
      await db.receipt.deleteMany({ where: { schoolId } });
      await db.paymentEvent.deleteMany({ where: { schoolId } });
      await db.paymentCreditRelease.deleteMany({ where: { schoolId } });
      await db.paymentAllocationRelease.deleteMany({ where: { schoolId } });
      await db.paymentCreditApplication.deleteMany({ where: { schoolId } });
      await db.paymentAllocation.deleteMany({ where: { schoolId } });
      await db.paymentRefund.deleteMany({ where: { schoolId } });
      await db.refundCommand.deleteMany({ where: { schoolId } });
      await db.payment.deleteMany({ where: { schoolId } });
      await db.paymentQuote.deleteMany({ where: { schoolId } });
      await db.receiptSequence.deleteMany({ where: { schoolId } });
      await db.cashierShift.deleteMany({ where: { schoolId } });
      await db.feeObligation.deleteMany({ where: { schoolId } });
      await db.feeCredit.deleteMany({ where: { schoolId } });
      await db.storeIssueLine.deleteMany({ where: { schoolId } });
      await db.storeIssue.deleteMany({ where: { schoolId } });
      await db.auditEvent.deleteMany({ where: { schoolId } });
      const users = await db.user.findMany({ where: { schoolId }, select: { id: true } });
      await db.loginSession.deleteMany({ where: { userId: { in: users.map(user => user.id) } } });
      await db.user.deleteMany({ where: { schoolId } });
      await db.enrollment.deleteMany({ where: { schoolId } });
      await db.student.deleteMany({ where: { schoolId } });
      await db.family.deleteMany({ where: { schoolId } });
      await db.feeHead.deleteMany({ where: { schoolId } });
      await db.classOffering.deleteMany({ where: { schoolId } });
      await db.academicSession.deleteMany({ where: { schoolId } });
      await db.school.delete({ where: { id: schoolId } });
    }
    await app?.close();
  });

  it('previews oldest-due allocation, captures atomically, settles store balance, and retries idempotently', async () => {
    const storeIssue = await db.storeIssue.create({ data: { schoolId, issueNumber: `PAY-SI-${suffix.slice(0, 8)}`, studentId, enrollmentId, issuedAt: new Date('2026-04-03'), status: 'OPEN', totalMinor: 3000n, reason: 'Test store issue', createdBy: adminId } });
    const shift = await client(accountant, 'post', '/cashier-shifts').send({ businessDate: '2026-10-13', openingFloatMinor: '1000' }).expect(201);
    expect(shift.body.openingFloatMinor).toBe('1000');
    const quote = await client(accountant, 'post', '/payment-quotes').send({ studentId, amountMinor: '15000' }).expect(201);
    expect(quote.body.availableCreditMinor).toBe('1000');
    expect(quote.body.paymentAllocatedMinor).toBe('14000');
    expect(quote.body.allocations.filter((line: { paymentAllocatedMinor: string }) => line.paymentAllocatedMinor !== '0')).toHaveLength(3);
    expect(quote.body.allocations.find((line: { targetType: string; targetId: string }) => line.targetType === 'STORE' && line.targetId === storeIssue.id).paymentAllocatedMinor).toBe('3000');

    const paymentBody = { quoteId: quote.body.id, quoteVersion: quote.body.version, receivedAmountMinor: '15000', businessDate: '2026-10-13', mode: 'CASH', currency: 'INR', tenderedAmountMinor: '16000', payerName: 'Payment Guardian', payerPhone: '9222222222' };
    const [first, retry] = await Promise.all([1, 2].map(() => client(accountant, 'post', '/payments').set('Idempotency-Key', 'payment-cash-001').send(paymentBody).expect(201)));
    expect(retry.body.payment.id).toBe(first.body.payment.id);
    expect(first.body.payment.changeMinor).toBe('1000');
    expect(first.body.payment.status).toBe('CAPTURED');
    expect(first.body.receipt.receiptNumber).toMatch(/^DEMO\/FEE\/SCHOOL\/000001$/);
    expect(first.body.receipt.pdfStatus).toBe('PENDING');
    expect(await db.receiptPdfJob.count({ where: { receiptId: first.body.receipt.id, receiptStatus: 'ISSUED', status: 'PENDING' } })).toBe(1);
    expect(first.body.receipt.snapshot.payment.receivedAmountMinor).toBe('15000');
    expect(await db.payment.count({ where: { schoolId } })).toBe(1);
    expect(await db.receipt.count({ where: { schoolId } })).toBe(1);
    expect(await db.paymentAllocation.count({ where: { schoolId, paymentId: first.body.payment.id } })).toBe(3);
    expect((await db.storeIssue.findUniqueOrThrow({ where: { id: storeIssue.id } })).paidMinor).toBe(3000n);
    expect((await db.feeObligation.findFirstOrThrow({ where: { schoolId, periodKey: '2026-04' } })).paidMinor).toBe(4000n);
    await client(accountant, 'post', '/payments').set('Idempotency-Key', 'payment-cash-001').send({ ...paymentBody, payerName: 'Different Guardian' }).expect(409);
    await client(accountant, 'post', '/payments').set('Idempotency-Key', 'payment-cash-reuse').send(paymentBody).expect(409);

    await client(accountant, 'get', `/receipts/${first.body.receipt.id}`).expect(200).expect(response => expect(response.body.events.map((event: { type: string }) => event.type)).toContain('ISSUED'));
    await client(accountant, 'post', `/receipts/${first.body.receipt.id}/print-events`).send({ reason: 'Guardian requested another copy' }).expect(201);
    await client(accountant, 'get', '/receipts?receiptNumber=000001').expect(200).expect(response => { expect(response.body.total).toBe(1); expect(response.body.items[0].receiptNumber).toBe(first.body.receipt.receiptNumber); });

    await client(accountant, 'post', `/cashier-shifts/${shift.body.id}/close`).send({ countedCashMinor: '16000' }).expect(201).expect(response => { expect(response.body.expectedCashMinor).toBe('16000'); expect(response.body.varianceMinor).toBe('0'); });
    await client(accountant, 'post', '/payments').set('Idempotency-Key', 'payment-cash-001').send(paymentBody).expect(201);
    await client(accountant, 'post', `/payments/${first.body.payment.id}/reverse`).send({ reason: 'Admin-only correction attempt' }).expect(403);
    await client(admin, 'post', `/payments/${first.body.payment.id}/reverse`).send({ reason: 'Closed shift cannot pay out' }).expect(409);
    const correctionShift = await client(admin, 'post', '/cashier-shifts').send({ businessDate: '2026-10-15', openingFloatMinor: '20000' }).expect(201);
    const reversed = await client(admin, 'post', `/payments/${first.body.payment.id}/reverse`).send({ reason: 'Duplicate cash entry corrected', businessDate: '2026-10-15', shiftId: correctionShift.body.id }).expect(201);
    expect(reversed.body.payment.status).toBe('REVERSED');
    expect(reversed.body.receipt.status).toBe('VOID');
    expect((await db.storeIssue.findUniqueOrThrow({ where: { id: storeIssue.id } })).paidMinor).toBe(0n);
    expect((await db.cashierShift.findUniqueOrThrow({ where: { id: shift.body.id } })).expectedCashMinor).toBe(16000n);
    expect(reversed.body.receipt.snapshot).toEqual(first.body.receipt.snapshot);
    expect(reversed.body.overpaymentCredit.remainingMinor).toBe('0');
    expect(reversed.body.creditReleases).toHaveLength(1);
    await client(admin, 'post', `/cashier-shifts/${correctionShift.body.id}/close`).send({ countedCashMinor: '4900' }).expect(400);
    await client(admin, 'post', `/cashier-shifts/${correctionShift.body.id}/close`).send({ countedCashMinor: '4900', reason: 'Counted cash short by one rupee' }).expect(201).expect(response => { expect(response.body.expectedCashMinor).toBe('5000'); expect(response.body.varianceMinor).toBe('-100'); });
    await client(admin, 'get', '/reports/collections?fromDate=2026-10-13&toDate=2026-10-13').expect(200).expect(response => expect(response.body.netCapturedMinor).toBe('15000'));
    await client(admin, 'get', '/reports/collections?fromDate=2026-10-15&toDate=2026-10-15').expect(200).expect(response => { expect(response.body.reversedMinor).toBe('15000'); expect(response.body.netCapturedMinor).toBe('-15000'); });
  });

  it('holds cheques until clearance, issues a receipt on clear, and retains bounce history', async () => {
    await db.feeObligation.create({ data: { schoolId, studentId, enrollmentId, feeHeadId, periodKey: '2026-06', dueDate: new Date('2026-06-05'), amountMinor: 4000n, status: 'OPEN' } });
    const shift = await client(accountant, 'post', '/cashier-shifts').send({ businessDate: '2026-10-14', openingFloatMinor: '0' }).expect(201);
    const quote = await client(accountant, 'post', '/payment-quotes').send({ studentId, amountMinor: '4000' }).expect(201);
    const body = { quoteId: quote.body.id, quoteVersion: quote.body.version, receivedAmountMinor: '4000', businessDate: '2026-10-14', mode: 'CHEQUE', payerName: 'Cheque Guardian', chequeNumber: `CHQ-${suffix.slice(0, 8)}`, chequeBank: 'Test Bank', chequeDate: '2026-10-12' };
    const pending = await client(accountant, 'post', '/payments').set('Idempotency-Key', 'payment-cheque-001').send(body).expect(201);
    expect(pending.body.payment.status).toBe('PENDING_CHEQUE');
    expect(pending.body.receipt).toBeNull();
    expect((await db.feeObligation.findFirstOrThrow({ where: { schoolId, periodKey: '2026-06' } })).paidMinor).toBe(0n);

    const cleared = await client(accountant, 'post', `/payments/${pending.body.payment.id}/clear-cheque`).send({ businessDate: '2026-10-14', reason: 'Bank confirmation received' }).expect(201);
    expect(cleared.body.payment.status).toBe('CLEARED');
    expect(cleared.body.receipt.receiptNumber).toMatch(/000002$/);
    expect(cleared.body.events.map((event: { type: string }) => event.type)).toContain('CHEQUE_CLEARED');
    const bounced = await client(admin, 'post', `/payments/${pending.body.payment.id}/bounce`).send({ businessDate: '2026-10-14', reason: 'Cheque returned unpaid' }).expect(201);
    expect(bounced.body.payment.status).toBe('BOUNCED');
    expect(bounced.body.receipt.status).toBe('VOID');
    expect(bounced.body.events.map((event: { type: string }) => event.type)).toContain('CHEQUE_BOUNCED');
    expect((await db.cashierShift.findUniqueOrThrow({ where: { id: shift.body.id } })).status).toBe('OPEN');

    const electronicQuote = await client(accountant, 'post', '/payment-quotes').send({ studentId, amountMinor: '1000' }).expect(201);
    const electronic = await client(accountant, 'post', '/payments').set('Idempotency-Key', 'payment-electronic-001').send(electronicBody(electronicQuote.body, { currency: 'INR', payerName: 'Electronic Guardian', reference: 'UPI-TEST-001' })).expect(201);
    expect(electronic.body.payment.status).toBe('CAPTURED');
    const refunded = await client(admin, 'post', `/payments/${electronic.body.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ businessDate: '2026-10-14', amountMinor: '1000', reason: 'Electronic payment returned', reference: 'REF-TEST-001' }).expect(201);
    expect(refunded.body.payment.status).toBe('REFUNDED');
    expect(refunded.body.receipt.status).toBe('REFUNDED');
    await client(accountant, 'get', `/receipts/${electronic.body.receipt.id}`).expect(200).expect(response => {
      expect(response.body.events.map((event: { type: string }) => event.type)).toContain('REFUNDED');
      expect(response.body.refunds[0].amountMinor).toBe('1000');
    });
  });

  it('replays a small refund command exactly, including after later corrections', async () => {
    await db.cashierShift.upsert({ where: { schoolId_cashierId_businessDate: { schoolId, cashierId: accountantId, businessDate: new Date('2026-10-14') } }, create: { schoolId, cashierId: accountantId, businessDate: new Date('2026-10-14'), openingFloatMinor: 0n }, update: {} });
    const student = await freshStudent();
    const captured = await electronicFor(student.studentId, '1000');
    const path = `/payments/${captured.payment.id}/refunds`;
    const body = { businessDate: '2026-10-14', amountMinor: '100', reason: 'Small retry-safe refund' };
    const key = randomUUID();
    await client(admin, 'post', path).send(body).expect(400);
    await client(admin, 'post', path).set('Idempotency-Key', 'short').send(body).expect(400);
    const first = await client(admin, 'post', path).set('Idempotency-Key', key).send(body).expect(201);
    const retry = await client(admin, 'post', path).set('Idempotency-Key', key).send(body).expect(201);
    expect(retry.body).toEqual(first.body);
    expect(await db.paymentRefund.count({ where: { paymentId: captured.payment.id } })).toBe(1);
    for (const extra of [{ amountMinor: '101' }, { reason: 'Different reason' }, { businessDate: '2026-10-15' }, { reference: 'different' }, { shiftId: 'different' }]) {
      await client(admin, 'post', path).set('Idempotency-Key', key).send({ ...body, ...extra }).expect(409);
    }
    const other = await electronicFor((await freshStudent()).studentId, '1000');
    await client(admin, 'post', `/payments/${other.payment.id}/refunds`).set('Idempotency-Key', key).send(body).expect(409);
    await client(admin, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...body, amountMinor: '200' }).expect(201);
    await client(admin, 'post', path).set('Idempotency-Key', key).send(body).expect(201).expect(response => expect(response.body).toEqual(first.body));
    await client(admin, 'post', `/payments/${captured.payment.id}/reverse`).send({ businessDate: '2026-10-14', reason: 'Reverse after partial refunds' }).expect(201);
    await client(admin, 'post', path).set('Idempotency-Key', key).send(body).expect(201).expect(response => expect(response.body).toEqual(first.body));
    expect(await db.refundCommand.count({ where: { schoolId, paymentId: captured.payment.id } })).toBe(2);
  });

  it('rejects unverified manual electronic capture', async () => {
    const student = await freshStudent();
    const quote = await quoteFor(student.studentId, '100');
    for (const extra of [{ electronicVerified: undefined }, { electronicVerified: false }, { electronicVerified: 'true' }, { electronicVerified: 1 }, { electronicVerified: null }, { electronicVerificationNote: undefined }, { electronicVerificationNote: null }, { electronicVerificationNote: '   ' }]) {
      await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(quote, extra)).expect(400);
    }
    expect(await db.payment.count({ where: { schoolId, studentId: student.studentId } })).toBe(0);
    expect((await db.paymentQuote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('OPEN');
    expect(await db.receipt.count({ where: { schoolId, studentId: student.studentId } })).toBe(0);
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(quote, { mode: 'CASH', electronicChannel: undefined, tenderedAmountMinor: '100' })).expect(400);
  });

  it('captures verified electronic money once under concurrent retries and retains staff evidence', async () => {
    const student = await freshStudent();
    const quote = await quoteFor(student.studentId, '1000');
    const key = randomUUID();
    const body = electronicBody(quote, { reference: ' \tVERIFIED-001\n ', electronicVerificationNote: '  Matched school statement entry 001  ' });
    const [first, retry] = await Promise.all([1, 2].map(() => client(accountant, 'post', '/payments').set('Idempotency-Key', key).send(body).expect(201)));
    expect(retry.body).toEqual(first.body);
    expect(first.body.payment).toMatchObject({ status: 'CAPTURED', reference: 'VERIFIED-001', electronicVerifiedBy: accountantId, electronicVerificationNote: 'Matched school statement entry 001' });
    expect(first.body.payment.electronicVerifiedAt).toBe(first.body.payment.capturedAt);
    expect(await db.receipt.count({ where: { schoolId, studentId: student.studentId } })).toBe(1);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { schoolId, entityId: first.body.payment.id, action: 'PAYMENT_CAPTURED' } });
    expect(audit.actorId).toBe(accountantId);
    expect(audit.after).toMatchObject({ payment: { electronicVerifiedBy: accountantId, electronicVerificationNote: 'Matched school statement entry 001' } });
    await client(accountant, 'post', '/payments').set('Idempotency-Key', key).send({ ...body, electronicVerificationNote: 'Different evidence' }).expect(409);
    const otherQuote = await quoteFor((await freshStudent()).studentId, '1000');
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(otherQuote, { reference: '\u00a0VERIFIED-001\t' })).expect(409);
    expect((await db.paymentQuote.findUniqueOrThrow({ where: { id: otherQuote.id } })).status).toBe('OPEN');
    await client(admin, 'post', `/payments/${first.body.payment.id}/reverse`).send({ businessDate: '2026-10-14', reason: 'Reference remains reserved after reversal' }).expect(201);
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(otherQuote, { reference: 'VERIFIED-001' })).expect(409);
    // Channel scopes the identity; the same string in another channel is valid.
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(otherQuote, { reference: 'VERIFIED-001', electronicChannel: 'BANK_TRANSFER' })).expect(201);

    // Bypass the service to prove trim-normalized uniqueness is enforced by SQL.
    const stored = await db.payment.findUniqueOrThrow({ where: { id: first.body.payment.id } });
    await expect(db.payment.create({ data: { ...stored, id: randomUUID(), quoteId: null, idempotencyKey: randomUUID(), reference: '\uFEFF\t VERIFIED-001\n\u3000' } })).rejects.toMatchObject({ code: 'P2002' });
    const foreignSchool = await db.school.create({ data: { name: `Reference scope ${suffix}` } });
    try {
      const foreign = await db.payment.create({ data: { ...stored, id: randomUUID(), schoolId: foreignSchool.id, quoteId: null, idempotencyKey: randomUUID() } });
      expect(foreign.reference).toBe(stored.reference);
    } finally {
      await cleanupFinance(db, foreignSchool.id);
      await db.payment.deleteMany({ where: { schoolId: foreignSchool.id } });
      await db.school.delete({ where: { id: foreignSchool.id } });
    }
  });

  it('deduplicates concurrent electronic references across different students and keys', async () => {
    const students = await Promise.all([freshStudent(), freshStudent()]);
    const quotes = await Promise.all(students.map(student => quoteFor(student.studentId, '1000')));
    const results = await Promise.all(quotes.map((quote, index) => client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(quote, { reference: index ? ' \tRACE-REFERENCE\n' : 'RACE-REFERENCE' }))));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const ids = students.map(student => student.studentId);
    expect(await db.payment.count({ where: { schoolId, studentId: { in: ids } } })).toBe(1);
    expect(await db.receipt.count({ where: { schoolId, studentId: { in: ids } } })).toBe(1);
    expect(await db.feeCredit.count({ where: { schoolId, studentId: { in: ids } } })).toBe(1);
    expect(await db.paymentQuote.count({ where: { id: { in: quotes.map(quote => quote.id) }, status: 'OPEN' } })).toBe(1);
  });

  it('posts a small concurrent refund only once and scopes command keys to actor', async () => {
    const student = await freshStudent();
    const obligation = await db.feeObligation.create({ data: { schoolId, ...student, feeHeadId, periodKey: '2026-04', dueDate: new Date('2026-04-01'), amountMinor: 1000n } });
    const captured = await electronicFor(student.studentId, '1000');
    const key = randomUUID();
    const body = { businessDate: '2026-10-14', amountMinor: '100', reason: 'Concurrent small partial refund' };
    const path = `/payments/${captured.payment.id}/refunds`;
    const [first, retry] = await Promise.all([1, 2].map(() => client(admin, 'post', path).set('Idempotency-Key', key).send(body).expect(201)));
    expect(retry.body).toEqual(first.body);
    expect((await db.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })).paidMinor).toBe(900n);
    for (const count of [db.paymentRefund.count({ where: { paymentId: captured.payment.id } }), db.paymentAllocationRelease.count({ where: { paymentId: captured.payment.id } }), db.paymentEvent.count({ where: { paymentId: captured.payment.id, type: 'REFUND_POSTED' } }), db.receiptEvent.count({ where: { receiptId: captured.receipt.id, type: 'PARTIALLY_REFUNDED' } }), db.auditEvent.count({ where: { entityId: captured.payment.id, action: 'PAYMENT_REFUNDED' } })]) expect(await count).toBe(1);
    const localAdmin = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    const otherAdmin = await db.user.create({ data: { schoolId, name: 'Second refund admin', email: `second-refund-${suffix}@example.test`, role: 'ADMIN', passwordHash: localAdmin.passwordHash, mustChangePassword: false } });
    await client(await login(otherAdmin.email), 'post', path).set('Idempotency-Key', key).send(body).expect(201);
    expect(await db.paymentRefund.count({ where: { paymentId: captured.payment.id } })).toBe(2);
    expect(await db.refundCommand.count({ where: { schoolId, idempotencyKey: key } })).toBe(2);
  });

  it('rejects a concurrent mismatched refund key across payments and rolls back the loser', async () => {
    const payments = await Promise.all([freshStudent(), freshStudent()]).then(async students => {
      // Capture sequentially to keep this race focused on refund commands.
      const result = [];
      for (const student of students) result.push(await electronicFor(student.studentId, '1000'));
      return result;
    });
    const key = randomUUID();
    const body = { businessDate: '2026-10-14', amountMinor: '100', reason: 'Same key different payment race' };
    const results = await Promise.all(payments.map(payment => client(admin, 'post', `/payments/${payment.payment.id}/refunds`).set('Idempotency-Key', key).send(body)));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const ids = payments.map(payment => payment.payment.id);
    expect(await db.paymentRefund.count({ where: { paymentId: { in: ids } } })).toBe(1);
    expect(await db.paymentEvent.count({ where: { paymentId: { in: ids }, type: 'REFUND_POSTED' } })).toBe(1);
    expect((await db.feeCredit.findMany({ where: { sourcePaymentId: { in: ids } } })).map(credit => credit.remainingMinor.toString()).sort()).toEqual(['1000', '900']);
  });

  it('rejects invalid commands, expired/stale quotes, missing CSRF and unauthorized roles', async () => {
    for (const amountMinor of ['0', '-1', '1.5', '9223372036854775808', 100]) {
      await client(accountant, 'post', '/payment-quotes').send({ studentId, amountMinor }).expect(400);
    }
    await client(teacher, 'post', '/payment-quotes').send({ studentId, amountMinor: '100' }).expect(403);
    for (const path of ['/payments', '/receipts', '/cashier-shifts', '/reports/collections']) await client(teacher, 'get', path).expect(403);
    await request(app.getHttpServer()).post('/api/v1/payment-quotes').set('Cookie', accountant.cookie).set('Origin', origin).send({ studentId, amountMinor: '100' }).expect(403);
    const student = await freshStudent();
    const quote = await quoteFor(student.studentId, '100');
    const body = electronicBody(quote);
    await client(accountant, 'post', '/payments').send(body).expect(400);
    for (const extra of [{ payerName: '   ' }, { reference: '' }, { electronicChannel: null }, { currency: 'USD' }, { receivedAmountMinor: 100 }, { businessDate: '2026-02-30' }, { mode: 'CASH', electronicChannel: null, tenderedAmountMinor: '99' }, { mode: 'CHEQUE', electronicChannel: null }, { unexpected: 'field' }]) {
      await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ ...body, ...extra }).expect(400);
    }
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ ...body, quoteVersion: 2 }).expect(409);
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ ...body, businessDate: '2026-12-01' }).expect(409);
    await db.paymentQuote.update({ where: { id: quote.id }, data: { expiresAt: new Date(0) } });
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(body).expect(409);
    const stale = await quoteFor(student.studentId, '100');
    await db.feeObligation.create({ data: { schoolId, ...student, feeHeadId, periodKey: '2026-04', dueDate: new Date('2026-04-01'), amountMinor: 1000n } });
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(stale)).expect(409);
    expect(await db.payment.count({ where: { schoolId, studentId: student.studentId } })).toBe(0);
  });

  it('concurrent quotes cannot over-settle an issue; partial balances and cancellation stay consistent', async () => {
    const student = await freshStudent();
    const issue = await db.storeIssue.create({ data: { schoolId, ...student, issueNumber: randomUUID(), issuedAt: new Date('2026-04-01'), totalMinor: 300n, reason: 'Partial settlement fixture', createdBy: adminId } });
    const quotes = await Promise.all([quoteFor(student.studentId, '200'), quoteFor(student.studentId, '200')]);
    const results = await Promise.all(quotes.map(quote => client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(quote))));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect((await db.storeIssue.findUniqueOrThrow({ where: { id: issue.id } })).paidMinor).toBe(200n);
    await client(admin, 'post', `/store/issues/${issue.id}/cancel`).send({ reason: 'Paid issue cannot be cancelled' }).expect(409);
    const next = await quoteFor(student.studentId, '100');
    expect(next.allocations[0].beforeOutstandingMinor).toBe('100');
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(next)).expect(201);
    expect((await db.storeIssue.findUniqueOrThrow({ where: { id: issue.id } })).status).toBe('PAID');
    await expect(db.storeIssue.update({ where: { id: issue.id }, data: { paidMinor: 301n } })).rejects.toThrow();
  });

  it('atomically releases traced spent advance without reversing a later independent payment', async () => {
    const student = await freshStudent();
    const original = await electronicFor(student.studentId, '2000');
    expect(original.overpaymentCredit.remainingMinor).toBe('2000');
    const sibling = await freshStudent();
    expect((await quoteFor(sibling.studentId, '100')).availableCreditMinor).toBe('0');
    const obligation = await db.feeObligation.create({ data: { schoolId, ...student, feeHeadId, periodKey: '2026-04', dueDate: new Date('2026-04-01'), amountMinor: 1000n } });
    const later = await electronicFor(student.studentId, '100');
    expect(later.creditApplications[0].amountMinor).toBe('1000');
    const correction = { businessDate: '2026-10-14', reason: 'Reverse advance with spent credit' };
    await client(accountant, 'post', `/payments/${original.payment.id}/reverse`).send(correction).expect(403);
    await client(admin, 'post', `/payments/${original.payment.id}/reverse`).send(correction).expect(201);
    expect((await db.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })).creditAppliedMinor).toBe(0n);
    expect((await db.feeCredit.findUniqueOrThrow({ where: { sourcePaymentId: original.payment.id } })).remainingMinor).toBe(0n);
    expect((await db.payment.findUniqueOrThrow({ where: { id: later.payment.id } })).status).toBe('CAPTURED');
    expect((await db.feeCredit.findUniqueOrThrow({ where: { sourcePaymentId: later.payment.id } })).remainingMinor).toBe(100n);
    const release = await db.feeCreditAllocationRelease.findFirstOrThrow({ where: { schoolId, correctionPaymentId: original.payment.id } });
    expect(release.amountMinor).toBe(1000n);
    expect(release.restoredToCredit).toBe(false);
    await client(accountant, 'get', `/students/${student.studentId}/statement`).expect(200).expect(response => { expect(response.body.totals.outstandingMinor).toBe('1000'); expect(response.body.totals.journal.reconciled).toBe(true); });
    await client(admin, 'post', `/payments/${later.payment.id}/reverse`).send(correction).expect(201);
    expect((await db.feeCredit.findUniqueOrThrow({ where: { sourcePaymentId: original.payment.id } })).remainingMinor).toBe(0n);
    expect(await db.feeCreditAllocationRelease.count({ where: { allocationId: release.allocationId } })).toBe(1);
    await client(admin, 'post', `/payments/${original.payment.id}/reverse`).send(correction).expect(409);
  });

  it('bounds concurrent partial refunds and retains immutable receipt snapshots and releases', async () => {
    const student = await freshStudent();
    const obligation = await db.feeObligation.create({ data: { schoolId, ...student, feeHeadId, periodKey: '2026-04', dueDate: new Date('2026-04-01'), amountMinor: 1000n } });
    const captured = await electronicFor(student.studentId, '1000');
    const refund = { businessDate: '2026-10-14', amountMinor: '600', reason: 'Partial electronic refund' };
    await client(accountant, 'post', `/payments/${captured.payment.id}/refunds`).send(refund).expect(403);
    await client(admin, 'post', `/payments/${captured.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ ...refund, reason: '   ' }).expect(400);
    const results = await Promise.all([1, 2].map(() => client(admin, 'post', `/payments/${captured.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send(refund)));
    expect(results.map(result => result.status).sort()).toEqual([201, 400]);
    expect((await db.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })).paidMinor).toBe(400n);
    await client(admin, 'post', `/payments/${captured.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ ...refund, amountMinor: '400' }).expect(201);
    expect((await db.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })).paidMinor).toBe(0n);
    await expect(db.receipt.update({ where: { id: captured.receipt.id }, data: { snapshot: { changed: true } } })).rejects.toThrow();
    await client(accountant, 'get', `/payments/${captured.payment.id}`).expect(200).expect(response => {
      expect(response.body.receipt.snapshot).toEqual(captured.receipt.snapshot);
      expect(response.body.allocations).toHaveLength(1);
      expect(response.body.allocationReleases).toHaveLength(2);
      expect(response.body.refunds).toHaveLength(2);
    });
  });

  it('recalculates pending cheques at clearance and paginates actual receipts rather than pending payments', async () => {
    const student = await freshStudent();
    const obligation = await db.feeObligation.create({ data: { schoolId, ...student, feeHeadId, periodKey: '2026-04', dueDate: new Date('2026-04-01'), amountMinor: 1000n } });
    const quote = await quoteFor(student.studentId, '1000');
    const pending = (await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ quoteId: quote.id, quoteVersion: quote.version, receivedAmountMinor: '1000', businessDate: '2026-10-14', mode: 'CHEQUE', payerName: 'Cheque Payer', chequeBank: 'Test Bank', chequeNumber: '123456', chequeDate: '2026-10-14' }).expect(201)).body;
    await electronicFor(student.studentId, '500');
    await client(accountant, 'get', `/receipts?studentId=${student.studentId}&limit=1`).expect(200).expect(response => { expect(response.body.total).toBe(1); expect(response.body.items).toHaveLength(1); });
    await client(accountant, 'post', '/cashier-shifts').send({ businessDate: '2026-10-16', openingFloatMinor: '0' }).expect(201);
    const cleared = (await client(accountant, 'post', `/payments/${pending.payment.id}/clear-cheque`).send({ businessDate: '2026-10-16', reason: 'Cheque cleared after partial payment' }).expect(201)).body;
    expect(cleared.allocations[0].amountMinor).toBe('500');
    expect(cleared.overpaymentCredit.remainingMinor).toBe('500');
    expect(cleared.receipt.snapshot.payment.captureBusinessDate).toBe('2026-10-16');
    expect((await db.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })).paidMinor).toBe(1000n);
    await client(accountant, 'post', `/payments/${pending.payment.id}/clear-cheque`).send({ businessDate: '2026-10-16', reason: 'Duplicate clear attempt' }).expect(409);
    await client(accountant, 'get', `/receipts?studentId=${student.studentId}&limit=1&page=2`).expect(200).expect(response => { expect(response.body.total).toBe(2); expect(response.body.items).toHaveLength(1); });
    await client(accountant, 'get', '/reports/collections?fromDate=2026-10-16&toDate=2026-10-16&mode=CHEQUE').expect(200).expect(response => expect(response.body.capturedMinor).toBe('1000'));
    await client(admin, 'post', `/payments/${pending.payment.id}/bounce`).send({ businessDate: '2026-10-17', reason: 'Bank returned previously cleared cheque' }).expect(201);
    expect((await db.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } })).paidMinor).toBe(500n);
    await client(accountant, 'get', '/reports/collections?fromDate=2026-10-17&toDate=2026-10-17&mode=CHEQUE').expect(200).expect(response => expect(response.body.netCapturedMinor).toBe('-1000'));
  });

  it('rolls back payment, quote consumption, allocation, credit and audit when receipt issuance fails', async () => {
    const student = await freshStudent();
    const issue = await db.storeIssue.create({ data: { schoolId, ...student, issueNumber: randomUUID(), issuedAt: new Date('2026-04-01'), totalMinor: 300n, reason: 'Atomic rollback fixture', createdBy: adminId } });
    const quote = await quoteFor(student.studentId, '500');
    const sequence = await db.receiptSequence.findUniqueOrThrow({ where: { schoolId } });
    const audits = await db.auditEvent.count({ where: { schoolId } });
    const journalEntries = await db.journalEntry.count({ where: { schoolId } });
    const pdfJobs = await db.receiptPdfJob.count({ where: { schoolId } });
    const body = electronicBody(quote);
    const key = randomUUID();
    // Fail at the final receipt-number allocation, after settlement writes.
    await db.receiptSequence.update({ where: { schoolId }, data: { nextNumber: 2147483647 } });
    try {
      await client(accountant, 'post', '/payments').set('Idempotency-Key', key).send(body).expect(500);
      expect((await db.storeIssue.findUniqueOrThrow({ where: { id: issue.id } })).paidMinor).toBe(0n);
      expect((await db.paymentQuote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe('OPEN');
      expect(await db.payment.count({ where: { schoolId, studentId: student.studentId } })).toBe(0);
      expect(await db.feeCredit.count({ where: { schoolId, studentId: student.studentId } })).toBe(0);
      expect(await db.auditEvent.count({ where: { schoolId } })).toBe(audits);
      expect(await db.journalEntry.count({ where: { schoolId } })).toBe(journalEntries);
      expect(await db.receiptPdfJob.count({ where: { schoolId } })).toBe(pdfJobs);
    } finally {
      await db.receiptSequence.update({ where: { schoolId }, data: { nextNumber: sequence.nextNumber } });
    }
    await client(accountant, 'post', '/payments').set('Idempotency-Key', key).send(body).expect(201);
  });

  it('scopes all financial objects to school and bounces pending cheques without issuing receipts', async () => {
    const foreignSchool = await db.school.create({ data: { name: `Foreign payment school ${suffix}` } });
    const localUser = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    const foreignUser = await db.user.create({ data: { schoolId: foreignSchool.id, role: 'ADMIN', name: 'Foreign Admin', email: `foreign-payments-${suffix}@example.test`, passwordHash: localUser.passwordHash, mustChangePassword: false } });
    try {
      const foreign = await login(foreignUser.email);
      const student = await freshStudent();
      const quote = await quoteFor(student.studentId, '100');
      const captured = await electronicFor(student.studentId, '100');
      await client(foreign, 'post', '/payment-quotes').send({ studentId: student.studentId, amountMinor: '100' }).expect(400);
      await client(foreign, 'get', `/payment-quotes/${quote.id}`).expect(400);
      await client(foreign, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(electronicBody(quote)).expect(400);
      await client(foreign, 'get', `/payments/${captured.payment.id}`).expect(400);
      await client(foreign, 'get', `/receipts/${captured.receipt.id}`).expect(400);
      await client(foreign, 'post', `/receipts/${captured.receipt.id}/print-events`).send({ reason: 'Cross school reprint denied' }).expect(400);
      await client(foreign, 'post', `/payments/${captured.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ amountMinor: '10', reason: 'Cross school refund denied' }).expect(400);
      await client(foreign, 'get', '/receipts').expect(200).expect(response => expect(response.body.total).toBe(0));
      await client(foreign, 'get', '/reports/collections').expect(200).expect(response => expect(response.body.capturedMinor).toBe('0'));
      const pendingQuote = await quoteFor(student.studentId, '100');
      const pending = (await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ quoteId: pendingQuote.id, quoteVersion: 1, receivedAmountMinor: '100', businessDate: '2026-10-14', mode: 'CHEQUE', payerName: 'Pending Cheque Payer', chequeBank: 'Test Bank', chequeNumber: '789123', chequeDate: '2026-10-14' }).expect(201)).body;
      await client(accountant, 'post', `/payments/${pending.payment.id}/bounce`).send({ reason: 'Accountant cannot bounce' }).expect(403);
      const bounced = (await client(admin, 'post', `/payments/${pending.payment.id}/bounce`).send({ reason: 'Cheque rejected before clearance', businessDate: '2026-10-14' }).expect(201)).body;
      expect(bounced.receipt).toBeNull();
      expect(bounced.allocations).toEqual([]);
      expect(bounced.events.find((event: { type: string }) => event.type === 'CHEQUE_BOUNCED').amountMinor).toBe('0');
      await client(accountant, 'post', `/payments/${pending.payment.id}/clear-cheque`).send({ reason: 'Cannot clear bounced cheque', businessDate: '2026-10-14' }).expect(409);
    } finally {
      await db.auditEvent.deleteMany({ where: { schoolId: foreignSchool.id } });
      await db.loginSession.deleteMany({ where: { userId: foreignUser.id } });
      await db.user.delete({ where: { id: foreignUser.id } });
      await db.school.delete({ where: { id: foreignSchool.id } });
    }
  });

  it('serializes cash capture against day close and restricts another cashier closing a shift', async () => {
    const student = await freshStudent();
    const shift = (await client(accountant, 'post', '/cashier-shifts').send({ businessDate: '2026-10-18', openingFloatMinor: '0' }).expect(201)).body;
    const otherShift = (await client(admin, 'post', '/cashier-shifts').send({ businessDate: '2026-10-18', openingFloatMinor: '0' }).expect(201)).body;
    await client(accountant, 'post', `/cashier-shifts/${otherShift.id}/close`).send({ countedCashMinor: '0' }).expect(403);
    const quote = await quoteFor(student.studentId, '100');
    const body = { quoteId: quote.id, quoteVersion: 1, receivedAmountMinor: '100', businessDate: '2026-10-18', mode: 'CASH', tenderedAmountMinor: '500', payerName: 'Cash race guardian' };
    const [payment, close] = await Promise.all([
      client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(body),
      client(accountant, 'post', `/cashier-shifts/${shift.id}/close`).send({ countedCashMinor: '0', reason: 'Race test counted amount' }),
    ]);
    expect(close.status).toBe(201);
    expect([201, 409]).toContain(payment.status);
    const closed = await db.cashierShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(closed.expectedCashMinor).toBe(payment.status === 201 ? 100n : 0n);
    await client(accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(body).expect(409);
    await client(accountant, 'post', `/cashier-shifts/${shift.id}/close`).send({ countedCashMinor: '0' }).expect(409);
  });

  it('keeps paise exact above Number.MAX_SAFE_INTEGER across quotes, receipts, credits and refunds', async () => {
    const student = await freshStudent();
    const amountMinor = '9007199254740993';
    const captured = await electronicFor(student.studentId, amountMinor);
    expect(captured.payment.receivedAmountMinor).toBe(amountMinor);
    expect(captured.receipt.snapshot.payment.receivedAmountMinor).toBe(amountMinor);
    expect(captured.overpaymentCredit.remainingMinor).toBe(amountMinor);
    const refunded = (await client(admin, 'post', `/payments/${captured.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ businessDate: '2026-10-14', amountMinor: '1', reason: 'Exact one paise partial refund' }).expect(201)).body;
    expect(refunded.overpaymentCredit.remainingMinor).toBe('9007199254740992');
    expect(refunded.payment.status).toBe('PARTIALLY_REFUNDED');
    const reversed = (await client(admin, 'post', `/payments/${captured.payment.id}/reverse`).send({ businessDate: '2026-10-14', reason: 'Reverse remaining advance exactly' }).expect(201)).body;
    expect(reversed.overpaymentCredit.remainingMinor).toBe('0');
    expect(reversed.refunds.reduce((sum: bigint, refund: { amountMinor: string }) => sum + BigInt(refund.amountMinor), 0n)).toBe(BigInt(amountMinor));
  });
});
