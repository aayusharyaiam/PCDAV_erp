import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { CashMovement, Prisma } from '@prisma/client';
import { Actor } from './auth';
import { audit, Db, Tx } from './db';
import { jsonSafe, minor } from './fee-utils';
import { fingerprint, requireAdmin, requireCommandKey } from './finance-common';
import { CashMovementDto } from './finance.dto';

function publicMovement(row: CashMovement) {
  const { idempotencyKey, requestHash, ...movement } = row;
  return jsonSafe(movement);
}

export async function cashTotals(tx: Tx, shift: { id: string; openingFloatMinor: bigint }) {
  const [received, refunded, moved] = await Promise.all([
    tx.payment.aggregate({ where: { shiftId: shift.id, mode: 'CASH', capturedAt: { not: null } }, _sum: { receivedAmountMinor: true } }),
    tx.paymentRefund.aggregate({ where: { shiftId: shift.id }, _sum: { amountMinor: true } }),
    tx.cashMovement.aggregate({ where: { shiftId: shift.id }, _sum: { amountMinor: true } }),
  ]);
  const cashReceivedMinor = received._sum.receivedAmountMinor ?? 0n;
  const cashRefundedMinor = refunded._sum.amountMinor ?? 0n;
  const cashMovedMinor = moved._sum.amountMinor ?? 0n;
  return { cashReceivedMinor, cashRefundedMinor, cashMovedMinor, expectedCashMinor: shift.openingFloatMinor + cashReceivedMinor - cashRefundedMinor - cashMovedMinor };
}

@Injectable()
export class CashService {
  constructor(private readonly db: Db) {}
  async list(actor: Actor, shiftId: string) {
    if (!await this.db.cashierShift.findFirst({ where: { id: shiftId, schoolId: actor.schoolId } })) throw new BadRequestException('Cashier shift not found');
    return { items: (await this.db.cashMovement.findMany({ where: { schoolId: actor.schoolId, shiftId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(publicMovement) };
  }
  async create(actor: Actor, shiftId: string, body: CashMovementDto, key?: string) {
    requireCommandKey(key);
    if (body.type === 'EXPENSE') requireAdmin(actor);
    const amountMinor = minor(body.amountMinor);
    const requestHash = fingerprint({ shiftId, body });
    const where = { schoolId_createdBy_idempotencyKey: { schoolId: actor.schoolId, createdBy: actor.id, idempotencyKey: key } };
    const replay = (movement: CashMovement) => {
      if (movement.requestHash !== requestHash) throw new ConflictException('Idempotency-Key was already used with a different cash movement');
      return publicMovement(movement);
    };
    try {
      return await this.db.atomic(async tx => {
        const existing = await tx.cashMovement.findUnique({ where });
        if (existing) return replay(existing);
        const shift = await tx.cashierShift.findFirst({ where: { id: shiftId, schoolId: actor.schoolId } });
        if (!shift) throw new BadRequestException('Cashier shift not found');
        if (shift.cashierId !== actor.id && !['ADMIN', 'SUPERADMIN'].includes(actor.role)) throw new ForbiddenException('Only the cashier or an Admin may move this cash');
        if (shift.status !== 'OPEN') throw new ConflictException('Closed cashier shifts are immutable');
        if (amountMinor > (await cashTotals(tx, shift)).expectedCashMinor) throw new ConflictException('Cash movement exceeds available cash');
        const movement = await tx.cashMovement.create({ data: { schoolId: actor.schoolId, shiftId, type: body.type, amountMinor, reason: body.reason, reference: body.reference, createdBy: actor.id, idempotencyKey: key, requestHash } });
        await audit(tx, actor, 'CASH_MOVEMENT_POSTED', 'CashMovement', movement.id, body.reason, undefined, movement);
        return publicMovement(movement);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.db.cashMovement.findUnique({ where });
        if (existing) return replay(existing);
      }
      throw error;
    }
  }
}
