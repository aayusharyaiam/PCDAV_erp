import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor } from './auth';
import { Db } from './db';
import { jsonSafe } from './fee-utils';
import { DuesReportDto, JournalReportDto } from './finance.dto';
import { asDate } from './utils';

@Injectable()
export class ReportsService {
  constructor(private readonly db: Db) {}

  async dues(actor: Actor, query: DuesReportDto) {
    const cutoff = query.asOf ? asDate(query.asOf) : undefined;
    const school = await this.db.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
    const today = asDate(new Intl.DateTimeFormat('en-CA', { timeZone: school.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
    const agingDate = cutoff ?? today;
    const cte = Prisma.sql`WITH dues AS (
      SELECT 'FEE' AS "sourceType", f."id" AS "sourceId", f."schoolId", f."studentId", f."enrollmentId", f."feeHeadId",
        h."name" || ' · ' || f."periodKey" AS label, f."dueDate", f."amountMinor" AS "assessedMinor", f."amountMinor"-f."paidMinor"-f."creditAppliedMinor" AS "outstandingMinor"
      FROM "FeeObligation" f JOIN "FeeHead" h ON h."id"=f."feeHeadId" AND h."schoolId"=f."schoolId" WHERE f."schoolId"=${actor.schoolId}
      UNION ALL
      SELECT 'STORE', i."id", i."schoolId", i."studentId", i."enrollmentId", NULL, 'Store issue ' || i."issueNumber", i."issuedAt", i."totalMinor", i."totalMinor"-i."paidMinor"
      FROM "StoreIssue" i WHERE i."schoolId"=${actor.schoolId} AND i."status" <> 'VOID'
    ), filtered AS (
      SELECT d."sourceType",d."sourceId",d."studentId",s."admissionNumber",s."name" AS "studentName",e."sessionId",e."classId",d."feeHeadId",d.label,d."dueDate",d."assessedMinor",d."outstandingMinor",d."dueDate" < ${agingDate}::date AS overdue
      FROM dues d JOIN "Student" s ON s."id"=d."studentId" AND s."schoolId"=d."schoolId"
      JOIN "Enrollment" e ON e."id"=d."enrollmentId" AND e."schoolId"=d."schoolId"
      WHERE d."outstandingMinor">0
      ${query.studentId ? Prisma.sql`AND d."studentId"=${query.studentId}` : Prisma.empty}
      ${query.sessionId ? Prisma.sql`AND e."sessionId"=${query.sessionId}` : Prisma.empty}
      ${query.classId ? Prisma.sql`AND e."classId"=${query.classId}` : Prisma.empty}
      ${query.feeHeadId ? Prisma.sql`AND d."feeHeadId"=${query.feeHeadId}` : Prisma.empty}
      ${cutoff ? Prisma.sql`AND d."dueDate"<=${cutoff}::date` : Prisma.empty}
    )`;
    return this.db.atomic(async tx => {
      const items = await tx.$queryRaw(Prisma.sql`${cte} SELECT * FROM filtered ORDER BY "dueDate","studentId","sourceType","sourceId" OFFSET ${(query.page - 1) * query.limit} LIMIT ${query.limit}`);
      const [totals] = await tx.$queryRaw<{ count: bigint; assessedMinor: string; outstandingMinor: string; overdueMinor: string }[]>(Prisma.sql`${cte}
        SELECT count(*) AS count, coalesce(sum("assessedMinor"),0)::text AS "assessedMinor", coalesce(sum("outstandingMinor"),0)::text AS "outstandingMinor", coalesce(sum("outstandingMinor") FILTER (WHERE overdue),0)::text AS "overdueMinor" FROM filtered`);
      return jsonSafe({ items, total: Number(totals.count), page: query.page, limit: query.limit, totals: { assessedMinor: totals.assessedMinor, outstandingMinor: totals.outstandingMinor, overdueMinor: totals.overdueMinor }, asOf: query.asOf ?? null, agingDate: agingDate.toISOString().slice(0, 10), basis: 'CURRENT_BALANCES_WITH_DUE_DATE_CUTOFF_NOT_HISTORICAL' });
    });
  }

  async journal(actor: Actor, query: JournalReportDto) {
    const from = query.fromDate ? asDate(query.fromDate) : undefined;
    const to = query.toDate ? asDate(query.toDate) : undefined;
    if (from && to && from > to) throw new BadRequestException('fromDate must not be after toDate');
    const where: Prisma.JournalEntryWhereInput = { schoolId: actor.schoolId, businessDate: { gte: from, lte: to }, ...(query.studentId ? { lines: { some: { studentId: query.studentId } } } : {}) };
    return this.db.atomic(async tx => {
      const [items, total, sums] = await Promise.all([
        tx.journalEntry.findMany({ where, include: { lines: { orderBy: { id: 'asc' } } }, orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.limit, take: query.limit }),
        tx.journalEntry.count({ where }), tx.journalLine.aggregate({ where: { schoolId: actor.schoolId, entry: { is: where } }, _sum: { debitMinor: true, creditMinor: true } }),
      ]);
      const debitMinor = sums._sum.debitMinor ?? 0n; const creditMinor = sums._sum.creditMinor ?? 0n;
      return jsonSafe({ items, total, page: query.page, limit: query.limit, totals: { debitMinor, creditMinor, balanced: debitMinor === creditMinor }, basis: 'JOURNAL_BUSINESS_DATE', accountBasis: 'DEMO_OPERATIONAL_ACCOUNTS; CLEARING_IS_NOT_BANK_SETTLEMENT' });
    });
  }
}
