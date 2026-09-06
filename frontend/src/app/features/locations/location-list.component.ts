import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import type { Location, StockLevel } from '../../core/models';

@Component({
  selector: 'app-location-list',
  imports: [RouterLink, ConfirmDialogComponent],
  templateUrl: './location-list.component.html',
  styleUrls: ['./location-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** `GET /api/locations`. */
  readonly locations = signal<Location[]>([]);

  /** Per-location holdings, aggregated from each item's stock breakdown. */
  readonly stockLevels = signal<StockLevel[]>([]);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [locations, stockLevels] = await Promise.all([
        this.api.listLocations(),
        this.api.listStockLevels(),
      ]);
      this.locations.set(locations);
      this.stockLevels.set(stockLevels);
    } catch (error) {
      this.error.set(toApiError(error, 'Could not load storage locations.').message);
    } finally {
      this.loading.set(false);
    }
  }

  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly rows = computed(() =>
    this.locations().map((location) => {
      const held = this.stockLevels().filter((l) => l.locationId === location.id && l.qty > 0);
      return {
        ...location,
        distinctItems: held.length,
        totalQty: held.reduce((sum, l) => sum + l.qty, 0),
      };
    }),
  );

  /** Destructive confirm lives in the URL, not in component state. */
  readonly deleteId = computed(() =>
    this.queryParams().get('modal') === 'delete' ? this.queryParams().get('id') : null,
  );
  readonly deleteTarget = computed(
    () => this.rows().find((row) => row.id === this.deleteId()) ?? null,
  );

  /** Deletion is refused while the location still holds stock. */
  readonly deleteBlockedReason = computed<string | null>(() => {
    const target = this.deleteTarget();
    if (target === null) return null;
    if (target.totalQty > 0) {
      return `${target.name} still holds ${target.totalQty} units across ${target.distinctItems} item(s). Transfer that stock elsewhere before deleting the location.`;
    }
    return null;
  });

  openDelete(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: 'delete', id },
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

  /**
   * The server refuses a location that still holds stock, or one referenced by
   * the immutable movement log, with a 409. That message is shown in the list's
   * error banner rather than swallowed, so a refused delete is never mistaken
   * for a successful one.
   */
  async confirmDelete(): Promise<void> {
    const id = this.deleteId();
    if (id === null) return;
    try {
      await this.api.deleteLocation(id);
      this.closeDelete();
      await this.reload();
    } catch (error) {
      this.error.set(toApiError(error, 'Could not delete that location.').message);
      this.closeDelete();
    }
  }
}
