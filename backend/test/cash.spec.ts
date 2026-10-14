import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { FinanceFixture } from './finance-fixture';

describe('Durable cash movements and close reconciliation', () => {
  const f = new FinanceFixture();
  beforeAll(() => f.init());
  afterAll(() => f.close());
  const movement = { type: 'DEPOSIT', amountMinor: '300', reason: 'Demo bank deposit', reference: 'DEPOSIT-SLIP-001' };

  it('posts deposits, handovers and Admin expenses exactly once and retains totals after close', async () => {
    const date = '2026-10-21'; const shift = await f.open(f.accountant, date, '1000');
    const student = await f.student(); const quote = await f.quote(student.studentId, '500');
    const paid = (await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ quoteId: quote.id, quoteVersion: 1, receivedAmountMinor: '500', tenderedAmountMinor: '1000', businessDate: date, mode: 'CASH', payerName: 'Cash guardian' }).expect(201)).body;
    const path = `/cashier-shifts/${shift.id}/movements`; const key = randomUUID();
    await f.client(f.accountant, 'post', path).send(movement).expect(400);
    await f.client(f.accountant, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...movement, reference: '  ' }).expect(400);
    const [first, retry] = await Promise.all([1, 2].map(() => f.client(f.accountant, 'post', path).set('Idempotency-Key', key).send(movement).expect(201)));
    expect(first.body).toEqual(retry.body); expect(first.body.requestHash).toBeUndefined();
    await f.client(f.accountant, 'post', path).set('Idempotency-Key', key).send({ ...movement, amountMinor: '301' }).expect(409);
    await f.client(f.accountant, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...movement, type: 'HANDOVER', amountMinor: '200', reference: 'HANDOVER-001' }).expect(201);
    await f.client(f.accountant, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...movement, type: 'EXPENSE', amountMinor: '50' }).expect(403);
    await f.client(f.admin, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...movement, type: 'EXPENSE', amountMinor: '50', reference: 'EXPENSE-VOUCHER-001' }).expect(201);
    await f.client(f.admin, 'post', `/payments/${paid.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ businessDate: date, amountMinor: '100', reason: 'Cash refund before close' }).expect(201);
    await f.client(f.accountant, 'get', path).expect(200).expect(res => expect(res.body.items).toHaveLength(3));
    const totals = { cashReceivedMinor: '500', cashRefundedMinor: '100', cashMovedMinor: '550', expectedCashMinor: '850' };
    await f.client(f.accountant, 'get', `/cashier-shifts?businessDate=${date}`).expect(200).expect(res => expect(res.body.items[0]).toMatchObject(totals));
    await f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/close`).send({ countedCashMinor: '850' }).expect(201).expect(res => expect(res.body).toMatchObject({ ...totals, varianceMinor: '0' }));
    await f.client(f.accountant, 'post', path).set('Idempotency-Key', key).send(movement).expect(201).expect(res => expect(res.body).toEqual(first.body));
    await f.client(f.admin, 'post', path).set('Idempotency-Key', randomUUID()).send(movement).expect(409);
    expect(await f.db.journalEntry.count({ where: { schoolId: f.schoolId, sourceType: { in: ['CASH_DEPOSIT', 'CASH_HANDOVER', 'CASH_EXPENSE'] }, sourceId: { in: (await f.db.cashMovement.findMany({ where: { shiftId: shift.id } })).map(item => item.id) } } })).toBe(3);
  });

  it('enforces cash ownership, school, roles and no-overdraw under concurrent different keys', async () => {
    const shift = await f.open(f.accountant, '2026-10-22', '1000'); const path = `/cashier-shifts/${shift.id}/movements`;
    await f.client(f.otherCashier, 'post', path).set('Idempotency-Key', randomUUID()).send(movement).expect(403);
    await f.client(f.foreign, 'post', path).set('Idempotency-Key', randomUUID()).send(movement).expect(400);
    await f.client(f.foreign, 'get', path).expect(400);
    await f.client(f.teacher, 'get', path).expect(403);
    await f.client(f.teacher, 'post', path).set('Idempotency-Key', randomUUID()).send(movement).expect(403);
    await f.client(f.accountant, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...movement, amountMinor: '1001' }).expect(409);
    const results = await Promise.all([1, 2].map(() => f.client(f.accountant, 'post', path).set('Idempotency-Key', randomUUID()).send({ ...movement, amountMinor: '700' })));
    expect(results.map(res => res.status).sort()).toEqual([201, 409]);
    await f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/close`).send({ countedCashMinor: '300' }).expect(201).expect(res => expect(res.body.cashMovedMinor).toBe('700'));
    const posted = await f.db.cashMovement.findFirstOrThrow({ where: { shiftId: shift.id } });
    await expect(f.db.cashMovement.update({ where: { id: posted.id }, data: { amountMinor: 1n } })).rejects.toThrow();
  });

  it('serializes a movement against closing so frozen totals reflect precisely the committed outflow', async () => {
    const shift = await f.open(f.accountant, '2026-10-23', '1000');
    const [move, close] = await Promise.all([
      f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/movements`).set('Idempotency-Key', randomUUID()).send(movement),
      f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/close`).send({ countedCashMinor: '1000', reason: 'Synthetic close race count' }),
    ]);
    expect(close.status).toBe(201); expect([201, 409]).toContain(move.status);
    const stored = await f.db.cashierShift.findUniqueOrThrow({ where: { id: shift.id } });
    expect(stored.expectedCashMinor).toBe(move.status === 201 ? 700n : 1000n);
    await f.client(f.accountant, 'get', '/cashier-shifts?businessDate=2026-10-23').expect(200).expect(res => expect(res.body.items[0].expectedCashMinor).toBe(stored.expectedCashMinor!.toString()));
  });

  it.each(['movement', 'close'])('stales an exact cash correction request after payout drawer %s', async change => {
    const date = change === 'movement' ? '2026-10-24' : '2026-10-25';
    const shift = await f.open(f.accountant, date, '1000'); const student = await f.student(); const quote = await f.quote(student.studentId, '500');
    const paid = (await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ quoteId: quote.id, quoteVersion: 1, receivedAmountMinor: '500', tenderedAmountMinor: '500', businessDate: date, mode: 'CASH', payerName: 'Cash stale test' }).expect(201)).body;
    const row = await f.request(paid.payment.id, { type: 'REVERSE', amountMinor: undefined, businessDate: date });
    expect(row.shiftId).toBe(shift.id);
    if (change === 'movement') await f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/movements`).set('Idempotency-Key', randomUUID()).send(movement).expect(201);
    else await f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/close`).send({ countedCashMinor: '1500' }).expect(201);
    await f.client(f.admin, 'post', `/finance/requests/${row.id}/approve`).send({ reason: 'Frozen cash drawer has changed' }).expect(201).expect(res => expect(res.body.status).toBe('STALE'));
    expect(await f.db.paymentRefund.count({ where: { paymentId: paid.payment.id } })).toBe(0);
  });

  it('rejects reuse of a movement key on another shift and races cash refund against deposit without negative cash', async () => {
    const date = '2026-10-26'; const shift = await f.open(f.accountant, date, '0'); const second = await f.open(f.accountant, '2026-10-27', '1000');
    const student = await f.student(); const quote = await f.quote(student.studentId, '1000');
    const paid = (await f.client(f.accountant, 'post', '/payments').set('Idempotency-Key', randomUUID()).send({ quoteId: quote.id, quoteVersion: 1, receivedAmountMinor: '1000', tenderedAmountMinor: '1000', businessDate: date, mode: 'CASH', payerName: 'Cash race guardian' }).expect(201)).body;
    const key = randomUUID(); const body = { ...movement, amountMinor: '700' };
    const [deposit, refund] = await Promise.all([
      f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/movements`).set('Idempotency-Key', key).send(body),
      f.client(f.admin, 'post', `/payments/${paid.payment.id}/refunds`).set('Idempotency-Key', randomUUID()).send({ amountMinor: '700', reason: 'Competing cash payout', businessDate: date }),
    ]);
    expect([deposit.status, refund.status].sort()).toEqual([201, 409]);
    await f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/close`).send({ countedCashMinor: '300' }).expect(201);
    if (deposit.status === 201) await f.client(f.accountant, 'post', `/cashier-shifts/${second.id}/movements`).set('Idempotency-Key', key).send(body).expect(409);
    else {
      await f.client(f.accountant, 'post', `/cashier-shifts/${second.id}/movements`).set('Idempotency-Key', key).send(body).expect(201);
      await f.client(f.accountant, 'post', `/cashier-shifts/${shift.id}/movements`).set('Idempotency-Key', key).send(body).expect(409);
    }
  });
});
