import { Body, Controller, Get, Param, Patch, Post, Query, ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { Db, audit } from './db';
import { Actor, AdminOnly, CurrentUser, publicUser } from './auth';
import { CreateUserDto, ListDto, UserChangeDto } from './dto';

@Controller('users') @AdminOnly()
export class UsersController {
  constructor(private readonly db: Db) {}
  @Get()
  async list(@CurrentUser() actor: Actor, @Query() query: ListDto) {
    const where = { schoolId: actor.schoolId, ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' as const } }, { email: { contains: query.q, mode: 'insensitive' as const } }] } : {}) };
    const [users, total] = await Promise.all([this.db.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }), this.db.user.count({ where })]);
    return { items: users.map(publicUser), total, page: query.page, limit: query.limit };
  }
  @Post()
  async create(@CurrentUser() actor: Actor, @Body() body: CreateUserDto) {
    if (body.role === Role.SUPERADMIN) throw new ForbiddenException('Creating another Superadmin is not permitted');
    const passwordHash = await argon2.hash(body.password);
    return this.db.atomic(async tx => {
      const user = await tx.user.create({ data: { schoolId: actor.schoolId, name: body.name.trim(), email: body.email.toLowerCase().trim(), passwordHash, role: body.role } });
      await audit(tx, actor, 'USER_CREATED', 'User', user.id, 'Account provisioned', undefined, publicUser(user));
      return publicUser(user);
    });
  }
  @Patch(':id')
  async change(@CurrentUser() actor: Actor, @Param('id') id: string, @Body() body: UserChangeDto) {
    const passwordHash = body.password ? await argon2.hash(body.password) : undefined;
    return this.db.atomic(async tx => {
      const user = await tx.user.findFirst({ where: { id, schoolId: actor.schoolId } });
      if (!user) throw new NotFoundException('Account not found');
      if (user.role === Role.SUPERADMIN || user.id === actor.id || (user.role === Role.ADMIN && actor.role !== Role.SUPERADMIN)) throw new ForbiddenException('Only Superadmin manages Admin accounts; self-role edits are not allowed');
      if (user.version !== body.version) throw new ConflictException('Account changed. Reload before saving.');
      if (body.role === Role.SUPERADMIN) throw new ForbiddenException('Promoting an account to Superadmin is not permitted');
      if (body.role && actor.role !== Role.SUPERADMIN && (user.role === Role.ADMIN || ![Role.TEACHER, Role.ACCOUNTANT].includes(body.role as 'TEACHER' | 'ACCOUNTANT'))) throw new ForbiddenException('Only Accountant ↔ Teacher role changes are allowed');
      const changed = await tx.user.update({ where: { id }, data: { name: body.name?.trim(), active: body.active, role: body.role, passwordHash, ...(passwordHash ? { mustChangePassword: true } : {}), version: { increment: 1 } } });
      await tx.loginSession.deleteMany({ where: { userId: id } });
      if (body.active === false || (body.role && body.role !== Role.TEACHER)) {
        const assignments = await tx.teacherAssignment.findMany({ where: { teacherId: id, endedAt: null } });
        for (const assignment of assignments) await tx.teacherAssignment.update({ where: { id: assignment.id }, data: { endedAt: new Date(), endDate: assignment.startDate > new Date() ? assignment.startDate : new Date() } });
      }
      await audit(tx, actor, passwordHash ? 'USER_PASSWORD_RESET' : 'USER_UPDATED', 'User', id, body.reason, publicUser(user), publicUser(changed));
      return publicUser(changed);
    });
  }
}
