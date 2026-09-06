import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Item, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PAGE_SIZE,
  Paginated,
  paginate,
} from '../common/pagination.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { ItemSortKey, QueryItemsDto } from './dto/query-items.dto';

/** A catalogue row with its on-hand total summed across every location. */
export interface ItemWithTotals extends Item {
  totalQty: number;
}

/** One line of an item's per-location breakdown. */
export interface StockBreakdownRow {
  id: string;
  itemId: string;
  locationId: string;
  locationName: string;
  zone: string;
  qty: number;
}

export interface ItemDetail extends ItemWithTotals {
  /** Named `byLocation` in the API contract; `stockLevels` is a stable alias. */
  byLocation: StockBreakdownRow[];
  stockLevels: StockBreakdownRow[];
}

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sums `StockLevel.qty` per item for the given ids.
   *
   * Items with no `StockLevel` rows are absent from the groupBy result, so the
   * caller defaults them to 0 rather than dropping them — an item nobody has
   * ever stocked must still appear in the catalogue (and in the low-stock
   * report) rather than silently vanishing.
   */
  private async totalsByItem(itemIds: string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const grouped = await this.prisma.stockLevel.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds } },
      _sum: { qty: true },
    });
    return new Map(grouped.map((row) => [row.itemId, row._sum.qty ?? 0]));
  }

  private static compare(a: ItemWithTotals, b: ItemWithTotals, sort: ItemSortKey): number {
    const desc = sort.startsWith('-');
    const key = (desc ? sort.slice(1) : sort) as
      | 'sku'
      | 'name'
      | 'reorderAt'
      | 'totalQty'
      | 'createdAt';

    let result: number;
    switch (key) {
      case 'reorderAt':
      case 'totalQty':
        result = a[key] - b[key];
        break;
      case 'createdAt':
        result = a.createdAt.getTime() - b.createdAt.getTime();
        break;
      default:
        result = a[key].localeCompare(b[key], 'en', { sensitivity: 'base' });
    }
    // Tie-break on the primary key so repeating an identical request always
    // returns an identical ordering (no non-deterministic page boundaries).
    if (result === 0) result = a.id.localeCompare(b.id);
    return desc ? -result : result;
  }

  /**
   * Catalogue listing with on-hand totals.
   *
   * `lowOnly` and `sort=totalQty` both depend on the aggregate, which cannot be
   * expressed as a Prisma `where`/`orderBy`. The filtered set is therefore
   * resolved (ids + totals) before paging, so `total` is the count of matching
   * items and page N is a true slice of the sorted result — not a slice taken
   * before the aggregate filter, which would produce short and overlapping
   * pages.
   */
  async findAll(query: QueryItemsDto): Promise<Paginated<ItemWithTotals>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const sort: ItemSortKey = query.sort ?? 'sku';

    const q = query.q?.trim();
    const where: Prisma.ItemWhereInput = q
      ? {
          OR: [
            { sku: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const items = await this.prisma.item.findMany({ where });
    const totals = await this.totalsByItem(items.map((item) => item.id));

    let rows: ItemWithTotals[] = items.map((item) => ({
      ...item,
      totalQty: totals.get(item.id) ?? 0,
    }));

    if (query.lowOnly === true) {
      rows = rows.filter((row) => row.totalQty <= row.reorderAt);
    }

    rows.sort((a, b) => ItemsService.compare(a, b, sort));
    return paginate(rows, page, pageSize);
  }

  async findOne(id: string): Promise<ItemDetail> {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { stockLevels: { include: { location: true } } },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);

    const byLocation: StockBreakdownRow[] = item.stockLevels
      .map((level) => ({
        id: level.id,
        itemId: level.itemId,
        locationId: level.locationId,
        locationName: level.location.name,
        zone: level.location.zone,
        qty: level.qty,
      }))
      .sort((a, b) => a.locationName.localeCompare(b.locationName));

    const { stockLevels: _levels, ...rest } = item;
    const totalQty = byLocation.reduce((sum, row) => sum + row.qty, 0);
    return { ...rest, totalQty, byLocation, stockLevels: byLocation };
  }

  async create(dto: CreateItemDto): Promise<ItemWithTotals> {
    try {
      const item = await this.prisma.item.create({
        data: {
          sku: dto.sku.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          unit: dto.unit.trim(),
          reorderAt: dto.reorderAt,
        },
      });
      return { ...item, totalQty: 0 };
    } catch (error) {
      ItemsService.rethrowWriteError(error);
    }
  }

  async update(id: string, dto: UpdateItemDto): Promise<ItemWithTotals> {
    const existing = await this.prisma.item.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Item ${id} not found`);

    const data: Prisma.ItemUpdateInput = {};
    if (dto.sku !== undefined) data.sku = dto.sku.trim();
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.unit !== undefined) data.unit = dto.unit.trim();
    if (dto.reorderAt !== undefined) data.reorderAt = dto.reorderAt;

    try {
      const item = await this.prisma.item.update({ where: { id }, data });
      const totals = await this.totalsByItem([id]);
      return { ...item, totalQty: totals.get(id) ?? 0 };
    } catch (error) {
      ItemsService.rethrowWriteError(error);
    }
  }

  /**
   * Deletion is blocked while the item still holds stock, and blocked outright
   * once it has any movement history: the audit log is immutable, so an item
   * that appears in it can never be cascade-deleted out from under those rows.
   */
  async remove(id: string): Promise<void> {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { stockLevels: true, _count: { select: { movements: true } } },
    });
    if (!item) throw new NotFoundException(`Item ${id} not found`);

    const onHand = item.stockLevels.reduce((sum, level) => sum + level.qty, 0);
    if (onHand > 0) {
      throw new ConflictException({
        message: `Cannot delete an item that still holds stock (${onHand} on hand). Move it out first.`,
        fieldErrors: { id: 'Item still holds stock' },
      });
    }
    if (item._count.movements > 0) {
      throw new ConflictException({
        message:
          'Cannot delete an item that has movement history. The audit log is immutable, so the item must be kept.',
        fieldErrors: { id: 'Item has movement history' },
      });
    }

    await this.prisma.item.delete({ where: { id } });
  }

  /**
   * Turns the unique-constraint violation on `sku` into a field-level 409 the
   * item form can render inline, instead of leaking a raw Prisma error code.
   */
  private static rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        message: 'An item with that SKU already exists',
        fieldErrors: { sku: 'An item with that SKU already exists' },
      });
    }
    throw error;
  }
}
