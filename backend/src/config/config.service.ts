import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sentinel written by provisioning when a key is known but not yet filled in.
 * Treated exactly like "absent" so a placeholder never reaches a live SDK call.
 */
export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

/**
 * Raised when a feature's credentials are neither in the environment nor in
 * `SystemSetting`. It maps to 503 rather than 500 because the deployment is
 * healthy — the integration simply has not been configured yet, and the admin
 * settings screen is where a human fixes it.
 */
export class ServiceUnconfiguredError extends HttpException {
  constructor(
    readonly key: string,
    message = `${key} is not configured. Set it in Admin settings or provide it as an environment variable.`,
  ) {
    super({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, message, key }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

/** Keys the admin settings screen manages, grouped by the service they belong to. */
export interface ManagedKey {
  key: string;
  service: string;
  label: string;
}

export const MANAGED_KEYS: ManagedKey[] = [
  { key: 'DATABASE_URL', service: 'postgresql', label: 'Connection URL' },
  { key: 'MINIO_ENDPOINT', service: 'minio', label: 'Endpoint' },
  { key: 'MINIO_ACCESS_KEY', service: 'minio', label: 'Access key' },
  { key: 'MINIO_SECRET_KEY', service: 'minio', label: 'Secret key' },
  { key: 'LLM_API_KEY', service: 'llm', label: 'API key' },
  { key: 'LLM_BASE_URL', service: 'llm', label: 'Base URL' },
];

export const MANAGED_KEY_NAMES: string[] = MANAGED_KEYS.map((entry) => entry.key);

function isUsable(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '' && value !== PLACEHOLDER;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolution order: environment variable, then the `SystemSetting` row, then
   * null.
   *
   * The environment wins because that is where the platform injects the real
   * provisioned credentials at deploy time; a stale row an admin typed months
   * ago must never shadow it.
   */
  async resolveConfig(key: string): Promise<string | null> {
    const fromEnv = process.env[key];
    if (isUsable(fromEnv)) return fromEnv;

    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (isUsable(row?.value)) return row!.value;

    return null;
  }

  /** Same lookup, but for call sites that cannot proceed without a value. */
  async requireConfig(key: string): Promise<string> {
    const value = await this.resolveConfig(key);
    if (value === null) throw new ServiceUnconfiguredError(key);
    return value;
  }

  async isConfigured(key: string): Promise<boolean> {
    return (await this.resolveConfig(key)) !== null;
  }
}
