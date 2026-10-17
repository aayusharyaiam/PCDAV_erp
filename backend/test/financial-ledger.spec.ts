import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { FinanceFixture } from './finance-fixture';

describe('Balanced journal, assessment lineage and financial reports', () => {
  const f = new FinanceFixture();
  beforeAll(() => f.init());
  afterAll(() => f.close());

  it('partially refunds and reverses assessment-consumed advance through persistent traced releases', async () => {
    const student = await f.student(); const paid = await f.capture(student.studentId, '2000');
    await f.client(f.admin, 'post', '/assessments').send({ enrollmentId: student.enrollmentId, periods: ['2026-04', '2026-05'], reason: 'Use advance on later assessment' }).expect(201);
    const before = await f.statement(student.studentId);
    expect(before.totals).toMatchObject({ outstandingMinor: '0', availableCreditMinor: '0', journal: { reconciled: true } });
    expect(before.credits[0].allocations).toHaveLength(2);
    expect(before.fees.every((fee: any) => fee.untracedCreditAppliedMinor === '0')).toBe(true);
    const key = randomUUID(); const path = `/payments/${paid.payment.id}/refunds`;
    const body = { amountMinor: '600', reason: 'Refund traced assessment use', businessDate: f.date };
    const [first, duplicate] = await Promise.all([1, 2].map(() => f.client(f.admin, 'post', path).set('Idempotency-Key', key).send(body).expect(201)));
    expect(duplicate.body).toEqual(first.body);
    expect((await f.statement(student.studentId)).totals).toMatchObject({ outstandingMinor: '600', availableCreditMinor: '0', journal: { reconciled: true } });
    await f.client(f.admin, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...body, amountMinor: '100' }).expect(201);
    const row = await f.request(paid.payment.id, { type: 'REVERSE', amountMinor: undefined });
    const decision = { reason: 'Authorize exact remaining traced advance reversal' };
    await Promise.all([1, 2].map(() => f.client(f.admin, 'post', `/finance/requests/${row.id}/approve`).send(decision).expect(201)));
    const statement = await f.statement(student.studentId);
    expect(statement.totals).toMatchObject({ outstandingMinor: '2000', availableCreditMinor: '0', refundedMinor: '2000', journal: { reconciled: true } });
    expect(statement.credits[0].allocations.every((item: any) => item.activeMinor === '0')).toBe(true);
    expect(statement.credits[0].allocations.reduce((sum: bigint, item: any) => sum + BigInt(item.releasedMinor), 0n)).toBe(2000n);
    expect(statement.payments[0].tracedCreditReleases).toHaveLength(4);
    expect((await f.db.receipt.findUniqueOrThrow({ where: { id: paid.receipt.id } })).snapshot).toEqual(paid.receipt.snapshot);
    expect(await f.db.receiptPdfJob.count({ where: { receiptId: paid.receipt.id, receiptStatus: 'VOID' } })).toBe(1);
  });

  it('keeps a partially paid obligation as PAID after credit settles its remainder', async () => {
    const student = await f.student();
    const obligation = await f.fee(student, 1000n);
    await f.capture(student.studentId, '400');

    await f.client(f.admin, 'post', '/credits').send({ studentId: student.studentId, amountMinor: '600', source: 'ADJUSTMENT', reason: 'Synthetic remainder settlement' }).expect(201);

    const settled = await f.db.feeObligation.findUniqueOrThrow({ where: { id: obligation.id } });
    expect(settled).toMatchObject({ paidMinor: 400n, creditAppliedMinor: 600n, status: 'PAID' });
    expect((await f.statement(student.studentId)).totals.journal.reconciled).toBe(true);
  });

  it('bounds concurrent refunds of consumed advance and never credits a sibling', async () => {
    const student = await f.student(); const sibling = await f.student(); const paid = await f.capture(student.studentId, '2000');
    await f.client(f.admin, 'post', '/assessments').send({ enrollmentId: student.enrollmentId, periods: ['2026-04', '2026-05'], reason: 'Consume advance before refund race' }).expect(201);
    const results = await Promise.all([1, 2].map(() => f.client(f.admin, 'post', `/payments/${paid.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ amountMinor: '1200', reason: 'Concurrent consumed advance refund', businessDate: f.date })));
    expect(results.map(result => result.status).sort()).toEqual([201, 400]);
    expect((await f.statement(student.studentId)).totals).toMatchObject({ outstandingMinor: '1200', availableCreditMinor: '0', journal: { reconciled: true } });
    expect((await f.statement(sibling.studentId)).totals).toMatchObject({ outstandingMinor: '0', availableCreditMinor: '0', journal: { reconciled: true } });
    const allocations = await f.db.feeCreditAllocation.findMany({ where: { schoolId: f.schoolId, studentId: student.studentId } });
    const active = await f.db.feeCreditAllocationRelease.aggregate({ where: { allocationId: { in: allocations.map(item => item.id) } }, _sum: { amountMinor: true } });
    expect(active._sum.amountMinor).toBe(1200n);
  });

  it('serializes assessment credit use against refund and reaches the same restored dues', async () => {
    const student = await f.student(); const paid = await f.capture(student.studentId, '1000');
    const results = await Promise.all([
      f.client(f.admin, 'post', '/assessments').send({ enrollmentId: student.enrollmentId, periods: ['2026-04'], reason: 'Assessment racing advance withdrawal' }),
      f.client(f.admin, 'post', `/payments/${paid.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ amountMinor: '1000', reason: 'Refund racing assessment', businessDate: f.date }),
    ]);
    expect(results.map(result => result.status)).toEqual([201, 201]);
    expect((await f.statement(student.studentId)).totals).toMatchObject({ outstandingMinor: '1000', availableCreditMinor: '0', journal: { reconciled: true } });
  });

  it('retains untraced historical-use refusal and rolls back a partial withdrawal rather than inventing lineage', async () => {
    const student = await f.student(); const paid = await f.capture(student.studentId, '1000'); const obligation = await f.fee(student, 500n);
    // Synthetic pre-lineage history: only balances survived, with no allocation
    // evidence. The migration must not guess which old advance funded which fee.
    await f.db.atomic(async tx => {
      await tx.feeCredit.update({ where: { sourcePaymentId: paid.payment.id }, data: { remainingMinor: 500n } });
      await tx.feeObligation.update({ where: { id: obligation.id }, data: { creditAppliedMinor: 500n, status: 'PAID_BY_CREDIT' } });
    });
    await f.client(f.admin, 'post', `/payments/${paid.payment.id}/reverse`).send({ reason: 'Missing evidenced historical allocation', businessDate: f.date }).expect(409);
    expect((await f.db.feeCredit.findUniqueOrThrow({ where: { sourcePaymentId: paid.payment.id } })).remainingMinor).toBe(500n);
    expect(await f.db.paymentRefund.count({ where: { paymentId: paid.payment.id } })).toBe(0);
    const statement = await f.statement(student.studentId);
    expect(statement.fees[0].untracedCreditAppliedMinor).toBe('500');
    expect(statement.totals.journal.reconciled).toBe(true);
  });

  it('assesses configured demo bounce fees once for an immediately recorded cheque under approval retries', async () => {
    await f.policy({ bounceFeeMinor: '250' });
    const student = await f.student(); const recorded = await f.cheque(student.studentId);
    const row = await f.request(recorded.payment.id, { type: 'BOUNCE', amountMinor: undefined, reference: 'BANK-RETURN-TEST' });
    const path = `/finance/requests/${row.id}/approve`; const body = { reason: 'Confirm exact cheque bounce' };
    await Promise.all([1, 2].map(() => f.client(f.admin, 'post', path).send(body).expect(201)));
    await f.client(f.admin, 'post', `/payments/${recorded.payment.id}/bounce`).send({ businessDate: f.date, reason: 'Duplicate bounce cannot charge twice' }).expect(409);
    const fees = await f.db.feeObligation.findMany({ where: { bouncePaymentId: recorded.payment.id } });
    expect(fees).toHaveLength(1); expect(fees[0].amountMinor).toBe(250n);
    const statement = await f.statement(student.studentId);
    expect(statement.payments[0].events.find((event: any) => event.type === 'CHEQUE_BOUNCED').metadata.reference).toBe('BANK-RETURN-TEST');
    expect(statement.totals).toMatchObject({ outstandingMinor: '250', availableCreditMinor: '0', pendingChequeMinor: '0', journal: { reconciled: true } });
    expect(statement.payments[0].receipt.status).toBe('VOID');
    const report = (await f.client(f.admin, 'get', `/reports/journal?studentId=${student.studentId}&limit=1`).expect(200)).body;
    expect(report.totals.balanced).toBe(true); expect(report.total).toBeGreaterThanOrEqual(1);
    await f.policy({ bounceFeeMinor: '0' });
  });

  it('reports filtered full-set dues totals and labels due-date cutoff against current balances honestly', async () => {
    const student = await f.student(); const other = await f.student();
    await f.fee(student, 1000n, '2026-04-05'); await f.fee(student, 2000n, '2026-05-05'); await f.fee(student, 3000n, '2027-01-05'); await f.fee(other, 5000n, '2026-04-05');
    const issue = await f.db.storeIssue.create({ data: { schoolId: f.schoolId, ...student, issueNumber: randomUUID(), issuedAt: new Date('2026-04-01'), totalMinor: 400n, reason: 'Filtered store due', createdBy: f.admin.id } });
    const path = `/reports/dues?studentId=${student.studentId}&sessionId=${f.sessionId}&classId=${f.classId}&asOf=2026-06-01&limit=1`;
    const first = (await f.client(f.accountant, 'get', path).expect(200)).body;
    expect(first.total).toBe(3); expect(first.items).toHaveLength(1); expect(first.items[0].sourceId).toBe(issue.id);
    expect(first.totals).toMatchObject({ assessedMinor: '3400', outstandingMinor: '3400', overdueMinor: '3400' });
    expect(first.basis).toBe('CURRENT_BALANCES_WITH_DUE_DATE_CUTOFF_NOT_HISTORICAL');
    const second = (await f.client(f.accountant, 'get', `${path}&page=2`).expect(200)).body;
    expect(second.totals).toEqual(first.totals); expect(second.items[0].sourceType).toBe('FEE');
    await f.client(f.accountant, 'get', `${path}&feeHeadId=${f.feeHeadId}`).expect(200).expect(res => { expect(res.body.total).toBe(2); expect(res.body.totals.outstandingMinor).toBe('3000'); });
    await f.capture(student.studentId, '1400');
    await f.client(f.accountant, 'get', path).expect(200).expect(res => { expect(res.body.total).toBe(1); expect(res.body.totals.outstandingMinor).toBe('2000'); });
    expect((await f.statement(student.studentId)).totals).toMatchObject({ outstandingMinor: '5000', journal: { reconciled: true } });
    await f.client(f.accountant, 'get', `${path}&page=99`).expect(200).expect(res => { expect(res.body.items).toEqual([]); expect(res.body.totals.outstandingMinor).toBe('2000'); });
    await f.client(f.accountant, 'get', '/reports/dues?asOf=2026-02-30').expect(400);
    await f.client(f.accountant, 'get', '/reports/journal?fromDate=2026-12-01&toDate=2026-01-01').expect(400);
  });

  it('reports immediately recorded manual methods and correction event dates by original cashier', async () => {
    const student = await f.student(); const paid = await f.capture(student.studentId, '1000');
    await f.cheque(student.studentId, '250');
    const row = await f.request(paid.payment.id, { amountMinor: '125', businessDate: '2026-10-28' });
    await f.client(f.superadmin, 'post', `/finance/requests/${row.id}/approve`).send({ reason: 'Later dated approved refund' }).expect(201);
    expect((await f.statement(student.studentId)).totals).toMatchObject({ pendingChequeMinor: '0', availableCreditMinor: '1125', refundedMinor: '125', journal: { reconciled: true } });
    const path = `/reports/collections?fromDate=2026-10-28&toDate=2026-10-28&mode=UPI&cashierId=${f.accountant.id}`;
    await f.client(f.accountant, 'get', path).expect(200).expect(res => { expect(res.body.basis).toBe('EVENT_BUSINESS_DATE'); expect(res.body.refundedMinor).toBe('125'); expect(res.body.netCapturedMinor).toBe('-125'); expect(res.body.cashierBasis).toBe('ORIGINAL_COLLECTOR'); });
    await f.client(f.accountant, 'get', `/reports/collections?fromDate=2026-10-28&toDate=2026-10-28&cashierId=${f.admin.id}`).expect(200).expect(res => expect(res.body.refundedMinor).toBe('0'));
    const journal = (await f.client(f.admin, 'get', `/reports/journal?fromDate=2026-10-28&toDate=2026-10-28&studentId=${student.studentId}&limit=1`).expect(200)).body;
    expect(journal.totals).toEqual({ debitMinor: '125', creditMinor: '125', balanced: true });
    expect(journal.items[0].sourceType).toBe('PAYMENT_REFUND_OR_REVERSAL');
  });

  it('enforces nonempty balanced journals at COMMIT and rejects alteration, deletion and later balanced appends', async () => {
    const data = { schoolId: f.schoolId, businessDate: new Date(f.date), sourceType: 'TEST', sourceId: randomUUID(), description: 'Synthetic journal invariant' };
    const count = await f.db.journalEntry.count({ where: { schoolId: f.schoolId } });
    let reachedEnd = false;
    await expect(f.db.atomic(async tx => { await tx.journalEntry.create({ data }); reachedEnd = true; })).rejects.toThrow();
    expect(reachedEnd).toBe(true); // failure is deferred until transaction commit
    await expect(f.db.atomic(async tx => {
      const entry = await tx.journalEntry.create({ data });
      await tx.journalLine.createMany({ data: [
        { schoolId: f.schoolId, entryId: entry.id, account: 'CASH', debitMinor: 10n },
        { schoolId: f.schoolId, entryId: entry.id, account: 'TEST', creditMinor: 9n },
      ] });
    })).rejects.toThrow();
    expect(await f.db.journalEntry.count({ where: { schoolId: f.schoolId } })).toBe(count);
    const valid = await f.db.atomic(async tx => tx.journalEntry.create({ data: { ...data, lines: { create: [{ account: 'TEST_DEBIT', debitMinor: 10n }, { account: 'TEST_CREDIT', creditMinor: 10n }] } }, include: { lines: true } }));
    await expect(f.db.journalEntry.update({ where: { id: valid.id }, data: { description: 'Rewrite posted history' } })).rejects.toThrow();
    await expect(f.db.journalLine.update({ where: { id: valid.lines[0].id }, data: { account: 'ALTERED' } })).rejects.toThrow();
    await expect(f.db.journalLine.delete({ where: { id: valid.lines[0].id } })).rejects.toThrow();
    await expect(f.db.journalLine.createMany({ data: [{ schoolId: f.schoolId, entryId: valid.id, account: 'APPEND_D', debitMinor: 1n }, { schoolId: f.schoolId, entryId: valid.id, account: 'APPEND_C', creditMinor: 1n }] })).rejects.toThrow();
    await f.client(f.accountant, 'get', '/reports/journal?limit=1').expect(200).expect(res => { expect(res.body.totals.balanced).toBe(true); expect(res.body.total).toBeGreaterThan(1); expect(res.body.items).toHaveLength(1); });
  });

  it('keeps posted payment, refund, and allocation lineage append-only', async () => {
    const student = await f.student();
    const advance = await f.capture(student.studentId, '500');
    await f.fee(student, 1000n);
    const paid = await f.capture(student.studentId, '500');
    await f.client(f.admin, 'post', `/payments/${paid.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ amountMinor: '100', reason: 'Create immutable payment lineage', businessDate: f.date }).expect(201);
    await f.client(f.admin, 'post', `/payments/${paid.payment.id}/reverse`).send({ reason: 'Restore the original advance on reversal', businessDate: f.date }).expect(201);

    const before = await f.statement(student.studentId);
    expect(before.totals).toMatchObject({ outstandingMinor: '1000', availableCreditMinor: '500', refundedMinor: '500', journal: { reconciled: true } });
    expect(before.credits.find((credit: any) => credit.sourcePaymentId === advance.payment.id).remainingMinor).toBe('500');
    // Exercise both operations on all protected tables with actual capture and
    // correction evidence, then verify the statement and journal did not change.
    for (const model of [f.db.paymentAllocation, f.db.paymentAllocationRelease, f.db.paymentCreditApplication, f.db.paymentCreditRelease, f.db.paymentRefund, f.db.paymentEvent]) {
      const row = await (model.findFirstOrThrow as Function)({ where: { paymentId: paid.payment.id } });
      await expect((model.update as Function)({ where: { id: row.id }, data: { amountMinor: 1n } })).rejects.toThrow('Posted financial history is immutable');
      await expect((model.delete as Function)({ where: { id: row.id } })).rejects.toThrow('Posted financial history is immutable');
    }
    const command = await f.db.refundCommand.findFirstOrThrow({ where: { paymentId: paid.payment.id } });
    await expect(f.db.refundCommand.update({ where: { id: command.id }, data: { requestHash: 'tampered' } })).rejects.toThrow('Posted financial history is immutable');
    await expect(f.db.refundCommand.delete({ where: { id: command.id } })).rejects.toThrow('Posted financial history is immutable');
    expect(await f.statement(student.studentId)).toEqual(before);
  });
});
