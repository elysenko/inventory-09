import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LowStockRow {
  id: string;
  /** Alias of `id` — the report contract names the column `itemId`. */
  itemId: string;
  sku: string;
  name: string;
  unit: string;
  totalQty: number;
  reorderAt: number;
  shortfall: number;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Items at or below their reorder point.
   *
   * The predicate is `totalQty <= reorderAt` (inclusive), so an item sitting
   * exactly on its threshold is reported with a shortfall of 0 — hitting the
   * reorder point is the signal to reorder, not one unit later.
   *
   * The totals are built by left-joining in memory rather than by grouping in
   * SQL, so an item with no `StockLevel` rows at all is treated as 0 and shows
   * up in the report instead of being dropped by an inner join.
   */
  async lowStock(): Promise<LowStockRow[]> {
    const [items, grouped] = await Promise.all([
      this.prisma.item.findMany(),
      this.prisma.stockLevel.groupBy({ by: ['itemId'], _sum: { qty: true } }),
    ]);

    const totals = new Map(grouped.map((row) => [row.itemId, row._sum.qty ?? 0]));

    return items
      .map((item) => {
        const totalQty = totals.get(item.id) ?? 0;
        return {
          id: item.id,
          itemId: item.id,
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          totalQty,
          reorderAt: item.reorderAt,
          shortfall: item.reorderAt - totalQty,
        };
      })
      .filter((row) => row.totalQty <= row.reorderAt)
      .sort((a, b) => b.shortfall - a.shortfall || a.sku.localeCompare(b.sku));
  }
}
