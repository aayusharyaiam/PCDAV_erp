import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor } from './auth';
import { audit, Db, Tx } from './db';
import { ListDto, PromotionBatchActionDto, PromotionBatchDto, PromotionDecisionDto } from './dto';
import { StudentAccess } from './student-access';

type ValidationError = { itemId: string; errors: string[] };
type ValidationResult = { valid: boolean; checkedAt: string; errors: ValidationError[] };

@Injectable()
export class PromotionService {
  constructor(private readonly db: Db, private readonly access: StudentAccess) {}

  async decisions(actor: Actor, query: ListDto) {
    if (!query.sessionId) throw new BadRequestException('sourceSessionId is required');
    const where: any = { schoolId: actor.schoolId, sourceSessionId: query.sessionId, ...(query.classId ? { sourceClassId: query.classId } : {}) };
    if (actor.role === Role.TEACHER) {
      const classIds = await this.access.classIds(actor, query.sessionId);
      if (query.classId && !classIds?.includes(query.classId)) throw new ForbiddenException('Promotion decisions are limited to your assigned classroom');
      where.sourceClassId = { in: classIds ?? [] };
      where.decidedBy = actor.id;
    }
    return this.db.promotionDecision.findMany({ where, orderBy: [{ sourceClassId: 'asc' }, { studentId: 'asc' }] });
  }

  async submitDecisions(actor: Actor, body: PromotionDecisionDto) {
    if (actor.role !== Role.TEACHER) throw new ForbiddenException('Only Teachers can submit Promote/Retain decisions');
    return this.db.atomic(async tx => {
      const session = await tx.academicSession.findFirst({ where: { id: body.sourceSessionId, schoolId: actor.schoolId } });
      const classroom = await tx.classOffering.findFirst({ where: { id: body.classId, schoolId: actor.schoolId } });
      if (!session || !classroom || classroom.sessionId !== body.sourceSessionId) throw new NotFoundException('Source session or classroom not found');
      const assignment = await tx.teacherAssignment.findFirst({ where: { schoolId: actor.schoolId, teacherId: actor.id, sessionId: body.sourceSessionId, classId: body.classId, endedAt: null, startDate: { lte: session.endDate }, OR: [{ endDate: null }, { endDate: { gte: session.startDate } }] } });
      if (!assignment) throw new ForbiddenException('You are not assigned to this classroom');
      const enrollmentIds = body.decisions.map(item => item.enrollmentId);
      if (new Set(enrollmentIds).size !== enrollmentIds.length) throw new BadRequestException('Each enrollment may receive only one final decision');
      const enrollments = await tx.enrollment.findMany({ where: { schoolId: actor.schoolId, sessionId: body.sourceSessionId, classId: body.classId, status: 'ACTIVE', id: { in: enrollmentIds } } });
      if (enrollments.length !== enrollmentIds.length) throw new BadRequestException('Every decision must target an active student in the assigned classroom');
      const existing = await tx.promotionDecision.findMany({ where: { schoolId: actor.schoolId, sourceEnrollmentId: { in: enrollmentIds } } });
      if (existing.length) throw new ConflictException('A final Promote/Retain decision already exists for one or more students');
      const enrollmentById = new Map(enrollments.map(enrollment => [enrollment.id, enrollment]));
      const created = [];
      for (const input of body.decisions) {
        const enrollment = enrollmentById.get(input.enrollmentId)!;
        const decision = await tx.promotionDecision.create({ data: { schoolId: actor.schoolId, sourceSessionId: body.sourceSessionId, sourceEnrollmentId: enrollment.id, studentId: enrollment.studentId, sourceClassId: body.classId, decision: input.decision, decidedBy: actor.id, reason: input.reason.trim() } });
        await audit(tx, actor, 'PROMOTION_DECISION_SUBMITTED', 'PromotionDecision', decision.id, input.reason, undefined, decision);
        created.push(decision);
      }
      return created;
    });
  }

  async createBatch(actor: Actor, body: PromotionBatchDto) {
    this.requireAdmin(actor);
    return this.db.atomic(async tx => {
      if (body.sourceSessionId === body.targetSessionId) throw new BadRequestException('Source and target sessions must be different');
      const [sourceSession, targetSession] = await Promise.all([
        tx.academicSession.findFirst({ where: { id: body.sourceSessionId, schoolId: actor.schoolId } }),
        tx.academicSession.findFirst({ where: { id: body.targetSessionId, schoolId: actor.schoolId } }),
      ]);
      if (!sourceSession || !targetSession) throw new NotFoundException('Source or target session not found');
      const sourceEnrollmentIds = body.items.map(item => item.sourceEnrollmentId);
      if (new Set(sourceEnrollmentIds).size !== sourceEnrollmentIds.length) throw new BadRequestException('Each source enrollment may appear only once in a batch');
      const [enrollments, decisions, targetClasses] = await Promise.all([
        tx.enrollment.findMany({ where: { schoolId: actor.schoolId, sessionId: body.sourceSessionId, status: 'ACTIVE', id: { in: sourceEnrollmentIds } } }),
        tx.promotionDecision.findMany({ where: { schoolId: actor.schoolId, sourceSessionId: body.sourceSessionId, sourceEnrollmentId: { in: sourceEnrollmentIds } } }),
        tx.classOffering.findMany({ where: { schoolId: actor.schoolId, sessionId: body.targetSessionId, id: { in: body.items.map(item => item.targetClassId) } } }),
      ]);
      if (enrollments.length !== sourceEnrollmentIds.length || decisions.length !== sourceEnrollmentIds.length || targetClasses.length !== new Set(body.items.map(item => item.targetClassId)).size) throw new BadRequestException('Every batch item must reference an active source enrollment, a final teacher decision, and a target-session classroom');
      const enrollmentById = new Map(enrollments.map(enrollment => [enrollment.id, enrollment]));
      const decisionByEnrollment = new Map(decisions.map(decision => [decision.sourceEnrollmentId, decision]));
      const targetClassIds = new Set(targetClasses.map(classroom => classroom.id));
      for (const item of body.items) {
        const enrollment = enrollmentById.get(item.sourceEnrollmentId)!;
        const decision = decisionByEnrollment.get(item.sourceEnrollmentId)!;
        if (decision.sourceClassId !== enrollment.classId || decision.studentId !== enrollment.studentId || !targetClassIds.has(item.targetClassId)) throw new BadRequestException('Batch item does not match its source decision or target session');
      }
      const batch = await tx.promotionBatch.create({ data: { schoolId: actor.schoolId, sourceSessionId: body.sourceSessionId, targetSessionId: body.targetSessionId, createdBy: actor.id } });
      await tx.promotionBatchItem.createMany({ data: body.items.map(item => { const enrollment = enrollmentById.get(item.sourceEnrollmentId)!; const decision = decisionByEnrollment.get(item.sourceEnrollmentId)!; return { schoolId: actor.schoolId, batchId: batch.id, sourceEnrollmentId: enrollment.id, decisionId: decision.id, studentId: enrollment.studentId, decision: decision.decision, targetClassId: item.targetClassId }; }) });
      await audit(tx, actor, 'PROMOTION_BATCH_CREATED', 'PromotionBatch', batch.id, 'Promotion batch prepared', undefined, { batch, items: body.items });
      return this.batchView(tx, batch.id, actor.schoolId);
    });
  }

  async getBatch(actor: Actor, id: string) {
    this.requireAdmin(actor);
    return this.batchView(this.db, id, actor.schoolId);
  }

  async validateBatch(actor: Actor, id: string, body: PromotionBatchActionDto) {
    this.requireAdmin(actor);
    return this.db.atomic(async tx => {
      const batch = await tx.promotionBatch.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!batch) throw new NotFoundException('Promotion batch not found');
      if (batch.status === 'EXECUTED') return this.batchView(tx, id, actor.schoolId);
      if (batch.version !== body.version) throw new ConflictException('Promotion batch changed. Reload before validating.');
      const result = await this.validate(tx, batch, actor.schoolId);
      const updated = await tx.promotionBatch.update({ where: { id: batch.id }, data: { status: result.valid ? 'READY' : 'INVALID', version: { increment: 1 }, validation: result as any, validatedAt: new Date() } });
      await audit(tx, actor, result.valid ? 'PROMOTION_BATCH_VALIDATED' : 'PROMOTION_BATCH_INVALID', 'PromotionBatch', batch.id, body.reason, batch, updated);
      return { ...(await this.batchView(tx, id, actor.schoolId)), validation: result };
    });
  }

  async executeBatch(actor: Actor, id: string, body: PromotionBatchActionDto) {
    this.requireAdmin(actor);
    return this.db.atomic(async tx => {
      const batch = await tx.promotionBatch.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!batch) throw new NotFoundException('Promotion batch not found');
      if (batch.status === 'EXECUTED') return this.batchView(tx, id, actor.schoolId);
      if (batch.status !== 'READY') throw new ConflictException('Validate the promotion batch successfully before execution');
      if (batch.version !== body.version) throw new ConflictException('Promotion batch changed. Reload before executing.');
      const validation = await this.validate(tx, batch, actor.schoolId);
      if (!validation.valid) throw new ConflictException('Promotion batch is stale; validate it again before execution');
      const [targetSession, items] = await Promise.all([
        tx.academicSession.findFirstOrThrow({ where: { id: batch.targetSessionId, schoolId: actor.schoolId } }),
        tx.promotionBatchItem.findMany({ where: { batchId: batch.id, schoolId: actor.schoolId }, orderBy: { id: 'asc' } }),
      ]);
      for (const item of items) {
        const source = await tx.enrollment.findFirstOrThrow({ where: { id: item.sourceEnrollmentId, schoolId: actor.schoolId } });
        const student = await tx.student.findFirstOrThrow({ where: { id: item.studentId, schoolId: actor.schoolId } });
        const target = await tx.enrollment.create({ data: { schoolId: actor.schoolId, studentId: student.id, sessionId: batch.targetSessionId, classId: item.targetClassId, status: 'ACTIVE', entryType: item.decision === 'PROMOTE' ? 'PROMOTED' : 'RETAINED', feeCategory: source.feeCategory, ews: source.ews, startDate: targetSession.startDate } });
        const ended = await tx.enrollment.update({ where: { id: source.id }, data: { status: item.decision === 'PROMOTE' ? 'PROMOTED' : 'RETAINED', endDate: targetSession.startDate } });
        await tx.promotionBatchItem.update({ where: { id: item.id }, data: { status: 'COMPLETED', targetEnrollmentId: target.id, executedAt: new Date(), error: null } });
        await audit(tx, actor, item.decision === 'PROMOTE' ? 'STUDENT_PROMOTED' : 'STUDENT_RETAINED', 'Enrollment', target.id, body.reason, source, { source: ended, target });
      }
      const executed = await tx.promotionBatch.update({ where: { id: batch.id }, data: { status: 'EXECUTED', version: { increment: 1 }, executedAt: new Date() } });
      await audit(tx, actor, 'PROMOTION_BATCH_EXECUTED', 'PromotionBatch', batch.id, body.reason, batch, executed);
      return this.batchView(tx, id, actor.schoolId);
    });
  }

  private async validate(tx: Tx, batch: any, schoolId: string): Promise<ValidationResult> {
    const items = await tx.promotionBatchItem.findMany({ where: { batchId: batch.id, schoolId }, orderBy: { id: 'asc' } });
    const sourceIds = items.map(item => item.sourceEnrollmentId);
    const studentIds = items.map(item => item.studentId);
    const targetClassIds = [...new Set(items.map(item => item.targetClassId))];
    const [sourceEnrollments, students, targetClasses, decisions, targetEnrollments] = await Promise.all([
      tx.enrollment.findMany({ where: { schoolId, id: { in: sourceIds } } }),
      tx.student.findMany({ where: { schoolId, id: { in: studentIds } } }),
      tx.classOffering.findMany({ where: { schoolId, sessionId: batch.targetSessionId, id: { in: targetClassIds } } }),
      tx.promotionDecision.findMany({ where: { schoolId, id: { in: items.map(item => item.decisionId) } } }),
      tx.enrollment.findMany({ where: { schoolId, sessionId: batch.targetSessionId, studentId: { in: studentIds } } }),
    ]);
    const sourceById = new Map(sourceEnrollments.map(row => [row.id, row]));
    const studentById = new Map(students.map(row => [row.id, row]));
    const classById = new Map(targetClasses.map(row => [row.id, row]));
    const decisionById = new Map(decisions.map(row => [row.id, row]));
    const targetByStudent = new Map(targetEnrollments.map(row => [row.studentId, row]));
    const errors: ValidationError[] = [];
    for (const item of items) {
      const itemErrors: string[] = [];
      const source = sourceById.get(item.sourceEnrollmentId);
      const student = studentById.get(item.studentId);
      const targetClass = classById.get(item.targetClassId);
      const decision = decisionById.get(item.decisionId);
      if (!source || source.sessionId !== batch.sourceSessionId || source.studentId !== item.studentId || source.status !== 'ACTIVE') itemErrors.push('Source enrollment is missing, changed, or no longer active');
      if (!student || student.status !== 'ACTIVE') itemErrors.push('Student is missing or no longer active');
      if (!targetClass) itemErrors.push('Target classroom is missing or belongs to another session');
      if (!decision || decision.sourceEnrollmentId !== item.sourceEnrollmentId || decision.studentId !== item.studentId || decision.decision !== item.decision) itemErrors.push('Teacher decision is missing or changed');
      if (targetByStudent.has(item.studentId)) itemErrors.push('Target-session enrollment already exists for this student');
      if (item.decision !== 'PROMOTE' && item.decision !== 'RETAIN') itemErrors.push('Invalid Promote/Retain decision');
      if (itemErrors.length) errors.push({ itemId: item.id, errors: itemErrors });
    }
    for (const classId of targetClassIds) {
      const targetClass = classById.get(classId);
      if (!targetClass) continue;
      const currentCount = await tx.enrollment.count({ where: { schoolId, sessionId: batch.targetSessionId, classId, status: 'ACTIVE' } });
      const itemCount = items.filter(item => item.targetClassId === classId && !targetByStudent.has(item.studentId)).length;
      if (currentCount + itemCount > targetClass.capacity) {
        for (const item of items.filter(candidate => candidate.targetClassId === classId)) {
          const existing = errors.find(error => error.itemId === item.id);
          if (existing) existing.errors.push('Target classroom capacity would be exceeded');
          else errors.push({ itemId: item.id, errors: ['Target classroom capacity would be exceeded'] });
        }
      }
    }
    return { valid: errors.length === 0, checkedAt: new Date().toISOString(), errors };
  }

  private async batchView(client: Db | Tx, id: string, schoolId: string) {
    const batch = await client.promotionBatch.findFirst({ where: { id, schoolId } });
    if (!batch) throw new NotFoundException('Promotion batch not found');
    const items = await client.promotionBatchItem.findMany({ where: { batchId: id, schoolId }, orderBy: { id: 'asc' } });
    return { ...batch, items };
  }

  private requireAdmin(actor: Actor) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPERADMIN) throw new ForbiddenException('Admin access is required');
  }
}
