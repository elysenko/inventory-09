/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin under /<mockup_id>/ and storage is
 * origin-scoped, not path-scoped, so unprefixed keys collide across mockups.
 * The namespace is derived from the <base href> (set in index.html from the
 * served path) rather than from location.pathname directly, so it stays stable
 * as the user navigates between routes.
 */
function resolveNamespace(): string {
  if (typeof document === 'undefined') return 'app';
  const base = document.querySelector('base')?.getAttribute('href') ?? '/';
  return base.replace(/^\/+|\/+$/g, '').split('/')[0] || 'app';
}

const NS = resolveNamespace();

/** e.g. '49c3b66f-...-a4:user' — colon separator is load-bearing. */
export const nsKey = (key: string): string => `${NS}:${key}`;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* private mode / quota — preview must keep working */
  }
}

export function removeKeys(...keys: string[]): void {
  try {
    for (const key of keys) localStorage.removeItem(nsKey(key));
  } catch {
    /* ignore */
  }
}

/** Reads and JSON-parses a key. Returns null on anything unparseable. */
export function readJson<T>(key: string): T | null {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
