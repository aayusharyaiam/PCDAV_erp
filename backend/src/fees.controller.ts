import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AdminOnly, Actor, CurrentUser, Roles } from './auth';
import { Db, audit } from './db';
import { AssessmentCommitDto, AssessmentPreviewDto, CreditDto, FeeHeadDto, FeePlanDto, ListDto, PublishFeePlanDto } from './dto';
import { asDate } from './utils';
import { allocateCredits, jsonSafe, minor, money, periodDate, periodsForFrequency } from './fee-utils';

type PreviewLine = { feeHeadId: string; feeHeadCode: string; feeHeadName: string; ruleId?: string; serviceAssignmentId?: string; periodKey: string; dueDate: string; amountMinor: string; existingObligationId?: string; existingCreditAppliedMinor?: string };

function validateFeeRules(rules: FeePlanDto['rules']) {
  const keys = new Set<string>();
  for (const rule of rules) {
    const key = `${rule.feeHeadId}:${rule.classId ?? '*'}`;
    if (keys.has(key)) throw new BadRequestException('A fee head may appear only once per class scope in a fee-plan version');
    keys.add(key);
    if ((rule.frequency === 'ANNUAL' || rule.frequency === 'HALF_YEARLY') && !rule.assessmentMonth) throw new BadRequestException(`${rule.frequency} rules require an assessment month`);
  }
}

@Controller('fee-heads')
export class FeeHeadsController {
  constructor(private readonly db: Db) {}
  @Get() @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async list(@CurrentUser() actor: Actor) { return this.db.feeHead.findMany({ where: { schoolId: actor.schoolId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }); }
  @Post() @AdminOnly()
  async create(@CurrentUser() actor: Actor, @Body() body: FeeHeadDto) {
    return this.db.atomic(async tx => {
      const head = await tx.feeHead.create({ data: { schoolId: actor.schoolId, code: body.code.toUpperCase(), name: body.name.trim(), category: body.category } });
      await audit(tx, actor, 'FEE_HEAD_CREATED', 'FeeHead', head.id, 'Fee head created', undefined, head);
      return head;
    });
  }
}

@Controller('fee-plans')
export class FeePlansController {
  constructor(private readonly db: Db) {}
  @Get() @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async list(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const plans = await this.db.feePlan.findMany({ where: { schoolId: actor.schoolId, ...(query.sessionId ? { sessionId: query.sessionId } : {}) }, orderBy: { updatedAt: 'desc' } });
    const versions = await this.db.feePlanVersion.findMany({ where: { schoolId: actor.schoolId, planId: { in: plans.map(plan => plan.id) } }, orderBy: { versionNumber: 'desc' } });
    return plans.map(plan => ({ ...plan, versions: versions.filter(version => version.planId === plan.id) }));
  }

  @Get(':id') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async get(@CurrentUser() actor: Actor, @Param('id') id: string) {
    const plan = await this.db.feePlan.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!plan) throw new BadRequestException('Fee plan not found');
    const versions = await this.db.feePlanVersion.findMany({ where: { planId: id, schoolId: actor.schoolId }, orderBy: { versionNumber: 'desc' } });
    const rules = await this.db.feeRule.findMany({ where: { schoolId: actor.schoolId, versionId: { in: versions.map(version => version.id) } } });
    return jsonSafe({ ...plan, versions: versions.map(version => ({ ...version, rules: rules.filter(rule => rule.versionId === version.id) })) });
  }

  @Post() @AdminOnly()
  async create(@CurrentUser() actor: Actor, @Body() body: FeePlanDto) {
    if (!body.rules.length) throw new BadRequestException('Add at least one fee rule before saving a plan');
    validateFeeRules(body.rules);
    const effectiveFrom = asDate(body.effectiveFrom); const effectiveTo = body.effectiveTo ? asDate(body.effectiveTo) : undefined;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('Fee-plan end date must be after its start date');
    return this.db.atomic(async tx => {
      const session = await tx.academicSession.findFirst({ where: { id: body.sessionId, schoolId: actor.schoolId } });
      if (!session) throw new BadRequestException('Session not found');
      const headIds = [...new Set(body.rules.map(rule => rule.feeHeadId))];
      if (await tx.feeHead.count({ where: { schoolId: actor.schoolId, id: { in: headIds }, active: true } }) !== headIds.length) throw new BadRequestException('One or more fee heads are invalid or inactive');
      const classIds = [...new Set(body.rules.flatMap(rule => rule.classId ? [rule.classId] : []))];
      if (classIds.length && await tx.classOffering.count({ where: { schoolId: actor.schoolId, sessionId: body.sessionId, id: { in: classIds } } }) !== classIds.length) throw new BadRequestException('One or more fee classes are invalid for this session');
      const plan = await tx.feePlan.create({ data: { schoolId: actor.schoolId, sessionId: body.sessionId, name: body.name.trim(), createdBy: actor.id } });
      const version = await tx.feePlanVersion.create({ data: { schoolId: actor.schoolId, planId: plan.id, sessionId: body.sessionId, versionNumber: 1, effectiveFrom, effectiveTo, createdBy: actor.id } });
      const rules = await Promise.all(body.rules.map(rule => tx.feeRule.create({ data: { schoolId: actor.schoolId, versionId: version.id, feeHeadId: rule.feeHeadId, classId: rule.classId, frequency: rule.frequency, amountMinor: minor(rule.amountMinor), assessmentMonth: rule.assessmentMonth, entryType: rule.entryType ?? 'ALL', category: rule.category ?? 'ALL', dueDay: rule.dueDay ?? 10 } })));
      await audit(tx, actor, 'FEE_PLAN_CREATED', 'FeePlan', plan.id, 'Draft fee plan created', undefined, { plan, version, rules });
      return jsonSafe({ plan, version, rules });
    });
  }

  @Post(':id/publish') @AdminOnly()
  async publish(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PublishFeePlanDto) {
    return this.db.atomic(async tx => {
      const version = await tx.feePlanVersion.findFirst({ where: { schoolId: actor.schoolId, planId: id, versionNumber: body.versionNumber } });
      if (!version) throw new BadRequestException('Fee-plan version not found');
      if (version.status === 'PUBLISHED') return version;
      if (version.status !== 'DRAFT') throw new ConflictException('Archived versions cannot be republished');
      const previous = await tx.feePlanVersion.findFirst({ where: { schoolId: actor.schoolId, planId: id, status: { in: ['PUBLISHED', 'ARCHIVED'] } }, orderBy: { effectiveFrom: 'desc' } });
      if (previous && (version.effectiveFrom <= previous.effectiveFrom || version.versionNumber <= previous.versionNumber)) throw new ConflictException('A new version must take effect after the previous published version');
      const rules = await tx.feeRule.count({ where: { schoolId: actor.schoolId, versionId: version.id } });
      if (!rules) throw new BadRequestException('Cannot publish a fee plan without rules');
      await tx.feePlanVersion.updateMany({ where: { schoolId: actor.schoolId, planId: id, id: { not: version.id }, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
      const published = await tx.feePlanVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
      await tx.feePlan.update({ where: { id }, data: { status: 'PUBLISHED' } });
      await audit(tx, actor, 'FEE_PLAN_PUBLISHED', 'FeePlanVersion', version.id, body.reason, version, published);
      return published;
    });
  }

  @Post(':id/versions') @AdminOnly()
  async addVersion(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: FeePlanDto) {
    if (!body.rules.length) throw new BadRequestException('Add at least one fee rule before saving a version');
    validateFeeRules(body.rules);
    const effectiveFrom = asDate(body.effectiveFrom); const effectiveTo = body.effectiveTo ? asDate(body.effectiveTo) : undefined;
    if (effectiveTo && effectiveTo <= effectiveFrom) throw new BadRequestException('Fee-plan end date must be after its start date');
    return this.db.atomic(async tx => {
      const plan = await tx.feePlan.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!plan || plan.sessionId !== body.sessionId) throw new BadRequestException('Fee plan not found for this session');
      const headIds = [...new Set(body.rules.map(rule => rule.feeHeadId))];
      if (await tx.feeHead.count({ where: { schoolId: actor.schoolId, id: { in: headIds }, active: true } }) !== headIds.length) throw new BadRequestException('One or more fee heads are invalid or inactive');
      const classIds = [...new Set(body.rules.flatMap(rule => rule.classId ? [rule.classId] : []))];
      if (classIds.length && await tx.classOffering.count({ where: { schoolId: actor.schoolId, sessionId: plan.sessionId, id: { in: classIds } } }) !== classIds.length) throw new BadRequestException('One or more fee classes are invalid for this session');
      const last = await tx.feePlanVersion.findFirst({ where: { schoolId: actor.schoolId, planId: id }, orderBy: { versionNumber: 'desc' } });
      const version = await tx.feePlanVersion.create({ data: { schoolId: actor.schoolId, planId: id, sessionId: plan.sessionId, versionNumber: (last?.versionNumber ?? 0) + 1, effectiveFrom, effectiveTo, createdBy: actor.id } });
      const rules = await Promise.all(body.rules.map(rule => tx.feeRule.create({ data: { schoolId: actor.schoolId, versionId: version.id, feeHeadId: rule.feeHeadId, classId: rule.classId, frequency: rule.frequency, amountMinor: minor(rule.amountMinor), assessmentMonth: rule.assessmentMonth, entryType: rule.entryType ?? 'ALL', category: rule.category ?? 'ALL', dueDay: rule.dueDay ?? 10 } })));
      await audit(tx, actor, 'FEE_PLAN_VERSION_CREATED', 'FeePlanVersion', version.id, 'Fee plan version created', undefined, { version, rules });
      return jsonSafe({ plan, version, rules });
    });
  }
}

@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly db: Db) {}

  @Post('preview') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async preview(@CurrentUser() actor: Actor, @Body() body: AssessmentPreviewDto) {
    return this.db.atomic(async tx => jsonSafe(await this.calculate(actor, body, tx)));
  }

  @Post() @AdminOnly()
  async commit(@CurrentUser() actor: Actor, @Body() body: AssessmentCommitDto) {
    return this.db.atomic(async tx => {
      const calculated = await this.calculate(actor, body, tx);
      const created = [];
      for (const line of calculated.lines) {
        if (line.existingObligationId) continue;
        const amount = BigInt(line.amountMinor);
        const obligation = await tx.feeObligation.create({ data: { schoolId: actor.schoolId, studentId: calculated.studentId, enrollmentId: calculated.enrollmentId, feeHeadId: line.feeHeadId, feeRuleId: line.ruleId, serviceAssignmentId: line.serviceAssignmentId, periodKey: line.periodKey, dueDate: asDate(line.dueDate), amountMinor: amount, creditAppliedMinor: 0n, status: 'OPEN' } });
        created.push(obligation);
      }
      await allocateCredits(tx, actor, calculated.studentId);
      const refreshed = created.length ? await tx.feeObligation.findMany({ where: { id: { in: created.map(item => item.id) } } }) : [];
      await audit(tx, actor, 'FEE_ASSESSMENT_COMMITTED', 'Enrollment', calculated.enrollmentId, body.reason, undefined, { created: created.map(item => item.id), skipped: calculated.lines.length - created.length });
      return jsonSafe({ created: refreshed, skipped: calculated.lines.length - created.length, studentId: calculated.studentId, enrollmentId: calculated.enrollmentId });
    });
  }

  private async calculate(actor: Actor, body: AssessmentPreviewDto, tx: Prisma.TransactionClient = this.db) {
    const enrollment = await tx.enrollment.findFirst({ where: { id: body.enrollmentId, schoolId: actor.schoolId, status: { in: ['ACTIVE', 'PENDING'] } } });
    if (!enrollment) throw new BadRequestException('Enrollment not found or not assessable');
    const session = await tx.academicSession.findFirst({ where: { id: enrollment.sessionId, schoolId: actor.schoolId } });
    const classroom = await tx.classOffering.findFirst({ where: { id: enrollment.classId, schoolId: actor.schoolId } });
    if (!session || !classroom) throw new BadRequestException('Enrollment academic context is incomplete');
    const periods = [...new Set(body.periods)].sort();
    if (periods.some(period => periodDate(period, 31) < session.startDate || periodDate(period, 1) > session.endDate)) throw new BadRequestException('Fee periods must fall within the enrollment session');
    const allVersions = await tx.feePlanVersion.findMany({ where: { schoolId: actor.schoolId, sessionId: enrollment.sessionId, status: { in: ['PUBLISHED', 'ARCHIVED'] } }, orderBy: [{ effectiveFrom: 'desc' }, { versionNumber: 'desc' }] });
    const selectedVersion = body.feePlanVersionId ? allVersions.find(item => item.id === body.feePlanVersionId) : undefined;
    if (body.feePlanVersionId && !selectedVersion) throw new BadRequestException('Published fee-plan version not found for this session');
    const candidates = allVersions.filter(version => version.effectiveFrom <= periodDate(periods.at(-1)!, 31) && (!version.effectiveTo || version.effectiveTo >= periodDate(periods[0], 1)));
    if (!selectedVersion && new Set(candidates.map(version => version.planId)).size > 1) throw new BadRequestException('Multiple fee plans apply; select a fee-plan version explicitly');
    const versions = selectedVersion ? [selectedVersion] : candidates;
    if (!versions.length) throw new BadRequestException('No published fee plan exists for these periods');
    const rules = await tx.feeRule.findMany({ where: { schoolId: actor.schoolId, versionId: { in: versions.map(version => version.id) }, OR: [{ classId: enrollment.classId }, { classId: null }] } });
    const eligibleRules = rules.filter(rule => (rule.entryType === 'ALL' || rule.entryType === enrollment.entryType) && (rule.category === 'ALL' || rule.category === (enrollment.ews ? 'EWS' : enrollment.feeCategory)));
    const specificHeads = new Set(eligibleRules.filter(rule => rule.classId === enrollment.classId).map(rule => `${rule.versionId}:${rule.feeHeadId}`));
    const applicableRules = eligibleRules.filter(rule => rule.classId === enrollment.classId || !specificHeads.has(`${rule.versionId}:${rule.feeHeadId}`));
    const heads = await tx.feeHead.findMany({ where: { schoolId: actor.schoolId, id: { in: applicableRules.map(rule => rule.feeHeadId) } } });
    const existing = await tx.feeObligation.findMany({ where: { schoolId: actor.schoolId, enrollmentId: enrollment.id } });
    const studentObligations = await tx.feeObligation.findMany({ where: { schoolId: actor.schoolId, studentId: enrollment.studentId } });
    const lines: PreviewLine[] = [];
    for (const rule of applicableRules) {
      const version = versions.find(item => item.id === rule.versionId)!;
      const anchor = new Date(Math.max(enrollment.startDate.getTime(), version.effectiveFrom.getTime(), session.startDate.getTime()));
      const occurrence = anchor.toISOString().slice(0, 7);
      const rulePeriods = rule.frequency === 'ONE_TIME' ? periods.filter(period => period === occurrence) : periodsForFrequency(rule.frequency, periods, rule.assessmentMonth ?? undefined);
      for (const periodKey of rulePeriods) {
        const dueDate = rule.frequency === 'ONE_TIME' ? new Date(Math.max(periodDate(periodKey, rule.dueDay).getTime(), anchor.getTime())) : periodDate(periodKey, rule.dueDay);
        if (dueDate < anchor || (enrollment.endDate && dueDate > enrollment.endDate) || (version.effectiveTo && dueDate > version.effectiveTo) || dueDate > session.endDate) continue;
        // An archived version is billable only before its successor takes effect.
        if (allVersions.some(item => item.planId === version.planId && item.effectiveFrom > version.effectiveFrom && item.effectiveFrom <= dueDate)) continue;
        if (['ONE_TIME', 'ANNUAL'].includes(rule.frequency) && (existing.some(item => item.feeHeadId === rule.feeHeadId && item.periodKey !== periodKey) || lines.some(item => item.feeHeadId === rule.feeHeadId && item.periodKey !== periodKey))) continue;
        const found = existing.find(item => item.feeHeadId === rule.feeHeadId && item.periodKey === periodKey);
        const head = heads.find(item => item.id === rule.feeHeadId);
        lines.push({ feeHeadId: rule.feeHeadId, feeHeadCode: head?.code ?? '', feeHeadName: head?.name ?? 'Fee', ruleId: rule.id, periodKey, dueDate: (found?.dueDate ?? dueDate).toISOString().slice(0, 10), amountMinor: money(found?.amountMinor ?? rule.amountMinor), existingObligationId: found?.id, existingCreditAppliedMinor: found ? money(found.creditAppliedMinor) : undefined });
      }
    }
    const assignments = await tx.serviceAssignment.findMany({ where: { schoolId: actor.schoolId, enrollmentId: enrollment.id, startDate: { lte: periodDate(periods.at(-1)!, 31) }, OR: [{ endDate: null }, { endDate: { gte: periodDate(periods[0], 1) } }] } });
    const serviceHeads = await tx.feeHead.findMany({ where: { schoolId: actor.schoolId, code: { in: ['TRANSPORT', 'HOSTEL_ADMISSION', 'HOSTEL_MONTHLY'] } } });
    for (const assignment of assignments) {
      const headCode = assignment.type === 'TRANSPORT' ? 'TRANSPORT' : assignment.frequency === 'ONE_TIME' ? 'HOSTEL_ADMISSION' : 'HOSTEL_MONTHLY';
      const head = serviceHeads.find(item => item.code === headCode);
      if (!head) throw new BadRequestException(`Configure the ${headCode} fee head before assessing this service`);
      for (const periodKey of assignment.frequency === 'ONE_TIME' ? periods.filter(period => period === assignment.startDate.toISOString().slice(0, 7)) : periods) {
        const dueDate = assignment.frequency === 'ONE_TIME' ? assignment.startDate : periodDate(periodKey, 10);
        if (dueDate < assignment.startDate || (assignment.endDate && dueDate > assignment.endDate) || dueDate < session.startDate || dueDate > session.endDate || dueDate < enrollment.startDate || (enrollment.endDate && dueDate > enrollment.endDate)) continue;
        if (lines.some(line => line.feeHeadId === head.id && line.periodKey === periodKey)) throw new ConflictException('A fee head has multiple charge sources for this period; resolve overlapping rules or assignments');
        const found = existing.find(item => assignment.frequency === 'ONE_TIME' ? item.serviceAssignmentId === assignment.id : item.feeHeadId === head.id && item.periodKey === periodKey);
        if (found && found.serviceAssignmentId !== assignment.id) throw new ConflictException('A different source has already assessed this service period');
        lines.push({ feeHeadId: head.id, feeHeadCode: head.code, feeHeadName: `${head.name} · ${assignment.label}`, periodKey, dueDate: (found?.dueDate ?? dueDate).toISOString().slice(0, 10), amountMinor: money(found?.amountMinor ?? assignment.amountMinor), serviceAssignmentId: assignment.id, existingObligationId: found?.id, existingCreditAppliedMinor: found ? money(found.creditAppliedMinor) : undefined });
      }
    }
    lines.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.feeHeadName.localeCompare(b.feeHeadName));
    const gross = lines.filter(line => !line.existingObligationId).reduce((sum, line) => sum + BigInt(line.amountMinor), 0n);
    const credit = (await tx.feeCredit.findMany({ where: { schoolId: actor.schoolId, studentId: enrollment.studentId, remainingMinor: { gt: 0n } } })).reduce((sum, item) => sum + item.remainingMinor, 0n);
    const allocationOrder = [
      ...studentObligations.map(item => ({ date: item.dueDate.toISOString().slice(0, 10), amount: item.amountMinor - item.creditAppliedMinor - item.paidMinor, existing: true })),
      ...lines.filter(line => !line.existingObligationId).map(line => ({ date: line.dueDate, amount: BigInt(line.amountMinor), existing: false })),
    ].sort((a, b) => a.date.localeCompare(b.date) || Number(b.existing) - Number(a.existing));
    let remainingCredit = credit; let creditForNew = 0n; let creditForExisting = 0n;
    for (const item of allocationOrder) {
      if (item.amount <= 0n) continue;
      const applied = item.amount < remainingCredit ? item.amount : remainingCredit;
      remainingCredit -= applied;
      if (item.existing) creditForExisting += applied; else creditForNew += applied;
    }
    return { studentId: enrollment.studentId, enrollmentId: enrollment.id, feePlanVersionId: versions[0].id, feePlanVersionIds: versions.map(version => version.id), lines, grossMinor: money(gross), availableCreditMinor: money(credit), creditReservedForOlderMinor: money(creditForExisting), projectedNetMinor: money(gross > creditForNew ? gross - creditForNew : 0n) };
  }
}

@Controller('credits')
export class CreditsController {
  constructor(private readonly db: Db) {}
  @Post() @AdminOnly()
  async create(@CurrentUser() actor: Actor, @Body() body: CreditDto) {
    const amount = minor(body.amountMinor);
    return this.db.atomic(async tx => {
      const student = await tx.student.findFirst({ where: { id: body.studentId, schoolId: actor.schoolId } });
      if (!student) throw new BadRequestException('Student not found');
      const credit = await tx.feeCredit.create({ data: { schoolId: actor.schoolId, studentId: body.studentId, amountMinor: amount, remainingMinor: amount, source: body.source, reason: body.reason, createdBy: actor.id } });
      await allocateCredits(tx, actor, body.studentId);
      await audit(tx, actor, 'FEE_CREDIT_CREATED', 'Student', body.studentId, body.reason, undefined, credit);
      return jsonSafe(await tx.feeCredit.findUniqueOrThrow({ where: { id: credit.id } }));
    });
  }
}

@Controller('students')
export class StudentLedgerController {
  constructor(private readonly db: Db) {}
  @Get(':id/ledger') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async ledger(@CurrentUser() actor: Actor, @Param('id') id: string) {
    const student = await this.db.student.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!student) throw new BadRequestException('Student not found');
    const [obligations, credits] = await Promise.all([
      this.db.feeObligation.findMany({ where: { schoolId: actor.schoolId, studentId: id }, orderBy: [{ dueDate: 'asc' }, { assessedAt: 'asc' }] }),
      this.db.feeCredit.findMany({ where: { schoolId: actor.schoolId, studentId: id }, orderBy: { createdAt: 'asc' } }),
    ]);
    const heads = await this.db.feeHead.findMany({ where: { schoolId: actor.schoolId, id: { in: obligations.map(item => item.feeHeadId) } } });
    const items = obligations.map(item => ({ ...item, feeHeadName: heads.find(head => head.id === item.feeHeadId)?.name ?? 'Fee', outstandingMinor: item.amountMinor - item.creditAppliedMinor - item.paidMinor }));
    const outstanding = items.reduce((sum, item) => sum + (item.outstandingMinor > 0n ? item.outstandingMinor : 0n), 0n);
    const availableCredit = credits.reduce((sum, item) => sum + item.remainingMinor, 0n);
    return jsonSafe({ student: { id: student.id, admissionNumber: student.admissionNumber, name: student.name }, items, credits, totals: { assessedMinor: items.reduce((sum, item) => sum + item.amountMinor, 0n), outstandingMinor: outstanding, availableCreditMinor: availableCredit } });
  }
}
