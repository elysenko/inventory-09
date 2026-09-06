import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import type { LowStockRow } from '../../core/models';

@Component({
  selector: 'app-low-stock',
  imports: [RouterLink],
  templateUrl: './low-stock.component.html',
  styleUrls: ['./low-stock.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockComponent {
  private readonly auth = inject(AuthService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly isManager = computed(() => {
    this.auth.currentUser();
    return this.auth.isManager();
  });

  /**
   * Backend-provided data. Replaced with an API call by the service layer.
   * Server returns items where SUM(qty) <= reorderAt, sorted by shortfall desc.
   */
  readonly rows = signal<LowStockRow[]>([
    { id: 'itm-002', sku: 'SKU-002', name: 'Hex Bolt 12mm', unit: 'each', totalQty: 68, reorderAt: 100, shortfall: 32 },
    { id: 'itm-004', sku: 'SKU-004', name: 'Nitrile Gloves (L)', unit: 'box', totalQty: 7, reorderAt: 30, shortfall: 23 },
    { id: 'itm-008', sku: 'SKU-008', name: 'Safety Goggles', unit: 'each', totalQty: 34, reorderAt: 50, shortfall: 16 },
    { id: 'itm-006', sku: 'SKU-006', name: 'Shelf Bracket 300mm', unit: 'each', totalQty: 20, reorderAt: 20, shortfall: 0 },
  ]);

  readonly sorted = computed(() => [...this.rows()].sort((a, b) => b.shortfall - a.shortfall));

  readonly criticalCount = computed(() => this.rows().filter((r) => r.shortfall > 0).length);

  /** Proportion of the reorder point currently held, for the inline gauge. */
  fillPercent(row: LowStockRow): number {
    if (row.reorderAt <= 0) return 100;
    return Math.min(100, Math.round((row.totalQty / row.reorderAt) * 100));
  }

  severity(row: LowStockRow): string {
    if (row.shortfall <= 0) return 'badge badge--warn';
    return this.fillPercent(row) < 50 ? 'badge badge--danger' : 'badge badge--warn';
  }

  severityLabel(row: LowStockRow): string {
    if (row.shortfall <= 0) return 'At reorder point';
    return this.fillPercent(row) < 50 ? 'Critical' : 'Below reorder point';
  }
}
