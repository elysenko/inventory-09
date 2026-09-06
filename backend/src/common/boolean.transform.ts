import { TransformFnParams } from 'class-transformer';

/**
 * Query strings carry booleans as text. Only the four canonical spellings are
 * accepted; anything else is passed through untouched so `@IsBoolean()` rejects
 * it with a 400 rather than being silently coerced to `false`.
 */
export function toOptionalBoolean({ value }: TransformFnParams): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}
