import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { ItemWithTotals, Movement, MovementType } from '../../core/models';

const PAGE_SIZE = 8;

@Component({
  selector: 'app-movement-log',
  imports: [RouterLink, DatePipe],
  templateUrl: './movement-log.component.html',
  styleUrls: ['./movement-log.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovementLogComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly types: MovementType[] = ['IN', 'OUT', 'TRANSFER'];

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
  readonly movements = signal<Movement[]>([
    { id: 'mv-12', type: 'IN', itemId: 'itm-008', itemSku: 'SKU-008', itemName: 'Safety Goggles', fromLocId: null, fromLocName: null, toLocId: 'loc-1', toLocName: 'Zone A', qty: 22, note: 'PO-4488 received', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-09-05T11:25:00Z' },
    { id: 'mv-11', type: 'OUT', itemId: 'itm-004', itemSku: 'SKU-004', itemName: 'Nitrile Gloves (L)', fromLocId: 'loc-1', fromLocName: 'Zone A', toLocId: null, toLocName: null, qty: 23, note: 'Issued to line 2', userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-09-04T07:12:00Z' },
    { id: 'mv-10', type: 'OUT', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', fromLocId: 'loc-1', fromLocName: 'Zone A', toLocId: null, toLocName: null, qty: 18, note: 'Works order WO-118', userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-09-03T14:47:00Z' },
    { id: 'mv-9', type: 'TRANSFER', itemId: 'itm-003', itemSku: 'SKU-003', itemName: 'Cable Tie 200mm', fromLocId: 'loc-1', fromLocName: 'Zone A', toLocId: 'loc-3', toLocName: 'Zone C', qty: 100, note: 'Stage for dispatch', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-09-02T16:30:00Z' },
    { id: 'mv-8', type: 'IN', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', fromLocId: null, fromLocName: null, toLocId: 'loc-1', toLocName: 'Zone A', qty: 60, note: null, userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-09-01T09:31:00Z' },
    { id: 'mv-7', type: 'IN', itemId: 'itm-005', itemSku: 'SKU-005', itemName: 'Packing Tape 48mm', fromLocId: null, fromLocName: null, toLocId: 'loc-2', toLocName: 'Zone B', qty: 60, note: 'PO-4479 received', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-08-31T12:00:00Z' },
    { id: 'mv-6', type: 'TRANSFER', itemId: 'itm-005', itemSku: 'SKU-005', itemName: 'Packing Tape 48mm', fromLocId: 'loc-2', fromLocName: 'Zone B', toLocId: 'loc-3', toLocName: 'Zone C', qty: 36, note: 'Dispatch replenishment', userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-08-30T14:10:00Z' },
    { id: 'mv-5', type: 'TRANSFER', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', fromLocId: 'loc-1', fromLocName: 'Zone A', toLocId: 'loc-2', toLocName: 'Zone B', qty: 52, note: 'Restock racking', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-08-29T10:02:00Z' },
    { id: 'mv-4', type: 'IN', itemId: 'itm-001', itemSku: 'SKU-001', itemName: 'Steel Bracket M8', fromLocId: null, fromLocName: null, toLocId: 'loc-1', toLocName: 'Zone A', qty: 100, note: 'PO-4471 received', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-08-28T08:14:00Z' },
    { id: 'mv-3', type: 'IN', itemId: 'itm-003', itemSku: 'SKU-003', itemName: 'Cable Tie 200mm', fromLocId: null, fromLocName: null, toLocId: 'loc-1', toLocName: 'Zone A', qty: 220, note: 'PO-4465 received', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-08-26T09:45:00Z' },
    { id: 'mv-2', type: 'IN', itemId: 'itm-002', itemSku: 'SKU-002', itemName: 'Hex Bolt 12mm', fromLocId: null, fromLocName: null, toLocId: 'loc-2', toLocName: 'Zone B', qty: 68, note: 'PO-4460 received', userId: 'u-3', userEmail: 'sam.okafor@stockroom.app', createdAt: '2026-08-24T13:05:00Z' },
    { id: 'mv-1', type: 'IN', itemId: 'itm-006', itemSku: 'SKU-006', itemName: 'Shelf Bracket 300mm', fromLocId: null, fromLocName: null, toLocId: 'loc-2', toLocName: 'Zone B', qty: 20, note: 'Opening balance', userId: 'u-2', userEmail: 'dana.reid@stockroom.app', createdAt: '2026-08-20T08:00:00Z' },
  ]);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemFilter = computed(() => this.params().get('itemId') ?? '');
  readonly typeFilter = computed(() => this.params().get('type') ?? '');
  readonly fromDate = computed(() => this.params().get('from') ?? '');
  readonly toDate = computed(() => this.params().get('to') ?? '');
  readonly page = computed(() => {
    const raw = Number(this.params().get('page') ?? '1');
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  });

  readonly hasFilters = computed(
    () => !!(this.itemFilter() || this.typeFilter() || this.fromDate() || this.toDate()),
  );

  /** Ordered createdAt desc, matching the server's audit-log ordering. */
  private readonly filtered = computed(() => {
    const itemId = this.itemFilter();
    const type = this.typeFilter();
    const from = this.fromDate();
    const to = this.toDate();

    return this.movements()
      .filter((movement) => {
        if (itemId && movement.itemId !== itemId) return false;
        if (type && movement.type !== type) return false;
        const day = movement.createdAt.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  readonly total = computed(() => this.filtered().length);
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly visible = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });
  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.currentPage() - 1) * PAGE_SIZE + 1));
  readonly rangeEnd = computed(() => Math.min(this.currentPage() * PAGE_SIZE, this.total()));

  private update(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  onItem(event: Event): void {
    this.update({ itemId: (event.target as HTMLSelectElement).value || null, page: null });
  }

  onType(event: Event): void {
    this.update({ type: (event.target as HTMLSelectElement).value || null, page: null });
  }

  onFrom(event: Event): void {
    this.update({ from: (event.target as HTMLInputElement).value || null, page: null });
  }

  onTo(event: Event): void {
    this.update({ to: (event.target as HTMLInputElement).value || null, page: null });
  }

  clearFilters(): void {
    this.update({ itemId: null, type: null, from: null, to: null, page: null });
  }

  goToPage(page: number): void {
    this.update({ page: page <= 1 ? null : String(page) });
  }

  badgeClass(type: MovementType): string {
    if (type === 'IN') return 'badge badge--in';
    if (type === 'OUT') return 'badge badge--out';
    return 'badge badge--transfer';
  }
}
