import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { makeId } from '../common/ids';
import { config } from '../config';
import { CurrentUser, Public, SESSION_COOKIE, SessionUser } from './access';
import { employeeJson } from '../people/people.mappers';

/** Sign in, create an account, sign out, and "who am I". */
@Controller('api/auth')
export class AuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /** Staff and admins both sign in with PIN + password. body.kind = "employee" (default) or "admin". */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // at most 10 tries a minute from one address
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const pin = String(body?.pin || '').trim();
    const password = String(body?.password || '');
    if (!pin || !password) throw new UserError('Enter your PIN and password.');

    if (body?.kind === 'admin') {
      const admin = await this.prisma.adminUser.findUnique({ where: { pin } });
      if (!admin || !(await bcrypt.compare(password, admin.passwordHash)))
        throw new UserError('No admin account matches that PIN and password.', 401);
      await this.setCookie(req, res, admin.id, 'admin');
      return { kind: 'admin', user: { id: admin.id, name: admin.name, email: admin.email, pin: admin.pin } };
    }

    const emp = await this.prisma.employee.findUnique({ where: { pin } });
    if (!emp || !(await bcrypt.compare(password, emp.passwordHash)))
      throw new UserError('No account matches that PIN and password.', 401);
    await this.setCookie(req, res, emp.id, 'employee');
    return { kind: 'employee', user: employeeJson(emp) };
  }

  /** Self-registration for staff. Their email is where action item emails go if they become a fixer. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() body: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const name = String(body?.name || '').trim();
    const phone = String(body?.phone || '').trim();
    const email = String(body?.email || '').trim();
    const pin = String(body?.pin || '').trim();
    const password = String(body?.password || '');
    if (!name || !phone || !email || !pin || !password)
      throw new UserError('Fill in every field — name, number, email, PIN, and password.');
    if (!/^\d{4,8}$/.test(pin)) throw new UserError('PIN should be 4–8 digits.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError('That email address does not look right.');
    if (password.length < 6) throw new UserError('Password should be at least 6 characters.');
    if (await this.prisma.employee.findUnique({ where: { pin } }))
      throw new UserError('That PIN is already registered to someone else — PINs must be unique.');
    if (await this.prisma.employee.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }))
      throw new UserError('That email is already registered.');

    const emp = await this.prisma.employee.create({
      data: { id: makeId('EMP'), name, phone, email, pin, passwordHash: await bcrypt.hash(password, 10), roles: ['field'] },
    });
    await this.setCookie(req, res, emp.id, 'employee');
    return { kind: 'employee', user: employeeJson(emp) };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return { kind: user.kind, user };
  }

  private async setCookie(req: Request, res: Response, id: string, kind: 'employee' | 'admin') {
    const maxAge = kind === 'admin' ? config.adminSessionHours * 3600_000 : config.staffSessionDays * 86400_000;
    const token = await this.jwt.signAsync({ sub: id, kind }, { expiresIn: Math.floor(maxAge / 1000) });
    // secure = only sent over HTTPS; follows the request so plain-HTTP testing still works
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge, path: '/' });
  }
}
