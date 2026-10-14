import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor, CurrentUser, Roles } from './auth';
import { CashService } from './cash.service';
import { CashMovementDto } from './finance.dto';

@Controller('cashier-shifts')
@Roles(Role.SUPERADMIN, Role.ADMIN, Role.ACCOUNTANT)
export class CashController {
  constructor(private readonly cash: CashService) {}
  @Get(':id/movements')
  list(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.cash.list(actor, id); }
  @Post(':id/movements')
  create(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: CashMovementDto, @Headers('idempotency-key') key?: string) { return this.cash.create(actor, id, body, key); }
}
