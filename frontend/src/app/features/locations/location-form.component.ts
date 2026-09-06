import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import type { Location } from '../../core/models';

@Component({
  selector: 'app-location-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './location-form.component.html',
  styleUrls: ['./location-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationFormComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  /** The location being edited, loaded from `GET /api/locations/:id`. */
  readonly existing = signal<Location | null>(null);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly locationId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.locationId() !== null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    zone: ['', [Validators.required]],
  });

  private hydratedFor: string | null = null;

  constructor() {
    effect(() => {
      const id = this.locationId();
      if (id !== null && id !== this.hydratedFor) void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.hydratedFor = id;
    try {
      const location = await this.api.getLocation(id);
      this.existing.set(location);
      this.form.patchValue({ name: location.name, zone: location.zone });
    } catch (error) {
      this.hydratedFor = null;
      this.formError.set(toApiError(error, 'Could not load that location.').message);
    }
  }

  errorFor(field: 'name' | 'zone'): string | null {
    const server = this.fieldErrors()[field];
    if (server) return server;
    const control = this.form.controls[field];
    if (control.touched && control.hasError('required')) return 'This field is required.';
    return null;
  }

  /**
   * `name` is unique in the database. The duplicate is detected there rather
   * than against a locally-held list, so the check cannot be defeated by a
   * concurrent create or by a location the client has not loaded; the server
   * returns `fieldErrors.name`, which renders inline.
   */
  async save(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.fieldErrors.set({});
    if (this.form.invalid || this.saving()) return;

    const raw = this.form.getRawValue();
    const payload = { name: raw.name.trim(), zone: raw.zone.trim() };

    this.saving.set(true);
    try {
      const id = this.locationId();
      if (id !== null) await this.api.updateLocation(id, payload);
      else await this.api.createLocation(payload);
      await this.router.navigate(['/locations']);
    } catch (error) {
      const apiError = toApiError(error, 'Could not save that location.');
      this.formError.set(apiError.message);
      this.fieldErrors.set(apiError.fieldErrors ?? {});
    } finally {
      this.saving.set(false);
    }
  }
}
