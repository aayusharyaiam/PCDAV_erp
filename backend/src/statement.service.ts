import { BadRequestException, Injectable } from '@nestjs/common';
import { Actor } from './auth';
import { Db } from './db';
import { jsonSafe } from './fee-utils';

const sum = (values: bigint[]) => values.reduce((a, b) => a + b, 0n);

@Injectable()
export class StatementService {
  constructor(private readonly db: Db) {}
  async get(actor: Actor, studentId: string) {
    return this.db.atomic(async tx => {
      const where = { schoolId: actor.schoolId, studentId };
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId: actor.schoolId }, select: { id: true, admissionNumber: true, name: true } });
      if (!student) throw new BadRequestException('Student not found');
      const [obligations, issues, creditRows, paymentRows, creditAllocations, enrollments, heads, journal] = await Promise.all([
        tx.feeObligation.findMany({ where, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] }), tx.storeIssue.findMany({ where, orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }] }),
        tx.feeCredit.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }), tx.payment.findMany({ where, orderBy: [{ businessDate: 'asc' }, { id: 'asc' }], include: { receipt: true } }),
        tx.feeCreditAllocation.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }), tx.enrollment.findMany({ where }), tx.feeHead.findMany({ where: { schoolId: actor.schoolId } }),
        tx.journalLine.groupBy({ by: ['account'], where, _sum: { debitMinor: true, creditMinor: true } }),
      ]);
      const paymentsWhere = { schoolId: actor.schoolId, paymentId: { in: paymentRows.map(item => item.id) } };
      const [allocations, releases, refunds, events, creditReleases, issueLines] = await Promise.all([
        tx.paymentAllocation.findMany({ where: paymentsWhere }), tx.paymentAllocationRelease.findMany({ where: paymentsWhere }), tx.paymentRefund.findMany({ where: paymentsWhere }), tx.paymentEvent.findMany({ where: paymentsWhere, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
        tx.feeCreditAllocationRelease.findMany({ where: { schoolId: actor.schoolId, allocationId: { in: creditAllocations.map(item => item.id) } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
        tx.storeIssueLine.findMany({ where: { schoolId: actor.schoolId, issueId: { in: issues.map(item => item.id) } } }),
      ]);
      const paymentAllocations = allocations.map(item => {
        const linked = releases.filter(release => release.allocationId === item.id);
        const releasedMinor = sum(linked.map(release => release.amountMinor));
        return { ...item, releasedMinor, activeMinor: item.amountMinor - releasedMinor, releases: linked };
      });
      const traced = creditAllocations.map(item => {
        const linked = creditReleases.filter(release => release.allocationId === item.id);
        const releasedMinor = sum(linked.map(release => release.amountMinor));
        return { ...item, releasedMinor, activeMinor: item.amountMinor - releasedMinor, releases: linked };
      });
      const academic = (enrollmentId: string) => {
        const enrollment = enrollments.find(item => item.id === enrollmentId);
        return { sessionId: enrollment?.sessionId ?? null, classId: enrollment?.classId ?? null };
      };
      const fees = obligations.map(item => ({ ...item, ...academic(item.enrollmentId), feeHeadName: heads.find(head => head.id === item.feeHeadId)?.name ?? 'Fee', outstandingMinor: item.amountMinor - item.paidMinor - item.creditAppliedMinor,
        allocations: paymentAllocations.filter(allocation => allocation.targetType === 'FEE' && allocation.targetId === item.id), creditAllocations: traced.filter(allocation => allocation.obligationId === item.id),
        untracedCreditAppliedMinor: item.creditAppliedMinor - sum(traced.filter(allocation => allocation.obligationId === item.id).map(allocation => allocation.activeMinor)),
      }));
      const storeIssues = issues.map(item => ({ ...item, ...academic(item.enrollmentId), outstandingMinor: item.status === 'VOID' ? 0n : item.totalMinor - item.paidMinor, lines: issueLines.filter(line => line.issueId === item.id), allocations: paymentAllocations.filter(allocation => allocation.targetType === 'STORE' && allocation.targetId === item.id) }));
      const credits = creditRows.map(item => ({ ...item, allocations: traced.filter(allocation => allocation.creditId === item.id) }));
      const payments = paymentRows.map(item => ({ ...item, allocations: paymentAllocations.filter(allocation => allocation.paymentId === item.id), creditApplications: traced.filter(allocation => allocation.paymentId === item.id), refunds: refunds.filter(refund => refund.paymentId === item.id), events: events.filter(event => event.paymentId === item.id), tracedCreditReleases: creditReleases.filter(release => release.correctionPaymentId === item.id) }));
      const feeOutstandingMinor = sum(fees.map(item => item.outstandingMinor));
      const storeOutstandingMinor = sum(storeIssues.map(item => item.outstandingMinor));
      const availableCreditMinor = sum(credits.map(item => item.remainingMinor));
      const accountBalance = (account: string) => {
        const row = journal.find(item => item.account === account);
        return (row?._sum.debitMinor ?? 0n) - (row?._sum.creditMinor ?? 0n);
      };
      const journalBalances = { feeReceivableMinor: accountBalance('FEE_RECEIVABLE'), storeReceivableMinor: accountBalance('STORE_RECEIVABLE'), studentCreditMinor: -accountBalance('STUDENT_CREDIT') };
      return jsonSafe({ student, fees, storeIssues, credits, payments, totals: {
        assessedFeeMinor: sum(fees.map(item => item.amountMinor)), assessedStoreMinor: sum(storeIssues.filter(item => item.status !== 'VOID').map(item => item.totalMinor)),
        feeOutstandingMinor, storeOutstandingMinor, outstandingMinor: feeOutstandingMinor + storeOutstandingMinor, availableCreditMinor,
        pendingChequeMinor: sum(payments.filter(item => item.status === 'PENDING_CHEQUE').map(item => item.receivedAmountMinor)), refundedMinor: sum(refunds.map(item => item.amountMinor)),
        journal: { ...journalBalances, reconciled: journalBalances.feeReceivableMinor === feeOutstandingMinor && journalBalances.storeReceivableMinor === storeOutstandingMinor && journalBalances.studentCreditMinor === availableCreditMinor },
      } });
    });
  }
}
