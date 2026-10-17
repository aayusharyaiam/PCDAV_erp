import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Actor } from './auth';
import { audit, Db, Tx } from './db';
import { StudentLifecycleDto, StudentReadmissionDto, StudentTransferDto } from './dto';
import { asDate } from './utils';

type LeavingType = 'WITHDRAWN' | 'STRUCK_OFF';

@Injectable()
export class LifecycleService {
  constructor(private readonly db: Db) {}

  async history(actor: Actor, studentId: string) {
    const student = await this.db.student.findFirst({ where: { id: studentId, schoolId: actor.schoolId } });
    if (!student) throw new NotFoundException('Student not found');
    return this.db.studentLifecycleEvent.findMany({ where: { schoolId: actor.schoolId, studentId }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }] });
  }

  async leave(actor: Actor, studentId: string, body: StudentLifecycleDto, eventType: LeavingType) {
    const effectiveDate = asDate(body.effectiveDate);
    return this.db.atomic(async tx => {
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId: actor.schoolId } });
      if (!student) throw new NotFoundException('Student not found');
      if (student.version !== body.version) throw new ConflictException('Student changed. Reload before saving.');
      if (student.status !== 'ACTIVE') throw new BadRequestException('Only an active student can be withdrawn or struck off');
      const enrollment = await this.activeEnrollment(tx, actor.schoolId, studentId, body.enrollmentId);
      const session = await tx.academicSession.findFirst({ where: { id: enrollment.sessionId, schoolId: actor.schoolId } });
      if (!session || effectiveDate < enrollment.startDate || effectiveDate > session.endDate) throw new BadRequestException('Leaving date must fall within the enrollment session');

      const updatedEnrollment = await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: eventType, endDate: effectiveDate } });
      const updatedStudent = await tx.student.update({ where: { id: student.id }, data: { status: 'FORMER', version: { increment: 1 } } });
      const closedServices = await tx.serviceAssignment.updateMany({ where: { schoolId: actor.schoolId, enrollmentId: enrollment.id, active: true, startDate: { lte: effectiveDate }, OR: [{ endDate: null }, { endDate: { gt: effectiveDate } }] }, data: { active: false, endDate: effectiveDate } });
      const event = await tx.studentLifecycleEvent.create({ data: { schoolId: actor.schoolId, studentId: student.id, enrollmentId: enrollment.id, eventType, effectiveDate, reason: body.reason.trim(), fromStudentStatus: student.status, toStudentStatus: updatedStudent.status, fromEnrollmentStatus: enrollment.status, toEnrollmentStatus: updatedEnrollment.status, actorId: actor.id } });
      await audit(tx, actor, eventType === 'WITHDRAWN' ? 'STUDENT_WITHDRAWN' : 'STUDENT_STRUCK_OFF', 'Student', student.id, body.reason, { student, enrollment }, { student: updatedStudent, enrollment: updatedEnrollment, event, closedServiceCount: closedServices.count });
      return { student: updatedStudent, enrollment: updatedEnrollment, event, closedServiceCount: closedServices.count };
    });
  }

  async transfer(actor: Actor, studentId: string, body: StudentTransferDto) {
    const startDate = asDate(body.startDate);
    return this.db.atomic(async tx => {
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId: actor.schoolId } });
      if (!student) throw new NotFoundException('Student not found');
      if (student.status !== 'ACTIVE') throw new BadRequestException('Only an active student can be transferred');
      const source = await this.activeEnrollment(tx, actor.schoolId, studentId, body.sourceEnrollmentId);
      const targetSession = await tx.academicSession.findFirst({ where: { id: body.targetSessionId, schoolId: actor.schoolId } });
      const targetClass = await tx.classOffering.findFirst({ where: { id: body.targetClassId, schoolId: actor.schoolId, sessionId: body.targetSessionId } });
      if (!targetSession || !targetClass) throw new BadRequestException('Choose a classroom in a valid target session');
      if (source.sessionId === targetSession.id) throw new BadRequestException('A transfer must create an enrollment in a different academic session');
      if (!targetSession.admissionsOpen || startDate < targetSession.startDate || startDate > targetSession.endDate) throw new BadRequestException('Transfer date must fall within an open target session');
      const existingTarget = await tx.enrollment.findUnique({ where: { schoolId_studentId_sessionId: { schoolId: actor.schoolId, studentId, sessionId: targetSession.id } } });
      if (existingTarget) {
        if (existingTarget.entryType === 'TRANSFER' && existingTarget.classId === targetClass.id && existingTarget.startDate.getTime() === startDate.getTime()) return { student, sourceEnrollment: source, enrollment: existingTarget, idempotent: true };
        throw new ConflictException('This student already has an enrollment in the target session');
      }
      const activeCount = await tx.enrollment.count({ where: { schoolId: actor.schoolId, classId: targetClass.id, status: 'ACTIVE' } });
      if (activeCount >= targetClass.capacity) throw new ConflictException('The selected target classroom is at capacity');
      const target = await tx.enrollment.create({ data: { schoolId: actor.schoolId, studentId, sessionId: targetSession.id, classId: targetClass.id, status: 'ACTIVE', entryType: 'TRANSFER', feeCategory: body.feeCategory ?? source.feeCategory, ews: body.ews ?? source.ews, startDate } });
      const endedSource = await tx.enrollment.update({ where: { id: source.id }, data: { status: 'TRANSFERRED', endDate: startDate } });
      const closedServices = await tx.serviceAssignment.updateMany({ where: { schoolId: actor.schoolId, enrollmentId: source.id, active: true, startDate: { lte: startDate }, OR: [{ endDate: null }, { endDate: { gt: startDate } }] }, data: { active: false, endDate: startDate } });
      const event = await tx.studentLifecycleEvent.create({ data: { schoolId: actor.schoolId, studentId, enrollmentId: target.id, eventType: 'TRANSFERRED', effectiveDate: startDate, reason: body.reason.trim(), fromStudentStatus: student.status, toStudentStatus: student.status, fromEnrollmentStatus: source.status, toEnrollmentStatus: target.status, actorId: actor.id, metadata: { sourceEnrollmentId: source.id, endedSourceStatus: endedSource.status } } });
      const updatedStudent = await tx.student.update({ where: { id: student.id }, data: { version: { increment: 1 } } });
      await audit(tx, actor, 'STUDENT_TRANSFERRED', 'Student', student.id, body.reason, { student, sourceEnrollment: source }, { student: updatedStudent, sourceEnrollment: endedSource, enrollment: target, event, closedServiceCount: closedServices.count });
      return { student: updatedStudent, sourceEnrollment: endedSource, enrollment: target, event, closedServiceCount: closedServices.count };
    });
  }

  async readmit(actor: Actor, studentId: string, body: StudentReadmissionDto) {
    const startDate = asDate(body.startDate);
    return this.db.atomic(async tx => {
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId: actor.schoolId } });
      if (!student) throw new NotFoundException('Student not found');
      if (student.status !== 'FORMER') throw new BadRequestException('Readmission is available only for a former student');
      if (await tx.enrollment.findFirst({ where: { schoolId: actor.schoolId, studentId, status: 'ACTIVE' } })) throw new ConflictException('Student already has an active enrollment');
      const targetSession = await tx.academicSession.findFirst({ where: { id: body.targetSessionId, schoolId: actor.schoolId } });
      const targetClass = await tx.classOffering.findFirst({ where: { id: body.targetClassId, schoolId: actor.schoolId, sessionId: body.targetSessionId } });
      if (!targetSession || !targetClass) throw new BadRequestException('Choose a classroom in a valid target session');
      if (!targetSession.admissionsOpen || startDate < targetSession.startDate || startDate > targetSession.endDate) throw new BadRequestException('Readmission date must fall within an open target session');
      const existingTarget = await tx.enrollment.findUnique({ where: { schoolId_studentId_sessionId: { schoolId: actor.schoolId, studentId, sessionId: targetSession.id } } });
      if (existingTarget) throw new ConflictException('This student already has an enrollment in the readmission session');
      const activeCount = await tx.enrollment.count({ where: { schoolId: actor.schoolId, classId: targetClass.id, status: 'ACTIVE' } });
      if (activeCount >= targetClass.capacity) throw new ConflictException('The selected readmission classroom is at capacity');
      const previous = await tx.enrollment.findFirst({ where: { schoolId: actor.schoolId, studentId }, orderBy: { startDate: 'desc' } });
      const enrollment = await tx.enrollment.create({ data: { schoolId: actor.schoolId, studentId, sessionId: targetSession.id, classId: targetClass.id, status: 'ACTIVE', entryType: 'READMISSION', feeCategory: body.feeCategory ?? previous?.feeCategory ?? 'GENERAL', ews: body.ews ?? previous?.ews ?? false, startDate } });
      const updatedStudent = await tx.student.update({ where: { id: student.id }, data: { status: 'ACTIVE', version: { increment: 1 } } });
      const event = await tx.studentLifecycleEvent.create({ data: { schoolId: actor.schoolId, studentId, enrollmentId: enrollment.id, eventType: 'READMITTED', effectiveDate: startDate, reason: body.reason.trim(), fromStudentStatus: student.status, toStudentStatus: updatedStudent.status, fromEnrollmentStatus: previous?.status, toEnrollmentStatus: enrollment.status, actorId: actor.id, metadata: previous ? { previousEnrollmentId: previous.id } : undefined } });
      await audit(tx, actor, 'STUDENT_READMITTED', 'Student', student.id, body.reason, { student, previousEnrollment: previous }, { student: updatedStudent, enrollment, event });
      return { student: updatedStudent, enrollment, event };
    });
  }

  private async activeEnrollment(tx: Tx, schoolId: string, studentId: string, enrollmentId?: string) {
    const enrollment = enrollmentId
      ? await tx.enrollment.findFirst({ where: { id: enrollmentId, schoolId, studentId, status: 'ACTIVE' } })
      : await tx.enrollment.findFirst({ where: { schoolId, studentId, status: 'ACTIVE' }, orderBy: { startDate: 'desc' } });
    if (!enrollment) throw new BadRequestException('Active enrollment not found');
    return enrollment;
  }
}
