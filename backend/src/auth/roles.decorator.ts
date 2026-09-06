import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Declares the roles allowed to reach a handler. `RolesGuard` expands
 * `MANAGER` to also admit `ADMIN` (admin inherits every manager capability),
 * but never the other way round: `@Roles(Role.ADMIN)` stays admin-only.
 */
export const Roles = (...roles: Role[]): CustomDecorator<string> => SetMetadata(ROLES_KEY, roles);
