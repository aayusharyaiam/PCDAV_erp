import { BadRequestException, Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { Actor } from './auth';
import { Db } from './db';
import { jsonSafe } from './fee-utils';
import { DuesReportDto, JournalReportDto } from './finance.dto';
import { ReportQueryDto } from './dto';
import { asDate, page } from './utils';
import { periodDate } from './fee-utils';

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

  async admissions(actor: Actor, query: ReportQueryDto) {
    const status = query.status && Object.values(ApplicationStatus).includes(query.status as ApplicationStatus) ? query.status as ApplicationStatus : undefined;
    const where: Prisma.ApplicationWhereInput = { schoolId: actor.schoolId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), ...(status ? { status } : {}), ...(query.fromDate || query.toDate ? { createdAt: { gte: query.fromDate ? asDate(query.fromDate) : undefined, lte: query.toDate ? asDate(query.toDate) : undefined } } : {}) };
    const [total, byStatus, byGrade, bySource, items] = await Promise.all([
      this.db.application.count({ where }),
      this.db.application.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.db.application.groupBy({ by: ['appliedGrade'], where, _count: { _all: true } }),
      this.db.application.groupBy({ by: ['source'], where, _count: { _all: true } }),
      this.db.application.findMany({ where, orderBy: { updatedAt: 'desc' }, ...page(query.page, query.limit), select: { id: true, sessionId: true, studentName: true, appliedGrade: true, source: true, status: true, ews: true, studentId: true, createdAt: true, updatedAt: true } }),
    ]);
    return { denominator: 'applications', total, byStatus: byStatus.map(item => ({ status: item.status, count: item._count._all })), byGrade: byGrade.map(item => ({ grade: item.appliedGrade, count: item._count._all })), bySource: bySource.map(item => ({ source: item.source, count: item._count._all })), items, page: query.page, limit: query.limit };
  }

  async enrollments(actor: Actor, query: ReportQueryDto) {
    const where: Prisma.EnrollmentWhereInput = { schoolId: actor.schoolId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), ...(query.classId ? { classId: query.classId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.entryType ? { entryType: query.entryType } : {}), ...(query.fromDate || query.toDate ? { startDate: { gte: query.fromDate ? asDate(query.fromDate) : undefined, lte: query.toDate ? asDate(query.toDate) : undefined } } : {}) };
    const [total, byStatus, byEntryType, byCategory, byClass, ewsCount, rows] = await Promise.all([
      this.db.enrollment.count({ where }),
      this.db.enrollment.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.db.enrollment.groupBy({ by: ['entryType'], where, _count: { _all: true } }),
      this.db.enrollment.groupBy({ by: ['feeCategory'], where, _count: { _all: true } }),
      this.db.enrollment.groupBy({ by: ['classId'], where, _count: { _all: true } }),
      this.db.enrollment.count({ where: { ...where, ews: true } }),
      this.db.enrollment.findMany({ where, orderBy: [{ startDate: 'desc' }, { id: 'desc' }], ...page(query.page, query.limit) }),
    ]);
    const [students, classes, sessions] = await Promise.all([
      this.db.student.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.map(row => row.studentId) } }, select: { id: true, admissionNumber: true, name: true, status: true } }),
      this.db.classOffering.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.map(row => row.classId) } }, select: { id: true, sessionId: true, grade: true, section: true, stream: true } }),
      this.db.academicSession.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.map(row => row.sessionId) } }, select: { id: true, name: true } }),
    ]);
    const className = (id: string) => { const classroom = classes.find(item => item.id === id); return classroom ? `${classroom.grade} ${classroom.section}${classroom.stream ? ` · ${classroom.stream}` : ''}` : ''; };
    return { denominator: 'enrollments', total, ewsCount, byStatus: byStatus.map(item => ({ status: item.status, count: item._count._all })), byEntryType: byEntryType.map(item => ({ entryType: item.entryType, count: item._count._all })), byCategory: byCategory.map(item => ({ feeCategory: item.feeCategory, count: item._count._all })), byClass: byClass.map(item => ({ classId: item.classId, className: className(item.classId), count: item._count._all })), items: rows.map(row => ({ ...row, student: students.find(item => item.id === row.studentId) ?? null, className: className(row.classId), session: sessions.find(item => item.id === row.sessionId) ?? null })), page: query.page, limit: query.limit };
  }

  async transport(actor: Actor, query: ReportQueryDto) {
    const [from, to] = this.dateRange(query);
    const classEnrollmentIds = query.classId ? (await this.db.enrollment.findMany({ where: { schoolId: actor.schoolId, classId: query.classId }, select: { id: true } })).map(item => item.id) : undefined;
    const where: Prisma.ServiceAssignmentWhereInput = { schoolId: actor.schoolId, type: 'TRANSPORT', ...(query.routeId ? { routeId: query.routeId } : {}), ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}), ...(classEnrollmentIds ? { enrollmentId: { in: classEnrollmentIds } } : {}), ...(from || to ? { startDate: { lte: to ?? new Date('9999-12-31') }, OR: [{ endDate: null }, { endDate: { gte: from ?? new Date('0001-01-01') } }] } : {}) };
    const [rows, total] = await Promise.all([this.db.serviceAssignment.findMany({ where, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], ...page(query.page, query.limit) }), this.db.serviceAssignment.count({ where })]);
    const [enrollments, routes, vehicles] = await Promise.all([
      this.db.enrollment.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.map(row => row.enrollmentId) } } }),
      this.db.transportRoute.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.flatMap(row => row.routeId ? [row.routeId] : []) } } }),
      this.db.transportVehicle.findMany({ where: { schoolId: actor.schoolId, id: { in: rows.flatMap(row => row.vehicleId ? [row.vehicleId] : []) } } }),
    ]);
    const students = await this.db.student.findMany({ where: { schoolId: actor.schoolId, id: { in: enrollments.map(row => row.studentId) } }, select: { id: true, admissionNumber: true, name: true } });
    const classes = await this.db.classOffering.findMany({ where: { schoolId: actor.schoolId, id: { in: enrollments.map(row => row.classId) } }, select: { id: true, grade: true, section: true, stream: true } });
    const items = rows.map(row => { const enrollment = enrollments.find(item => item.id === row.enrollmentId); const classroom = classes.find(item => item.id === enrollment?.classId); return { ...row, student: students.find(item => item.id === enrollment?.studentId) ?? null, className: classroom ? `${classroom.grade} ${classroom.section}${classroom.stream ? ` · ${classroom.stream}` : ''}` : '', route: routes.find(item => item.id === row.routeId) ?? null, vehicle: vehicles.find(item => item.id === row.vehicleId) ?? null }; });
    return jsonSafe({ denominator: 'dated transport assignments', total, items, page: query.page, limit: query.limit, asOf: query.month ?? null });
  }

  async store(actor: Actor, query: ReportQueryDto) {
    const [from, to] = this.dateRange(query);
    const where: Prisma.StoreProductWhereInput = { schoolId: actor.schoolId };
    const [products, allProducts, total, movements] = await Promise.all([
      this.db.storeProduct.findMany({ where, orderBy: [{ active: 'desc' }, { name: 'asc' }], ...page(query.page, query.limit) }),
      this.db.storeProduct.findMany({ where, select: { quantity: true, alertQuantity: true } }),
      this.db.storeProduct.count({ where }),
      this.db.storeStockMovement.findMany({ where: { schoolId: actor.schoolId, ...(from || to ? { createdAt: { gte: from, lt: to ? new Date(to.getTime() + 86400000) : undefined } } : {}) }, orderBy: { createdAt: 'desc' } }),
    ]);
    const lowStock = allProducts.filter(product => product.quantity <= product.alertQuantity).length;
    const movementSummary = movements.reduce<Record<string, number>>((summary, movement) => { summary[movement.type] = (summary[movement.type] ?? 0) + movement.quantityDelta; return summary; }, {});
    return jsonSafe({ denominator: 'store products', total, lowStock, items: products, movementSummary, movementCount: movements.length, page: query.page, limit: query.limit, fromDate: query.fromDate ?? null, toDate: query.toDate ?? null });
  }

  private dateRange(query: ReportQueryDto): [Date | undefined, Date | undefined] {
    if (query.month) return [periodDate(query.month, 1), periodDate(query.month, 31)];
    const from = query.fromDate ? asDate(query.fromDate) : undefined;
    const to = query.toDate ? asDate(query.toDate) : undefined;
    if (from && to && from > to) throw new BadRequestException('fromDate must not be after toDate');
    return [from, to];
  }
}
