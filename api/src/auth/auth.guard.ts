import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { Access, ACCESS_KEY, SESSION_COOKIE, SessionUser } from './access';

/**
 * Runs before every endpoint: reads the sign-in cookie, looks the person up
 * (so role changes by the admin apply at once) and checks the endpoint's access rule.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const access =
      this.reflector.getAllAndOverride<Access>(ACCESS_KEY, [ctx.getHandler(), ctx.getClass()]) || 'signed-in';
    const req = ctx.switchToHttp().getRequest();
    req.user = await this.userFromCookie(req.cookies?.[SESSION_COOKIE]);

    if (access === 'public') return true;
    if (!req.user) throw new UserError('Please sign in again.', 401);
    if (access === 'admin' && req.user.kind !== 'admin') throw new UserError('Only an admin can do this.', 403);
    if (access === 'staff' && req.user.kind !== 'employee') throw new UserError('Sign in to the staff app to do this.', 403);
    return true;
  }

  private async userFromCookie(token?: string): Promise<SessionUser | null> {
    if (!token) return null;
    let payload: { sub: string; kind: 'employee' | 'admin' };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      return null;
    }
    if (payload.kind === 'admin') {
      const a = await this.prisma.adminUser.findUnique({ where: { id: payload.sub } });
      return a ? { kind: 'admin', id: a.id, name: a.name, email: a.email, roles: [], departmentId: null } : null;
    }
    const e = await this.prisma.employee.findUnique({ where: { id: payload.sub } });
    return e
      ? { kind: 'employee', id: e.id, name: e.name, email: e.email, roles: e.roles, departmentId: e.departmentId }
      : null;
  }
}
