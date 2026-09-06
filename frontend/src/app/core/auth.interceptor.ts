import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { readRaw, removeKeys } from './storage';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

/** Requests whose own 401 is a normal answer, not an expired session. */
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/signup'];

/**
 * Attaches the bearer token to every API call and turns a rejected token into a
 * clean sign-out.
 *
 * The token is read from storage rather than from `AuthService` on purpose:
 * injecting `AuthService` here would close the loop
 * `HttpClient -> interceptor -> AuthService -> ApiService -> HttpClient` and
 * Angular would fail to construct the client at all.
 *
 * A 401 from `/auth/login` is the server correctly rejecting bad credentials —
 * the login form renders that inline, so it must not trigger a redirect.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = readRaw(TOKEN_KEY);

  const authorised =
    token !== null && token !== ''
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      const isCredentialCall = CREDENTIAL_ENDPOINTS.some((path) => req.url.includes(path));

      if (error instanceof HttpErrorResponse && error.status === 401 && !isCredentialCall) {
        // The token is gone or expired. Drop the stale session so guards stop
        // treating the user as signed in, then send them to sign in again with
        // a return path so they land back where they were.
        removeKeys(USER_KEY, TOKEN_KEY);
        const returnUrl = router.url;
        void router.navigate(['/login'], {
          queryParams: returnUrl && returnUrl !== '/login' ? { returnUrl } : {},
        });
      }

      return throwError(() => error);
    }),
  );
};
