import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Blocks unauthenticated access. Redirects at most once and never from /login,
 * so a guard <-> shell redirect loop (which renders a permanently blank page)
 * is impossible.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (COLOSSUS_PREVIEW) {
    // Preview is served as static files with no API. Treat the session as
    // already signed in so every authenticated route deep-links on a cold load.
    auth.ensurePreviewSession();
    return true;
  }

  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
