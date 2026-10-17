import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { FinanceRequest, Prisma } from '@prisma/client';
import { Actor } from './auth';
import { audit, Db, Tx } from './db';
import { PaymentService } from './payment.service';
import { FinanceRequestDto, FinanceRequestListDto } from './finance.dto';
import { jsonSafe, minor } from './fee-utils';
import { fingerprint, requireAdmin, requireCommandKey } from './finance-common';
import { policyFor } from './finance-policy';
import { cashTotals } from './cash.service';

function publicRequest(row: FinanceRequest) {
  const { idempotencyKey, requestHash, fingerprint: state, ...item } = row;
  return jsonSafe(item);
}

@Injectable()
export class ApprovalService {
  constructor(private readonly db: Db, private readonly payments: PaymentService) {}

  async list(actor: Actor, query: FinanceRequestListDto) {
    return this.db.atomic(async tx => {
      const where = { schoolId: actor.schoolId, ...(query.status ? { status: query.status } : {}) };
      const [items, total] = await Promise.all([
        tx.financeRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), tx.financeRequest.count({ where }),
      ]);
      return { items: items.map(publicRequest), total, page: query.page, limit: query.limit };
    });
  }

  async create(actor: Actor, body: FinanceRequestDto, key?: string) {
    requireCommandKey(key);
    if (body.type !== 'REFUND' && body.amountMinor !== undefined) throw new BadRequestException('Only a refund request accepts amountMinor');
    const amountMinor = body.type === 'REFUND' ? minor(body.amountMinor!) : null;
    const requestHash = fingerprint(body);
    const where = { schoolId_requestedBy_idempotencyKey: { schoolId: actor.schoolId, requestedBy: actor.id, idempotencyKey: key } };
    const replay = (row: FinanceRequest) => {
      if (row.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was already used with a different correction request');
      return publicRequest(row);
    };
    try {
      return await this.db.atomic(async tx => {
        const existing = await tx.financeRequest.findUnique({ where });
        if (existing) return replay(existing);
        const payment = await tx.payment.findFirst({ where: { id: body.paymentId, schoolId: actor.schoolId } });
        if (!payment) throw new BadRequestException('Payment not found');
        if (body.type === 'BOUNCE') {
          if (payment.mode !== 'CHEQUE' || !['PENDING_CHEQUE', 'CAPTURED', 'CLEARED'].includes(payment.status)) throw new ConflictException('Only a recorded cheque can be bounced');
        } else if (!['CAPTURED', 'CLEARED', 'PARTIALLY_REFUNDED'].includes(payment.status)) throw new ConflictException('Only a captured payment can be corrected');
        const refunded = (await tx.paymentRefund.aggregate({ where: { schoolId: actor.schoolId, paymentId: payment.id }, _sum: { amountMinor: true } }))._sum.amountMinor ?? 0n;
        if (amountMinor !== null && amountMinor > payment.receivedAmountMinor - refunded) throw new BadRequestException('Refund exceeds the unrefunded payment amount');
        const context = await this.payments.correctionContext(tx, actor, payment, body);
        if (context.shiftId) {
          const shift = await tx.cashierShift.findUniqueOrThrow({ where: { id: context.shiftId } });
          if ((amountMinor ?? payment.receivedAmountMinor - refunded) > (await cashTotals(tx, shift)).expectedCashMinor) throw new ConflictException('Correction exceeds available payout cash');
        }
        const state = await this.state(tx, actor.schoolId, payment.id, context.shiftId);
        const row = await tx.financeRequest.create({ data: { schoolId: actor.schoolId, paymentId: payment.id, type: body.type, amountMinor, reason: body.reason, reference: body.reference?.trim() ?? '', businessDate: context.businessDate, shiftId: context.shiftId, requestedBy: actor.id, idempotencyKey: key, requestHash, fingerprint: state } });
        await audit(tx, actor, 'FINANCE_CORRECTION_REQUESTED', 'FinanceRequest', row.id, body.reason, undefined, row);
        return publicRequest(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.db.financeRequest.findUnique({ where });
        if (existing) return replay(existing);
      }
      throw error;
    }
  }

  async decide(actor: Actor, id: string, reason: string, approve: boolean) {
    requireAdmin(actor);
    return this.db.atomic(async tx => {
      const row = await tx.financeRequest.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!row) throw new BadRequestException('Correction request not found');
      if (row.status !== 'REQUESTED') {
        if ((approve && ['APPLIED', 'STALE'].includes(row.status) || !approve && row.status === 'REJECTED') && row.decisionReason === reason) return publicRequest(row);
        throw new ConflictException('This request has already been decided');
      }
      let status = 'REJECTED';
      if (approve) {
        status = await this.state(tx, actor.schoolId, row.paymentId, row.shiftId ?? undefined) === row.fingerprint ? 'APPLIED' : 'STALE';
        if (status === 'APPLIED') {
          const body = { reason: row.reason, reference: row.reference, businessDate: row.businessDate?.toISOString().slice(0, 10), shiftId: row.shiftId ?? undefined };
          if (row.type === 'REFUND') await this.payments.refund(actor, row.paymentId, { ...body, amountMinor: row.amountMinor!.toString() }, `approval:${row.id}`, tx);
          else if (row.type === 'REVERSE') await this.payments.reverse(actor, row.paymentId, body, tx);
          else await this.payments.bounceCheque(actor, row.paymentId, body, tx);
        }
      }
      const decided = await tx.financeRequest.update({ where: { id }, data: { status, decidedBy: actor.id, decidedAt: new Date(), decisionReason: reason } });
      await audit(tx, actor, `FINANCE_CORRECTION_${status}`, 'FinanceRequest', id, reason, row, decided);
      return publicRequest(decided);
    });
  }

  // Include the entire student's financial state and payout drawer, not just
  // the target payment. Later assessment/credit use and a deposit must stale an
  // approval just as a changed payment balance or policy does.
  private async state(tx: Tx, schoolId: string, paymentId: string, shiftId?: string) {
    const payment = await tx.payment.findFirstOrThrow({ where: { schoolId, id: paymentId } });
    const where = { schoolId, studentId: payment.studentId };
    const [fees, stores, credits, allocations, payments, enrollments, policy, shift] = await Promise.all([
      tx.feeObligation.findMany({ where, orderBy: { id: 'asc' } }), tx.storeIssue.findMany({ where, orderBy: { id: 'asc' } }), tx.feeCredit.findMany({ where, orderBy: { id: 'asc' } }),
      tx.feeCreditAllocation.findMany({ where, orderBy: { id: 'asc' } }), tx.payment.findMany({ where, orderBy: { id: 'asc' } }), tx.enrollment.findMany({ where, orderBy: { id: 'asc' } }),
      policyFor(tx, schoolId), shiftId ? tx.cashierShift.findFirst({ where: { schoolId, id: shiftId } }) : null,
    ]);
    const [refunds, releases, paymentAllocations, paymentReleases, drawer] = await Promise.all([
      tx.paymentRefund.findMany({ where: { schoolId, paymentId: { in: payments.map(item => item.id) } }, orderBy: { id: 'asc' } }),
      tx.feeCreditAllocationRelease.findMany({ where: { schoolId, allocationId: { in: allocations.map(item => item.id) } }, orderBy: { id: 'asc' } }),
      tx.paymentAllocation.findMany({ where: { schoolId, paymentId }, orderBy: { id: 'asc' } }), tx.paymentAllocationRelease.findMany({ where: { schoolId, paymentId }, orderBy: { id: 'asc' } }),
      shift ? cashTotals(tx, shift) : null,
    ]);
    return fingerprint({ payment, fees, stores, credits, allocations, payments, enrollments, policy, shift, refunds, releases, paymentAllocations, paymentReleases, drawer });
  }
}
