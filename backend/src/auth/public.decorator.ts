import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Escape hatch for the global `JwtAuthGuard`.
 *
 * The guard is registered as an `APP_GUARD`, so "unauthenticated -> 401" is the
 * default for every route. Routes that must answer without a token (health,
 * login, signup) opt out by carrying this metadata.
 */
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
