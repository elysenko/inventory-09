import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Paginated } from '../common/pagination.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { QueryMovementsDto } from './dto/query-movements.dto';
import { MovementRow, MovementsService } from './movements.service';

/**
 * Movements are append-only. There is intentionally no PATCH/PUT/DELETE here:
 * an editable audit log is not an audit log, so a correction is entered as a
 * compensating movement.
 */
@ApiTags('movements')
@ApiBearerAuth()
@Controller('movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  /**
   * Recording stock is the clerk's core job, so this is open to every
   * authenticated role. The movement is attributed to the token holder.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record an IN / OUT / TRANSFER movement' })
  create(
    @Body() dto: CreateMovementDto,
    @CurrentUser('id') userId: string,
  ): Promise<MovementRow> {
    return this.movementsService.create(dto, userId);
  }

  /** Reading the audit log is manager-only. */
  @Get()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Filterable movement audit log, newest first (manager only)' })
  findAll(@Query() query: QueryMovementsDto): Promise<Paginated<MovementRow>> {
    return this.movementsService.findAll(query);
  }
}
