import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

/** Shape attached to `request.user` by `JwtStrategy.validate`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

/**
 * Injects the authenticated principal. The caller's id is always taken from the
 * verified token, never from the request body, so a client cannot attribute a
 * movement to another user.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
