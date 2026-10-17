import { Body, Controller, Get, Param, Patch, Post, Query, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { Db, audit } from './db';
import { Actor, AdminOnly, CurrentUser } from './auth';
import { GuardianDto, LinkFamilyDto, ListDto, StudentEditDto } from './dto';
import { asDate, page } from './utils';
import { StudentAccess } from './student-access';

@Controller('students')
export class StudentsController {
  constructor(private readonly db: Db, private readonly access: StudentAccess) {}

  @Get()
  async list(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    if (query.status && !['ACTIVE', 'FORMER'].includes(query.status)) throw new BadRequestException('Invalid student status');
    const teacherClasses = await this.access.classIds(actor, query.sessionId);
    const filterEnrollment = teacherClasses !== null || !!query.classId || !!query.sessionId;
    const enrollments = filterEnrollment ? await this.db.enrollment.findMany({ where: {
      schoolId: actor.schoolId, ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(teacherClasses !== null ? { classId: { in: teacherClasses.filter(id => !query.classId || id === query.classId) }, status: 'ACTIVE' } : query.classId ? { classId: query.classId } : {}),
    }, select: { studentId: true } }) : null;
    const contactMatches = query.q && actor.role !== Role.TEACHER ? await this.db.guardian.findMany({ where: { schoolId: actor.schoolId, OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { phone: { contains: query.q } }] }, select: { familyId: true } }) : [];
    const where: Prisma.StudentWhereInput = { schoolId: actor.schoolId, ...(query.status ? { status: query.status } : {}),
      ...(enrollments ? { id: { in: enrollments.map(e => e.studentId) } } : {}),
      ...(query.q ? { OR: [{ admissionNumber: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }, { familyId: { in: contactMatches.map(g => g.familyId) } }] } : {}),
    };
    const [students, total] = await Promise.all([this.db.student.findMany({ where, orderBy: { admissionNumber: 'asc' }, ...page(query.page, query.limit) }), this.db.student.count({ where })]);
    const items = await Promise.all(students.map(async student => {
      const guardian = actor.role !== Role.TEACHER ? await this.db.guardian.findFirst({ where: { schoolId: actor.schoolId, familyId: student.familyId } }) : null;
      const enrollment = await this.db.enrollment.findFirst({ where: { schoolId: actor.schoolId, studentId: student.id, ...(query.sessionId ? { sessionId: query.sessionId } : {}) }, orderBy: { startDate: 'desc' } });
      const classroom = enrollment ? await this.db.classOffering.findUnique({ where: { id: enrollment.classId } }) : null;
      return { id: student.id, admissionNumber: student.admissionNumber, name: student.name, dateOfBirth: student.dateOfBirth, gender: student.gender, status: student.status, guardianName: guardian?.name, guardianPhone: guardian?.phone, className: classroom ? `${classroom.grade} ${classroom.section} ${classroom.stream}`.trim() : '', version: student.version };
    }));
    return { items, total, page: query.page, limit: query.limit };
  }

  @Get(':id')
  async get(@CurrentUser() actor: Actor, @Param('id') id: string) {
    const student = await this.access.student(actor, id);
    const teacherClasses = await this.access.classIds(actor);
    const enrollments = await this.db.enrollment.findMany({ where: { studentId: id, schoolId: actor.schoolId, ...(teacherClasses ? { classId: { in: teacherClasses } } : {}) }, orderBy: { startDate: 'desc' } });
    const history = await Promise.all(enrollments.map(async enrollment => {
      const [session, classroom] = await Promise.all([this.db.academicSession.findUnique({ where: { id: enrollment.sessionId } }), this.db.classOffering.findUnique({ where: { id: enrollment.classId } })]);
      return { ...enrollment, sessionName: session?.name, className: `${classroom?.grade} ${classroom?.section} ${classroom?.stream}`.trim() };
    }));
    if (actor.role === Role.TEACHER) return { student: { id: student.id, admissionNumber: student.admissionNumber, name: student.name, dateOfBirth: student.dateOfBirth, gender: student.gender, status: student.status, admissionDate: student.admissionDate }, enrollments: history, family: null, guardians: [], siblings: [], documents: [], timeline: [], applications: [] };
    const admin = [Role.SUPERADMIN, Role.ADMIN].includes(actor.role as 'SUPERADMIN' | 'ADMIN');
    const [family, guardians, siblings] = await Promise.all([
      this.db.family.findUnique({ where: { id: student.familyId } }),
      this.db.guardian.findMany({ where: { familyId: student.familyId, schoolId: actor.schoolId } }),
      this.db.student.findMany({ where: { familyId: student.familyId, schoolId: actor.schoolId, id: { not: id } }, select: { id: true, name: true, admissionNumber: true } }),
    ]);
    return { student, family, guardians, siblings, enrollments: history,
      documents: admin ? await this.db.document.findMany({ where: { schoolId: actor.schoolId, studentId: id }, select: { id: true, type: true, originalName: true, verifiedAt: true, createdAt: true } }) : [],
      timeline: admin ? await this.db.auditEvent.findMany({ where: { schoolId: actor.schoolId, entityId: id }, orderBy: { createdAt: 'desc' }, take: 100 }) : [],
      lifecycleEvents: admin ? await this.db.studentLifecycleEvent.findMany({ where: { schoolId: actor.schoolId, studentId: id }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }] }) : [],
      applications: admin ? await this.db.application.findMany({ where: { studentId: id, schoolId: actor.schoolId } }) : [],
    };
  }

  @Patch(':id') @AdminOnly()
  async edit(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentEditDto) {
    if (asDate(body.dateOfBirth) > new Date()) throw new BadRequestException('Date of birth cannot be in the future');
    return this.db.atomic(async tx => {
      const existing = await tx.student.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!existing) throw new NotFoundException('Student not found');
      if (existing.version !== body.version) throw new ConflictException('Student changed. Reload before saving.');
      const { reason, version, ...fields } = body;
      const updated = await tx.student.update({ where: { id }, data: { ...fields, name: body.name.trim(), dateOfBirth: asDate(body.dateOfBirth), version: { increment: 1 } } });
      await audit(tx, actor, 'STUDENT_UPDATED', 'Student', id, reason, existing, updated);
      return updated;
    });
  }

  @Post(':id/family-link') @AdminOnly()
  async linkFamily(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: LinkFamilyDto) {
    return this.db.atomic(async tx => {
      const student = await tx.student.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!student) throw new NotFoundException('Student not found');
      if (student.version !== body.version) throw new ConflictException('Student changed. Reload before saving.');
      const sibling = await tx.student.findFirst({ where: { admissionNumber: body.siblingAdmissionNumber.trim().toUpperCase(), schoolId: actor.schoolId } });
      if (!sibling || sibling.id === id) throw new BadRequestException('Choose a different existing student by admission number');
      if (student.familyId === sibling.familyId) return student;
      const updated = await tx.student.update({ where: { id }, data: { familyId: sibling.familyId, version: { increment: 1 } } });
      await audit(tx, actor, 'STUDENT_FAMILY_LINKED', 'Student', id, body.reason, { familyId: student.familyId }, { familyId: updated.familyId, siblingAdmissionNumber: sibling.admissionNumber });
      return updated;
    });
  }

  @Post(':id/guardians') @AdminOnly()
  async guardian(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: GuardianDto) {
    return this.db.atomic(async tx => {
      const student = await tx.student.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!student) throw new NotFoundException('Student not found');
      const guardian = await tx.guardian.create({ data: { ...body, schoolId: actor.schoolId, familyId: student.familyId } });
      await audit(tx, actor, 'GUARDIAN_ADDED', 'Student', id, 'Verified family contact added', undefined, guardian);
      return guardian;
    });
  }
}
