import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { authInterceptor } from './core/auth.interceptor';
import { routes } from './app.routes';

/**
 * The app talks to the NestJS REST API at `/api` through `ApiService`.
 * `authInterceptor` is registered here so every one of those calls carries the
 * bearer token and shares one expired-session behaviour.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimations(),
  ],
};
