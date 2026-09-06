import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService, HOME_ROUTE } from './auth.service';
import type { Role } from './models';

/**
 * Requires one of `roles`. ADMIN implicitly satisfies MANAGER.
 * Redirects to the home route (never to a guarded route), so it cannot loop.
 */
export function roleGuard(roles: Role[]): CanActivateFn {
  return (): boolean | UrlTree => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (COLOSSUS_PREVIEW) auth.ensurePreviewSession();

    const role = auth.role();
    if (role === null) return router.createUrlTree(['/login']);

    const allowed = roles.includes(role) || (role === 'ADMIN' && roles.includes('MANAGER'));
    return allowed ? true : router.createUrlTree([HOME_ROUTE]);
  };
}
