import { ConflictException } from '@nestjs/common';
import { FeeCreditAllocation } from '@prisma/client';
import { audit, Tx } from './db';

type CreditActor = { id: string; schoolId: string };

export async function activeCreditAllocation(tx: Tx, allocation: FeeCreditAllocation) {
  const released = await tx.feeCreditAllocationRelease.aggregate({ where: { schoolId: allocation.schoolId, allocationId: allocation.id }, _sum: { amountMinor: true } });
  return allocation.amountMinor - (released._sum.amountMinor ?? 0n);
}

// A release always reopens the actual fee. When withdrawing the originating
// advance, released money goes straight to the correction, never back to credit.
export async function releaseCreditAllocation(tx: Tx, actor: CreditActor, allocation: FeeCreditAllocation, amount: bigint, correctionPaymentId: string, restoredToCredit: boolean, reason: string) {
  if (amount <= 0n || amount > await activeCreditAllocation(tx, allocation)) throw new ConflictException('Credit release exceeds traced active allocation');
  const credit = await tx.feeCredit.findFirst({ where: { id: allocation.creditId, schoolId: actor.schoolId, studentId: allocation.studentId } });
  const obligation = await tx.feeObligation.findFirst({ where: { id: allocation.obligationId, schoolId: actor.schoolId, studentId: allocation.studentId } });
  if (!credit || !obligation || obligation.creditAppliedMinor < amount) throw new ConflictException('Credit allocation history is inconsistent');
  const creditApplied = obligation.creditAppliedMinor - amount;
  await tx.feeObligation.update({ where: { id: obligation.id }, data: { creditAppliedMinor: creditApplied, status: obligation.amountMinor > creditApplied + obligation.paidMinor ? 'OPEN' : obligation.paidMinor > 0n ? 'PAID' : 'PAID_BY_CREDIT' } });
  if (restoredToCredit) await tx.feeCredit.update({ where: { id: credit.id }, data: { remainingMinor: { increment: amount } } });
  const release = await tx.feeCreditAllocationRelease.create({ data: { schoolId: actor.schoolId, allocationId: allocation.id, correctionPaymentId, amountMinor: amount, restoredToCredit, reason, createdBy: actor.id } });
  if (allocation.legacyApplicationId && allocation.paymentId) await tx.paymentCreditRelease.create({ data: { schoolId: actor.schoolId, paymentId: allocation.paymentId, applicationId: allocation.legacyApplicationId, amountMinor: amount, reason, createdBy: actor.id } });
  await audit(tx, actor, 'FEE_CREDIT_ALLOCATION_RELEASED', 'FeeCreditAllocation', allocation.id, reason, undefined, release);
  return release;
}

export async function withdrawConsumedAdvance(tx: Tx, actor: CreditActor, creditId: string, correctionPaymentId: string, amount: bigint, reason: string) {
  let remaining = amount;
  const allocations = await tx.feeCreditAllocation.findMany({ where: { schoolId: actor.schoolId, creditId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  for (const allocation of allocations) {
    if (remaining <= 0n) break;
    const active = await activeCreditAllocation(tx, allocation);
    const released = active < remaining ? active : remaining;
    if (released > 0n) await releaseCreditAllocation(tx, actor, allocation, released, correctionPaymentId, false, reason);
    remaining -= released;
  }
  return remaining;
}

export async function releaseCollectionCredits(tx: Tx, actor: CreditActor, paymentId: string, reason: string) {
  const allocations = await tx.feeCreditAllocation.findMany({ where: { schoolId: actor.schoolId, paymentId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  for (const allocation of allocations) {
    const active = await activeCreditAllocation(tx, allocation);
    if (active > 0n) await releaseCreditAllocation(tx, actor, allocation, active, paymentId, true, reason);
  }
}
