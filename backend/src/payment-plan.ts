import { BadRequestException, ConflictException } from '@nestjs/common';
import { Tx } from './db';
import { policyFor } from './finance-policy';
import { fingerprint } from './finance-common';

export type TargetType = 'FEE' | 'STORE';
export type Selection = { obligationIds?: string[]; storeIssueIds?: string[] };
export type AllocationLine = {
  targetType: TargetType; targetId: string; reference: string; description: string; dueDate: string;
  beforeOutstandingMinor: string; creditAppliedMinor: string; paymentAllocatedMinor: string; afterOutstandingMinor: string;
};
export type AllocationPlan = {
  amountMinor: string; availableCreditMinor: string; creditAppliedMinor: string; paymentAllocatedMinor: string;
  projectedOutstandingMinor: string; projectedCreditMinor: string; newCreditMinor: string;
  lines: AllocationLine[]; creditApplications: { creditId: string; targetId: string; amountMinor: string }[];
  selection: Selection; policyVersion: number; balanceFingerprint: string;
};
const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

export async function buildPlan(tx: Tx, schoolId: string, studentId: string, amountMinor: bigint, selection: Selection = {}, mode: 'QUOTE' | 'CAPTURE' | 'CLEARANCE' = 'QUOTE'): Promise<AllocationPlan> {
  const [obligations, issues, credits, enrollments, sessions, policy] = await Promise.all([
    tx.feeObligation.findMany({ where: { schoolId, studentId }, orderBy: [{ dueDate: 'asc' }, { assessedAt: 'asc' }, { id: 'asc' }] }),
    tx.storeIssue.findMany({ where: { schoolId, studentId, status: { not: 'VOID' } }, orderBy: [{ issuedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
    tx.feeCredit.findMany({ where: { schoolId, studentId, remainingMinor: { gt: 0n } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    tx.enrollment.findMany({ where: { schoolId, studentId }, orderBy: { id: 'asc' } }),
    tx.academicSession.findMany({ where: { schoolId } }), policyFor(tx, schoolId),
  ]);
  const heads = await tx.feeHead.findMany({ where: { schoolId, id: { in: obligations.map(item => item.feeHeadId) } } });
  const headNames = new Map(heads.map(head => [head.id, head.name]));
  const all = [
    ...obligations.map(item => ({ targetType: 'FEE' as const, targetId: item.id, enrollmentId: item.enrollmentId, reference: `${item.periodKey}:${item.feeHeadId}`, description: `${headNames.get(item.feeHeadId) ?? 'Fee'} · ${item.periodKey}`, dueDate: item.dueDate.toISOString().slice(0, 10), createdAt: item.assessedAt, outstanding: item.amountMinor - item.creditAppliedMinor - item.paidMinor })),
    ...issues.map(item => ({ targetType: 'STORE' as const, targetId: item.id, enrollmentId: item.enrollmentId, reference: item.issueNumber, description: `Store issue ${item.issueNumber}`, dueDate: item.issuedAt.toISOString().slice(0, 10), createdAt: item.createdAt, outstanding: item.totalMinor - item.paidMinor })),
  ];
  for (const [type, ids] of [['FEE', selection.obligationIds], ['STORE', selection.storeIssueIds]] as const) {
    if (ids === undefined) continue;
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Selected obligation IDs must be unique');
    for (const id of ids) {
      const target = all.find(item => item.targetType === type && item.targetId === id);
      if (!target) {
        if (mode !== 'QUOTE') throw new ConflictException('Quoted selection changed or was cancelled; request a fresh preview');
        throw new BadRequestException('Selected obligation is not owned by this student/school or was cancelled');
      }
      if (mode !== 'CLEARANCE' && target.outstanding <= 0n) throw new ConflictException('Selected obligation is already settled; refresh selection');
    }
  }
  const targets = all.filter(item => item.outstanding > 0n && (item.targetType === 'FEE' ? selection.obligationIds?.includes(item.targetId) ?? true : selection.storeIssueIds?.includes(item.targetId) ?? true))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.targetType === b.targetType ? a.createdAt.getTime() - b.createdAt.getTime() || a.targetId.localeCompare(b.targetId) : a.targetType === 'FEE' ? -1 : 1));
  const creditApplications: AllocationPlan['creditApplications'] = [];
  const creditByTarget = new Map<string, bigint>();
  const creditRemaining = new Map(credits.map(credit => [credit.id, credit.remainingMinor]));
  const availableCredit = sum(credits.map(credit => credit.remainingMinor));
  let remainingCredit = availableCredit;
  for (const target of targets.filter(item => item.targetType === 'FEE')) {
    let needed = target.outstanding;
    for (const credit of credits) {
      const available = creditRemaining.get(credit.id)!;
      const applied = available < needed ? available : needed;
      if (applied <= 0n) continue;
      creditApplications.push({ creditId: credit.id, targetId: target.targetId, amountMinor: applied.toString() });
      creditRemaining.set(credit.id, available - applied);
      creditByTarget.set(target.targetId, (creditByTarget.get(target.targetId) ?? 0n) + applied);
      needed -= applied; remainingCredit -= applied;
    }
  }
  let remainingPayment = amountMinor;
  const lines = targets.map(target => {
    const creditApplied = creditByTarget.get(target.targetId) ?? 0n;
    const afterCredit = target.outstanding - creditApplied;
    const paymentAllocated = afterCredit < remainingPayment ? afterCredit : remainingPayment;
    remainingPayment -= paymentAllocated;
    return { targetType: target.targetType, targetId: target.targetId, reference: target.reference, description: target.description, dueDate: target.dueDate, beforeOutstandingMinor: target.outstanding.toString(), creditAppliedMinor: creditApplied.toString(), paymentAllocatedMinor: paymentAllocated.toString(), afterOutstandingMinor: (afterCredit - paymentAllocated).toString() };
  });
  if (!policy.allowAdvance && remainingPayment > 0n) throw new ConflictException('Demo policy disallows advance; reduce the amount or select additional dues');
  if (policy.blockPreviousSession) {
    const sessionStart = (enrollmentId: string) => sessions.find(session => session.id === enrollments.find(enrollment => enrollment.id === enrollmentId)?.sessionId)?.startDate.getTime();
    for (const target of targets) {
      const line = lines.find(item => item.targetId === target.targetId)!;
      if (BigInt(line.paymentAllocatedMinor) + BigInt(line.creditAppliedMinor) === 0n) continue;
      const start = sessionStart(target.enrollmentId);
      if (start === undefined) throw new ConflictException('Academic session context is incomplete');
      if (all.some(old => {
        const oldStart = sessionStart(old.enrollmentId);
        const allocated = lines.find(item => item.targetId === old.targetId);
        const remaining = allocated ? BigInt(allocated.afterOutstandingMinor) : old.outstanding;
        return oldStart !== undefined && oldStart < start && remaining > 0n;
      })) throw new ConflictException('Demo policy requires clearing previous-session dues before new-session allocation');
    }
  }
  const creditApplied = availableCredit - remainingCredit;
  const paymentAllocated = amountMinor - remainingPayment;
  return {
    amountMinor: amountMinor.toString(), availableCreditMinor: availableCredit.toString(), creditAppliedMinor: creditApplied.toString(), paymentAllocatedMinor: paymentAllocated.toString(),
    projectedOutstandingMinor: (sum(all.map(target => target.outstanding)) - creditApplied - paymentAllocated).toString(), projectedCreditMinor: (remainingCredit + remainingPayment).toString(), newCreditMinor: remainingPayment.toString(),
    lines, creditApplications, selection, policyVersion: policy.version,
    balanceFingerprint: fingerprint({ obligations, issues, credits, enrollments, policy }),
  };
}
