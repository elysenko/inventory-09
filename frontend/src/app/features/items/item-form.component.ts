import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import type { ItemDetail } from '../../core/models';

/** Offered as suggestions only — `unit` is free text on the server. */
const UNITS = ['each', 'box', 'pack', 'roll', 'pallet', 'kg', 'litre'];

@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './item-form.component.html',
  styleUrls: ['./item-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  /** Field-level errors returned by the server, e.g. duplicate `sku`. */
  readonly fieldErrors = signal<Record<string, string>>({});

  /** The item being edited, loaded from `GET /api/items/:id`. */
  readonly existing = signal<ItemDetail | null>(null);

  readonly units = signal<string[]>(UNITS);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.itemId() !== null);

  /** Destructive confirm lives in the URL, not in component state. */
  readonly deleteOpen = computed(() => this.queryParams().get('modal') === 'delete');

  /**
   * Deletion is refused while the item still holds stock. The server enforces
   * this too (and additionally refuses items with movement history); this is
   * the same rule stated up front so the confirm button is disabled rather than
   * failing on click.
   */
  readonly deleteBlockedReason = computed<string | null>(() => {
    const item = this.existing();
    if (item === null) return null;
    if (item.totalQty > 0) {
      return `${item.name} still holds ${item.totalQty} ${item.unit} across its locations. Move the stock out before deleting it.`;
    }
    return null;
  });

  readonly form = this.fb.nonNullable.group({
    sku: ['', [Validators.required]],
    name: ['', [Validators.required]],
    description: [''],
    unit: ['each', [Validators.required]],
    reorderAt: [0, [Validators.required, Validators.min(0)]],
  });

  private hydratedFor: string | null = null;

  constructor() {
    effect(() => {
      const id = this.itemId();
      if (id !== null && id !== this.hydratedFor) void this.load(id);
    });
  }

  /** Loads the edit target and fills the form from the server's copy. */
  private async load(id: string): Promise<void> {
    this.hydratedFor = id;
    try {
      const item = await this.api.getItem(id);
      this.existing.set(item);
      // Keep the offered units a superset of whatever the item actually uses,
      // otherwise the <select> would silently drop a custom unit on save.
      if (!UNITS.includes(item.unit)) this.units.set([...UNITS, item.unit]);
      this.form.patchValue({
        sku: item.sku,
        name: item.name,
        description: item.description ?? '',
        unit: item.unit,
        reorderAt: item.reorderAt,
      });
    } catch (error) {
      this.hydratedFor = null;
      this.formError.set(toApiError(error, 'Could not load that item.').message);
    }
  }

  errorFor(field: 'sku' | 'name' | 'unit' | 'reorderAt'): string | null {
    const server = this.fieldErrors()[field];
    if (server) return server;
    const control = this.form.controls[field];
    if (!control.touched) return null;
    if (control.hasError('required')) return 'This field is required.';
    if (control.hasError('min')) return 'Must be zero or greater.';
    return null;
  }

  /**
   * Creates or updates through the API.
   *
   * Uniqueness of `sku` is decided by the database, not here: a client-side
   * scan of a locally-held list would both miss items outside the loaded page
   * and lose the race against a concurrent create. The server's P2002 handler
   * returns `fieldErrors.sku`, which is rendered inline on the SKU field.
   */
  async save(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.fieldErrors.set({});
    if (this.form.invalid || this.saving()) return;

    const raw = this.form.getRawValue();
    const payload = {
      sku: raw.sku.trim(),
      name: raw.name.trim(),
      description: raw.description.trim(),
      unit: raw.unit.trim(),
      reorderAt: Number(raw.reorderAt),
    };

    this.saving.set(true);
    try {
      const id = this.itemId();
      if (id !== null) await this.api.updateItem(id, payload);
      else await this.api.createItem(payload);
      await this.router.navigate(['/items']);
    } catch (error) {
      const apiError = toApiError(error, 'Could not save that item.');
      this.formError.set(apiError.message);
      this.fieldErrors.set(apiError.fieldErrors ?? {});
    } finally {
      this.saving.set(false);
    }
  }

  openDelete(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: 'delete', id: this.itemId() },
      queryParamsHandling: 'merge',
    });
  }

  closeDelete(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: null, id: null },
      queryParamsHandling: 'merge',
    });
  }

  async confirmDelete(): Promise<void> {
    const id = this.itemId();
    if (id === null) return;
    try {
      await this.api.deleteItem(id);
      await this.router.navigate(['/items']);
    } catch (error) {
      // 409 when the item holds stock or appears in the immutable audit log.
      this.formError.set(toApiError(error, 'Could not delete that item.').message);
      this.closeDelete();
    }
  }
}
