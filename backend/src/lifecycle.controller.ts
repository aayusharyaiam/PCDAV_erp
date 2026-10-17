import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AdminOnly, Actor, CurrentUser } from './auth';
import { StudentLifecycleDto, StudentReadmissionDto, StudentTransferDto } from './dto';
import { LifecycleService } from './lifecycle.service';

@Controller('students')
@AdminOnly()
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Get(':id/lifecycle')
  history(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.lifecycle.history(actor, id); }

  @Post(':id/lifecycle')
  transition(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentLifecycleDto) {
    if (body.eventType === 'WITHDRAWN' || body.eventType === 'STRUCK_OFF') return this.lifecycle.leave(actor, id, body, body.eventType);
    throw new BadRequestException('Lifecycle eventType must be WITHDRAWN or STRUCK_OFF for this endpoint');
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentLifecycleDto) { return this.lifecycle.leave(actor, id, body, 'WITHDRAWN'); }

  @Post(':id/withdrawal')
  withdrawal(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentLifecycleDto) { return this.lifecycle.leave(actor, id, body, 'WITHDRAWN'); }

  @Post(':id/strike-off')
  strikeOff(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentLifecycleDto) { return this.lifecycle.leave(actor, id, body, 'STRUCK_OFF'); }

  @Post(':id/struck-off')
  struckOff(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentLifecycleDto) { return this.lifecycle.leave(actor, id, body, 'STRUCK_OFF'); }

  @Post(':id/transfer')
  transfer(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentTransferDto) { return this.lifecycle.transfer(actor, id, body); }

  @Post(':id/readmit')
  readmit(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentReadmissionDto) { return this.lifecycle.readmit(actor, id, body); }

  @Post(':id/readmission')
  readmission(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: StudentReadmissionDto) { return this.lifecycle.readmit(actor, id, body); }
}
