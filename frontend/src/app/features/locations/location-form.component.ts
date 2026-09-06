import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { Location } from '../../core/models';

@Component({
  selector: 'app-location-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './location-form.component.html',
  styleUrls: ['./location-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});

  /** Backend-provided data. Replaced with an API call by the service layer. */
  readonly locations = signal<Location[]>([
    { id: 'loc-1', name: 'Zone A', zone: 'Receiving', createdAt: '2026-01-10T08:00:00Z' },
    { id: 'loc-2', name: 'Zone B', zone: 'Main racking', createdAt: '2026-01-10T08:05:00Z' },
    { id: 'loc-3', name: 'Zone C', zone: 'Dispatch', createdAt: '2026-01-10T08:10:00Z' },
    { id: 'loc-4', name: 'Zone D', zone: 'Quarantine', createdAt: '2026-02-15T08:10:00Z' },
  ]);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly locationId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.locationId() !== null);
  readonly existing = computed<Location | null>(
    () => this.locations().find((l) => l.id === this.locationId()) ?? null,
  );

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    zone: ['', [Validators.required]],
  });

  constructor() {
    const location = this.existing();
    if (location) this.form.patchValue({ name: location.name, zone: location.zone });
  }

  errorFor(field: 'name' | 'zone'): string | null {
    const server = this.fieldErrors()[field];
    if (server) return server;
    const control = this.form.controls[field];
    if (control.touched && control.hasError('required')) return 'This field is required.';
    return null;
  }

  save(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.fieldErrors.set({});
    if (this.form.invalid) return;

    const { name } = this.form.getRawValue();
    const clash = this.locations().find(
      (l) => l.name.toLowerCase() === name.trim().toLowerCase() && l.id !== this.locationId(),
    );

    // Mirrors the server's unique-constraint response on `name`.
    if (clash) {
      this.fieldErrors.set({ name: `A location named “${clash.name}” already exists.` });
      this.formError.set('That location name is already in use.');
      return;
    }

    this.saving.set(true);
    void this.router.navigate(['/locations']);
  }
}
