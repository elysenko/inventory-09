import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import type { ItemWithTotals, Movement, StockLevel } from '../../core/models';

@Component({
  selector: 'app-item-detail',
  imports: [RouterLink, DatePipe],
  templateUrl: './item-detail.component.html',
  styleUrls: ['./item-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly isManager = computed(() => {
    this.auth.currentUser();
    return this.auth.isManager();
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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

  /** Per-location breakdown. Sums must equal the item's totalQty. */
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

  /** Movement history. Replaced with an API call by the service layer. */
  readonly movements = signal<Movement[]>([
    { id: 'mv-1', type: 'IN', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', toLocId: 'loc-1', toLocName: 'Zone A', fromLocId: null, fromLocName: null, qty: 100, note: 'PO-4471 received', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-08-28T08:14:00Z' },
    { id: 'mv-2', type: 'TRANSFER', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', fromLocId: 'loc-1', fromLocName: 'Zone A', toLocId: 'loc-2', toLocName: 'Zone B', qty: 52, note: 'Restock racking', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-08-29T10:02:00Z' },
    { id: 'mv-3', type: 'IN', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', toLocId: 'loc-1', toLocName: 'Zone A', fromLocId: null, fromLocName: null, qty: 60, note: null, userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-09-01T09:31:00Z' },
    { id: 'mv-4', type: 'OUT', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', fromLocId: 'loc-1', fromLocName: 'Zone A', toLocId: null, toLocName: null, qty: 18, note: 'Works order WO-118', userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-09-03T14:47:00Z' },
    { id: 'mv-5', type: 'OUT', itemId: 'itm-004', itemSku: 'SKU-004', itemName: 'Nitrile Gloves (L)', fromLocId: 'loc-1', fromLocName: 'Zone A', toLocId: null, toLocName: null, qty: 23, note: 'Issued to line 2', userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-09-04T07:12:00Z' },
    { id: 'mv-6', type: 'IN', itemId: 'itm-008', itemSku: 'SKU-008', itemName: 'Safety Goggles', toLocId: 'loc-1', toLocName: 'Zone A', fromLocId: null, fromLocName: null, qty: 22, note: 'PO-4488 received', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-09-05T11:25:00Z' },
  ]);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemId = computed(() => this.params().get('id') ?? '');

  readonly item = computed<ItemWithTotals | null>(
    () => this.items().find((i) => i.id === this.itemId()) ?? null,
  );

  readonly tab = computed(() => (this.queryParams().get('tab') === 'history' ? 'history' : 'stock'));

  readonly breakdown = computed(() =>
    this.stockLevels().filter((level) => level.itemId === this.itemId()),
  );

  /** Sum of the per-location rows — shown so it can be checked against the total. */
  readonly breakdownTotal = computed(() =>
    this.breakdown().reduce((sum, level) => sum + level.qty, 0),
  );

  readonly history = computed(() =>
    this.movements()
      .filter((movement) => movement.itemId === this.itemId())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  readonly isLow = computed(() => {
    const item = this.item();
    return item !== null && item.totalQty <= item.reorderAt;
  });

  selectTab(tab: 'stock' | 'history'): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'stock' ? null : tab },
      queryParamsHandling: 'merge',
    });
  }

  badgeClass(type: Movement['type']): string {
    if (type === 'IN') return 'badge badge--in';
    if (type === 'OUT') return 'badge badge--out';
    return 'badge badge--transfer';
  }
}
