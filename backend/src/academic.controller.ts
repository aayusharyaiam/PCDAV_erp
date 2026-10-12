import { Body, Controller, Get, Param, Patch, Post, Query, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Db, audit } from './db';
import { AdminOnly, Actor, CurrentUser, Roles } from './auth';
import { Role } from '@prisma/client';
import { AssignmentDto, ClassChangeDto, ClassDto, EndAssignmentDto, ListDto, SchoolDto, SessionDto, SessionStateDto, SubjectDto } from './dto';
import { asDate, page } from './utils';
import { StudentAccess } from './student-access';

@Controller('school')
export class AcademicController {
  constructor(private readonly db: Db, private readonly access: StudentAccess) {}

  @Get()
  async school(@CurrentUser() actor: Actor) { return this.db.school.findUniqueOrThrow({ where: { id: actor.schoolId } }); }

  @Patch()
  @AdminOnly()
  async updateSchool(@CurrentUser() actor: Actor, @Body() body: SchoolDto) {
    return this.db.atomic(async tx => {
      const school = await tx.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
      if (school.version !== body.version) throw new ConflictException('School settings changed. Reload before saving.');
      const updated = await tx.school.update({ where: { id: school.id }, data: { name: body.name.trim(), address: body.address, phone: body.phone, email: body.email, admissionPrefix: body.admissionPrefix, version: { increment: 1 } } });
      await audit(tx, actor, 'SCHOOL_UPDATED', 'School', school.id, 'School settings updated', school, updated);
      return updated;
    });
  }

  @Get('sessions')
  async sessions(@CurrentUser() actor: Actor) { return this.db.academicSession.findMany({ where: { schoolId: actor.schoolId }, orderBy: { startDate: 'desc' } }); }

  @Post('sessions')
  @AdminOnly()
  async createSession(@CurrentUser() actor: Actor, @Body() body: SessionDto) {
    const startDate = asDate(body.startDate); const endDate = asDate(body.endDate);
    if (endDate <= startDate) throw new BadRequestException('Session end date must be after its start date');
    return this.db.atomic(async tx => {
      if (body.current) await tx.academicSession.updateMany({ where: { schoolId: actor.schoolId }, data: { current: false } });
      const session = await tx.academicSession.create({ data: { schoolId: actor.schoolId, name: body.name.trim(), startDate, endDate, current: body.current, admissionsOpen: body.admissionsOpen } });
      await audit(tx, actor, 'SESSION_CREATED', 'AcademicSession', session.id, 'Academic session created', undefined, session);
      return session;
    });
  }

  @Patch('sessions/:id')
  @AdminOnly()
  async updateSession(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: SessionStateDto) {
    return this.db.atomic(async tx => {
      const existing = await tx.academicSession.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!existing) throw new NotFoundException('Session not found');
      if (body.current) await tx.academicSession.updateMany({ where: { schoolId: actor.schoolId, id: { not: id } }, data: { current: false } });
      const updated = await tx.academicSession.update({ where: { id }, data: body });
      await audit(tx, actor, 'SESSION_UPDATED', 'AcademicSession', id, 'Session state updated', existing, updated);
      return updated;
    });
  }

  @Get('subjects')
  async subjects(@CurrentUser() actor: Actor) { return this.db.subject.findMany({ where: { schoolId: actor.schoolId }, orderBy: { name: 'asc' } }); }

  @Post('subjects')
  @AdminOnly()
  async createSubject(@CurrentUser() actor: Actor, @Body() body: SubjectDto) {
    return this.db.atomic(async tx => {
      const subject = await tx.subject.create({ data: { schoolId: actor.schoolId, code: body.code, name: body.name.trim() } });
      await audit(tx, actor, 'SUBJECT_CREATED', 'Subject', subject.id, 'Subject created', undefined, subject);
      return subject;
    });
  }

  @Get('classes')
  async classes(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const assigned = await this.access.classIds(actor, query.sessionId);
    const where = { schoolId: actor.schoolId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), ...(assigned ? { id: { in: assigned } } : {}) };
    const [items, total] = await Promise.all([this.db.classOffering.findMany({ where, orderBy: [{ grade: 'asc' }, { section: 'asc' }], ...page(query.page, query.limit) }), this.db.classOffering.count({ where })]);
    const withCounts = await Promise.all(items.map(async item => ({ ...item, activeEnrollmentCount: await this.db.enrollment.count({ where: { schoolId: actor.schoolId, classId: item.id, status: 'ACTIVE' } }) })));
    return { items: withCounts, total, page: query.page, limit: query.limit };
  }

  @Post('classes')
  @AdminOnly()
  async createClass(@CurrentUser() actor: Actor, @Body() body: ClassDto) {
    const session = await this.db.academicSession.findFirst({ where: { id: body.sessionId, schoolId: actor.schoolId } });
    if (!session) throw new NotFoundException('Session not found');
    return this.db.atomic(async tx => {
      if (await tx.subject.count({ where: { schoolId: actor.schoolId, id: { in: body.subjectIds } } }) !== body.subjectIds.length) throw new BadRequestException('Choose valid, distinct subjects');
      const item = await tx.classOffering.create({ data: { schoolId: actor.schoolId, sessionId: body.sessionId, grade: body.grade.trim(), section: body.section.trim(), stream: body.stream.trim(), capacity: body.capacity, subjectIds: body.subjectIds } });
      await audit(tx, actor, 'CLASS_CREATED', 'ClassOffering', item.id, 'Class created', undefined, item);
      return item;
    });
  }

  @Patch('classes/:id')
  @AdminOnly()
  async updateClass(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: ClassChangeDto) {
    return this.db.atomic(async tx => {
      const existing = await tx.classOffering.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!existing) throw new NotFoundException('Class not found');
      if (existing.version !== body.version) throw new ConflictException('Class changed. Reload before saving.');
      if (await tx.enrollment.count({ where: { schoolId: actor.schoolId, classId: id, status: 'ACTIVE' } }) > body.capacity) throw new BadRequestException('Capacity is below current enrollment');
      if (await tx.subject.count({ where: { schoolId: actor.schoolId, id: { in: body.subjectIds } } }) !== body.subjectIds.length) throw new BadRequestException('Choose valid, distinct subjects');
      if (body.nextClassId && (body.nextClassId === id || !await tx.classOffering.findFirst({ where: { id: body.nextClassId, schoolId: actor.schoolId } }))) throw new BadRequestException('Invalid next-class mapping');
      const updated = await tx.classOffering.update({ where: { id }, data: { capacity: body.capacity, subjectIds: body.subjectIds, nextClassId: body.nextClassId, version: { increment: 1 } } });
      await audit(tx, actor, 'CLASS_UPDATED', 'ClassOffering', id, 'Class updated', existing, updated);
      return updated;
    });
  }

  @Get('teacher-assignments')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.TEACHER)
  async assignments(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const where = { schoolId: actor.schoolId, ...(query.sessionId ? { sessionId: query.sessionId } : {}), ...(actor.role === Role.TEACHER ? { teacherId: actor.id, endedAt: null } : {}) };
    return this.db.teacherAssignment.findMany({ where, orderBy: { startDate: 'desc' } });
  }

  @Post('teacher-assignments')
  @AdminOnly()
  async assignTeacher(@CurrentUser() actor: Actor, @Body() body: AssignmentDto) {
    return this.db.atomic(async tx => {
      const teacher = await tx.user.findFirst({ where: { id: body.teacherId, schoolId: actor.schoolId, role: Role.TEACHER, active: true } });
      const classOffering = await tx.classOffering.findFirst({ where: { id: body.classId, schoolId: actor.schoolId } });
      if (!teacher || !classOffering) throw new BadRequestException('Choose an active Teacher and valid classroom');
      const session = await tx.academicSession.findUniqueOrThrow({ where: { id: classOffering.sessionId } });
      const start = asDate(body.startDate);
      if (start < session.startDate || start > session.endDate) throw new BadRequestException('Assignment date must fall within the session');
      const existing = await tx.teacherAssignment.findFirst({ where: { schoolId: actor.schoolId, teacherId: body.teacherId, sessionId: classOffering.sessionId, endedAt: null } });
      if (existing) throw new ConflictException('This Teacher already has an active classroom assignment for this session');
      const assignment = await tx.teacherAssignment.create({ data: { schoolId: actor.schoolId, sessionId: classOffering.sessionId, teacherId: body.teacherId, classId: body.classId, startDate: asDate(body.startDate), assignedBy: actor.id } });
      await audit(tx, actor, 'TEACHER_ASSIGNED', 'TeacherAssignment', assignment.id, 'Teacher assigned to classroom', undefined, assignment);
      return assignment;
    });
  }

  @Post('teacher-assignments/:id/end')
  @AdminOnly()
  async endAssignment(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: EndAssignmentDto) {
    return this.db.atomic(async tx => {
      const existing = await tx.teacherAssignment.findFirst({ where: { id, schoolId: actor.schoolId, endedAt: null } });
      if (!existing) throw new NotFoundException('Active assignment not found');
      if (asDate(body.endDate) < existing.startDate || asDate(body.endDate) > new Date()) throw new BadRequestException('End date must be between assignment start and today');
      const updated = await tx.teacherAssignment.update({ where: { id }, data: { endDate: asDate(body.endDate), endedAt: new Date() } });
      await audit(tx, actor, 'TEACHER_ASSIGNMENT_ENDED', 'TeacherAssignment', id, body.reason, existing, updated);
      return updated;
    });
  }
}
