import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { FinanceFixture } from './finance-fixture';

describe('Level 4 demo financial controls', () => {
  const f = new FinanceFixture();
  beforeAll(() => f.init());
  afterAll(() => f.close());
  beforeEach(async () => {
    const policy = (await f.client(f.admin, 'get', '/finance/policy').expect(200)).body;
    if (policy.receiptPrefix !== 'DEMO/FEE' || policy.receiptScope !== 'SCHOOL' || !policy.allowAdvance || policy.blockPreviousSession || policy.bounceFeeMinor !== '0') await f.policy({ receiptPrefix: 'DEMO/FEE', receiptScope: 'SCHOOL', allowAdvance: true, blockPreviousSession: false, bounceFeeMinor: '0' });
  });

  it('versions demo policy, rejects stale/concurrent edits and preserves immutable versions', async () => {
    const { schoolId, ...policy } = (await f.client(f.accountant, 'get', '/finance/policy').expect(200)).body;
    expect(policy).toMatchObject({ receiptPrefix: 'DEMO/FEE', receiptScope: 'SCHOOL', allowAdvance: true, blockPreviousSession: false, bounceFeeMinor: '0' });
    const body = { ...policy, bounceFeeMinor: '125', reason: 'Configurable synthetic amount' };
    await f.client(f.accountant, 'post', '/finance/policy').send(body).expect(403);
    await f.client(f.teacher, 'get', '/finance/policy').expect(403);
    const results = await Promise.all([f.admin, f.superadmin].map(actor => f.client(actor, 'post', '/finance/policy').send(body)));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const current = (await f.client(f.admin, 'get', '/finance/policy')).body;
    expect(current.version).toBe(policy.version + 1);
    await f.client(f.admin, 'post', '/finance/policy').send({ ...body, receiptPrefix: '../bad' }).expect(400);
    await f.client(f.admin, 'post', '/finance/policy').send({ ...body, version: current.version, bounceFeeMinor: '9223372036854775808' }).expect(400);
    const history = await f.db.financePolicyVersion.findFirstOrThrow({ where: { schoolId: f.schoolId, version: current.version } });
    expect(history.snapshot).toMatchObject({ bounceFeeMinor: '125' });
    await expect(f.db.financePolicyVersion.update({ where: { id: history.id }, data: { reason: 'Rewrite history' } })).rejects.toThrow();
    expect((await f.client(f.foreign, 'get', '/finance/policy')).body.bounceFeeMinor).toBe('0');
  });

  it('selects only owned dues, applies credit oldest-first, and rejects duplicates, stale and foreign IDs', async () => {
    const student = await f.student(); const other = await f.student();
    const oldest = await f.fee(student, 1000n, '2026-04-05'); const newest = await f.fee(student, 1000n, '2026-05-05'); const foreign = await f.fee(other);
    const issue = await f.db.storeIssue.create({ data: { schoolId: f.schoolId, ...student, issueNumber: randomUUID(), issuedAt: new Date('2026-03-01'), totalMinor: 100n, reason: 'Selection fixture', createdBy: f.admin.id } });
    await f.db.feeCredit.create({ data: { schoolId: f.schoolId, studentId: student.studentId, amountMinor: 500n, remainingMinor: 500n, source: 'DEMO', reason: 'Synthetic unapplied grant', createdBy: f.admin.id } });
    for (const selection of [{ obligationIds: [oldest.id, oldest.id] }, { obligationIds: [foreign.id] }, { storeIssueIds: [oldest.id] }, { obligationIds: null }]) await f.client(f.accountant, 'post', '/payment-quotes').send({ studentId: student.studentId, amountMinor: '100', ...selection }).expect(400);
    const quote = await f.quote(student.studentId, '1000', { obligationIds: [newest.id, oldest.id], storeIssueIds: [] });
    expect(quote.allocations.map((line: any) => line.targetId)).toEqual([oldest.id, newest.id]);
    expect(quote.allocations[0]).toMatchObject({ creditAppliedMinor: '500', paymentAllocatedMinor: '500' });
    expect(quote.allocations[1].paymentAllocatedMinor).toBe('500');
    const payment = (await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(f.electronicBody(quote)).expect(201)).body;
    expect((await f.db.storeIssue.findUniqueOrThrow({ where: { id: issue.id } })).paidMinor).toBe(0n);
    expect((await f.statement(student.studentId)).totals).toMatchObject({ outstandingMinor: '600', availableCreditMinor: '0', journal: { reconciled: true } });
    await f.client(f.accountant, 'post', '/payment-quotes').send({ studentId: student.studentId, amountMinor: '1', obligationIds: [oldest.id] }).expect(409);
    const selected = await f.quote(student.studentId, '100', { obligationIds: [newest.id], storeIssueIds: [] });
    await f.client(f.admin, 'post', `/payments/${payment.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ amountMinor: '10', reason: 'Invalidate selected balance', businessDate: f.date }).expect(201);
    await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(f.electronicBody(selected)).expect(409);
    const onlyAdvance = await f.quote(student.studentId, '123', { obligationIds: [], storeIssueIds: [] });
    expect(onlyAdvance.allocations).toEqual([]); expect(onlyAdvance.projectedCreditMinor).toBe('123');
  });

  it('invalidates quoted policy and enforces configurable advance and previous-session rules', async () => {
    const student = await f.student(); const current = await f.fee(student);
    const quote = await f.quote(student.studentId, '100');
    await f.policy({ receiptPrefix: 'DEMO/REVISED' });
    await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(f.electronicBody(quote)).expect(409);
    await f.policy({ allowAdvance: false, blockPreviousSession: true });
    await f.client(f.accountant, 'post', '/payment-quotes').send({ studentId: student.studentId, amountMinor: '1001' }).expect(409);
    const oldSession = await f.db.academicSession.create({ data: { schoolId: f.schoolId, name: `Old ${randomUUID()}`, startDate: new Date('2025-04-01'), endDate: new Date('2026-03-31') } });
    const oldClass = await f.db.classOffering.create({ data: { schoolId: f.schoolId, sessionId: oldSession.id, grade: 'III', section: 'A', capacity: 20 } });
    const oldEnrollment = await f.db.enrollment.create({ data: { schoolId: f.schoolId, studentId: student.studentId, sessionId: oldSession.id, classId: oldClass.id, startDate: new Date('2025-04-01') } });
    const old = await f.fee({ studentId: student.studentId, enrollmentId: oldEnrollment.id }, 500n, '2025-05-05');
    await f.client(f.accountant, 'post', '/payment-quotes').send({ studentId: student.studentId, amountMinor: '100', obligationIds: [current.id], storeIssueIds: [] }).expect(409);
    const allowed = await f.quote(student.studentId, '600', { obligationIds: [current.id, old.id], storeIssueIds: [] });
    expect(allowed.allocations.map((line: any) => line.paymentAllocatedMinor)).toEqual(['500', '100']);
    await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(f.electronicBody(allowed)).expect(201);
    expect((await f.statement(student.studentId)).totals.journal.reconciled).toBe(true);
  });

  it('stales cancelled store selections and allocates an explicit cheque selection at capture', async () => {
    const student = await f.student();
    const issue = await f.db.storeIssue.create({ data: { schoolId: f.schoolId, ...student, issueNumber: randomUUID(), issuedAt: new Date('2026-03-01'), totalMinor: 100n, reason: 'Cancel selected store issue', createdBy: f.admin.id } });
    const stale = await f.quote(student.studentId, '100', { obligationIds: [], storeIssueIds: [issue.id] });
    await f.client(f.admin, 'post', `/store/issues/${issue.id}/cancel`).send({ reason: 'Cancelled after quoted selection' }).expect(201);
    await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send(f.electronicBody(stale)).expect(409);
    expect((await f.statement(student.studentId)).totals.journal.reconciled).toBe(true);
    const excluded = await f.fee(student, 1000n, '2026-04-01'); const selected = await f.fee(student, 500n, '2026-05-01');
    const quote = await f.quote(student.studentId, '500', { obligationIds: [selected.id], storeIssueIds: [] });
    const captured = (await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ quoteId: quote.id, quoteVersion: 1, receivedAmountMinor: '500', businessDate: f.date, mode: 'CHEQUE', payerName: 'Selected cheque guardian' }).expect(201)).body;
    expect(captured.payment.status).toBe('CAPTURED'); expect(captured.allocations[0].targetId).toBe(selected.id); expect(captured.allocations[0].amountMinor).toBe('500');
    expect((await f.db.feeObligation.findUniqueOrThrow({ where: { id: excluded.id } })).paidMinor).toBe(0n);
    expect((await f.statement(student.studentId)).totals.journal.reconciled).toBe(true);
  });

  it('requires a fresh quote when selected dues settle before a manual cheque capture', async () => {
    const student = await f.student();
    const selected = await f.fee(student, 500n, '2026-04-05');
    const pendingQuote = await f.quote(student.studentId, '500', { obligationIds: [selected.id], storeIssueIds: [] });

    await f.capture(student.studentId, '500');
    await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({
      quoteId: pendingQuote.id,
      quoteVersion: pendingQuote.version,
      receivedAmountMinor: '500',
      businessDate: f.date,
      mode: 'CHEQUE',
      payerName: 'Settled selection cheque guardian',
      chequeNumber: randomUUID(),
      chequeBank: 'Demo Bank',
      chequeDate: f.date,
    }).expect(409);
    expect(await f.db.payment.count({ where: { quoteId: pendingQuote.id } })).toBe(0);
    expect((await f.db.paymentQuote.findUniqueOrThrow({ where: { id: pendingQuote.id } })).status).toBe('OPEN');
  });

  it('uses persistent school/FY receipt scopes across policy changes without rewriting originals', async () => {
    const student = await f.student(); const schoolReceipt = (await f.capture(student.studentId)).receipt;
    await f.policy({ receiptScope: 'FINANCIAL_YEAR' });
    const first = (await f.capture(student.studentId)).receipt;
    const second = (await f.capture(student.studentId)).receipt;
    expect(first.receiptNumber).toBe('DEMO/FEE/FY2026-27/000001'); expect(second.receiptNumber).toBe('DEMO/FEE/FY2026-27/000002');
    await f.policy({ receiptScope: 'SCHOOL', receiptPrefix: 'DEMO/ALT' });
    const alternate = (await f.capture(student.studentId)).receipt;
    await f.policy({ receiptScope: 'FINANCIAL_YEAR', receiptPrefix: 'DEMO/FEE' });
    const resumed = (await f.capture(student.studentId)).receipt;
    expect(resumed.receiptNumber).toBe('DEMO/FEE/FY2026-27/000003');
    await f.open(f.accountant, '2027-04-01', '0');
    const nextYear = (await f.capture(student.studentId, '100', { businessDate: '2027-04-01' })).receipt;
    expect(nextYear.receiptNumber).toBe('DEMO/FEE/FY2027-28/000001');
    expect(new Set([schoolReceipt, first, second, alternate, resumed, nextYear].map(row => row.receiptNumber)).size).toBe(6);
    expect((await f.db.receipt.findUniqueOrThrow({ where: { id: schoolReceipt.id } })).snapshot).toEqual(schoolReceipt.snapshot);
    expect(await f.db.receiptPdfJob.count({ where: { schoolId: f.schoolId, receiptId: { in: [first.id, second.id, resumed.id] } } })).toBe(3);
  });

  it('freezes exact correction requests and approves concurrent retries once with full actor/reason evidence', async () => {
    const student = await f.student(); const paid = await f.capture(student.studentId);
    const body = { paymentId: paid.payment.id, type: 'REFUND', amountMinor: '125', reason: 'Guardian requested exactly 125 paise', reference: 'DEMO-REF-125', businessDate: f.date };
    const key = randomUUID();
    await f.client(f.accountant, 'post', '/finance/requests').send(body).expect(400);
    const [first, duplicate] = await Promise.all([1, 2].map(() => f.client(f.accountant, 'post', '/finance/requests').set('Idempotency-Key', key).send(body).expect(201)));
    expect(first.body).toEqual(duplicate.body); expect(first.body.status).toBe('REQUESTED'); expect(first.body.fingerprint).toBeUndefined();
    expect(await f.db.paymentRefund.count({ where: { paymentId: paid.payment.id } })).toBe(0);
    await f.client(f.accountant, 'post', '/finance/requests').set('Idempotency-Key', key).send({ ...body, amountMinor: '126' }).expect(409);
    await expect(f.db.financeRequest.update({ where: { id: first.body.id }, data: { amountMinor: 126n } })).rejects.toThrow();
    const path = `/finance/requests/${first.body.id}/approve`; const decision = { reason: 'Reviewed exact frozen request' };
    await f.client(f.accountant, 'post', path).send(decision).expect(403);
    await f.client(f.foreign, 'post', path).send(decision).expect(400);
    await f.client(f.admin, 'post', path).send({ ...decision, amountMinor: '900' }).expect(400);
    const results = await Promise.all([1, 2].map(() => f.client(f.admin, 'post', path).send(decision).expect(201)));
    expect(results[0].body).toEqual(results[1].body); expect(results[0].body).toMatchObject({ status: 'APPLIED', requestedBy: f.accountant.id, decidedBy: f.admin.id, reason: body.reason, decisionReason: decision.reason });
    const refunds = await f.db.paymentRefund.findMany({ where: { paymentId: paid.payment.id } });
    expect(refunds).toHaveLength(1); expect(refunds[0]).toMatchObject({ amountMinor: 125n, reason: body.reason, reference: body.reference, createdBy: f.admin.id });
    await f.client(f.superadmin, 'post', path).send(decision).expect(201);
    expect(await f.db.receiptPdfJob.count({ where: { receiptId: paid.receipt.id, receiptStatus: 'PARTIALLY_REFUNDED' } })).toBe(1);
    expect((await f.statement(student.studentId)).totals).toMatchObject({ availableCreditMinor: '875', journal: { reconciled: true } });
  });

  it('rejects without money movement and serializes conflicting Admin decisions', async () => {
    const paid = await f.capture((await f.student()).studentId); const row = await f.request(paid.payment.id);
    await f.client(f.admin, 'post', `/finance/requests/${row.id}/reject`).send({ reason: 'Insufficient correction evidence' }).expect(201);
    await f.client(f.admin, 'post', `/finance/requests/${row.id}/reject`).send({ reason: 'Insufficient correction evidence' }).expect(201);
    await f.client(f.admin, 'post', `/finance/requests/${row.id}/approve`).send({ reason: 'Cannot approve a rejection' }).expect(409);
    expect(await f.db.paymentRefund.count({ where: { paymentId: paid.payment.id } })).toBe(0);
    const contested = await f.request(paid.payment.id);
    const results = await Promise.all(['approve', 'reject'].map(action => f.client(f.admin, 'post', `/finance/requests/${contested.id}/${action}`).send({ reason: 'Concurrent Admin decision' })));
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const final = await f.db.financeRequest.findUniqueOrThrow({ where: { id: contested.id } });
    expect(await f.db.paymentRefund.count({ where: { paymentId: paid.payment.id } })).toBe(final.status === 'APPLIED' ? 1 : 0);
  });

  it.each(['refund', 'assessment', 'policy'])('marks approval STALE after intervening %s, without applying a widened correction', async change => {
    const student = await f.student(); const paid = await f.capture(student.studentId, '2000'); const row = await f.request(paid.payment.id);
    if (change === 'refund') await f.client(f.admin, 'post', `/payments/${paid.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ amountMinor: '10', reason: 'Intervening exact refund', businessDate: f.date }).expect(201);
    if (change === 'assessment') await f.client(f.admin, 'post', '/assessments').send({ enrollmentId: student.enrollmentId, periods: ['2026-04'], reason: 'Intervening credit consumption' }).expect(201);
    if (change === 'policy') await f.policy({ bounceFeeMinor: '1' });
    const before = await f.db.paymentRefund.count({ where: { paymentId: paid.payment.id } });
    const path = `/finance/requests/${row.id}/approve`; const decision = { reason: 'Review after financial state changed' };
    await f.client(f.admin, 'post', path).send(decision).expect(201).expect(res => expect(res.body.status).toBe('STALE'));
    await f.client(f.admin, 'post', path).send(decision).expect(201).expect(res => expect(res.body.status).toBe('STALE'));
    expect(await f.db.paymentRefund.count({ where: { paymentId: paid.payment.id } })).toBe(before);
  });

  it('restricts inbox and reports by role/school and validates correction intent', async () => {
    const student = await f.student(); const paid = await f.capture(student.studentId);
    for (const path of ['/finance/requests', '/reports/dues', '/reports/journal', `/students/${student.studentId}/statement`]) await f.client(f.teacher, 'get', path).expect(403);
    for (const extra of [{ type: 'REFUND', amountMinor: undefined }, { type: 'REFUND', amountMinor: '1001' }, { type: 'REVERSE', amountMinor: '1' }, { type: 'BOUNCE', amountMinor: undefined }]) await f.client(f.accountant, 'post', '/finance/requests').set('Idempotency-Key', randomUUID()).send({ paymentId: paid.payment.id, reason: 'Invalid correction intent', businessDate: f.date, ...extra }).expect(extra.type === 'BOUNCE' ? 409 : 400);
    await f.client(f.foreign, 'post', '/finance/requests').set('Idempotency-Key', randomUUID()).send({ paymentId: paid.payment.id, type: 'REVERSE', reason: 'Cross school correction' }).expect(400);
    await f.client(f.foreign, 'get', `/students/${student.studentId}/statement`).expect(400);
    for (const path of ['/finance/requests', '/reports/dues', '/reports/journal']) await f.client(f.foreign, 'get', path).expect(200).expect(res => expect(res.body.total).toBe(0));
    await f.client(f.accountant, 'get', '/finance/requests?status=REQUESTED&limit=1').expect(200).expect(res => { expect(res.body.items.length).toBeLessThanOrEqual(1); expect(res.body.limit).toBe(1); });
  });
});
