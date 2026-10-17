import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/**
 * Who may call an endpoint. Put one of these above a controller method:
 *   @Public()     anyone, no sign-in (public summary, sign-in itself)
 *   (nothing)     anyone signed in (staff or admin)
 *   @StaffOnly()  a signed-in employee (staff app)
 *   @AdminOnly()  a signed-in admin (admin console)
 */
export type Access = 'public' | 'signed-in' | 'staff' | 'admin';
export const ACCESS_KEY = 'access';
export const Public = () => SetMetadata(ACCESS_KEY, 'public');
export const StaffOnly = () => SetMetadata(ACCESS_KEY, 'staff');
export const AdminOnly = () => SetMetadata(ACCESS_KEY, 'admin');

/** The person signed in, as the guard found them. */
export interface SessionUser {
  kind: 'employee' | 'admin';
  id: string;
  name: string;
  email: string | null;
  roles: string[]; // employees only; empty for admins
  departmentId: string | null;
}

/** Use in a controller method:  me(@CurrentUser() user: SessionUser) */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user as SessionUser,
);

export const SESSION_COOKIE = 'fvt_session';
