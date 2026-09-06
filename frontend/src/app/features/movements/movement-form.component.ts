import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import type { ItemWithTotals, Location, MovementType, StockLevel } from '../../core/models';

const TYPES: { value: MovementType; label: string; blurb: string }[] = [
  { value: 'IN', label: 'Receive in', blurb: 'Add stock into a location.' },
  { value: 'OUT', label: 'Issue out', blurb: 'Remove stock from a location.' },
  { value: 'TRANSFER', label: 'Transfer', blurb: 'Move stock between two locations.' },
];

@Component({
  selector: 'app-movement-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './movement-form.component.html',
  styleUrls: ['./movement-form.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);

  readonly types = TYPES;
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly saved = signal(false);

  readonly isManager = computed(() => {
    this.auth.currentUser();
    return this.auth.isManager();
  });

  /** Picker options — the whole catalogue and every storage location. */
  readonly items = signal<ItemWithTotals[]>([]);
  readonly locations = signal<Location[]>([]);

  /**
   * Per-location stock for the *selected* item only.
   *
   * Loaded from `GET /api/items/:id` each time the item changes, so the
   * "N available here" hint reflects the server's current balance rather than
   * a snapshot taken when the page opened.
   */
  readonly stockLevels = signal<StockLevel[]>([]);

  readonly form = this.fb.nonNullable.group({
    type: ['IN' as MovementType, [Validators.required]],
    itemId: ['', [Validators.required]],
    fromLocId: [''],
    toLocId: [''],
    qty: [1, [Validators.required, Validators.min(1)]],
    note: [''],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly type = computed<MovementType>(() => (this.formValue().type ?? 'IN') as MovementType);

  /** IN needs a destination only; OUT a source only; TRANSFER both. */
  readonly needsFrom = computed(() => this.type() === 'OUT' || this.type() === 'TRANSFER');
  readonly needsTo = computed(() => this.type() === 'IN' || this.type() === 'TRANSFER');

  /** Stock available at the source location — the over-draw guard's basis. */
  readonly availableAtSource = computed<number | null>(() => {
    const value = this.formValue();
    const itemId = value.itemId ?? '';
    const fromLocId = value.fromLocId ?? '';
    if (!this.needsFrom() || !itemId || !fromLocId) return null;
    const level = this.stockLevels().find(
      (l) => l.itemId === itemId && l.locationId === fromLocId,
    );
    return level?.qty ?? 0;
  });

  readonly selectedItem = computed(
    () => this.items().find((i) => i.id === this.formValue().itemId) ?? null,
  );

  readonly typeBlurb = computed(() => TYPES.find((t) => t.value === this.type())?.blurb ?? '');

  private loadedLevelsFor: string | null = null;

  constructor() {
    // Prefill from the URL so the form is deep-linkable from item pages.
    const params = this.route.snapshot.queryParamMap;
    const type = params.get('type');
    this.form.patchValue({
      type: type === 'IN' || type === 'OUT' || type === 'TRANSFER' ? type : 'IN',
      itemId: params.get('itemId') ?? '',
      fromLocId: params.get('fromLocId') ?? '',
      toLocId: params.get('toLocId') ?? '',
    });

    // Clear location fields that the selected type does not use, so a switched
    // type can never submit a stale value the server would reject.
    effect(() => {
      const movementType = this.type();
      if (movementType === 'IN' && this.form.controls.fromLocId.value) {
        this.form.controls.fromLocId.setValue('', { emitEvent: false });
      }
      if (movementType === 'OUT' && this.form.controls.toLocId.value) {
        this.form.controls.toLocId.setValue('', { emitEvent: false });
      }
    });

    // Keep the availability hint in step with the selected item.
    effect(() => {
      const itemId = this.formValue().itemId ?? '';
      if (itemId !== '' && itemId !== this.loadedLevelsFor) void this.loadStockLevels(itemId);
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const [items, locations] = await Promise.all([
        this.api.listAllItems(),
        this.api.listLocations(),
      ]);
      this.items.set(items);
      this.locations.set(locations);
    } catch (error) {
      this.formError.set(toApiError(error, 'Could not load items and locations.').message);
    }
  }

  private async loadStockLevels(itemId: string): Promise<void> {
    this.loadedLevelsFor = itemId;
    try {
      const detail = await this.api.getItem(itemId);
      this.stockLevels.set(detail.byLocation);
    } catch {
      // The hint is advisory; the server's atomic guard is the real check.
      this.stockLevels.set([]);
    }
  }

  selectType(type: MovementType): void {
    this.form.controls.type.setValue(type);
    this.formError.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { type },
      queryParamsHandling: 'merge',
    });
  }

  errorFor(field: 'itemId' | 'qty'): string | null {
    const control = this.form.controls[field];
    if (!control.touched) return null;
    if (control.hasError('required')) {
      return field === 'itemId' ? 'Choose an item.' : 'Enter a quantity.';
    }
    if (control.hasError('min')) return 'Quantity must be at least 1.';
    return null;
  }

  /**
   * Records the movement through `POST /api/movements`.
   *
   * The per-type checks below are there to keep the user out of an obviously
   * invalid submit, not to decide the outcome. Sufficiency of stock in
   * particular is decided by the server inside a transaction with a conditional
   * decrement, so a concurrent movement cannot slip past a client-side check —
   * a rejected request writes no movement row and leaves the balance untouched.
   */
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.saved.set(false);
    if (this.form.invalid || this.saving()) return;

    const { type, itemId, fromLocId, toLocId, qty, note } = this.form.getRawValue();

    if (this.needsFrom() && !fromLocId) {
      this.formError.set('Choose the location the stock is coming from.');
      return;
    }
    if (this.needsTo() && !toLocId) {
      this.formError.set('Choose the location the stock is going to.');
      return;
    }
    if (type === 'TRANSFER' && fromLocId === toLocId) {
      this.formError.set('A transfer must move stock between two different locations.');
      return;
    }

    this.saving.set(true);
    try {
      await this.api.createMovement({
        type,
        itemId,
        // Only send the locations this type uses: the server rejects an IN that
        // carries a fromLocId rather than ignoring it.
        fromLocId: this.needsFrom() ? fromLocId : undefined,
        toLocId: this.needsTo() ? toLocId : undefined,
        qty: Number(qty),
        note: note.trim() || undefined,
      });
      this.saved.set(true);
      // Refresh the balances the availability hint reads, and the catalogue
      // totals, so the next movement is judged against the new state.
      this.loadedLevelsFor = null;
      await this.refreshAfterWrite(itemId);
    } catch (error) {
      this.formError.set(
        toApiError(error, 'The movement was rejected. Stock levels are unchanged.').message,
      );
    } finally {
      this.saving.set(false);
    }
  }

  private async refreshAfterWrite(itemId: string): Promise<void> {
    try {
      const [detail, items] = await Promise.all([
        this.api.getItem(itemId),
        this.api.listAllItems(),
      ]);
      this.loadedLevelsFor = itemId;
      this.stockLevels.set(detail.byLocation);
      this.items.set(items);
    } catch {
      /* the movement was recorded; a stale hint is not worth an error banner */
    }
  }

  reset(): void {
    this.saved.set(false);
    this.formError.set(null);
    this.form.patchValue({ qty: 1, note: '' });
  }
}
