import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import type { ItemWithTotals } from '../../core/models';

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

  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  /** Field-level errors returned by the server, e.g. duplicate `sku`. */
  readonly fieldErrors = signal<Record<string, string>>({});

  /** Backend-provided data. Replaced with an API call by the service layer. */
  readonly items = signal<ItemWithTotals[]>([
    { id: 'itm-001', sku: 'SKU-001', name: 'Steel Bracket M8', description: 'Galvanised mounting bracket, 8mm bore.', unit: 'each', reorderAt: 25, totalQty: 142, createdAt: '2026-01-12T09:00:00Z' },
    { id: 'itm-002', sku: 'SKU-002', name: 'Hex Bolt 12mm', description: 'Zinc-plated hex head bolt.', unit: 'each', reorderAt: 100, totalQty: 68, createdAt: '2026-01-12T09:05:00Z' },
    { id: 'itm-003', sku: 'SKU-003', name: 'Cable Tie 200mm', description: 'UV-stable nylon cable ties, 100 per pack.', unit: 'pack', reorderAt: 40, totalQty: 310, createdAt: '2026-01-14T11:20:00Z' },
    { id: 'itm-004', sku: 'SKU-004', name: 'Nitrile Gloves (L)', description: 'Powder-free disposable gloves, 100 per box.', unit: 'box', reorderAt: 30, totalQty: 7, createdAt: '2026-01-18T08:40:00Z' },
    { id: 'itm-005', sku: 'SKU-005', name: 'Packing Tape 48mm', description: 'Clear polypropylene carton sealing tape.', unit: 'roll', reorderAt: 15, totalQty: 96, createdAt: '2026-02-02T13:15:00Z' },
    { id: 'itm-006', sku: 'SKU-006', name: 'Shelf Bracket 300mm', description: 'Heavy-duty powder-coated shelf bracket.', unit: 'each', reorderAt: 20, totalQty: 20, createdAt: '2026-02-09T15:00:00Z' },
    { id: 'itm-007', sku: 'SKU-007', name: 'Pallet Wrap 500mm', description: 'Blown stretch film for pallet wrapping.', unit: 'roll', reorderAt: 12, totalQty: 40, createdAt: '2026-02-21T10:05:00Z' },
    { id: 'itm-008', sku: 'SKU-008', name: 'Safety Goggles', description: 'Anti-fog polycarbonate safety eyewear.', unit: 'each', reorderAt: 50, totalQty: 34, createdAt: '2026-03-03T07:45:00Z' },
  ]);

  readonly units = signal<string[]>(['each', 'box', 'pack', 'roll', 'pallet', 'kg', 'litre']);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemId = computed(() => this.params().get('id'));
  readonly isEdit = computed(() => this.itemId() !== null);
  readonly existing = computed<ItemWithTotals | null>(
    () => this.items().find((i) => i.id === this.itemId()) ?? null,
  );

  /** Destructive confirm lives in the URL, not in component state. */
  readonly deleteOpen = computed(() => this.queryParams().get('modal') === 'delete');

  /** Deletion is refused while the item still holds stock or has movements. */
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
    // Populate the form once the edit target resolves.
    const item = this.existing();
    if (item && this.hydratedFor !== item.id) {
      this.hydratedFor = item.id;
      this.form.patchValue({
        sku: item.sku,
        name: item.name,
        description: item.description ?? '',
        unit: item.unit,
        reorderAt: item.reorderAt,
      });
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

  save(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    this.fieldErrors.set({});
    if (this.form.invalid) return;

    const { sku } = this.form.getRawValue();
    const clash = this.items().find(
      (i) => i.sku.toLowerCase() === sku.trim().toLowerCase() && i.id !== this.itemId(),
    );

    // Mirrors the server's Prisma P2002 unique-constraint response on `sku`.
    if (clash) {
      this.fieldErrors.set({ sku: `SKU ${clash.sku} is already used by “${clash.name}”.` });
      this.formError.set('That SKU is already in use. Choose a unique SKU.');
      return;
    }

    this.saving.set(true);
    void this.router.navigate(['/items']);
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

  confirmDelete(): void {
    void this.router.navigate(['/items']);
  }
}
