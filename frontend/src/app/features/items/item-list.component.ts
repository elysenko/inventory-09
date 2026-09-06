import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';
import type { ItemWithTotals } from '../../core/models';

const PAGE_SIZE = 5;

type SortKey = 'sku' | 'name' | 'totalQty' | 'reorderAt';

@Component({
  selector: 'app-item-list',
  imports: [RouterLink],
  templateUrl: './item-list.component.html',
  styleUrls: ['./item-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListComponent {
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

  // ---- URL is the single source of truth for search / filter / sort / page ----
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly query = computed(() => this.params().get('q') ?? '');
  readonly lowOnly = computed(() => this.params().get('lowOnly') === 'true');
  readonly sort = computed(() => this.params().get('sort') ?? 'sku');
  readonly page = computed(() => {
    const raw = Number(this.params().get('page') ?? '1');
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  });

  private readonly filtered = computed<ItemWithTotals[]>(() => {
    const needle = this.query().trim().toLowerCase();
    const lowOnly = this.lowOnly();
    const sort = this.sort();
    const desc = sort.startsWith('-');
    const key = (desc ? sort.slice(1) : sort) as SortKey;

    const rows = this.items().filter((item) => {
      if (lowOnly && item.totalQty > item.reorderAt) return false;
      if (!needle) return true;
      return (
        item.sku.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)
      );
    });

    return [...rows].sort((a, b) => {
      const left = a[key];
      const right = b[key];
      const cmp =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right));
      return desc ? -cmp : cmp;
    });
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
  readonly lowCount = computed(() => this.items().filter((i) => i.totalQty <= i.reorderAt).length);
  readonly hasFilters = computed(() => this.query().trim() !== '' || this.lowOnly());

  isLow(item: ItemWithTotals): boolean {
    return item.totalQty <= item.reorderAt;
  }

  sortIndicator(key: SortKey): string {
    const sort = this.sort();
    if (sort === key) return '▲';
    if (sort === `-${key}`) return '▼';
    return '';
  }

  /** All view state round-trips through the URL so every view is deep-linkable. */
  private update(params: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
    });
  }

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.update({ q: value || null, page: null });
  }

  onLowOnly(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.update({ lowOnly: checked ? 'true' : null, page: null });
  }

  toggleSort(key: SortKey): void {
    this.update({ sort: this.sort() === key ? `-${key}` : key, page: null });
  }

  goToPage(page: number): void {
    this.update({ page: page <= 1 ? null : String(page) });
  }

  clearFilters(): void {
    this.update({ q: null, lowOnly: null, page: null });
  }
}
