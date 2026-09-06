import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { MovementType } from '@prisma/client';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class QueryMovementsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID(undefined, { message: 'itemId must be a UUID' })
  itemId?: string;

  @IsOptional()
  @IsUUID(undefined, { message: 'userId must be a UUID' })
  userId?: string;

  @IsOptional()
  @IsEnum(MovementType, { message: 'type must be one of: IN, OUT, TRANSFER' })
  type?: MovementType;

  /** Inclusive lower bound on `createdAt`. */
  @IsOptional()
  @IsISO8601({}, { message: 'from must be an ISO 8601 date string' })
  from?: string;

  /** Inclusive upper bound on `createdAt`. */
  @IsOptional()
  @IsISO8601({}, { message: 'to must be an ISO 8601 date string' })
  to?: string;
}
