import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, Paginated } from '../common/pagination.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';

/** Audit-log row, joined to the names the UI renders. */
export interface MovementRow {
  id: string;
  type: MovementType;
  itemId: string;
  itemSku: string;
  itemName: string;
  fromLocId: string | null;
  fromLocName: string | null;
  toLocId: string | null;
  toLocName: string | null;
  qty: number;
  note: string | null;
  userId: string;
  userEmail: string;
  userName: string | null;
  createdAt: Date;
  /** Nested aliases so consumers can read either shape. */
  item: { id: string; sku: string; name: string };
  fromLocation: { id: string; name: string; zone: string } | null;
  toLocation: { id: string; name: string; zone: string } | null;
  user: { id: string; email: string; name: string | null };
}

const MOVEMENT_INCLUDE = {
  item: { select: { id: true, sku: true, name: true } },
  fromLoc: { select: { id: true, name: true, zone: true } },
  toLoc: { select: { id: true, name: true, zone: true } },
  user: { select: { id: true, email: true, name: true } },
} satisfies Prisma.MovementInclude;

type MovementWithRelations = Prisma.MovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Per-type field rules.
   *
   * Rejecting a *supplied* but meaningless location (an `IN` carrying
   * `fromLocId`) rather than ignoring it is deliberate: silently dropping it
   * would let a mis-wired client believe it had recorded a transfer.
   */
  private static assertShape(dto: CreateMovementDto): void {
    const { type, fromLocId, toLocId } = dto;

    if (type === MovementType.IN) {
      if (!toLocId) throw new BadRequestException('IN movements require toLocId');
      if (fromLocId) throw new BadRequestException('IN movements must not specify fromLocId');
      return;
    }

    if (type === MovementType.OUT) {
      if (!fromLocId) throw new BadRequestException('OUT movements require fromLocId');
      if (toLocId) throw new BadRequestException('OUT movements must not specify toLocId');
      return;
    }

    if (!fromLocId) throw new BadRequestException('TRANSFER movements require fromLocId');
    if (!toLocId) throw new BadRequestException('TRANSFER movements require toLocId');
    if (fromLocId === toLocId) {
      throw new BadRequestException('TRANSFER source and destination must differ');
    }
  }

  /**
   * Applies a movement and writes its audit row atomically.
   *
   * The decrement is a *conditional* update — `updateMany` with
   * `qty: { gte: qty }` — rather than a read-then-write. Postgres re-evaluates
   * that predicate after taking the row lock, so two concurrent OUTs against a
   * balance of 50 cannot both see "enough stock": the loser matches zero rows
   * and is rejected. A read-then-write would let both through and drive the
   * balance negative.
   *
   * Ordering inside the transaction matters: decrement first, then increment,
   * then the `Movement` row last. A rejected over-draw therefore leaves no
   * audit row and never creates the destination `StockLevel` at qty 0.
   */
  async create(dto: CreateMovementDto, userId: string): Promise<MovementRow> {
    MovementsService.assertShape(dto);

    const [item, fromLoc, toLoc] = await Promise.all([
      this.prisma.item.findUnique({ where: { id: dto.itemId }, select: { id: true } }),
      dto.fromLocId
        ? this.prisma.location.findUnique({ where: { id: dto.fromLocId }, select: { id: true } })
        : Promise.resolve(null),
      dto.toLocId
        ? this.prisma.location.findUnique({ where: { id: dto.toLocId }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    // Resolve references up front so an unknown id is a clean 404 rather than a
    // foreign-key 500 raised halfway through the transaction.
    if (!item) throw new NotFoundException(`Item ${dto.itemId} not found`);
    if (dto.fromLocId && !fromLoc) throw new NotFoundException(`Location ${dto.fromLocId} not found`);
    if (dto.toLocId && !toLoc) throw new NotFoundException(`Location ${dto.toLocId} not found`);

    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.fromLocId) {
        const decremented = await tx.stockLevel.updateMany({
          where: { itemId: dto.itemId, locationId: dto.fromLocId, qty: { gte: dto.qty } },
          data: { qty: { decrement: dto.qty } },
        });
        // Zero rows matched means either no StockLevel row exists at that
        // location or the balance is short. Both are the same user-facing
        // failure, and both must abort before anything else is written.
        if (decremented.count !== 1) {
          throw new UnprocessableEntityException('Insufficient stock');
        }
      }

      if (dto.toLocId) {
        await tx.stockLevel.upsert({
          where: { itemId_locationId: { itemId: dto.itemId, locationId: dto.toLocId } },
          create: { itemId: dto.itemId, locationId: dto.toLocId, qty: dto.qty },
          update: { qty: { increment: dto.qty } },
        });
      }

      return tx.movement.create({
        data: {
          type: dto.type,
          itemId: dto.itemId,
          fromLocId: dto.fromLocId ?? null,
          toLocId: dto.toLocId ?? null,
          qty: dto.qty,
          note: dto.note?.trim() || null,
          userId,
        },
        include: MOVEMENT_INCLUDE,
      });
    });

    return MovementsService.toRow(created);
  }

  /** Immutable audit log, newest first, with every filter the UI exposes. */
  async findAll(query: QueryMovementsDto): Promise<Paginated<MovementRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.MovementWhereInput = {};
    if (query.itemId) where.itemId = query.itemId;
    if (query.userId) where.userId = query.userId;
    if (query.type) where.type = query.type;

    const createdAt: Prisma.DateTimeFilter = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = MovementsService.endOfRange(query.to);
    if (query.from || query.to) where.createdAt = createdAt;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.movement.count({ where }),
      this.prisma.movement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        // `id` breaks ties so two movements written in the same millisecond
        // keep a stable, repeatable order across pages.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { data: rows.map(MovementsService.toRow), page, pageSize, total };
  }

  /**
   * `to` is inclusive. A date-only bound (`2026-09-06`) parses to midnight, so
   * it is stretched to the end of that day — otherwise "up to the 6th" would
   * silently exclude everything recorded on the 6th.
   */
  private static endOfRange(value: string): Date {
    if (DATE_ONLY.test(value)) return new Date(`${value}T23:59:59.999Z`);
    return new Date(value);
  }

  private static toRow(movement: MovementWithRelations): MovementRow {
    return {
      id: movement.id,
      type: movement.type,
      itemId: movement.itemId,
      itemSku: movement.item.sku,
      itemName: movement.item.name,
      fromLocId: movement.fromLocId,
      fromLocName: movement.fromLoc?.name ?? null,
      toLocId: movement.toLocId,
      toLocName: movement.toLoc?.name ?? null,
      qty: movement.qty,
      note: movement.note,
      userId: movement.userId,
      userEmail: movement.user.email,
      userName: movement.user.name,
      createdAt: movement.createdAt,
      item: movement.item,
      fromLocation: movement.fromLoc,
      toLocation: movement.toLoc,
      user: movement.user,
    };
  }
}
