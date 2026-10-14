import 'reflect-metadata';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Db } from '../src/db';

// pg is the installed embedded-postgres driver's dependency. Simple-query mode
// is used here because a reviewed migration contains multiple SQL statements.
const { Client } = require('pg') as { Client: new (options: { connectionString: string }) => { connect(): Promise<void>; query(sql: string): Promise<unknown>; end(): Promise<void> } };

describe('Financial migration cutover', () => {
  const schema = `finance_upgrade_${randomUUID().replace(/-/g, '')}`;
  const freshSchema = `finance_fresh_${randomUUID().replace(/-/g, '')}`;
  let db: Db;
  let pg: InstanceType<typeof Client>;
  let originalSnapshot: any;
  let schoolId: string; let studentId: string; let paymentId: string; let refundId: string;
  let legacyRefundMutationSucceeded = false;
  const migrationsPath = join(__dirname, '../prisma/migrations');

  async function apply(names: string[]) {
    for (const name of names) {
      await pg.query('BEGIN');
      try { await pg.query(readFileSync(join(migrationsPath, name, 'migration.sql'), 'utf8')); await pg.query('COMMIT'); }
      catch (error) { await pg.query('ROLLBACK'); throw error; }
    }
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Migration rehearsal requires disposable local PostgreSQL');
    url.searchParams.delete('schema');
    pg = new Client({ connectionString: url.toString() }); await pg.connect();
    await pg.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`);
    const names = readdirSync(migrationsPath).filter(name => /^\d/.test(name)).sort();
    await apply(names.filter(name => name < '20261013120000'));
    url.searchParams.set('schema', schema); db = new Db({ datasources: { db: { url: url.toString() } } });
    schoolId = (await db.school.create({ data: { name: 'Synthetic pre-journal school' } })).id;
    await db.user.create({ data: { id: 'HISTORICAL', schoolId, name: 'Historical synthetic actor', email: 'historical@example.test', passwordHash: 'test-only', role: 'ADMIN' } });
    const session = await db.academicSession.create({ data: { schoolId, name: '2026-27', startDate: new Date('2026-04-01'), endDate: new Date('2027-03-31') } });
    const classroom = await db.classOffering.create({ data: { schoolId, sessionId: session.id, grade: 'V', section: 'A', capacity: 10 } });
    const family = await db.family.create({ data: { schoolId, label: 'Historical fixture family' } });
    studentId = (await db.student.create({ data: { schoolId, familyId: family.id, admissionNumber: 'OLD-001', name: 'Historical synthetic student', dateOfBirth: new Date('2015-01-01'), gender: 'BOY', admissionDate: new Date('2026-04-01') } })).id;
    const enrollment = await db.enrollment.create({ data: { schoolId, studentId, sessionId: session.id, classId: classroom.id, startDate: new Date('2026-04-01') } });
    const head = await db.feeHead.create({ data: { schoolId, code: 'OLD', name: 'Historical demo fee', category: 'MONTHLY' } });
    const fee = await db.feeObligation.create({ data: { schoolId, studentId, enrollmentId: enrollment.id, feeHeadId: head.id, periodKey: '2026-04', dueDate: new Date('2026-04-05'), amountMinor: 2000n, creditAppliedMinor: 800n, paidMinor: 500n }, select: { id: true } });
    const issue = await db.storeIssue.create({ data: { schoolId, studentId, enrollmentId: enrollment.id, issueNumber: 'OLD-STORE-1', issuedAt: new Date('2026-04-01'), totalMinor: 300n, paidMinor: 100n, reason: 'Existing store balance', createdBy: 'HISTORICAL' } });
    const shift = await db.cashierShift.create({ data: { schoolId, cashierId: 'HISTORICAL', businessDate: new Date('2026-04-01'), openingFloatMinor: 50n } });
    const payment = await db.payment.create({ data: { schoolId, studentId, cashierId: 'HISTORICAL', shiftId: shift.id, idempotencyKey: 'historical-payment', requestHash: 'historical', businessDate: new Date('2026-04-01'), mode: 'CASH', status: 'PARTIALLY_REFUNDED', receivedAmountMinor: 1600n, tenderedAmountMinor: 1600n, payerName: 'Historical guardian', capturedAt: new Date('2026-04-01'), captureBusinessDate: new Date('2026-04-01'), captureShiftId: shift.id } });
    paymentId = payment.id;
    await db.paymentAllocation.createMany({ data: [{ schoolId, paymentId, targetType: 'FEE', targetId: fee.id, amountMinor: 500n }, { schoolId, paymentId, targetType: 'STORE', targetId: issue.id, amountMinor: 100n }] });
    const credit = await db.feeCredit.create({ data: { schoolId, studentId, amountMinor: 1000n, remainingMinor: 300n, source: 'PAYMENT_OVERPAYMENT', sourcePaymentId: paymentId, reason: 'Existing advance after 100 paise refunded', createdBy: 'HISTORICAL' } });
    refundId = (await db.paymentRefund.create({ data: { schoolId, paymentId, shiftId: shift.id, businessDate: new Date('2026-04-01'), amountMinor: 100n, reason: 'Historical unused advance refund', createdBy: 'HISTORICAL' } })).id;
    const grant = await db.feeCredit.create({ data: { schoolId, studentId, amountMinor: 200n, remainingMinor: 0n, source: 'ADJUSTMENT', reason: 'Existing used grant', createdBy: 'HISTORICAL' } });
    await db.paymentCreditApplication.create({ data: { schoolId, paymentId, creditId: grant.id, targetId: fee.id, amountMinor: 200n } });
    await db.auditEvent.create({ data: { schoolId, actorId: 'HISTORICAL', action: 'FEE_CREDIT_ALLOCATED', entityType: 'FeeObligation', entityId: fee.id, reason: 'Actual pre-lineage assessment evidence', after: { creditId: credit.id, studentId, amountMinor: '600' } } });
    originalSnapshot = { receiptNumber: 'LEGACY/1', student: { id: studentId, name: 'Original name' }, payment: { id: paymentId, receivedAmountMinor: '1600' } };
    await db.receipt.create({ data: { schoolId, studentId, paymentId, receiptNumber: 'LEGACY/1', snapshot: originalSnapshot } });
    await apply(names.filter(name => name >= '20261013120000' && name < '20261014100000'));
    // Reproduce the pre-fix gap without corrupting the cutover fixture: the
    // operational refund could be rewritten/deleted after its opening was posted.
    const rollback = new Error('Rollback pre-guard mutation probe');
    try {
      await db.$transaction(async tx => {
        await tx.paymentRefund.update({ where: { id: refundId }, data: { amountMinor: 1n } });
        await tx.paymentRefund.delete({ where: { id: refundId } });
        legacyRefundMutationSucceeded = true;
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    await apply(names.filter(name => name >= '20261014100000'));
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (pg) { await pg.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE; DROP SCHEMA IF EXISTS "${freshSchema}" CASCADE`); await pg.end(); }
  });

  it('uses explicit current-balance openings and recovers only evidenced allocation lineage', async () => {
    const entries = await db.journalEntry.findMany({ where: { schoolId }, include: { lines: true } });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => entry.sourceType.startsWith('OPENING_'))).toBe(true);
    for (const entry of entries) expect(entry.lines.reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n)).toBe(0n);
    const account = (name: string) => entries.flatMap(entry => entry.lines).filter(line => line.account === name).reduce((sum, line) => sum + line.debitMinor - line.creditMinor, 0n);
    expect(account('FEE_RECEIVABLE')).toBe(700n); expect(account('STORE_RECEIVABLE')).toBe(200n);
    expect(account('STUDENT_CREDIT')).toBe(-300n); expect(account('CASH')).toBe(1550n);
    const lineage = await db.feeCreditAllocation.findMany({ where: { schoolId, studentId }, orderBy: { amountMinor: 'asc' } });
    expect(lineage.map(item => [item.source, item.amountMinor.toString()])).toEqual([['PAYMENT', '200'], ['ASSESSMENT_AUDIT', '600']]);
    expect((await db.receipt.findUniqueOrThrow({ where: { paymentId } })).snapshot).toEqual(originalSnapshot);
    expect(await db.receiptPdfJob.count({ where: { schoolId, status: 'PENDING', receiptStatus: 'ISSUED' } })).toBe(1);
    expect(await db.financePolicy.findUniqueOrThrow({ where: { schoolId } })).toMatchObject({ version: 1, receiptPrefix: 'DEMO/FEE', bounceFeeMinor: 0n });
  });

  it('closes the demonstrated historical refund rewrite/delete gap without changing openings', async () => {
    expect(legacyRefundMutationSucceeded).toBe(true);
    const before = await db.journalEntry.findMany({ where: { schoolId }, include: { lines: true }, orderBy: { id: 'asc' } });
    await expect(db.paymentRefund.update({ where: { id: refundId }, data: { amountMinor: 1n } })).rejects.toThrow('Posted financial history is immutable');
    await expect(db.paymentRefund.delete({ where: { id: refundId } })).rejects.toThrow('Posted financial history is immutable');
    expect((await db.paymentRefund.findUniqueOrThrow({ where: { id: refundId } })).amountMinor).toBe(100n);
    expect(await db.journalEntry.findMany({ where: { schoolId }, include: { lines: true }, orderBy: { id: 'asc' } })).toEqual(before);
  });

  it('deploys the entire migration chain to a fresh schema and replays deploy without changes', () => {
    const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('schema', freshSchema);
    const run = () => execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { cwd: join(__dirname, '..'), env: { ...process.env, DATABASE_URL: url.toString() }, encoding: 'utf8', timeout: 120000 });
    expect(run()).toContain('All migrations have been successfully applied');
    expect(run()).toContain('No pending migrations to apply');
  }, 240000);
});
