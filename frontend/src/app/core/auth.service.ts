import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { toApiError } from './api-error';
import type { ApiError, Role, User } from './models';
import { readJson, removeKeys, writeJson, writeRaw, readRaw } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'token';

/** Route the app lands on once authenticated. */
export const HOME_ROUTE = '/items';

/** Roles that satisfy a MANAGER requirement (ADMIN inherits MANAGER). */
const MANAGER_ROLES: Role[] = ['MANAGER', 'ADMIN'];
const VALID_ROLES: Role[] = ['USER', 'CLERK', 'MANAGER', 'ADMIN'];

/** Untrusted storage payloads are validated against this before being trusted. */
function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u['id'] === 'string' &&
    u['id'].length > 0 &&
    typeof u['email'] === 'string' &&
    u['email'].length > 0 &&
    typeof u['role'] === 'string' &&
    VALID_ROLES.includes(u['role'] as Role)
  );
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/**
 * Placeholder token for preview sessions. Folded to '' in production builds so
 * the literal never reaches the bundle, even though the class methods that use
 * it cannot themselves be tree-shaken away.
 */
const PREVIEW_TOKEN = COLOSSUS_PREVIEW ? 'preview-session' : '';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly currentUser = signal<User | null>(this.restore());

  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly role = computed<Role | null>(() => this.currentUser()?.role ?? null);

  isManager(): boolean {
    const role = this.role();
    return role !== null && MANAGER_ROLES.includes(role);
  }

  isAdmin(): boolean {
    return this.role() === 'ADMIN';
  }

  /**
   * Restores a session from namespaced storage.
   * Anything unrecognised is cleared and treated as signed-out — restore must
   * never throw, or the app renders a blank page.
   */
  private restore(): User | null {
    try {
      const stored = readJson<unknown>(USER_KEY);
      if (stored === null) return null;
      if (!isUser(stored)) {
        removeKeys(USER_KEY, TOKEN_KEY);
        return null;
      }
      return stored;
    } catch {
      removeKeys(USER_KEY, TOKEN_KEY);
      return null;
    }
  }

  private persist(user: User, token: string): void {
    writeJson(USER_KEY, user);
    writeRaw(TOKEN_KEY, token);
    this.currentUser.set(user);
  }

  token(): string | null {
    return readRaw(TOKEN_KEY);
  }

  /**
   * Signs in.
   *
   * In preview builds this resolves locally and synchronously: the mockup is
   * served as static files with no API behind it, so an HTTP call would strand
   * the reviewer on the login screen. The production branch is the real request.
   */
  async login(email: string, password: string): Promise<ApiError | null> {
    const trimmed = email.trim();

    if (COLOSSUS_PREVIEW) {
      const fieldErrors: Record<string, string> = {};
      if (!trimmed) fieldErrors['email'] = 'Enter your email address.';
      else if (!EMAIL_SHAPE.test(trimmed)) fieldErrors['email'] = 'Enter a valid email address.';
      if (!password) fieldErrors['password'] = 'Enter your password.';
      if (Object.keys(fieldErrors).length > 0) {
        return { message: 'Check the highlighted fields and try again.', fieldErrors };
      }
      this.seedSession(trimmed, 'ADMIN');
      await this.router.navigate([HOME_ROUTE]);
      return null;
    }

    try {
      const res = await this.api.login(trimmed, password);
      this.persist(res.user, res.accessToken);
      await this.router.navigate([HOME_ROUTE]);
      return null;
    } catch (error) {
      return toApiError(error, 'That email and password combination was not recognised.');
    }
  }

  async signup(name: string, email: string, password: string): Promise<ApiError | null> {
    const trimmed = email.trim();

    if (COLOSSUS_PREVIEW) {
      this.seedSession(trimmed, 'CLERK', name.trim());
      await this.router.navigate([HOME_ROUTE]);
      return null;
    }

    try {
      const res = await this.api.signup(trimmed, password, name.trim() || undefined);
      this.persist(res.user, res.accessToken);
      await this.router.navigate([HOME_ROUTE]);
      return null;
    } catch (error) {
      return toApiError(error, 'Could not create that account. Try a different email address.');
    }
  }

  async logout(): Promise<void> {
    // Sessions are stateless, so the server call is a courtesy: the token is
    // discarded locally whether or not it succeeds. Never block sign-out on it.
    if (!COLOSSUS_PREVIEW) {
      try {
        await this.api.logout();
      } catch {
        /* already signed out, offline, or token expired — clear anyway */
      }
    }
    removeKeys(USER_KEY, TOKEN_KEY);
    this.currentUser.set(null);
    await this.router.navigate(['/login']);
  }

  /**
   * Re-reads the principal from `/api/auth/me`.
   *
   * The signed-in user is restored from localStorage so the first paint is not
   * blocked, but that copy can be stale (role changed) or backed by a token the
   * server no longer accepts. Calling this once inside the authenticated shell
   * reconciles both. A 401 is handled by the interceptor, which clears the
   * session and redirects, so nothing extra is needed here.
   */
  async refresh(): Promise<void> {
    if (COLOSSUS_PREVIEW) return;
    const token = this.token();
    if (token === null || token === '') return;
    try {
      const user = await this.api.me();
      this.persist(user, token);
    } catch {
      /* interceptor owns the 401 path; transient failures keep the cached user */
    }
  }

  // ---------------------------------------------------------------------------
  // Preview-only affordances. COLOSSUS_PREVIEW is a build-time constant, so
  // everything below is dead-code-eliminated from the production bundle.
  // ---------------------------------------------------------------------------

  /** Seeds signed-in state without any credential exchange. */
  private seedSession(email: string, role: Role, name?: string): void {
    const local = email.split('@')[0] || 'user';
    this.persist(
      {
        id: `preview-${local}`,
        email,
        name: name || local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        role,
      },
      PREVIEW_TOKEN,
    );
  }

  /** "Skip login — Demo Mode": seeds the session and lands on the home screen. */
  async previewSignIn(role: Role = 'ADMIN'): Promise<void> {
    if (!COLOSSUS_PREVIEW) return;
    this.seedSession('demo@stockroom.app', role);
    await this.router.navigate([HOME_ROUTE]);
  }

  /** Ensures a session exists so deep-linked routes render on a cold load. */
  ensurePreviewSession(): void {
    if (!COLOSSUS_PREVIEW) return;
    if (this.currentUser() === null) this.seedSession('demo@stockroom.app', 'ADMIN');
  }

  /** Lets a reviewer see how navigation and permissions differ per role. */
  previewSetRole(role: Role): void {
    if (!COLOSSUS_PREVIEW) return;
    const user = this.currentUser();
    if (user === null) this.seedSession('demo@stockroom.app', role);
    else this.persist({ ...user, role }, PREVIEW_TOKEN);
  }
}
