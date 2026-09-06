import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MovementType } from '@prisma/client';

/**
 * There is deliberately no `userId` field: with `whitelist: true` a
 * body-supplied one is stripped, and the service attributes the movement to the
 * authenticated caller. Per-type location rules (IN needs `toLocId` only, OUT
 * needs `fromLocId` only, TRANSFER needs both and they must differ) are
 * enforced in the service, where the error message can name the actual type.
 */
export class CreateMovementDto {
  @IsEnum(MovementType, { message: 'type must be one of: IN, OUT, TRANSFER' })
  type!: MovementType;

  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  fromLocId?: string;

  @IsOptional()
  @IsString()
  toLocId?: string;

  @Type(() => Number)
  @IsInt({ message: 'qty must be an integer' })
  @Min(1, { message: 'qty must not be less than 1' })
  qty!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
