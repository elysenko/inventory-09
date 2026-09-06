import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import type { LowStockRow } from '../../core/models';

@Component({
  selector: 'app-low-stock',
  imports: [RouterLink],
  templateUrl: './low-stock.component.html',
  styleUrls: ['./low-stock.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LowStockComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly isManager = computed(() => {
    this.auth.currentUser();
    return this.auth.isManager();
  });

  /**
   * `GET /api/reports/low-stock` — items where SUM(qty) <= reorderAt, already
   * sorted by shortfall descending. Manager-only on the server.
   */
  readonly rows = signal<LowStockRow[]>([]);

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.api.lowStock());
    } catch (error) {
      this.error.set(toApiError(error, 'Could not load the low-stock report.').message);
    } finally {
      this.loading.set(false);
    }
  }

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
