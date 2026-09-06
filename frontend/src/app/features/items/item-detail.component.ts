import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import type { ItemDetail, Movement, StockLevel } from '../../core/models';

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
  private readonly api = inject(ApiService);

  readonly isManager = computed(() => {
    this.auth.currentUser();
    return this.auth.isManager();
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** `GET /api/items/:id` — the item, its total and its per-location breakdown. */
  readonly detail = signal<ItemDetail | null>(null);

  /** `GET /api/movements?itemId=` — manager-only, so clerks see an empty tab. */
  readonly movements = signal<Movement[]>([]);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly itemId = computed(() => this.params().get('id') ?? '');

  readonly item = computed<ItemDetail | null>(() => {
    const detail = this.detail();
    // Guard against showing the previously-loaded item while a new id loads.
    return detail !== null && detail.id === this.itemId() ? detail : null;
  });

  readonly tab = computed(() => (this.queryParams().get('tab') === 'history' ? 'history' : 'stock'));

  readonly breakdown = computed<StockLevel[]>(() => this.item()?.byLocation ?? []);

  constructor() {
    // Re-loads whenever the :id segment changes, so navigating between items
    // (and deep-linking straight to one) both go through the same path.
    effect(() => {
      const id = this.itemId();
      if (id !== '') void this.load(id);
    });
  }

  /**
   * The movement history is a manager-only endpoint. Requesting it as a clerk
   * would 403, so the tab is simply left empty for them rather than surfacing
   * an authorisation error they cannot act on.
   */
  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const detail = await this.api.getItem(id);
      this.detail.set(detail);
      if (this.isManager()) {
        const log = await this.api.listMovements({ itemId: id, pageSize: 100 });
        this.movements.set(log.data);
      } else {
        this.movements.set([]);
      }
    } catch (error) {
      this.detail.set(null);
      this.movements.set([]);
      this.error.set(toApiError(error, 'Could not load that item.').message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Sum of the per-location rows — shown so it can be checked against the total. */
  readonly breakdownTotal = computed(() =>
    this.breakdown().reduce((sum, level) => sum + level.qty, 0),
  );

  /** Server already orders newest-first; sorted again so the view never depends on it. */
  readonly history = computed(() =>
    [...this.movements()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
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
