import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Location, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returned as a bare array rather than a paginated envelope: the movement
   * form needs every location to populate its pickers, and a location list is
   * bounded by the physical warehouse.
   */
  findAll(): Promise<Location[]> {
    return this.prisma.location.findMany({ orderBy: [{ name: 'asc' }] });
  }

  async findOne(id: string): Promise<Location> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) throw new NotFoundException(`Location ${id} not found`);
    return location;
  }

  async create(dto: CreateLocationDto): Promise<Location> {
    try {
      return await this.prisma.location.create({
        data: { name: dto.name.trim(), zone: dto.zone.trim() },
      });
    } catch (error) {
      LocationsService.rethrowWriteError(error);
    }
  }

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    await this.findOne(id);
    const data: Prisma.LocationUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.zone !== undefined) data.zone = dto.zone.trim();

    try {
      return await this.prisma.location.update({ where: { id }, data });
    } catch (error) {
      LocationsService.rethrowWriteError(error);
    }
  }

  /**
   * Blocked while the location holds stock — deleting it would cascade the
   * `StockLevel` rows away and silently destroy inventory.
   *
   * Zero-quantity rows are allowed to cascade. A location still referenced by
   * the immutable movement log is protected by an `onDelete: Restrict` foreign
   * key; that surfaces as P2003, which is translated to a 409 the UI can show
   * rather than a 500.
   */
  async remove(id: string): Promise<void> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { stockLevels: true },
    });
    if (!location) throw new NotFoundException(`Location ${id} not found`);

    const onHand = location.stockLevels.reduce((sum, level) => sum + level.qty, 0);
    if (onHand > 0) {
      throw new ConflictException({
        message: `Cannot delete a location that still holds stock (${onHand} on hand). Move it out first.`,
        fieldErrors: { id: 'Location still holds stock' },
      });
    }

    try {
      await this.prisma.location.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException({
          message:
            'Cannot delete a location referenced by the movement log. The audit history is immutable.',
          fieldErrors: { id: 'Location appears in movement history' },
        });
      }
      throw error;
    }
  }

  private static rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        message: 'A location with that name already exists',
        fieldErrors: { name: 'A location with that name already exists' },
      });
    }
    throw error;
  }
}
