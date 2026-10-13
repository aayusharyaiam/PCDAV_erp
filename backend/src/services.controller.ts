import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminOnly, Actor, CurrentUser, Roles } from './auth';
import { Db, audit } from './db';
import { EndServiceDto, ListDto, ServiceAssignmentDto } from './dto';
import { asDate } from './utils';
import { jsonSafe, minor } from './fee-utils';

@Controller('services')
export class ServicesController {
  constructor(private readonly db: Db) {}

  @Get('assignments') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async list(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const enrollmentIds = query.classId ? (await this.db.enrollment.findMany({ where: { schoolId: actor.schoolId, classId: query.classId }, select: { id: true } })).map(item => item.id) : undefined;
    const assignments = await this.db.serviceAssignment.findMany({ where: { schoolId: actor.schoolId, ...(query.status ? { type: query.status } : {}), ...(enrollmentIds ? { enrollmentId: { in: enrollmentIds } } : {}) }, orderBy: { startDate: 'desc' } });
    return jsonSafe(assignments);
  }

  @Post('assignments') @AdminOnly()
  async create(@CurrentUser() actor: Actor, @Body() body: ServiceAssignmentDto) {
    const amount = minor(body.amountMinor);
    const startDate = asDate(body.startDate); const endDate = body.endDate ? asDate(body.endDate) : undefined;
    if (endDate && endDate < startDate) throw new BadRequestException('Service end date must be after start date');
    return this.db.atomic(async tx => {
      const enrollment = await tx.enrollment.findFirst({ where: { id: body.enrollmentId, schoolId: actor.schoolId, status: 'ACTIVE' } });
      if (!enrollment) throw new BadRequestException('Active enrollment not found');
      // Ended intervals still reserve their history. Admission and recurring hostel charges can coexist.
      const overlap = await tx.serviceAssignment.findFirst({ where: { schoolId: actor.schoolId, enrollmentId: body.enrollmentId, type: body.type, frequency: body.frequency, startDate: { lte: endDate ?? new Date('9999-12-31') }, OR: [{ endDate: null }, { endDate: { gte: startDate } }] } });
      if (overlap) throw new BadRequestException(`A ${body.type.toLowerCase()} assignment already overlaps this period`);
      const assignment = await tx.serviceAssignment.create({ data: { schoolId: actor.schoolId, enrollmentId: body.enrollmentId, type: body.type, label: body.label.trim(), amountMinor: amount, frequency: body.frequency, startDate, endDate, assignedBy: actor.id } });
      await audit(tx, actor, 'SERVICE_ASSIGNED', 'ServiceAssignment', assignment.id, `${body.type} assignment created`, undefined, assignment);
      return jsonSafe(assignment);
    });
  }

  @Post('assignments/:id/end') @AdminOnly()
  async end(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: EndServiceDto) {
    const endDate = asDate(body.endDate);
    return this.db.atomic(async tx => {
      const existing = await tx.serviceAssignment.findFirst({ where: { id, schoolId: actor.schoolId, active: true } });
      if (!existing) throw new BadRequestException('Active service assignment not found');
      if (endDate < existing.startDate) throw new BadRequestException('Service end date cannot precede its start date');
      if (existing.endDate && endDate > existing.endDate) throw new BadRequestException('Ending a service cannot extend its scheduled end date');
      if (await tx.feeObligation.count({ where: { schoolId: actor.schoolId, serviceAssignmentId: id, dueDate: { gt: endDate } } })) throw new BadRequestException('Assessed charges exist after this date; resolve those charges before shortening the service');
      const updated = await tx.serviceAssignment.update({ where: { id }, data: { endDate, active: false } });
      await audit(tx, actor, 'SERVICE_ENDED', 'ServiceAssignment', id, body.reason, existing, updated);
      return jsonSafe(updated);
    });
  }
}
