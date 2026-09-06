import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import type { Location, StockLevel } from '../../core/models';

@Component({
  selector: 'app-location-list',
  imports: [RouterLink, ConfirmDialogComponent],
  templateUrl: './location-list.component.html',
  styleUrls: ['./location-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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

  confirmDelete(): void {
    const id = this.deleteId();
    if (id !== null) this.locations.update((rows) => rows.filter((row) => row.id !== id));
    this.closeDelete();
  }
}
