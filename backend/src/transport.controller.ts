import { BadRequestException, Body, ConflictException, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminOnly, Actor, CurrentUser, Roles } from './auth';
import { Db, audit } from './db';
import { ListDto, TransportAllocationDto, TransportRouteDto, TransportVehicleDto } from './dto';
import { asDate } from './utils';
import { jsonSafe, minor, periodDate } from './fee-utils';

function overlaps(start: Date, end: Date | undefined, otherStart: Date, otherEnd: Date | null) {
  return otherStart <= (end ?? new Date('9999-12-31')) && (!otherEnd || otherEnd >= start);
}

@Controller('transport')
export class TransportController {
  constructor(private readonly db: Db) {}

  @Get('routes') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async routes(@CurrentUser() actor: Actor) {
    const routes = await this.db.transportRoute.findMany({ where: { schoolId: actor.schoolId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
    return jsonSafe(routes);
  }

  @Post('routes') @AdminOnly()
  async createRoute(@CurrentUser() actor: Actor, @Body() body: TransportRouteDto) {
    const amount = minor(body.monthlyAmountMinor);
    return this.db.atomic(async tx => {
      if (await tx.transportRoute.findFirst({ where: { schoolId: actor.schoolId, name: body.name.trim() } })) throw new ConflictException('A route with this name already exists');
      const route = await tx.transportRoute.create({ data: { schoolId: actor.schoolId, name: body.name.trim(), campus: body.campus?.trim() ?? '', destination: body.destination?.trim() ?? '', monthlyAmountMinor: amount, capacity: body.capacity } });
      await audit(tx, actor, 'TRANSPORT_ROUTE_CREATED', 'TransportRoute', route.id, 'Transport route created', undefined, route);
      return jsonSafe(route);
    });
  }

  @Get('vehicles') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async vehicles(@CurrentUser() actor: Actor) {
    return this.db.transportVehicle.findMany({ where: { schoolId: actor.schoolId }, orderBy: [{ active: 'desc' }, { busNumber: 'asc' }] });
  }

  @Post('vehicles') @AdminOnly()
  async createVehicle(@CurrentUser() actor: Actor, @Body() body: TransportVehicleDto) {
    return this.db.atomic(async tx => {
      if (await tx.transportVehicle.findFirst({ where: { schoolId: actor.schoolId, busNumber: body.busNumber.trim() } })) throw new ConflictException('A vehicle with this bus number already exists');
      const vehicle = await tx.transportVehicle.create({ data: { schoolId: actor.schoolId, name: body.name.trim(), busNumber: body.busNumber.trim(), capacity: body.capacity, driver1Name: body.driver1Name?.trim() ?? '', driver1Phone: body.driver1Phone?.trim() ?? '', driver2Name: body.driver2Name?.trim() ?? '', driver2Phone: body.driver2Phone?.trim() ?? '' } });
      await audit(tx, actor, 'TRANSPORT_VEHICLE_CREATED', 'TransportVehicle', vehicle.id, 'Transport vehicle created', undefined, vehicle);
      return vehicle;
    });
  }

  @Get('allocations') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async allocations(@CurrentUser() actor: Actor, @Query() query: ListDto & { routeId?: string; vehicleId?: string; month?: string }) {
    const monthStart = query.month ? periodDate(query.month, 1) : undefined;
    const monthEnd = query.month ? periodDate(query.month, 31) : undefined;
    const classEnrollmentIds = query.classId ? (await this.db.enrollment.findMany({ where: { schoolId: actor.schoolId, classId: query.classId }, select: { id: true } })).map(item => item.id) : undefined;
    const assignments = await this.db.serviceAssignment.findMany({ where: { schoolId: actor.schoolId, type: 'TRANSPORT', ...(classEnrollmentIds ? { enrollmentId: { in: classEnrollmentIds } } : {}), ...(query.routeId ? { routeId: query.routeId } : {}), ...(query.vehicleId ? { vehicleId: query.vehicleId } : {}), ...(monthStart ? { startDate: { lte: monthEnd }, OR: [{ endDate: null }, { endDate: { gte: monthStart } }] } : {}) }, orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], ...({ skip: (query.page - 1) * query.limit, take: query.limit }) });
    return jsonSafe(await this.hydrateAllocations(actor.schoolId, assignments));
  }

  @Post('allocations') @AdminOnly()
  async allocate(@CurrentUser() actor: Actor, @Body() body: TransportAllocationDto) {
    const startDate = asDate(body.startDate); const endDate = body.endDate ? asDate(body.endDate) : undefined;
    if (endDate && endDate < startDate) throw new BadRequestException('Transport end date must be after its start date');
    return this.db.atomic(async tx => {
      const selectedEnrollment = await tx.enrollment.findFirst({ where: { id: body.enrollmentId, schoolId: actor.schoolId, status: 'ACTIVE' } });
      if (!selectedEnrollment) throw new BadRequestException('Active enrollment not found');
      if (startDate < selectedEnrollment.startDate || (selectedEnrollment.endDate && startDate > selectedEnrollment.endDate) || (endDate && selectedEnrollment.endDate && endDate > selectedEnrollment.endDate)) throw new BadRequestException('Transport dates must fall within the enrollment');
      const route = await tx.transportRoute.findFirst({ where: { id: body.routeId, schoolId: actor.schoolId, active: true } });
      if (!route) throw new BadRequestException('Active transport route not found');
      const vehicle = body.vehicleId ? await tx.transportVehicle.findFirst({ where: { id: body.vehicleId, schoolId: actor.schoolId, active: true } }) : null;
      if (body.vehicleId && !vehicle) throw new BadRequestException('Active transport vehicle not found');
      const overlappingStudent = await tx.serviceAssignment.findFirst({ where: { schoolId: actor.schoolId, enrollmentId: selectedEnrollment.id, type: 'TRANSPORT', startDate: { lte: endDate ?? new Date('9999-12-31') }, OR: [{ endDate: null }, { endDate: { gte: startDate } }] } });
      if (overlappingStudent) throw new ConflictException('This student already has an overlapping transport allocation');
      const candidates = await tx.serviceAssignment.findMany({ where: { schoolId: actor.schoolId, type: 'TRANSPORT', active: true, OR: [{ routeId: route.id }, ...(vehicle ? [{ vehicleId: vehicle.id }] : [])] } });
      const routeCount = candidates.filter(item => item.routeId === route.id && overlaps(startDate, endDate, item.startDate, item.endDate)).length;
      if (route.capacity && routeCount >= route.capacity) throw new ConflictException(`Route capacity reached (${route.capacity})`);
      const vehicleCount = vehicle ? candidates.filter(item => item.vehicleId === vehicle.id && overlaps(startDate, endDate, item.startDate, item.endDate)).length : 0;
      if (vehicle && vehicleCount >= vehicle.capacity) throw new ConflictException(`Vehicle capacity reached (${vehicle.capacity})`);
      const assignment = await tx.serviceAssignment.create({ data: { schoolId: actor.schoolId, enrollmentId: selectedEnrollment.id, type: 'TRANSPORT', label: route.name, amountMinor: route.monthlyAmountMinor, frequency: 'MONTHLY', startDate, endDate, routeId: route.id, vehicleId: vehicle?.id, assignedBy: actor.id } });
      await audit(tx, actor, 'TRANSPORT_ALLOCATED', 'ServiceAssignment', assignment.id, `Transport allocated on ${route.name}`, undefined, assignment);
      return jsonSafe(assignment);
    });
  }

  @Get('report') @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  async report(@CurrentUser() actor: Actor, @Query() query: ListDto & { routeId?: string; vehicleId?: string; month?: string }) {
    const month = query.month ?? new Date().toISOString().slice(0, 7);
    return this.allocations(actor, { ...query, month, page: 1, limit: 1000 } as ListDto & { routeId?: string; vehicleId?: string; month?: string });
  }

  private async hydrateAllocations(schoolId: string, assignments: Array<{ id: string; enrollmentId: string; routeId: string | null; vehicleId: string | null; amountMinor: bigint; startDate: Date; endDate: Date | null; active: boolean }>) {
    const enrollmentIds = assignments.map(item => item.enrollmentId);
    const routeIds = assignments.flatMap(item => item.routeId ? [item.routeId] : []);
    const vehicleIds = assignments.flatMap(item => item.vehicleId ? [item.vehicleId] : []);
    const enrollments = await this.db.enrollment.findMany({ where: { schoolId, id: { in: enrollmentIds } } });
    const students = await this.db.student.findMany({ where: { schoolId, id: { in: enrollments.map(item => item.studentId) } } });
    const classes = await this.db.classOffering.findMany({ where: { schoolId, id: { in: enrollments.map(item => item.classId) } } });
    const [routes, vehicles] = await Promise.all([this.db.transportRoute.findMany({ where: { schoolId, id: { in: routeIds } } }), this.db.transportVehicle.findMany({ where: { schoolId, id: { in: vehicleIds } } })]);
    return assignments.map(item => { const enrollment = enrollments.find(value => value.id === item.enrollmentId); const student = students.find(value => value.id === enrollment?.studentId); const classroom = classes.find(value => value.id === enrollment?.classId); return { ...item, admissionNumber: student?.admissionNumber ?? '', studentName: student?.name ?? '', className: classroom ? `${classroom.grade} ${classroom.section}${classroom.stream ? ` · ${classroom.stream}` : ''}` : '', route: routes.find(value => value.id === item.routeId) ?? null, vehicle: vehicles.find(value => value.id === item.vehicleId) ?? null }; });
  }
}
