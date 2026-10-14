import { ConflictException } from '@nestjs/common';
import { Payment } from '@prisma/client';
import { Actor } from './auth';
import { audit, Tx } from './db';
import { policyFor } from './finance-policy';
import { allocateCredits } from './fee-utils';

export async function assessBounce(tx: Tx, actor: Actor, payment: Payment, businessDate: Date, reason: string) {
  const policy = await policyFor(tx, actor.schoolId);
  if (policy.bounceFeeMinor === 0n) return;
  if (await tx.feeObligation.findUnique({ where: { bouncePaymentId: payment.id } })) return;
  const enrollment = await tx.enrollment.findFirst({ where: { schoolId: actor.schoolId, studentId: payment.studentId }, orderBy: [{ startDate: 'desc' }, { id: 'asc' }] });
  if (!enrollment) throw new ConflictException('A student enrollment is required for the configured demo bounce assessment');
  const head = await tx.feeHead.upsert({ where: { schoolId_code: { schoolId: actor.schoolId, code: 'DEMO_BOUNCE' } }, create: { schoolId: actor.schoolId, code: 'DEMO_BOUNCE', name: 'Configurable demo cheque bounce fee', category: 'MISCELLANEOUS' }, update: {} });
  const obligation = await tx.feeObligation.create({ data: { schoolId: actor.schoolId, studentId: payment.studentId, enrollmentId: enrollment.id, feeHeadId: head.id, periodKey: `BOUNCE:${payment.id}`, dueDate: businessDate, amountMinor: policy.bounceFeeMinor, bouncePaymentId: payment.id } });
  await allocateCredits(tx, actor, payment.studentId);
  await audit(tx, actor, 'DEMO_BOUNCE_ASSESSED', 'FeeObligation', obligation.id, reason, undefined, { obligation, paymentId: payment.id, policyVersion: policy.version });
}
