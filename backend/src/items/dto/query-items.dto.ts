import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';
import { toOptionalBoolean } from '../../common/boolean.transform';

/**
 * Sort keys are an explicit allowlist: a `-` prefix means descending. An
 * unrecognised key is a 400 rather than a silently ignored parameter, so a
 * typo in a deep link never produces a plausible-looking wrong ordering.
 */
export const ITEM_SORT_KEYS = [
  'sku',
  '-sku',
  'name',
  '-name',
  'reorderAt',
  '-reorderAt',
  'totalQty',
  '-totalQty',
  'createdAt',
  '-createdAt',
] as const;

export type ItemSortKey = (typeof ITEM_SORT_KEYS)[number];

export class QueryItemsDto extends PaginationQueryDto {
  /** Case-insensitive substring match against `sku` or `name`. */
  @IsOptional()
  @IsString()
  q?: string;

  /** Restricts the page to items where `totalQty <= reorderAt`. */
  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean({ message: 'lowOnly must be a boolean value (true or false)' })
  lowOnly?: boolean;

  @IsOptional()
  @IsIn(ITEM_SORT_KEYS as unknown as string[], {
    message: `sort must be one of: ${ITEM_SORT_KEYS.join(', ')}`,
  })
  sort?: ItemSortKey;
}
