import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService, MANAGED_KEYS } from '../../config/config.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

export interface SettingEntryView {
  key: string;
  service: string;
  label: string;
  /** Masked — never the raw credential. Empty string when unconfigured. */
  value: string;
  configured: boolean;
  source: 'env' | 'db' | null;
  updatedAt: Date | null;
}

/**
 * Shows only enough of a secret to recognise it (the last four characters) and
 * never enough to use it. Short values are masked entirely, so a 4-character
 * key is not echoed back in full.
 */
function mask(value: string): string {
  const visible = value.length > 8 ? value.slice(-4) : '';
  return `${'•'.repeat(8)}${visible}`;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * One entry per managed key, whether or not it is set, so the settings screen
   * can render a complete form and a truthful "needs credentials" banner.
   */
  async list(): Promise<SettingEntryView[]> {
    const rows = await this.prisma.systemSetting.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return Promise.all(
      MANAGED_KEYS.map(async ({ key, service, label }) => {
        const resolved = await this.config.resolveConfig(key);
        const row = byKey.get(key);
        const fromEnv = resolved !== null && resolved === process.env[key];
        return {
          key,
          service,
          label,
          value: resolved === null ? '' : mask(resolved),
          configured: resolved !== null,
          source: resolved === null ? null : fromEnv ? ('env' as const) : ('db' as const),
          updatedAt: row?.updatedAt ?? null,
        };
      }),
    );
  }

  /** Upsert, so applying the same patch twice leaves exactly one row per key. */
  async update(dto: UpdateSettingsDto): Promise<SettingEntryView[]> {
    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.systemSetting.upsert({
          where: { key: entry.key },
          update: { value: entry.value },
          create: { key: entry.key, value: entry.value },
        }),
      ),
    );
    return this.list();
  }
}
