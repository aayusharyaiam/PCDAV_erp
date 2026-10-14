import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor, AdminOnly, CurrentUser, Roles } from './auth';
import { ApprovalService } from './approval.service';
import { PaymentActionDto } from './dto';
import { FinanceRequestDto, FinanceRequestListDto } from './finance.dto';

@Controller('finance/requests')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}
  @Get() @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  list(@CurrentUser() actor: Actor, @Query() query: FinanceRequestListDto) { return this.approvals.list(actor, query); }
  @Post() @Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
  create(@CurrentUser() actor: Actor, @Body() body: FinanceRequestDto, @Headers('idempotency-key') key?: string) { return this.approvals.create(actor, body, key); }
  @Post(':id/approve') @AdminOnly()
  approve(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PaymentActionDto) { return this.approvals.decide(actor, id, body.reason, true); }
  @Post(':id/reject') @AdminOnly()
  reject(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PaymentActionDto) { return this.approvals.decide(actor, id, body.reason, false); }
}
