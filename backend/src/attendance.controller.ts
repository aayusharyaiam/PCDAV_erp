import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor, AdminOnly, CurrentUser, Roles } from './auth';
import { AttendanceService } from './attendance.service';
import { AttendanceCorrectionDecisionDto, AttendanceCorrectionDto, AttendanceDto, AttendanceQueryDto } from './dto';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.TEACHER)
  list(@CurrentUser() actor: Actor, @Query() query: AttendanceQueryDto) { return this.attendance.list(actor, query); }

  @Post()
  @Roles(Role.TEACHER)
  submit(@CurrentUser() actor: Actor, @Body() body: AttendanceDto) { return this.attendance.submit(actor, body); }

  @Get('correction-requests')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.TEACHER)
  correctionRequests(@CurrentUser() actor: Actor, @Query() query: AttendanceQueryDto) { return this.attendance.correctionRequests(actor, query); }

  @Post(':markId/correction-requests')
  @Roles(Role.TEACHER)
  requestCorrection(@CurrentUser() actor: Actor, @Param('markId') markId: string, @Body() body: AttendanceCorrectionDto) { return this.attendance.requestCorrection(actor, markId, body); }

  @Post('correction-requests/:id/approve')
  @AdminOnly()
  approve(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: AttendanceCorrectionDecisionDto) { return this.attendance.decide(actor, id, body, true); }

  @Post('correction-requests/:id/reject')
  @AdminOnly()
  reject(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: AttendanceCorrectionDecisionDto) { return this.attendance.decide(actor, id, body, false); }
}
