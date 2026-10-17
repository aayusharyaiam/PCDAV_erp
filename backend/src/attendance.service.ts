import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor } from './auth';
import { audit, Db, Tx } from './db';
import { AttendanceCorrectionDecisionDto, AttendanceCorrectionDto, AttendanceDto, AttendanceQueryDto } from './dto';
import { asDate } from './utils';
import { StudentAccess } from './student-access';

const correctionStatuses = ['REQUESTED', 'APPROVED', 'REJECTED', 'STALE'];

type DbClient = Db | Tx;

function publicCorrectionRequest(row: any) {
  return row;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly db: Db, private readonly access: StudentAccess) {}

  async submit(actor: Actor, body: AttendanceDto) {
    if (actor.role !== Role.TEACHER) throw new ForbiddenException('Only Teachers can submit attendance');
    const attendanceDate = asDate(body.attendanceDate);
    return this.db.atomic(async tx => {
      const session = await tx.academicSession.findFirst({ where: { id: body.sessionId, schoolId: actor.schoolId } });
      const classroom = await tx.classOffering.findFirst({ where: { id: body.classId, schoolId: actor.schoolId } });
      if (!session || !classroom || classroom.sessionId !== body.sessionId) throw new NotFoundException('Session or classroom not found');
      if (attendanceDate < session.startDate || attendanceDate > session.endDate) throw new BadRequestException('Attendance date must fall within the academic session');
      await this.requireAssignment(tx, actor, body.sessionId, body.classId, attendanceDate);

      const enrollments = await tx.enrollment.findMany({ where: { schoolId: actor.schoolId, sessionId: body.sessionId, classId: body.classId, status: 'ACTIVE' }, orderBy: { studentId: 'asc' } });
      const markIds = body.marks.map(mark => mark.studentId);
      if (new Set(markIds).size !== markIds.length) throw new BadRequestException('Each enrolled student may appear only once');
      const enrollmentByStudent = new Map(enrollments.map(enrollment => [enrollment.studentId, enrollment]));
      if (markIds.length !== enrollments.length || markIds.some(studentId => !enrollmentByStudent.has(studentId))) throw new BadRequestException('Attendance must include every active student in the assigned classroom exactly once');

      const existing = await tx.attendanceSubmission.findFirst({ where: { schoolId: actor.schoolId, sessionId: body.sessionId, classId: body.classId, attendanceDate } });
      if (existing) throw new ConflictException('Attendance for this classroom and date was already submitted; request a correction instead');
      const submission = await tx.attendanceSubmission.create({ data: { schoolId: actor.schoolId, sessionId: body.sessionId, classId: body.classId, attendanceDate, markedBy: actor.id } });
      await tx.attendanceMark.createMany({ data: body.marks.map(mark => ({ schoolId: actor.schoolId, submissionId: submission.id, studentId: mark.studentId, enrollmentId: enrollmentByStudent.get(mark.studentId)!.id, status: mark.status })) });
      await audit(tx, actor, 'ATTENDANCE_SUBMITTED', 'AttendanceSubmission', submission.id, 'Daily attendance submitted', undefined, submission);
      return this.view(tx, submission.id, actor.schoolId);
    });
  }

  async list(actor: Actor, query: AttendanceQueryDto) {
    const where: any = { schoolId: actor.schoolId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), ...(query.classId ? { classId: query.classId } : {}), ...(query.attendanceDate ? { attendanceDate: asDate(query.attendanceDate) } : {}) };
    if (actor.role === Role.TEACHER) {
      const classIds = query.attendanceDate
        ? (await this.db.teacherAssignment.findMany({ where: { schoolId: actor.schoolId, teacherId: actor.id, ...(query.sessionId ? { sessionId: query.sessionId } : {}), endedAt: null, startDate: { lte: asDate(query.attendanceDate) }, OR: [{ endDate: null }, { endDate: { gte: asDate(query.attendanceDate) } }] }, select: { classId: true } })).map(assignment => assignment.classId)
        : await this.access.classIds(actor, query.sessionId);
      if (query.classId && !classIds?.includes(query.classId)) throw new ForbiddenException('Attendance is limited to your assigned classroom');
      where.classId = { in: classIds ?? [] };
    }
    const submissions = await this.db.attendanceSubmission.findMany({ where, orderBy: [{ attendanceDate: 'desc' }, { submittedAt: 'desc' }] });
    return Promise.all(submissions.map(submission => this.view(this.db, submission.id, actor.schoolId)));
  }

  async requestCorrection(actor: Actor, markId: string, body: AttendanceCorrectionDto) {
    if (actor.role !== Role.TEACHER) throw new ForbiddenException('Only Teachers can request attendance corrections');
    return this.db.atomic(async tx => {
      const mark = await tx.attendanceMark.findFirst({ where: { id: markId, schoolId: actor.schoolId } });
      if (!mark) throw new NotFoundException('Attendance mark not found');
      const submission = await tx.attendanceSubmission.findFirst({ where: { id: mark.submissionId, schoolId: actor.schoolId } });
      if (!submission) throw new NotFoundException('Attendance submission not found');
      await this.requireAssignment(tx, actor, submission.sessionId, submission.classId, submission.attendanceDate);
      const current = await this.currentCorrection(tx, mark.id, actor.schoolId);
      const beforeStatus = current?.correctedStatus ?? mark.status;
      if (beforeStatus === body.requestedStatus) throw new BadRequestException('The requested attendance status is already effective');
      const request = await tx.attendanceCorrectionRequest.create({ data: { schoolId: actor.schoolId, attendanceMarkId: mark.id, requestedBy: actor.id, beforeStatus, requestedStatus: body.requestedStatus, beforeCorrectionId: current?.id, reason: body.reason.trim() } });
      await audit(tx, actor, 'ATTENDANCE_CORRECTION_REQUESTED', 'AttendanceCorrectionRequest', request.id, body.reason, undefined, request);
      return publicCorrectionRequest(request);
    });
  }

  async correctionRequests(actor: Actor, query: AttendanceQueryDto) {
    const where: any = { schoolId: actor.schoolId, ...(query.status ? { status: query.status } : {}) };
    if (query.status && !correctionStatuses.includes(query.status)) throw new BadRequestException('Invalid correction request status');
    if (actor.role === Role.TEACHER) where.requestedBy = actor.id;
    const rows = await this.db.attendanceCorrectionRequest.findMany({ where, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }] });
    return rows.map(publicCorrectionRequest);
  }

  async decide(actor: Actor, requestId: string, body: AttendanceCorrectionDecisionDto, approve: boolean) {
    if (actor.role !== Role.ADMIN && actor.role !== Role.SUPERADMIN) throw new ForbiddenException('Admin approval is required');
    const result = await this.db.atomic(async tx => {
      const request = await tx.attendanceCorrectionRequest.findFirst({ where: { id: requestId, schoolId: actor.schoolId } });
      if (!request) throw new NotFoundException('Attendance correction request not found');
      if (request.status !== 'REQUESTED') {
        if ((approve && request.status === 'APPROVED' || !approve && request.status === 'REJECTED') && request.decisionReason === body.reason) return { row: request, stale: false };
        throw new ConflictException('This attendance correction request has already been decided');
      }
      if (request.version !== body.version) throw new ConflictException('Attendance correction request changed. Reload before deciding.');
      if (!approve) {
        const rejected = await tx.attendanceCorrectionRequest.update({ where: { id: request.id }, data: { status: 'REJECTED', version: { increment: 1 }, decidedBy: actor.id, decidedAt: new Date(), decisionReason: body.reason } });
        await audit(tx, actor, 'ATTENDANCE_CORRECTION_REJECTED', 'AttendanceCorrectionRequest', request.id, body.reason, request, rejected);
        return { row: rejected, stale: false };
      }
      const mark = await tx.attendanceMark.findFirstOrThrow({ where: { id: request.attendanceMarkId, schoolId: actor.schoolId } });
      const current = await this.currentCorrection(tx, mark.id, actor.schoolId);
      const currentStatus = current?.correctedStatus ?? mark.status;
      if (currentStatus !== request.beforeStatus || (current?.id ?? null) !== (request.beforeCorrectionId ?? null)) {
        const stale = await tx.attendanceCorrectionRequest.update({ where: { id: request.id }, data: { status: 'STALE', version: { increment: 1 }, decidedBy: actor.id, decidedAt: new Date(), decisionReason: body.reason } });
        await audit(tx, actor, 'ATTENDANCE_CORRECTION_STALE', 'AttendanceCorrectionRequest', request.id, body.reason, request, stale);
        return { row: stale, stale: true };
      }
      const correction = await tx.attendanceCorrection.create({ data: { schoolId: actor.schoolId, attendanceMarkId: mark.id, requestId: request.id, originalStatus: request.beforeStatus, correctedStatus: request.requestedStatus, appliedBy: actor.id, reason: request.reason } });
      const approved = await tx.attendanceCorrectionRequest.update({ where: { id: request.id }, data: { status: 'APPROVED', version: { increment: 1 }, decidedBy: actor.id, decidedAt: new Date(), decisionReason: body.reason } });
      await audit(tx, actor, 'ATTENDANCE_CORRECTION_APPROVED', 'AttendanceCorrectionRequest', request.id, body.reason, request, { request: approved, correction });
      return { row: approved, stale: false };
    });
    if (result.stale) throw new ConflictException('Attendance changed after this correction request; the request is stale');
    return publicCorrectionRequest(result.row);
  }

  private async requireAssignment(tx: Tx, actor: Actor, sessionId: string, classId: string, date: Date) {
    const assignment = await tx.teacherAssignment.findFirst({ where: { schoolId: actor.schoolId, sessionId, classId, teacherId: actor.id, endedAt: null, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gte: date } }] } });
    if (!assignment) throw new ForbiddenException('You are not assigned to this classroom for the selected date');
    return assignment;
  }

  private async currentCorrection(tx: Tx, attendanceMarkId: string, schoolId: string) {
    return tx.attendanceCorrection.findFirst({ where: { schoolId, attendanceMarkId }, orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }] });
  }

  private async view(client: DbClient, submissionId: string, schoolId: string) {
    const submission = await client.attendanceSubmission.findFirst({ where: { id: submissionId, schoolId } });
    if (!submission) throw new NotFoundException('Attendance submission not found');
    const marks = await client.attendanceMark.findMany({ where: { schoolId, submissionId }, orderBy: { studentId: 'asc' } });
    const corrections = await client.attendanceCorrection.findMany({ where: { schoolId, attendanceMarkId: { in: marks.map(mark => mark.id) } }, orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }] });
    const latest = new Map<string, any>();
    for (const correction of corrections) if (!latest.has(correction.attendanceMarkId)) latest.set(correction.attendanceMarkId, correction);
    return { ...submission, marks: marks.map(mark => { const correction = latest.get(mark.id); return { ...mark, submittedStatus: mark.status, status: correction?.correctedStatus ?? mark.status, correctionId: correction?.id ?? null }; }) };
  }
}
