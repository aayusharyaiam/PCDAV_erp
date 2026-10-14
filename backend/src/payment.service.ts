import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Payment, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { Actor } from './auth';
import { Db, Tx, audit } from './db';
import { asDate } from './utils';
import { jsonSafe, minor } from './fee-utils';
import { AllocationPlan, buildPlan, TargetType } from './payment-plan';
import { financialDate, requireAdmin } from './finance-common';
import { policyFor } from './finance-policy';
import { releaseCollectionCredits, withdrawConsumedAdvance } from './credit-lineage';
import { cashTotals } from './cash.service';
import { assessBounce } from './bounce-assessment';
import {
  ChequeClearDto,
  CloseCashierShiftDto,
  CollectionReportDto,
  OpenCashierShiftDto,
  PaymentDto,
  PaymentListDto,
  PaymentQuoteDto,
  PaymentRefundDto,
  PaymentCorrectionDto,
} from './dto';

const PAYMENT_MODES = ['CASH', 'MANUAL_ELECTRONIC', 'CHEQUE'] as const;
const PAYMENT_STATUSES = ['PENDING_CHEQUE', 'CAPTURED', 'CLEARED', 'BOUNCED', 'REVERSED', 'PARTIALLY_REFUNDED', 'REFUNDED'];
const RECEIPT_STATUSES = ['ISSUED', 'VOID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function sum(values: bigint[]) { return values.reduce((total, value) => total + value, 0n); }

function requireCommandKey(key: string | undefined): asserts key is string {
  if (!key || !/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new BadRequestException('A valid Idempotency-Key header is required');
}

function refundReplay(command: { requestHash: string; result: Prisma.JsonValue }, requestHash: string) {
  if (command.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was already used with a different refund request');
  return command.result;
}

function statusFor(amountMinor: bigint, creditAppliedMinor: bigint, paidMinor: bigint) {
  if (amountMinor <= creditAppliedMinor + paidMinor) return paidMinor > 0n ? 'PAID' : 'PAID_BY_CREDIT';
  return 'OPEN';
}

function toPlanJson(plan: AllocationPlan): Prisma.InputJsonValue { return plan as unknown as Prisma.InputJsonValue; }

@Injectable()
export class PaymentService {
  constructor(private readonly db: Db) {}

  async createQuote(actor: Actor, body: PaymentQuoteDto) {
    const amount = minor(body.amountMinor);
    return this.db.atomic(async tx => {
      await this.requireStudent(tx, actor.schoolId, body.studentId);
      const selection = { ...(body.obligationIds !== undefined ? { obligationIds: body.obligationIds } : {}), ...(body.storeIssueIds !== undefined ? { storeIssueIds: body.storeIssueIds } : {}) };
      const plan = await buildPlan(tx, actor.schoolId, body.studentId, amount, selection);
      const quote = await tx.paymentQuote.create({
        data: {
          schoolId: actor.schoolId,
          studentId: body.studentId,
          createdBy: actor.id,
          amountMinor: amount,
          availableCreditMinor: minor(plan.availableCreditMinor, true),
          creditAppliedMinor: minor(plan.creditAppliedMinor, true),
          paymentAllocatedMinor: minor(plan.paymentAllocatedMinor, true),
          projectedOutstandingMinor: minor(plan.projectedOutstandingMinor, true),
          projectedCreditMinor: minor(plan.projectedCreditMinor, true),
          allocationPlan: toPlanJson(plan),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      await audit(tx, actor, 'PAYMENT_QUOTE_CREATED', 'PaymentQuote', quote.id, 'Payment allocation quote created', undefined, quote);
      return jsonSafe({ ...quote, allocations: plan.lines, creditApplications: plan.creditApplications });
    });
  }

  async getQuote(actor: Actor, id: string) {
    const quote = await this.db.paymentQuote.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!quote) throw new BadRequestException('Payment quote not found');
    const plan = quote.allocationPlan as unknown as AllocationPlan;
    return jsonSafe({ ...quote, allocations: plan.lines, creditApplications: plan.creditApplications });
  }

  async createPayment(actor: Actor, body: PaymentDto, idempotencyKey: string | undefined) {
    requireCommandKey(idempotencyKey);
    const received = minor(body.receivedAmountMinor);
    const businessDate = asDate(body.businessDate);
    this.validatePaymentDetails(body, received);
    const requestHash = createHash('sha256').update(stable(body)).digest('hex');
    try {
      return await this.db.atomic(async tx => {
        const existing = await tx.payment.findUnique({ where: { schoolId_cashierId_idempotencyKey: { schoolId: actor.schoolId, cashierId: actor.id, idempotencyKey } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was already used with a different payment request');
          return this.paymentResult(tx, existing.id);
        }
        const quote = await tx.paymentQuote.findFirst({ where: { id: body.quoteId, schoolId: actor.schoolId } });
        if (!quote) throw new BadRequestException('Payment quote not found');
        if (quote.version !== body.quoteVersion) throw new ConflictException('Payment quote version is stale');
        if (quote.status !== 'OPEN' || quote.expiresAt <= new Date()) throw new ConflictException('Payment quote is expired or already used');
        if (quote.amountMinor !== received) throw new ConflictException('Payment amount does not match the quoted amount');
        const shift = await tx.cashierShift.findFirst({ where: { schoolId: actor.schoolId, cashierId: actor.id, businessDate, status: 'OPEN' } });
        if (!shift) throw new ConflictException('Open cashier shift required for this business date');
        const plan = await buildPlan(tx, actor.schoolId, quote.studentId, received, (quote.allocationPlan as unknown as AllocationPlan).selection, 'CAPTURE');
        if (stable(plan) !== stable(quote.allocationPlan)) throw new ConflictException('Payment quote is stale; request a fresh allocation preview');
        await financialDate(tx, businessDate);
        const now = new Date();
        const payment = await tx.payment.create({
          data: {
            schoolId: actor.schoolId,
            studentId: quote.studentId,
            cashierId: actor.id,
            shiftId: shift.id,
            quoteId: quote.id,
            idempotencyKey,
            requestHash,
            businessDate,
            mode: body.mode,
            currency: body.currency ?? 'INR',
            status: body.mode === 'CHEQUE' ? 'PENDING_CHEQUE' : 'CAPTURED',
            receivedAmountMinor: received,
            tenderedAmountMinor: body.tenderedAmountMinor ? minor(body.tenderedAmountMinor) : undefined,
            changeMinor: body.tenderedAmountMinor ? minor(body.tenderedAmountMinor) - received : 0n,
            payerName: body.payerName.trim(),
            payerPhone: body.payerPhone?.trim() ?? '',
            reference: body.reference?.trim() ?? '',
            electronicChannel: body.electronicChannel ?? '',
            electronicVerifiedAt: body.mode === 'MANUAL_ELECTRONIC' ? now : undefined,
            electronicVerifiedBy: body.mode === 'MANUAL_ELECTRONIC' ? actor.id : undefined,
            electronicVerificationNote: body.mode === 'MANUAL_ELECTRONIC' ? body.electronicVerificationNote!.trim() : undefined,
            chequeNumber: body.chequeNumber?.trim() ?? '',
            chequeBank: body.chequeBank?.trim() ?? '',
            chequeDate: body.chequeDate ? asDate(body.chequeDate) : undefined,
            capturedAt: body.mode === 'CHEQUE' ? undefined : now,
            captureBusinessDate: body.mode === 'CHEQUE' ? undefined : businessDate,
            captureShiftId: body.mode === 'CHEQUE' ? undefined : shift.id,
          },
        });
        await tx.paymentQuote.update({ where: { id: quote.id }, data: { status: 'CONSUMED' } });
        if (body.mode === 'CHEQUE') {
          await tx.paymentEvent.create({ data: { schoolId: actor.schoolId, paymentId: payment.id, type: 'CHEQUE_RECEIVED', amountMinor: received, reason: 'Cheque payment recorded pending clearance', actorId: actor.id, businessDate, metadata: toPlanJson(plan) } });
          await audit(tx, actor, 'CHEQUE_PAYMENT_RECEIVED', 'Payment', payment.id, 'Cheque received pending clearance', undefined, payment);
          return this.paymentResult(tx, payment.id);
        }
        await this.applyPlan(tx, actor, payment.id, quote.studentId, plan, 'Payment captured');
        const receipt = await this.issueReceipt(tx, actor, payment, plan);
        await tx.paymentEvent.create({ data: { schoolId: actor.schoolId, paymentId: payment.id, type: 'PAYMENT_CAPTURED', amountMinor: received, reason: 'Payment captured', actorId: actor.id, businessDate, metadata: toPlanJson(plan) } });
        await audit(tx, actor, 'PAYMENT_CAPTURED', 'Payment', payment.id, 'Payment captured and allocated atomically', undefined, { payment, receipt });
        return this.paymentResult(tx, payment.id);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.db.payment.findUnique({ where: { schoolId_cashierId_idempotencyKey: { schoolId: actor.schoolId, cashierId: actor.id, idempotencyKey } } });
        if (existing) {
          if (existing.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was already used with a different payment request');
          return this.db.atomic(tx => this.paymentResult(tx, existing.id));
        }
        if (body.mode === 'MANUAL_ELECTRONIC') throw new ConflictException('Electronic transaction reference or quote is already recorded for this school and channel');
      }
      throw error;
    }
  }

  async clearCheque(actor: Actor, id: string, body: ChequeClearDto) {
    const businessDate = asDate(body.businessDate);
    return this.db.atomic(async tx => {
      const payment = await tx.payment.findFirst({ where: { id, schoolId: actor.schoolId, mode: 'CHEQUE' } });
      if (!payment) throw new BadRequestException('Cheque payment not found');
      if (payment.status !== 'PENDING_CHEQUE') throw new ConflictException('Only a pending cheque can be cleared');
      if (businessDate < payment.businessDate || (payment.chequeDate && businessDate < payment.chequeDate)) throw new BadRequestException('Clearance date cannot precede cheque receipt or cheque date');
      const shift = await tx.cashierShift.findFirst({ where: { schoolId: actor.schoolId, cashierId: actor.id, businessDate, status: 'OPEN' } });
      if (!shift) throw new ConflictException('Open cashier shift required to clear this cheque');
      // Pending cheques reserve no dues or credit. Recalculate at clearance and
      // retain both the original quote and the actual clearance allocation event.
      const quote = payment.quoteId ? await tx.paymentQuote.findUnique({ where: { id: payment.quoteId } }) : null;
      const plan = await buildPlan(tx, actor.schoolId, payment.studentId, payment.receivedAmountMinor, (quote?.allocationPlan as unknown as AllocationPlan | undefined)?.selection, 'CLEARANCE');
      await financialDate(tx, businessDate);
      const updated = await tx.payment.update({ where: { id }, data: { status: 'CLEARED', capturedAt: new Date(), captureBusinessDate: businessDate, captureShiftId: shift.id } });
      await this.applyPlan(tx, actor, id, payment.studentId, plan, 'Cheque cleared');
      await this.issueReceipt(tx, actor, updated, plan);
      await tx.paymentEvent.create({ data: { schoolId: actor.schoolId, paymentId: id, type: 'CHEQUE_CLEARED', amountMinor: payment.receivedAmountMinor, reason: body.reason, actorId: actor.id, businessDate, metadata: toPlanJson(plan) } });
      await audit(tx, actor, 'CHEQUE_CLEARED', 'Payment', id, body.reason, payment, updated);
      return this.paymentResult(tx, id);
    });
  }

  async bounceCheque(actor: Actor, id: string, body: PaymentCorrectionDto, transaction?: Tx) {
    requireAdmin(actor);
    const { reason } = body;
    const operation = async (tx: Tx) => {
      const payment = await tx.payment.findFirst({ where: { id, schoolId: actor.schoolId, mode: 'CHEQUE' } });
      if (!payment) throw new BadRequestException('Cheque payment not found');
      if (!['PENDING_CHEQUE', 'CLEARED'].includes(payment.status)) throw new ConflictException('This cheque cannot be bounced in its current state');
      const { businessDate } = await this.correctionContext(tx, actor, payment, body);
      await financialDate(tx, businessDate);
      if (payment.status === 'CLEARED') await this.releaseAllocations(tx, actor, payment, reason);
      const updated = await tx.payment.update({ where: { id }, data: { status: 'BOUNCED' } });
      await assessBounce(tx, actor, payment, businessDate, reason);
      if (payment.status === 'CLEARED') await this.updateReceiptStatus(tx, actor, id, 'VOID', reason, 'CHEQUE_BOUNCED');
      await tx.paymentEvent.create({ data: { schoolId: actor.schoolId, paymentId: id, type: 'CHEQUE_BOUNCED', amountMinor: payment.status === 'CLEARED' ? payment.receivedAmountMinor : 0n, reason, actorId: actor.id, businessDate, metadata: { reference: body.reference?.trim() ?? '' } } });
      await audit(tx, actor, 'CHEQUE_BOUNCED', 'Payment', id, reason, payment, updated);
      return this.paymentResult(tx, id);
    };
    return transaction ? operation(transaction) : this.db.atomic(operation);
  }

  async reverse(actor: Actor, id: string, body: PaymentCorrectionDto, transaction?: Tx) {
    requireAdmin(actor);
    const { reason } = body;
    const operation = async (tx: Tx) => {
      const payment = await tx.payment.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!payment) throw new BadRequestException('Payment not found');
      if (!['CAPTURED', 'CLEARED', 'PARTIALLY_REFUNDED'].includes(payment.status)) throw new ConflictException('Only captured payments can be reversed');
      const { businessDate, shiftId } = await this.correctionContext(tx, actor, payment, body);
      const refunded = await this.refundedAmount(tx, id);
      const remaining = payment.receivedAmountMinor - refunded;
      await this.requirePayoutCash(tx, shiftId, remaining);
      await financialDate(tx, businessDate);
      await this.releaseAllocations(tx, actor, payment, reason);
      if (remaining > 0n) await tx.paymentRefund.create({ data: { schoolId: actor.schoolId, paymentId: id, shiftId, businessDate, amountMinor: remaining, reason, reference: body.reference?.trim() ?? '', createdBy: actor.id } });
      const updated = await tx.payment.update({ where: { id }, data: { status: 'REVERSED' } });
      await this.updateReceiptStatus(tx, actor, id, 'VOID', reason, 'PAYMENT_REVERSED');
      await tx.paymentEvent.create({ data: { schoolId: actor.schoolId, paymentId: id, type: 'PAYMENT_REVERSED', amountMinor: remaining, reason, actorId: actor.id, businessDate, metadata: { shiftId: shiftId ?? null } } });
      await audit(tx, actor, 'PAYMENT_REVERSED', 'Payment', id, reason, payment, updated);
      return this.paymentResult(tx, id);
    };
    return transaction ? operation(transaction) : this.db.atomic(operation);
  }

  async refund(actor: Actor, id: string, body: PaymentRefundDto, idempotencyKey: string | undefined, transaction?: Tx) {
    requireAdmin(actor);
    requireCommandKey(idempotencyKey);
    const amount = minor(body.amountMinor);
    // Include the route target: a key cannot be reused for another payment.
    const requestHash = createHash('sha256').update(stable({ paymentId: id, body })).digest('hex');
    const where = { schoolId_actorId_idempotencyKey: { schoolId: actor.schoolId, actorId: actor.id, idempotencyKey } };
    try {
      const operation = async (tx: Tx) => {
        const existing = await tx.refundCommand.findUnique({ where });
        if (existing) return refundReplay(existing, requestHash);
        const payment = await tx.payment.findFirst({ where: { id, schoolId: actor.schoolId } });
        if (!payment) throw new BadRequestException('Payment not found');
        if (!['CAPTURED', 'CLEARED', 'PARTIALLY_REFUNDED'].includes(payment.status)) throw new ConflictException('Only captured payments can be refunded');
        const { businessDate, shiftId } = await this.correctionContext(tx, actor, payment, body);
        const alreadyRefunded = await this.refundedAmount(tx, id);
        if (amount > payment.receivedAmountMinor - alreadyRefunded) throw new BadRequestException('Refund exceeds the unrefunded payment amount');
        await this.requirePayoutCash(tx, shiftId, amount);
        await financialDate(tx, businessDate);
        await this.releasePaymentAmount(tx, actor, payment, amount, body.reason);
        await tx.paymentRefund.create({ data: { schoolId: actor.schoolId, paymentId: id, shiftId, businessDate, amountMinor: amount, reason: body.reason, reference: body.reference?.trim() ?? '', createdBy: actor.id } });
        const totalRefunded = alreadyRefunded + amount;
        const updated = await tx.payment.update({ where: { id }, data: { status: totalRefunded === payment.receivedAmountMinor ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
        await this.updateReceiptStatus(tx, actor, id, updated.status, body.reason, 'REFUND_POSTED');
        await tx.paymentEvent.create({ data: { schoolId: actor.schoolId, paymentId: id, type: 'REFUND_POSTED', amountMinor: amount, reason: body.reason, actorId: actor.id, businessDate, metadata: { reference: body.reference?.trim() ?? '', shiftId: shiftId ?? null, idempotencyKey } } });
        await audit(tx, actor, 'PAYMENT_REFUNDED', 'Payment', id, body.reason, payment, { ...updated, idempotencyKey });
        const result = await this.paymentResult(tx, id);
        await tx.refundCommand.create({ data: { schoolId: actor.schoolId, actorId: actor.id, idempotencyKey, requestHash, paymentId: id, result: result as unknown as Prisma.InputJsonValue } });
        return result;
      };
      return await (transaction ? operation(transaction) : this.db.atomic(operation));
    } catch (error) {
      if (transaction) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.db.refundCommand.findUnique({ where });
        if (existing) return refundReplay(existing, requestHash);
      }
      throw error;
    }
  }

  async openShift(actor: Actor, body: OpenCashierShiftDto) {
    const businessDate = asDate(body.businessDate); const opening = minor(body.openingFloatMinor, true);
    return this.db.atomic(async tx => {
      if (await tx.cashierShift.findUnique({ where: { schoolId_cashierId_businessDate: { schoolId: actor.schoolId, cashierId: actor.id, businessDate } } })) throw new ConflictException('A cashier shift already exists for this date');
      const shift = await tx.cashierShift.create({ data: { schoolId: actor.schoolId, cashierId: actor.id, businessDate, openingFloatMinor: opening } });
      await audit(tx, actor, 'CASHIER_SHIFT_OPENED', 'CashierShift', shift.id, 'Cashier shift opened', undefined, shift);
      return jsonSafe({ ...shift, ...await cashTotals(tx, shift) });
    });
  }

  async closeShift(actor: Actor, id: string, body: CloseCashierShiftDto) {
    const counted = minor(body.countedCashMinor, true);
    return this.db.atomic(async tx => {
      const shift = await tx.cashierShift.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!shift) throw new BadRequestException('Cashier shift not found');
      if (shift.status !== 'OPEN') throw new ConflictException('Cashier shift is already closed');
      if (shift.cashierId !== actor.id && !['ADMIN', 'SUPERADMIN'].includes(actor.role)) throw new ForbiddenException('Only the cashier or an Admin can close this shift');
      const expected = await this.expectedCash(tx, shift);
      const variance = counted - expected;
      if (expected < -9223372036854775808n || expected > 9223372036854775807n || variance < -9223372036854775808n || variance > 9223372036854775807n) throw new ConflictException('Cash close totals exceed the supported range');
      if (variance !== 0n && body.reason.trim().length < 3) throw new BadRequestException('A reason is required for a cash variance');
      const closed = await tx.cashierShift.update({ where: { id }, data: { status: 'CLOSED', expectedCashMinor: expected, countedCashMinor: counted, varianceMinor: variance, closedAt: new Date(), closeReason: body.reason.trim() } });
      await audit(tx, actor, 'CASHIER_SHIFT_CLOSED', 'CashierShift', id, body.reason, shift, closed);
      return jsonSafe({ ...closed, ...await cashTotals(tx, closed) });
    });
  }

  async shifts(actor: Actor, query: PaymentListDto) {
    if (query.status && !['OPEN', 'CLOSED'].includes(query.status)) throw new BadRequestException('Invalid cashier shift status');
    const where: Prisma.CashierShiftWhereInput = { schoolId: actor.schoolId, ...(query.status ? { status: query.status } : {}), ...(query.businessDate ? { businessDate: asDate(query.businessDate) } : {}), ...(query.cashierId ? { cashierId: query.cashierId } : {}) };
    return this.db.atomic(async tx => {
      const [shifts, total] = await Promise.all([tx.cashierShift.findMany({ where, orderBy: [{ businessDate: 'desc' }, { openedAt: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), tx.cashierShift.count({ where })]);
      const items = await Promise.all(shifts.map(async shift => {
        const totals = await cashTotals(tx, shift);
        return { ...shift, ...totals, expectedCashMinor: shift.status === 'OPEN' ? totals.expectedCashMinor : shift.expectedCashMinor };
      }));
      return jsonSafe({ items, total, page: query.page, limit: query.limit });
    });
  }

  async listPayments(actor: Actor, query: PaymentListDto) {
    const where = this.paymentWhere(actor, query);
    const [items, total] = await Promise.all([this.db.payment.findMany({ where, orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }), this.db.payment.count({ where })]);
    return jsonSafe({ items, total, page: query.page, limit: query.limit });
  }

  async getPayment(actor: Actor, id: string) {
    return this.db.atomic(async tx => {
      const payment = await tx.payment.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!payment) throw new BadRequestException('Payment not found');
      return this.paymentResult(tx, id);
    });
  }

  async listReceipts(actor: Actor, query: PaymentListDto) {
    const receiptStatus = query.receiptStatus ?? query.status;
    if (receiptStatus && !RECEIPT_STATUSES.includes(receiptStatus)) throw new BadRequestException('Invalid receipt status');
    const { businessDate, ...paymentWhere } = this.paymentWhere(actor, { ...query, status: undefined });
    const receiptWhere: Prisma.ReceiptWhereInput = {
      schoolId: actor.schoolId,
      payment: { is: { ...paymentWhere, captureBusinessDate: businessDate } },
      ...(query.q ? { receiptNumber: { contains: query.q.trim(), mode: 'insensitive' } } : {}),
      ...(query.receiptNumber ? { receiptNumber: { contains: query.receiptNumber.trim(), mode: 'insensitive' } } : {}),
      ...(receiptStatus ? { status: receiptStatus } : {}),
    };
    const [receipts, total] = await Promise.all([
      this.db.receipt.findMany({ where: receiptWhere, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
      this.db.receipt.count({ where: receiptWhere }),
    ]);
    return jsonSafe({ items: receipts, total, page: query.page, limit: query.limit });
  }

  async getReceipt(actor: Actor, id: string) {
    return this.db.atomic(async tx => {
      const receipt = await tx.receipt.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!receipt) throw new BadRequestException('Receipt not found');
      const [events, payment, paymentEvents, refunds] = await Promise.all([
        tx.receiptEvent.findMany({ where: { schoolId: actor.schoolId, receiptId: id }, orderBy: { createdAt: 'asc' } }),
        tx.payment.findFirst({ where: { id: receipt.paymentId, schoolId: actor.schoolId } }),
        tx.paymentEvent.findMany({ where: { schoolId: actor.schoolId, paymentId: receipt.paymentId }, orderBy: { createdAt: 'asc' } }),
        tx.paymentRefund.findMany({ where: { schoolId: actor.schoolId, paymentId: receipt.paymentId }, orderBy: { createdAt: 'asc' } }),
      ]);
      return jsonSafe({ receipt, payment, events, paymentEvents, refunds, reprint: this.reprintMetadata(receipt) });
    });
  }

  async reprint(actor: Actor, id: string, reason: string) {
    if (!reason || reason.trim().length < 3) throw new BadRequestException('A reprint reason is required');
    return this.db.atomic(async tx => {
      const receipt = await tx.receipt.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!receipt) throw new BadRequestException('Receipt not found');
      const event = await tx.receiptEvent.create({ data: { schoolId: actor.schoolId, receiptId: id, type: 'REPRINT', actorId: actor.id, metadata: { reason: reason.trim(), pdfStatus: receipt.pdfStatus, receiptNumber: receipt.receiptNumber, originalIssuedAt: receipt.issuedAt.toISOString() } } });
      await audit(tx, actor, 'RECEIPT_REPRINTED', 'Receipt', id, reason, undefined, event);
      return jsonSafe({ receipt, printEvent: event, reprint: this.reprintMetadata(receipt) });
    });
  }

  async collectionReport(actor: Actor, query: CollectionReportDto) {
    const from = query.fromDate ? asDate(query.fromDate) : undefined;
    const to = query.toDate ? asDate(query.toDate) : undefined;
    if (from && to && from > to) throw new BadRequestException('fromDate must not be after toDate');
    return this.db.atomic(async tx => {
      const payments = await tx.payment.findMany({ where: { schoolId: actor.schoolId, ...(query.mode ? { mode: query.mode } : {}), ...(query.cashierId ? { cashierId: query.cashierId } : {}) } });
      const events = await tx.paymentEvent.findMany({ where: { schoolId: actor.schoolId, paymentId: { in: payments.map(payment => payment.id) }, businessDate: { gte: from, lte: to } } });
      const modes = new Map(payments.map(payment => [payment.id, payment.mode]));
      const summarize = (mode?: string) => {
        const selected = events.filter(event => !mode || modes.get(event.paymentId) === mode);
        const total = (...types: string[]) => sum(selected.filter(event => types.includes(event.type)).map(event => event.amountMinor ?? 0n));
        const capturedMinor = total('PAYMENT_CAPTURED', 'CHEQUE_CLEARED');
        const refundedMinor = total('REFUND_POSTED');
        const reversedMinor = total('PAYMENT_REVERSED');
        const bouncedMinor = total('CHEQUE_BOUNCED');
        const pendingMinor = sum(payments.filter(payment => (!mode || payment.mode === mode) && payment.status === 'PENDING_CHEQUE' && (!from || payment.businessDate >= from) && (!to || payment.businessDate <= to)).map(payment => payment.receivedAmountMinor));
        return { capturedMinor, refundedMinor, reversedMinor, bouncedMinor, netCapturedMinor: capturedMinor - refundedMinor - reversedMinor - bouncedMinor, pendingMinor };
      };
      return jsonSafe({ fromDate: query.fromDate ?? null, toDate: query.toDate ?? null, basis: 'EVENT_BUSINESS_DATE', pendingBasis: 'CURRENT_STATUS_BY_RECEIVED_DATE', cashierBasis: 'ORIGINAL_COLLECTOR', paymentCount: new Set(events.map(event => event.paymentId)).size, ...summarize(), byMode: PAYMENT_MODES.map(mode => ({ mode, ...summarize(mode) })) });
    });
  }

  async register(actor: Actor, query: PaymentListDto) {
    return this.listReceipts(actor, query);
  }

  private paymentWhere(actor: Actor, query: PaymentListDto): Prisma.PaymentWhereInput {
    if (query.status && !PAYMENT_STATUSES.includes(query.status)) throw new BadRequestException('Invalid payment status');
    const from = query.fromDate ? asDate(query.fromDate) : undefined; const to = query.toDate ? asDate(query.toDate) : undefined;
    if (from && to && from > to) throw new BadRequestException('fromDate must not be after toDate');
    if (query.businessDate && (from || to)) throw new BadRequestException('Use businessDate or a date range, not both');
    return { schoolId: actor.schoolId, ...(query.mode ? { mode: query.mode } : {}), ...(query.studentId ? { studentId: query.studentId } : {}), ...(query.cashierId ? { cashierId: query.cashierId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.businessDate ? { businessDate: asDate(query.businessDate) } : {}), ...(from || to ? { businessDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) };
  }

  private validatePaymentDetails(body: PaymentDto, received: bigint) {
    if (!PAYMENT_MODES.includes(body.mode as typeof PAYMENT_MODES[number])) throw new BadRequestException('Unsupported payment mode');
    if (body.currency !== undefined && body.currency !== 'INR') throw new BadRequestException('Only INR payments are supported');
    if (body.payerName.trim().length < 2) throw new BadRequestException('A payer name is required');
    const tendered = body.tenderedAmountMinor ? minor(body.tenderedAmountMinor) : undefined;
    if (body.mode === 'CASH' && tendered === undefined) throw new BadRequestException('Cash tendered amount is required');
    if (tendered !== undefined && tendered < received) throw new BadRequestException('Tendered cash cannot be less than the received amount');
    if (body.mode !== 'CASH' && tendered !== undefined && tendered !== received) throw new BadRequestException('Tendered amount is only supported for cash and must equal a non-cash payment');
    if (body.mode === 'MANUAL_ELECTRONIC' && (!body.reference?.trim() || !body.electronicChannel)) throw new BadRequestException('Electronic channel and transaction reference are required');
    if (body.mode === 'MANUAL_ELECTRONIC' && (body.electronicVerified !== true || !body.electronicVerificationNote || body.electronicVerificationNote.trim().length < 3)) throw new BadRequestException('Confirm verified receipt of electronic funds and record verification evidence');
    if (body.mode !== 'MANUAL_ELECTRONIC' && (body.electronicVerified !== undefined || body.electronicVerificationNote !== undefined)) throw new BadRequestException('Electronic verification is only supported for electronic payments');
    if (body.mode === 'CHEQUE' && (!body.chequeNumber?.trim() || !body.chequeBank?.trim() || !body.chequeDate)) throw new BadRequestException('Cheque number, bank, and cheque date are required');
    if (body.mode !== 'CHEQUE' && (body.chequeNumber || body.chequeBank || body.chequeDate)) throw new BadRequestException('Cheque details are only supported for cheque payments');
    if (body.mode !== 'MANUAL_ELECTRONIC' && body.electronicChannel) throw new BadRequestException('Electronic channel is only supported for electronic payments');
  }

  private async requireStudent(tx: Tx, schoolId: string, studentId: string) {
    const student = await tx.student.findFirst({ where: { id: studentId, schoolId } });
    if (!student) throw new BadRequestException('Student not found');
    return student;
  }

  private async applyPlan(tx: Tx, actor: Actor, paymentId: string, studentId: string, plan: AllocationPlan, reason: string) {
    for (const application of plan.creditApplications) {
      const credit = await tx.feeCredit.findFirst({ where: { id: application.creditId, schoolId: actor.schoolId, studentId } });
      if (!credit || credit.remainingMinor < BigInt(application.amountMinor)) throw new ConflictException('Student credit changed; refresh the payment quote');
      const obligation = await tx.feeObligation.findFirst({ where: { id: application.targetId, schoolId: actor.schoolId, studentId } });
      if (!obligation) throw new ConflictException('Fee obligation changed; refresh the payment quote');
      const applied = BigInt(application.amountMinor);
      if (applied > obligation.amountMinor - obligation.paidMinor - obligation.creditAppliedMinor) throw new ConflictException('Credit exceeds the current outstanding fee');
      await tx.feeCredit.update({ where: { id: credit.id }, data: { remainingMinor: { decrement: applied } } });
      await tx.feeObligation.update({ where: { id: obligation.id }, data: { creditAppliedMinor: { increment: applied }, status: statusFor(obligation.amountMinor, obligation.creditAppliedMinor + applied, obligation.paidMinor) } });
      const recorded = await tx.paymentCreditApplication.create({ data: { schoolId: actor.schoolId, paymentId, creditId: credit.id, targetId: obligation.id, amountMinor: applied } });
      await tx.feeCreditAllocation.create({ data: { schoolId: actor.schoolId, studentId, creditId: credit.id, obligationId: obligation.id, paymentId, legacyApplicationId: recorded.id, source: 'PAYMENT', amountMinor: applied } });
      await audit(tx, actor, 'PAYMENT_CREDIT_APPLIED', 'FeeObligation', obligation.id, reason, undefined, { paymentId, creditId: credit.id, amountMinor: applied });
    }
    for (const line of plan.lines) {
      const amount = BigInt(line.paymentAllocatedMinor);
      if (amount <= 0n) continue;
      if (line.targetType === 'FEE') {
        const obligation = await tx.feeObligation.findFirst({ where: { id: line.targetId, schoolId: actor.schoolId, studentId } });
        if (!obligation) throw new ConflictException('Fee obligation changed; refresh the payment quote');
        const outstanding = obligation.amountMinor - obligation.creditAppliedMinor - obligation.paidMinor;
        if (amount > outstanding) throw new ConflictException('Fee allocation exceeds the current outstanding balance');
        await tx.feeObligation.update({ where: { id: obligation.id }, data: { paidMinor: { increment: amount }, status: statusFor(obligation.amountMinor, obligation.creditAppliedMinor, obligation.paidMinor + amount) } });
      } else {
        const issue = await tx.storeIssue.findFirst({ where: { id: line.targetId, schoolId: actor.schoolId, studentId, status: 'OPEN' } });
        if (!issue) throw new ConflictException('Store issue changed; refresh the payment quote');
        const outstanding = issue.totalMinor - issue.paidMinor;
        if (amount > outstanding) throw new ConflictException('Store settlement exceeds the outstanding issue balance');
        await tx.storeIssue.update({ where: { id: issue.id }, data: { paidMinor: { increment: amount }, status: issue.paidMinor + amount >= issue.totalMinor ? 'PAID' : 'OPEN' } });
      }
      await tx.paymentAllocation.create({ data: { schoolId: actor.schoolId, paymentId, targetType: line.targetType, targetId: line.targetId, amountMinor: amount } });
    }
    if (BigInt(plan.newCreditMinor) > 0n) await tx.feeCredit.create({ data: { schoolId: actor.schoolId, studentId, amountMinor: BigInt(plan.newCreditMinor), remainingMinor: BigInt(plan.newCreditMinor), source: 'PAYMENT_OVERPAYMENT', sourcePaymentId: paymentId, reason: `Payment overpayment ${paymentId}`, createdBy: actor.id } });
  }

  private async issueReceipt(tx: Tx, actor: Actor, payment: Payment, plan: AllocationPlan) {
    const [school, student, enrollment] = await Promise.all([
      tx.school.findUniqueOrThrow({ where: { id: actor.schoolId } }),
      tx.student.findFirstOrThrow({ where: { id: payment.studentId, schoolId: actor.schoolId } }),
      tx.enrollment.findFirst({ where: { schoolId: actor.schoolId, studentId: payment.studentId, status: 'ACTIVE' }, orderBy: { startDate: 'desc' } }),
    ]);
    const classroom = enrollment ? await tx.classOffering.findFirst({ where: { id: enrollment.classId, schoolId: actor.schoolId } }) : null;
    const policy = await policyFor(tx, actor.schoolId);
    const date = payment.captureBusinessDate ?? payment.businessDate;
    const startYear = date.getUTCFullYear() - (date.getUTCMonth() < 3 ? 1 : 0);
    const scopeKey = policy.receiptScope === 'SCHOOL' ? 'SCHOOL' : `FY${startYear}-${String(startYear + 1).slice(-2)}`;
    const sequence = policy.receiptScope === 'SCHOOL'
      ? await tx.receiptSequence.upsert({ where: { schoolId: actor.schoolId }, create: { schoolId: actor.schoolId, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } })
      : await tx.receiptSeries.upsert({ where: { schoolId_prefix_scopeKey: { schoolId: actor.schoolId, prefix: policy.receiptPrefix, scopeKey } }, create: { schoolId: actor.schoolId, prefix: policy.receiptPrefix, scopeKey, nextNumber: 2 }, update: { nextNumber: { increment: 1 } } });
    const number = sequence.nextNumber - 1;
    const receiptNumber = `${policy.receiptPrefix}/${scopeKey}/${String(number).padStart(6, '0')}`;
    const issuedAt = new Date();
    const snapshot = {
      receiptNumber,
      demoPolicy: { version: policy.version, receiptPrefix: policy.receiptPrefix, receiptScope: policy.receiptScope, scopeKey, financialYearStartMonth: 4, label: 'Configurable DEMO policy; not approved real school policy' },
      currency: payment.currency,
      school: { id: school.id, name: school.name, address: school.address, phone: school.phone, email: school.email },
      student: { id: student.id, admissionNumber: student.admissionNumber, name: student.name },
      enrollment: enrollment ? { id: enrollment.id, sessionId: enrollment.sessionId, classId: enrollment.classId, className: classroom ? `${classroom.grade} ${classroom.section}${classroom.stream ? ` · ${classroom.stream}` : ''}` : '' } : null,
      payer: { name: payment.payerName, phone: payment.payerPhone },
      payment: { id: payment.id, businessDate: payment.businessDate.toISOString().slice(0, 10), captureBusinessDate: payment.captureBusinessDate?.toISOString().slice(0, 10) ?? null, issuedAt: issuedAt.toISOString(), mode: payment.mode, channel: payment.electronicChannel, reference: payment.reference, chequeNumber: payment.chequeNumber, chequeBank: payment.chequeBank, chequeDate: payment.chequeDate?.toISOString().slice(0, 10) ?? null, receivedAmountMinor: payment.receivedAmountMinor.toString(), tenderedAmountMinor: payment.tenderedAmountMinor?.toString() ?? null, changeMinor: payment.changeMinor.toString() },
      allocation: { lines: plan.lines, creditAppliedMinor: plan.creditAppliedMinor, paymentAllocatedMinor: plan.paymentAllocatedMinor, projectedOutstandingMinor: plan.projectedOutstandingMinor, projectedCreditMinor: plan.projectedCreditMinor },
      collector: { id: actor.id, name: actor.name },
      templateVersion: 'receipt-v1',
    };
    const receipt = await tx.receipt.create({ data: { schoolId: actor.schoolId, paymentId: payment.id, studentId: payment.studentId, receiptNumber, snapshot: jsonSafe(snapshot) as Prisma.InputJsonValue, issuedAt, pdfStatus: 'PENDING' } });
    await tx.receiptPdfJob.create({ data: { schoolId: actor.schoolId, receiptId: receipt.id, receiptStatus: receipt.status, requestedBy: actor.id } });
    await tx.receiptEvent.create({ data: { schoolId: actor.schoolId, receiptId: receipt.id, type: 'ISSUED', actorId: actor.id, metadata: { receiptNumber, pdfStatus: receipt.pdfStatus, templateVersion: receipt.templateVersion } } });
    return receipt;
  }

  private async paymentResult(tx: Db | Tx, id: string) {
    const [payment, allocations, creditApplications, refunds, events, receipt, allocationReleases, creditReleases, overpaymentCredit] = await Promise.all([
      tx.payment.findUniqueOrThrow({ where: { id } }),
      tx.paymentAllocation.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.paymentCreditApplication.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.paymentRefund.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.paymentEvent.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.receipt.findUnique({ where: { paymentId: id } }),
      tx.paymentAllocationRelease.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.paymentCreditRelease.findMany({ where: { paymentId: id }, orderBy: { createdAt: 'asc' } }),
      tx.feeCredit.findUnique({ where: { sourcePaymentId: id } }),
    ]);
    return jsonSafe({ payment, allocations, creditApplications, allocationReleases, creditReleases, overpaymentCredit, refunds, events, receipt, pdfStatus: receipt?.pdfStatus ?? 'UNAVAILABLE' });
  }

  private async refundedAmount(tx: Tx, paymentId: string) { return sum((await tx.paymentRefund.findMany({ where: { paymentId } })).map(item => item.amountMinor)); }

  private async releasePaymentAmount(tx: Tx, actor: Actor, payment: { id: string; studentId: string }, amount: bigint, reason: string) {
    let remaining = amount;
    // Unused advance first, then traced consumed advance and direct allocations.
    const credit = await tx.feeCredit.findFirst({ where: { schoolId: actor.schoolId, studentId: payment.studentId, sourcePaymentId: payment.id } });
    if (credit) {
      const withdrawn = credit.remainingMinor < remaining ? credit.remainingMinor : remaining;
      if (withdrawn > 0n) await tx.feeCredit.update({ where: { id: credit.id }, data: { remainingMinor: { decrement: withdrawn } } });
      remaining -= withdrawn;
      if (remaining > 0n) remaining = await withdrawConsumedAdvance(tx, actor, credit.id, payment.id, remaining, reason);
    }
    const allocations = await tx.paymentAllocation.findMany({ where: { paymentId: payment.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    for (const allocation of allocations) {
      if (remaining <= 0n) break;
      const released = sum((await tx.paymentAllocationRelease.findMany({ where: { allocationId: allocation.id } })).map(item => item.amountMinor));
      const active = allocation.amountMinor - released;
      if (active <= 0n) continue;
      const amountToRelease = active < remaining ? active : remaining;
      await this.releaseTarget(tx, actor, payment.studentId, allocation.targetType as TargetType, allocation.targetId, amountToRelease);
      await tx.paymentAllocationRelease.create({ data: { schoolId: actor.schoolId, paymentId: payment.id, allocationId: allocation.id, amountMinor: amountToRelease, reason, createdBy: actor.id } });
      remaining -= amountToRelease;
    }
    if (remaining > 0n) throw new ConflictException('Historical credit use lacks sufficient traced allocations; reconcile its evidenced lineage before correction');
  }

  private async releaseAllocations(tx: Tx, actor: Actor, payment: Payment, reason: string) {
    const remaining = payment.receivedAmountMinor - await this.refundedAmount(tx, payment.id);
    await this.releasePaymentAmount(tx, actor, payment, remaining, reason);
    await releaseCollectionCredits(tx, actor, payment.id, reason);
  }

  private async releaseTarget(tx: Tx, actor: Actor, studentId: string, targetType: TargetType, targetId: string, amount: bigint) {
    if (targetType === 'FEE') {
      const obligation = await tx.feeObligation.findFirst({ where: { id: targetId, schoolId: actor.schoolId, studentId } });
      if (!obligation || obligation.paidMinor < amount) throw new ConflictException('Fee allocation history is inconsistent');
      await tx.feeObligation.update({ where: { id: targetId }, data: { paidMinor: { decrement: amount }, status: statusFor(obligation.amountMinor, obligation.creditAppliedMinor, obligation.paidMinor - amount) } });
    } else {
      const issue = await tx.storeIssue.findFirst({ where: { id: targetId, schoolId: actor.schoolId, studentId } });
      if (!issue || issue.paidMinor < amount) throw new ConflictException('Store settlement history is inconsistent');
      await tx.storeIssue.update({ where: { id: targetId }, data: { paidMinor: { decrement: amount }, status: 'OPEN' } });
    }
  }

  private async expectedCash(tx: Tx, shift: { id: string; openingFloatMinor: bigint }) {
    return (await cashTotals(tx, shift)).expectedCashMinor;
  }

  private async requirePayoutCash(tx: Tx, shiftId: string | undefined, amount: bigint) {
    if (!shiftId) return;
    const shift = await tx.cashierShift.findUniqueOrThrow({ where: { id: shiftId } });
    if (amount > (await cashTotals(tx, shift)).expectedCashMinor) throw new ConflictException('Correction exceeds available payout cash');
  }

  async correctionContext(tx: Tx, actor: Actor, payment: Payment, body: PaymentCorrectionDto) {
    const requestedDate = body.businessDate ? asDate(body.businessDate) : undefined;
    const earliest = payment.captureBusinessDate ?? payment.businessDate;
    if (payment.mode !== 'CASH') {
      if (body.shiftId) throw new BadRequestException('Payout shift is only used for cash corrections');
      const school = await tx.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: school.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const businessDate = requestedDate ?? asDate(today);
      if (businessDate < earliest) throw new BadRequestException('Correction date cannot precede capture or cheque receipt');
      return { businessDate, shiftId: undefined as string | undefined };
    }
    const shift = body.shiftId
      ? await tx.cashierShift.findFirst({ where: { id: body.shiftId, schoolId: actor.schoolId, status: 'OPEN' } })
      : await tx.cashierShift.findFirst({ where: { id: payment.shiftId, schoolId: actor.schoolId, status: 'OPEN' } });
    if (!shift) throw new ConflictException('Cash corrections require an open payout shift; the original closed shift is immutable');
    if (shift.businessDate < earliest) throw new BadRequestException('Payout shift cannot precede payment capture');
    if (requestedDate && requestedDate.getTime() !== shift.businessDate.getTime()) throw new BadRequestException('Correction businessDate must match the payout shift');
    return { businessDate: shift.businessDate, shiftId: shift.id };
  }

  private async updateReceiptStatus(tx: Tx, actor: Actor, paymentId: string, status: string, reason: string, eventType: string) {
    if (!RECEIPT_STATUSES.includes(status)) return;
    await tx.receipt.updateMany({ where: { schoolId: actor.schoolId, paymentId }, data: { status, pdfStatus: 'PENDING' } });
    const receipt = await tx.receipt.findUnique({ where: { paymentId } });
    if (receipt) {
      await tx.receiptEvent.create({ data: { schoolId: actor.schoolId, receiptId: receipt.id, type: status === 'VOID' ? 'VOIDED' : status, actorId: actor.id, metadata: { reason, source: eventType } } });
      await tx.receiptPdfJob.upsert({ where: { receiptId_receiptStatus: { receiptId: receipt.id, receiptStatus: status } }, create: { schoolId: actor.schoolId, receiptId: receipt.id, receiptStatus: status, requestedBy: actor.id }, update: { status: 'PENDING', content: null, sha256: null, errorCode: null, requestedBy: actor.id } });
    }
  }

  private reprintMetadata(receipt: { id: string; receiptNumber: string; issuedAt: Date; pdfStatus: string; templateVersion: string }) {
    return { receiptId: receipt.id, receiptNumber: receipt.receiptNumber, originalIssuedAt: receipt.issuedAt, pdfStatus: receipt.pdfStatus, templateVersion: receipt.templateVersion, downloadAvailable: false };
  }
}
