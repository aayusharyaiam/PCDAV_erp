import { Body, Controller, Get, Param, Patch, Post, Query, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, Prisma, Role } from '@prisma/client';
import { Db, audit } from './db';
import { Actor, AdminOnly, CurrentUser, Roles } from './auth';
import { ApplicationDto, ApplicationEditDto, ConfirmDto, DecisionDto, ListDto } from './dto';
import { asDate, dateOnly, page } from './utils';

@Controller('applications') @AdminOnly()
export class AdmissionsController {
  constructor(private readonly db: Db) {}

  @Get()
  async list(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    if (query.status && !Object.values(ApplicationStatus).includes(query.status as ApplicationStatus)) throw new BadRequestException('Invalid application status');
    const where = {
      schoolId: actor.schoolId,
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(query.status ? { status: query.status as ApplicationStatus } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.q ? { OR: [{ studentName: { contains: query.q, mode: 'insensitive' as const } }, { guardianName: { contains: query.q, mode: 'insensitive' as const } }, { guardianPhone: { contains: query.q } }] } : {}),
      ...(query.followUpBefore ? { nextFollowUp: { lte: asDate(query.followUpBefore) } } : {}),
    };
    const [items, total] = await Promise.all([this.db.application.findMany({ where, orderBy: { updatedAt: 'desc' }, ...page(query.page, query.limit) }), this.db.application.count({ where })]);
    return { items, total, page: query.page, limit: query.limit };
  }

  @Get(':id')
  async get(@CurrentUser() actor: Actor, @Param('id') id: string) {
    const application = await this.db.application.findFirst({ where: { id, schoolId: actor.schoolId } });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  @Post()
  @AdminOnly()
  async create(@CurrentUser() actor: Actor, @Body() body: ApplicationDto) {
    const session = await this.db.academicSession.findFirst({ where: { id: body.sessionId, schoolId: actor.schoolId, admissionsOpen: true } });
    if (!session) throw new BadRequestException('Admissions are not open for the selected session');
    if (asDate(body.dateOfBirth) > new Date()) throw new BadRequestException('Date of birth cannot be in the future');
    return this.db.atomic(async tx => {
      const duplicate = await tx.application.findFirst({ where: { schoolId: actor.schoolId, sessionId: body.sessionId, studentName: { equals: body.studentName.trim(), mode: 'insensitive' }, dateOfBirth: asDate(body.dateOfBirth), guardianPhone: body.guardianPhone } });
      if (duplicate) throw new ConflictException(`Matching applicant already exists: ${duplicate.id}. Review rather than duplicate.`);
      const application = await tx.application.create({ data: { ...body, schoolId: actor.schoolId, studentName: body.studentName.trim(), dateOfBirth: asDate(body.dateOfBirth), nextFollowUp: body.nextFollowUp ? asDate(body.nextFollowUp) : undefined, status: 'DRAFT', documentChecklist: body.documentChecklist as unknown as object } });
      await audit(tx, actor, 'APPLICATION_CREATED', 'Application', application.id, 'Application created', undefined, application);
      return application;
    });
  }

  @Patch(':id')
  @AdminOnly()
  async edit(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: ApplicationEditDto) {
    return this.db.atomic(async tx => {
      const existing = await tx.application.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!existing) throw new NotFoundException('Application not found');
      if (existing.version !== body.version) throw new ConflictException('Application changed. Reload before saving.');
      if (existing.status === 'ENROLLED') throw new BadRequestException('An enrolled application cannot be edited');
      if (existing.sessionId !== body.sessionId) throw new BadRequestException('Application session cannot change after creation');
      if (asDate(body.dateOfBirth) > new Date()) throw new BadRequestException('Date of birth cannot be in the future');
      const updated = await tx.application.update({ where: { id }, data: { sessionId: body.sessionId, studentName: body.studentName.trim(), dateOfBirth: asDate(body.dateOfBirth), gender: body.gender, guardianName: body.guardianName.trim(), guardianPhone: body.guardianPhone, guardianEmail: body.guardianEmail, relationship: body.relationship, address: body.address, permanentAddress: body.permanentAddress, previousSchool: body.previousSchool, appliedGrade: body.appliedGrade, source: body.source, nextFollowUp: body.nextFollowUp ? asDate(body.nextFollowUp) : null, notes: body.notes, ews: body.ews, documentChecklist: body.documentChecklist as unknown as object, version: { increment: 1 } } });
      await audit(tx, actor, 'APPLICATION_UPDATED', 'Application', id, 'Application updated', existing, updated);
      return updated;
    });
  }

  @Post(':id/submit')
  @AdminOnly()
  async submit(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: DecisionDto) {
    return this.changeStatus(actor, id, body, ['DRAFT']);
  }

  @Post(':id/decision')
  @AdminOnly()
  async decision(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: DecisionDto) {
    return this.changeStatus(actor, id, body, ['SUBMITTED', 'UNDER_REVIEW', 'WAITLISTED']);
  }

  private async changeStatus(actor: Actor, id: string, body: DecisionDto, allowed: ApplicationStatus[]) {
    const targets: ApplicationStatus[] = allowed[0] === 'DRAFT' ? ['SUBMITTED'] : ['UNDER_REVIEW', 'WAITLISTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
    if (!targets.includes(body.status)) throw new BadRequestException(`This action cannot set status to ${body.status}`);
    return this.db.atomic(async tx => {
      const existing = await tx.application.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!existing) throw new NotFoundException('Application not found');
      if (existing.version !== body.version) throw new ConflictException('Application changed. Reload before saving.');
      if (!allowed.includes(existing.status)) throw new BadRequestException(`Application is already ${existing.status}`);
      const updated = await tx.application.update({ where: { id }, data: { status: body.status, version: { increment: 1 } } });
      await audit(tx, actor, `APPLICATION_${body.status}`, 'Application', id, body.reason, existing, updated);
      return updated;
    });
  }

  @Post(':id/confirm-enrollment')
  @AdminOnly()
  async confirm(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: ConfirmDto) {
    const enroll = async () => this.db.atomic(async tx => {
      const application = await tx.application.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!application) throw new NotFoundException('Application not found');
      if (application.studentId && application.status === 'ENROLLED') {
        const student = await tx.student.findUniqueOrThrow({ where: { id: application.studentId } });
        const enrollment = await tx.enrollment.findUniqueOrThrow({ where: { schoolId_studentId_sessionId: { schoolId: actor.schoolId, studentId: student.id, sessionId: application.sessionId } } });
        if (enrollment.classId !== body.classId || dateOnly(enrollment.startDate) !== body.admissionDate || enrollment.feeCategory !== body.feeCategory) throw new ConflictException('Application already enrolled with different details');
        return { student, enrollment, admissionNumber: student.admissionNumber };
      }
      if (application.version !== body.version) throw new ConflictException('Application changed. Reload before saving.');
      if (application.status !== 'APPROVED') throw new BadRequestException('Approve the application before enrollment');
      const targetClass = await tx.classOffering.findFirst({ where: { id: body.classId, schoolId: actor.schoolId, sessionId: application.sessionId } });
      if (!targetClass) throw new BadRequestException('Choose a class in the application session');
      const session = await tx.academicSession.findUniqueOrThrow({ where: { id: application.sessionId } });
      const admissionDate = asDate(body.admissionDate);
      if (!session.admissionsOpen || admissionDate < session.startDate || admissionDate > session.endDate) throw new BadRequestException('Admissions must be open and the admission date must be within the session');
      if (targetClass.grade !== application.appliedGrade) throw new BadRequestException('Selected classroom must match the applied grade');
      const activeCount = await tx.enrollment.count({ where: { schoolId: actor.schoolId, classId: targetClass.id, status: 'ACTIVE' } });
      if (activeCount >= targetClass.capacity) throw new ConflictException('The selected classroom is at capacity');
      const existingStudent = application.studentId ? await tx.student.findUnique({ where: { id: application.studentId } }) : null;
      if (existingStudent) return existingStudent;
      const school = await tx.school.findUniqueOrThrow({ where: { id: actor.schoolId } });
      const admissionNumber = `${school.admissionPrefix}-${String(school.nextAdmission).padStart(4, '0')}`;
      const sibling = body.siblingAdmissionNumber ? await tx.student.findFirst({ where: { schoolId: actor.schoolId, admissionNumber: body.siblingAdmissionNumber.trim().toUpperCase() } }) : null;
      if (body.siblingAdmissionNumber && !sibling) throw new BadRequestException('Sibling admission number not found');
      const family = sibling ? await tx.family.findUniqueOrThrow({ where: { id: sibling.familyId } }) : await tx.family.create({ data: { schoolId: actor.schoolId, label: `${application.studentName} family` } });
      if (!sibling) await tx.guardian.create({ data: { schoolId: actor.schoolId, familyId: family.id, name: application.guardianName, relationship: application.relationship, phone: application.guardianPhone, email: application.guardianEmail, address: application.address } });
      const student = await tx.student.create({ data: { schoolId: actor.schoolId, admissionNumber, name: application.studentName, dateOfBirth: application.dateOfBirth, gender: application.gender, familyId: family.id, admissionDate: asDate(body.admissionDate), address: application.address, permanentAddress: application.permanentAddress, previousSchool: application.previousSchool } });
      const enrollment = await tx.enrollment.create({ data: { schoolId: actor.schoolId, studentId: student.id, sessionId: application.sessionId, classId: targetClass.id, status: 'ACTIVE', entryType: 'NEW_ADMISSION', feeCategory: body.feeCategory, ews: application.ews, startDate: asDate(body.admissionDate) } });
      await tx.application.update({ where: { id }, data: { status: 'ENROLLED', studentId: student.id, version: { increment: 1 } } });
      await tx.document.updateMany({ where: { schoolId: actor.schoolId, applicationId: id }, data: { studentId: student.id } });
      await tx.school.update({ where: { id: school.id }, data: { nextAdmission: { increment: 1 } } });
      await audit(tx, actor, 'APPLICATION_ENROLLED', 'Application', id, body.reason, application, { student, enrollment, admissionNumber });
      await audit(tx, actor, 'STUDENT_ENROLLED', 'Student', student.id, body.reason, undefined, { applicationId: id, enrollment });
      return { student, enrollment, admissionNumber };
    });
    try {
      return await enroll();
    } catch (error) {
      // A browser retry can race the first successful enrollment. Once the
      // application is enrolled, return that committed result instead of
      // asking the office to create a second student.
      if (error instanceof ConflictException || (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))) {
        const committed = await this.db.application.findFirst({ where: { id, schoolId: actor.schoolId, status: 'ENROLLED' } });
        if (committed?.studentId) {
          const student = await this.db.student.findUnique({ where: { id: committed.studentId } });
          const enrollment = student ? await this.db.enrollment.findUnique({ where: { schoolId_studentId_sessionId: { schoolId: actor.schoolId, studentId: student.id, sessionId: committed.sessionId } } }) : null;
          if (student && enrollment && enrollment.classId === body.classId && dateOnly(enrollment.startDate) === body.admissionDate && enrollment.feeCategory === body.feeCategory) return { student, enrollment, admissionNumber: student.admissionNumber };
        }
      }
      throw error;
    }
  }
}
