import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
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
  private readonly api = inject(ApiService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly types: MovementType[] = ['IN', 'OUT', 'TRANSFER'];

  /** Catalogue, for the item filter's options. */
  readonly items = signal<ItemWithTotals[]>([]);

  /** The current page of the audit log, newest first. */
  readonly movements = signal<Movement[]>([]);

  /** Total matching rows on the server, not just the loaded page. */
  private readonly totalCount = signal(0);

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

  /**
   * Filtering and paging happen on the server (`GET /api/movements`), so the
   * counts below describe the whole log rather than one downloaded slice — the
   * audit log is unbounded and must never be pulled into the browser wholesale.
   */
  readonly total = computed(() => this.totalCount());
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly currentPage = computed(() => Math.min(this.page(), this.pageCount()));
  readonly visible = computed(() => this.movements());
  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.currentPage() - 1) * PAGE_SIZE + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.currentPage() * PAGE_SIZE, this.total()),
  );

  constructor() {
    void this.loadItems();

    // Every filter and page change round-trips through the URL, so reacting to
    // the query params is enough to keep the table in step with a deep link,
    // a back-button press and a filter click alike.
    effect(() => {
      const query = {
        itemId: this.itemFilter() || undefined,
        type: (this.typeFilter() || undefined) as MovementType | undefined,
        from: this.fromDate() || undefined,
        to: this.toDate() || undefined,
        page: this.page(),
        pageSize: PAGE_SIZE,
      };
      void this.load(query);
    });
  }

  private async loadItems(): Promise<void> {
    try {
      this.items.set(await this.api.listAllItems());
    } catch {
      /* the filter simply offers no options; the log itself still loads */
    }
  }

  private async load(query: Parameters<ApiService['listMovements']>[0]): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.listMovements(query);
      this.movements.set(result.data);
      this.totalCount.set(result.total);
    } catch (error) {
      this.movements.set([]);
      this.totalCount.set(0);
      this.error.set(toApiError(error, 'Could not load the movement log.').message);
    } finally {
      this.loading.set(false);
    }
  }

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
