import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Hard ceiling on `pageSize` so a crafted query cannot pull the whole table. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must not be less than 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize must be an integer' })
  @Min(1, { message: 'pageSize must not be less than 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize must not be greater than ${MAX_PAGE_SIZE}` })
  pageSize?: number;
}

/** Envelope shared by every list endpoint (`/api/items`, `/api/movements`). */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function paginate<T>(rows: T[], page: number, pageSize: number): Paginated<T> {
  const start = (page - 1) * pageSize;
  return { data: rows.slice(start, start + pageSize), page, pageSize, total: rows.length };
}
