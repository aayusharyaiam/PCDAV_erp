import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { audit } from './db';

export function minor(value: string, allowZero = false): bigint {
  if (!/^\d{1,19}$/.test(value)) throw new BadRequestException('Amount must be an integer number of paise within the supported range');
  const amount = BigInt(value);
  if (amount > 9223372036854775807n) throw new BadRequestException('Amount exceeds the supported range');
  if (!allowZero && amount <= 0n) throw new BadRequestException('Amount must be greater than zero');
  return amount;
}

export function money(value: bigint): string { return value.toString(); }
export function moneyRupees(value: bigint): string {
  const negative = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${negative}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}

export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)) as T;
}

export function periodDate(periodKey: string, dueDay: number): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match) throw new BadRequestException(`Invalid fee period ${periodKey}; use YYYY-MM`);
  const year = Number(match[1]); const month = Number(match[2]);
  if (year < 1000 || month < 1 || month > 12) throw new BadRequestException(`Invalid fee month ${periodKey}`);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(dueDay, lastDay)));
}

export function periodsForFrequency(frequency: string, periods: string[], assessmentMonth?: number): string[] {
  if (frequency === 'MONTHLY') return periods;
  if (frequency === 'ONE_TIME') return periods.slice(0, 1);
  if (assessmentMonth) {
    const months = frequency === 'HALF_YEARLY' ? [assessmentMonth, ((assessmentMonth + 5) % 12) + 1] : [assessmentMonth];
    return periods.filter(period => months.includes(Number(period.slice(5, 7))));
  }
  return periods.filter((_period, index) => frequency === 'HALF_YEARLY' ? index % 6 === 0 : index === 0);
}

export async function allocateCredits(tx: Prisma.TransactionClient, actor: { id: string; schoolId: string }, studentId: string) {
  const { schoolId } = actor;
  const [credits, obligations] = await Promise.all([
    tx.feeCredit.findMany({ where: { schoolId, studentId, remainingMinor: { gt: 0n } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    tx.feeObligation.findMany({ where: { schoolId, studentId }, orderBy: [{ dueDate: 'asc' }, { assessedAt: 'asc' }, { id: 'asc' }] }),
  ]);
  let creditIndex = 0;
  for (const obligation of obligations) {
    let outstanding = obligation.amountMinor - obligation.creditAppliedMinor - obligation.paidMinor;
    while (outstanding > 0n && creditIndex < credits.length) {
      const credit = credits[creditIndex];
      const applied = outstanding < credit.remainingMinor ? outstanding : credit.remainingMinor;
      if (applied > 0n) {
        await tx.feeCredit.update({ where: { id: credit.id }, data: { remainingMinor: { decrement: applied } } });
        await tx.feeObligation.update({ where: { id: obligation.id }, data: { creditAppliedMinor: { increment: applied }, status: applied === outstanding ? (obligation.paidMinor > 0n ? 'PAID' : 'PAID_BY_CREDIT') : 'OPEN' } });
        await tx.feeCreditAllocation.create({ data: { schoolId, studentId, creditId: credit.id, obligationId: obligation.id, source: 'ASSESSMENT', amountMinor: applied } });
        await audit(tx, actor, 'FEE_CREDIT_ALLOCATED', 'FeeObligation', obligation.id, 'Automatic oldest-due-first allocation', undefined, { creditId: credit.id, studentId, amountMinor: applied });
        credit.remainingMinor -= applied;
        outstanding -= applied;
      }
      if (credit.remainingMinor <= 0n) creditIndex += 1;
    }
  }
}
