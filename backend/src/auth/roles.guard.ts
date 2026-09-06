import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedUser } from './current-user.decorator';

/**
 * Expansion of each declared requirement into the set of roles that satisfy it.
 *
 * ADMIN inherits every MANAGER capability, which is what the UI assumes
 * (`AuthService.isManager()` treats ADMIN as a manager). The inheritance is
 * deliberately one-way: `@Roles(Role.ADMIN)` is not satisfied by MANAGER, so
 * `/api/admin/settings` stays stricter than the manager routes.
 */
const ROLE_EXPANSION: Record<Role, Role[]> = {
  [Role.ADMIN]: [Role.ADMIN],
  [Role.MANAGER]: [Role.MANAGER, Role.ADMIN],
  [Role.CLERK]: [Role.CLERK, Role.USER, Role.MANAGER, Role.ADMIN],
  [Role.USER]: [Role.USER, Role.CLERK, Role.MANAGER, Role.ADMIN],
};

/**
 * Global authorisation guard. A route with no `@Roles()` metadata is open to
 * any authenticated principal; the authentication itself is enforced upstream
 * by `JwtAuthGuard`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const role = request.user?.role;
    if (!role) throw new ForbiddenException('Insufficient role for this operation');

    const allowed = new Set<Role>(required.flatMap((r) => ROLE_EXPANSION[r] ?? [r]));
    if (!allowed.has(role)) {
      throw new ForbiddenException('Insufficient role for this operation');
    }
    return true;
  }
}
