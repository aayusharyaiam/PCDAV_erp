import { Controller, Get, Query } from '@nestjs/common';
import { Db } from './db';
import { AdminOnly, Actor, CurrentUser } from './auth';
import { ListDto } from './dto';
import { page } from './utils';

@Controller('audit') @AdminOnly()
export class AuditController {
  constructor(private readonly db: Db) {}
  @Get()
  async list(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const where = { schoolId: actor.schoolId, ...(query.q ? { OR: [{ action: { contains: query.q, mode: 'insensitive' as const } }, { entityId: { contains: query.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([this.db.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, ...page(query.page, query.limit) }), this.db.auditEvent.count({ where })]);
    return { items, total, page: query.page, limit: query.limit };
  }
}
