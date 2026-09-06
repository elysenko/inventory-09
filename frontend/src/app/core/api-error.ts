import { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from './models';

/**
 * Normalises everything the NestJS API can return into the single `ApiError`
 * shape the forms and list screens render.
 *
 * Three server dialects have to collapse into one:
 *  - `ValidationPipe` 400s: `{ message: string[] }`, one entry per failed rule,
 *    each prefixed with the property name ("sku should not be empty").
 *  - Hand-thrown 409/422s: `{ message: string, fieldErrors?: {...} }` — the
 *    services already emit the inline field errors the forms want.
 *  - Everything else (500, gateway HTML, `status === 0` when the API is
 *    unreachable), which has no useful body at all.
 */

/** Leading token of a class-validator message is the offending property. */
const VALIDATION_PREFIX = /^([A-Za-z_][A-Za-z0-9_]*)\s/;

function fieldErrorsFromMessages(messages: string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const message of messages) {
    const match = VALIDATION_PREFIX.exec(message);
    const key = match?.[1];
    // Keep the first message per field: class-validator emits one per failed
    // rule and the first is the most specific ("required" before "too long").
    if (key !== undefined && fields[key] === undefined) fields[key] = message;
  }
  return fields;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toApiError(error: unknown, fallback: string): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return { message: fallback };
  }

  // status 0 means the request never reached the API (offline, DNS, CORS).
  if (error.status === 0) {
    return { message: 'Could not reach the server. Check your connection and try again.' };
  }

  const body: unknown = error.error;
  if (!isRecord(body)) {
    return { message: error.status >= 500 ? 'The server had a problem handling that request.' : fallback };
  }

  const rawMessage = body['message'];
  const rawFieldErrors = body['fieldErrors'];

  const fieldErrors: Record<string, string> = isRecord(rawFieldErrors)
    ? Object.fromEntries(
        Object.entries(rawFieldErrors).map(([key, value]) => [key, String(value)]),
      )
    : {};

  if (Array.isArray(rawMessage)) {
    const messages = rawMessage.map((entry) => String(entry));
    const derived = fieldErrorsFromMessages(messages);
    return {
      message: messages[0] ?? fallback,
      fieldErrors: { ...derived, ...fieldErrors },
    };
  }

  const message = typeof rawMessage === 'string' && rawMessage !== '' ? rawMessage : fallback;
  return Object.keys(fieldErrors).length > 0 ? { message, fieldErrors } : { message };
}

/** True when the failure was an authorisation refusal rather than bad input. */
export function isForbidden(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403;
}

export function isNotFound(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 404;
}
