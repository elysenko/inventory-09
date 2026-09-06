import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
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
export class SettingsComponent {
  private readonly fb = inject(FormBuilder);

  readonly services = SERVICES;
  readonly saving = signal(false);
  readonly savedService = signal<string | null>(null);

  /**
   * Backend-provided data. Replaced with an API call by the service layer.
   * Values arrive masked from the server; `configured` reflects env-or-DB resolution.
   */
  readonly settings = signal<SettingEntry[]>([
    { key: 'DATABASE_URL', service: 'postgresql', label: 'Connection URL', value: 'postgresql://••••••@app-db:5432/stockroom', configured: true },
    { key: 'MINIO_ENDPOINT', service: 'minio', label: 'Endpoint', value: '', configured: false },
    { key: 'MINIO_ACCESS_KEY', service: 'minio', label: 'Access key', value: '', configured: false },
    { key: 'MINIO_SECRET_KEY', service: 'minio', label: 'Secret key', value: '', configured: false },
    { key: 'LLM_API_KEY', service: 'llm', label: 'API key', value: '', configured: false },
    { key: 'LLM_BASE_URL', service: 'llm', label: 'Base URL', value: '', configured: false },
  ]);

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

  save(service: string): void {
    this.saving.set(true);
    this.savedService.set(service);
    this.saving.set(false);
  }
}
