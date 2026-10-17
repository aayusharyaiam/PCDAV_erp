import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Actor, AdminOnly, CurrentUser, Roles } from './auth';
import { PromotionService } from './promotion.service';
import { ListDto, PromotionBatchActionDto, PromotionBatchDto, PromotionDecisionDto } from './dto';

@Controller('promotion-decisions')
export class PromotionDecisionsController {
  constructor(private readonly promotions: PromotionService) {}

  @Get()
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.TEACHER)
  list(@CurrentUser() actor: Actor, @Query() query: ListDto) { return this.promotions.decisions(actor, query); }

  @Post()
  @Roles(Role.TEACHER)
  submit(@CurrentUser() actor: Actor, @Body() body: PromotionDecisionDto) { return this.promotions.submitDecisions(actor, body); }
}

@Controller('promotion-batches')
export class PromotionBatchesController {
  constructor(private readonly promotions: PromotionService) {}

  @Get(':id')
  @AdminOnly()
  get(@CurrentUser() actor: Actor, @Param('id') id: string) { return this.promotions.getBatch(actor, id); }

  @Post()
  @AdminOnly()
  create(@CurrentUser() actor: Actor, @Body() body: PromotionBatchDto) { return this.promotions.createBatch(actor, body); }

  @Post(':id/validate')
  @AdminOnly()
  validate(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PromotionBatchActionDto) { return this.promotions.validateBatch(actor, id, body); }

  @Post(':id/execute')
  @AdminOnly()
  execute(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: PromotionBatchActionDto) { return this.promotions.executeBatch(actor, id, body); }
}
