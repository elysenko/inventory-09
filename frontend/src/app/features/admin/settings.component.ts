import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import type { SettingEntry } from '../../core/models';

interface ServiceCard {
  service: string;
  label: string;
  blurb: string;
  keys: string[];
}

const SERVICES: ServiceCard[] = [
  {
    service: 'postgresql',
    label: 'PostgreSQL',
    blurb: 'Primary datastore for items, locations, stock levels and the movement log.',
    keys: ['DATABASE_URL'],
  },
  {
    service: 'minio',
    label: 'MinIO',
    blurb: 'Object storage for item photos and exported reports.',
    keys: ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY'],
  },
  {
    service: 'llm',
    label: 'LLM',
    blurb: 'Language model access for reorder suggestions and natural-language search.',
    keys: ['LLM_API_KEY', 'LLM_BASE_URL'],
  },
];

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);

  readonly services = SERVICES;
  readonly saving = signal(false);
  readonly savedService = signal<string | null>(null);
  /** Per-service save failure, keyed by service name. */
  readonly saveErrors = signal<Record<string, string>>({});

  /**
   * `GET /api/admin/settings` — masked values with a `configured` flag that
   * reflects env-then-database resolution on the server.
   *
   * Seeded from the static key registry above so the form renders its fields on
   * first paint and an unreachable API reads as "not configured" rather than as
   * "all services configured", which is what an empty list would imply.
   */
  readonly settings = signal<SettingEntry[]>(
    SERVICES.flatMap((service) =>
      service.keys.map((key) => ({
        key,
        service: service.service,
        label: key,
        value: '',
        configured: false,
      })),
    ),
  );

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const entries = await this.api.listSettings();
      if (entries.length > 0) this.settings.set(entries);
    } catch (error) {
      this.saveErrors.set({ postgresql: toApiError(error, 'Could not load settings.').message });
    }
  }

  readonly form = this.fb.nonNullable.group({
    DATABASE_URL: [''],
    MINIO_ENDPOINT: [''],
    MINIO_ACCESS_KEY: [''],
    MINIO_SECRET_KEY: [''],
    LLM_API_KEY: [''],
    LLM_BASE_URL: [''],
  });

  entriesFor(service: string): SettingEntry[] {
    return this.settings().filter((entry) => entry.service === service);
  }

  isConfigured(service: string): boolean {
    const entries = this.entriesFor(service);
    return entries.length > 0 && entries.every((entry) => entry.configured);
  }

  /** Services still missing credentials — surfaced in the banner. */
  readonly unconfigured = computed(() =>
    SERVICES.filter((service) => {
      const entries = this.settings().filter((entry) => entry.service === service.service);
      return entries.length > 0 && !entries.every((entry) => entry.configured);
    }),
  );

  readonly unconfiguredLabels = computed(() =>
    this.unconfigured()
      .map((service) => service.label)
      .join(', '),
  );

  controlName(key: string): 'DATABASE_URL' | 'MINIO_ENDPOINT' | 'MINIO_ACCESS_KEY' | 'MINIO_SECRET_KEY' | 'LLM_API_KEY' | 'LLM_BASE_URL' {
    return key as ReturnType<SettingsComponent['controlName']>;
  }

  /** Masked inputs for anything carrying a credential (DATABASE_URL embeds a password). */
  isSecret(key: string): boolean {
    return (
      key.includes('KEY') ||
      key.includes('SECRET') ||
      key.includes('PASSWORD') ||
      key === 'DATABASE_URL'
    );
  }

  errorFor(service: string): string | null {
    return this.saveErrors()[service] ?? null;
  }

  /**
   * Persists only the fields the admin actually typed into.
   *
   * Blank inputs are skipped rather than sent as empty strings: the displayed
   * value is masked, so submitting the form unchanged would otherwise overwrite
   * live credentials with the mask (or with nothing).
   */
  async save(service: string): Promise<void> {
    if (this.saving()) return;

    const keys = SERVICES.find((entry) => entry.service === service)?.keys ?? [];
    const values = this.form.getRawValue();
    const entries = keys
      .map((key) => ({ key, value: (values[this.controlName(key)] ?? '').trim() }))
      .filter((entry) => entry.value !== '');

    this.savedService.set(null);
    this.saveErrors.update((errors) => ({ ...errors, [service]: '' }));

    if (entries.length === 0) {
      this.saveErrors.update((errors) => ({
        ...errors,
        [service]: 'Enter at least one value before saving.',
      }));
      return;
    }

    this.saving.set(true);
    try {
      this.settings.set(await this.api.updateSettings(entries));
      // Clear the typed secrets from the DOM once they are stored server-side.
      for (const entry of entries) {
        this.form.controls[this.controlName(entry.key)].setValue('');
      }
      this.savedService.set(service);
      this.saveErrors.update((errors) => ({ ...errors, [service]: '' }));
    } catch (error) {
      this.saveErrors.update((errors) => ({
        ...errors,
        [service]: toApiError(error, 'Could not save those credentials.').message,
      }));
    } finally {
      this.saving.set(false);
    }
  }
}
