import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, User } from '@prisma/client';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { Db } from './db';

export const publicUser = (user: User) => ({ id: user.id, schoolId: user.schoolId, name: user.name, email: user.email, role: user.role, active: user.active, version: user.version, mustChangePassword: user.mustChangePassword, createdAt: user.createdAt });
export type Actor = ReturnType<typeof publicUser>;
export type AuthRequest = Request & { actor: Actor; sessionId: string; csrfToken: string };
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const AdminOnly = () => Roles(Role.SUPERADMIN, Role.ADMIN);
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => ctx.switchToHttp().getRequest<AuthRequest>().actor);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: Db) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.path === '/health') return true;
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const token = request.cookies?.pcdav_session;
    if (typeof token !== 'string' || token.length > 128) throw new UnauthorizedException('Sign in to continue');
    const session = await this.db.loginSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || !session.user.active) throw new UnauthorizedException('Your session has expired');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers['x-csrf-token'] !== session.csrfToken) throw new ForbiddenException('Invalid request token; reload this page');
      if (request.headers.origin !== (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')) throw new ForbiddenException('Origin not allowed');
    }
    const path = request.path;
    if (session.user.mustChangePassword && !['/api/v1/auth/me', '/api/v1/auth/password', '/api/v1/auth/logout'].includes(path)) throw new ForbiddenException('Change your temporary password first');
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(session.user.role)) throw new ForbiddenException('This action is not available for your account');
    request.actor = publicUser(session.user);
    request.sessionId = session.id;
    request.csrfToken = session.csrfToken;
    return true;
  }
}
