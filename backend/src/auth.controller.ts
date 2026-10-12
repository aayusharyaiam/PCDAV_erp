import { Body, Controller, Get, HttpCode, HttpException, Post, Req, Res, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { Db, audit } from './db';
import { AuthRequest, Public, publicUser, tokenHash } from './auth';
import { ChangePasswordDto, LoginDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly db: Db) {}

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    if (req.headers.origin !== (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')) throw new ForbiddenException('Origin not allowed');
    const email = body.email.trim().toLowerCase();
    const key = tokenHash(email);
    const allowed = await this.db.atomic(async tx => {
      const previous = await tx.loginAttempt.findUnique({ where: { key } });
      if (!previous || Date.now() - previous.windowStart.getTime() > 15 * 60 * 1000) {
        await tx.loginAttempt.upsert({ where: { key }, create: { key, attempts: 1, windowStart: new Date() }, update: { attempts: 1, windowStart: new Date() } });
        return true;
      }
      if (previous.attempts >= 10) return false;
      await tx.loginAttempt.update({ where: { key }, data: { attempts: { increment: 1 } } });
      return true;
    });
    if (!allowed) throw new HttpException('Too many attempts. Try again in 15 minutes.', 429);
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await argon2.verify(user.passwordHash, body.password))) throw new UnauthorizedException('Email or password is incorrect');
    const token = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    await this.db.atomic(async tx => {
      await tx.loginAttempt.deleteMany({ where: { key } });
      await tx.loginSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), csrfToken, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
      await audit(tx, user, 'LOGIN', 'User', user.id, 'Successful sign in');
    });
    res.cookie('pcdav_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000, path: '/' });
    res.setHeader('Cache-Control', 'no-store');
    return { user: publicUser(user), csrfToken };
  }

  @Get('me') me(@Req() req: AuthRequest) { return { user: req.actor, csrfToken: req.csrfToken }; }

  @Post('logout') @HttpCode(200)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.db.loginSession.deleteMany({ where: { id: req.sessionId } });
    res.clearCookie('pcdav_session', { path: '/' });
    return { ok: true };
  }

  @Post('password') @HttpCode(200)
  async password(@Req() req: AuthRequest, @Body() body: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: req.actor.id } });
    if (!(await argon2.verify(user.passwordHash, body.currentPassword))) throw new UnauthorizedException('Current password is incorrect');
    if (body.newPassword === body.currentPassword) throw new BadRequestException('Choose a different password');
    const passwordHash = await argon2.hash(body.newPassword);
    await this.db.atomic(async tx => {
      await tx.user.update({ where: { id: user.id, version: user.version }, data: { passwordHash, mustChangePassword: false, version: { increment: 1 } } });
      await tx.loginSession.deleteMany({ where: { userId: user.id } });
      await audit(tx, req.actor, 'PASSWORD_CHANGED', 'User', user.id, 'Password changed; sessions revoked');
    });
    res.clearCookie('pcdav_session', { path: '/' });
    return { ok: true };
  }
}
