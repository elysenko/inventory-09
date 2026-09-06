import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
export class MovementFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly types = TYPES;
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly saved = signal(false);

  readonly isManager = computed(() => {
    this.auth.currentUser();
    return this.auth.isManager();
  });

  /** Backend-provided data. Replaced with an API call by the service layer. */
  readonly items = signal<ItemWithTotals[]>([
    { id: 'itm-001', sku: 'SKU-001', name: 'Steel Bracket M8', description: null, unit: 'each', reorderAt: 25, totalQty: 142, createdAt: '2026-01-12T09:00:00Z' },
    { id: 'itm-002', sku: 'SKU-002', name: 'Hex Bolt 12mm', description: null, unit: 'each', reorderAt: 100, totalQty: 68, createdAt: '2026-01-12T09:05:00Z' },
    { id: 'itm-003', sku: 'SKU-003', name: 'Cable Tie 200mm', description: null, unit: 'pack', reorderAt: 40, totalQty: 310, createdAt: '2026-01-14T11:20:00Z' },
    { id: 'itm-004', sku: 'SKU-004', name: 'Nitrile Gloves (L)', description: null, unit: 'box', reorderAt: 30, totalQty: 7, createdAt: '2026-01-18T08:40:00Z' },
    { id: 'itm-005', sku: 'SKU-005', name: 'Packing Tape 48mm', description: null, unit: 'roll', reorderAt: 15, totalQty: 96, createdAt: '2026-02-02T13:15:00Z' },
    { id: 'itm-006', sku: 'SKU-006', name: 'Shelf Bracket 300mm', description: null, unit: 'each', reorderAt: 20, totalQty: 20, createdAt: '2026-02-09T15:00:00Z' },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap 500mm', description: null, unit: 'roll', reorderAt: 12, totalQty: 40, createdAt: '2026-02-21T10:05:00Z' },
    { id: 'itm-008', sku: 'SKU-008', name: 'Safety Goggles', description: null, unit: 'each', reorderAt: 50, totalQty: 34, createdAt: '2026-03-03T07:45:00Z' },
  ]);

  /** Backend-provided data. Replaced with an API call by the service layer. */
  readonly locations = signal<Location[]>([
    { id: 'loc-1', name: 'Zone A', zone: 'Receiving', createdAt: '2026-01-10T08:00:00Z' },
    { id: 'loc-2', name: 'Zone B', zone: 'Main racking', createdAt: '2026-01-10T08:05:00Z' },
    { id: 'loc-3', name: 'Zone C', zone: 'Dispatch', createdAt: '2026-01-10T08:10:00Z' },
    { id: 'loc-4', name: 'Zone D', zone: 'Quarantine', createdAt: '2026-02-15T08:10:00Z' },
  ]);

  /** Backend-provided data. Replaced with an API call by the service layer. */
  readonly stockLevels = signal<StockLevel[]>([
    { id: 'sl-1', itemId: 'itm-001', locationId: 'loc-1', locationName: 'Zone A', zone: 'Receiving', qty: 90 },
    { id: 'sl-2', itemId: 'itm-001', locationId: 'loc-2', locationName: 'Zone B', zone: 'Main racking', qty: 52 },
    { id: 'sl-3', itemId: 'itm-002', locationId: 'loc-2', locationName: 'Zone B', zone: 'Main racking', qty: 68 },
    { id: 'sl-4', itemId: 'itm-003', locationId: 'loc-1', locationName: 'Zone A', zone: 'Receiving', qty: 120 },
    { id: 'sl-5', itemId: 'itm-003', locationId: 'loc-2', locationName: 'Zone B', zone: 'Main racking', qty: 90 },
    { id: 'sl-6', itemId: 'itm-003', locationId: 'loc-3', locationName: 'Zone C', zone: 'Dispatch', qty: 100 },
    { id: 'sl-7', itemId: 'itm-004', locationId: 'loc-1', locationName: 'Zone A', zone: 'Receiving', qty: 7 },
    { id: 'sl-8', itemId: 'itm-005', locationId: 'loc-2', locationName: 'Zone B', zone: 'Main racking', qty: 60 },
    { id: 'sl-9', itemId: 'itm-005', locationId: 'loc-3', locationName: 'Zone C', zone: 'Dispatch', qty: 36 },
    { id: 'sl-10', itemId: 'itm-006', locationId: 'loc-2', locationName: 'Zone B', zone: 'Main racking', qty: 20 },
    { id: 'sl-11', itemId: 'itm-007', locationId: 'loc-3', locationName: 'Zone C', zone: 'Dispatch', qty: 40 },
    { id: 'sl-12', itemId: 'itm-008', locationId: 'loc-1', locationName: 'Zone A', zone: 'Receiving', qty: 22 },
    { id: 'sl-13', itemId: 'itm-008', locationId: 'loc-3', locationName: 'Zone C', zone: 'Dispatch', qty: 12 },
  ]);

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

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

  readonly type = computed<MovementType>(
    () => (this.formValue().type ?? 'IN') as MovementType,
  );

  /** IN needs a destination only; OUT a source only; TRANSFER both. */
  readonly needsFrom = computed(() => this.type() === 'OUT' || this.type() === 'TRANSFER');
  readonly needsTo = computed(() => this.type() === 'IN' || this.type() === 'TRANSFER');

  /** Stock available at the source location — the over-draw guard's basis. */
  readonly availableAtSource = computed<number | null>(() => {
    const { itemId, fromLocId } = this.formValue();
    if (!this.needsFrom() || !itemId || !fromLocId) return null;
    const level = this.stockLevels().find(
      (l) => l.itemId === itemId && l.locationId === fromLocId,
    );
    return level?.qty ?? 0;
  });

  readonly selectedItem = computed(
    () => this.items().find((i) => i.id === this.formValue().itemId) ?? null,
  );

  readonly typeBlurb = computed(
    () => TYPES.find((t) => t.value === this.type())?.blurb ?? '',
  );

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

  submit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.saved.set(false);
    if (this.form.invalid) return;

    const { type, fromLocId, toLocId, qty } = this.form.getRawValue();

    // Per-type field validation, mirroring the server.
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

    // Over-draw guard — the server rejects this atomically and writes no
    // movement row, leaving the balance untouched.
    const available = this.availableAtSource();
    if (available !== null && qty > available) {
      this.formError.set(
        `Insufficient stock: only ${available} available at the selected location, but ${qty} was requested. The balance is unchanged.`,
      );
      return;
    }

    this.saving.set(true);
    this.saved.set(true);
    this.saving.set(false);
  }

  reset(): void {
    this.saved.set(false);
    this.form.patchValue({ qty: 1, note: '' });
  }
}
