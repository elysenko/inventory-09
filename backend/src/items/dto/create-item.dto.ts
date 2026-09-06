import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateItemDto {
  @IsString()
  @IsNotEmpty({ message: 'sku should not be empty' })
  @MaxLength(64)
  sku!: string;

  @IsString()
  @IsNotEmpty({ message: 'name should not be empty' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsNotEmpty({ message: 'unit should not be empty' })
  @MaxLength(32)
  unit!: string;

  /**
   * Low-stock threshold. `@Type(() => Number)` coerces the string a form post
   * sends ("10") to a number; a non-integer such as 1.5 still fails `@IsInt`.
   */
  @Type(() => Number)
  @IsInt({ message: 'reorderAt must be an integer' })
  @Min(0, { message: 'reorderAt must not be less than 0' })
  reorderAt!: number;
}
