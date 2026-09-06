/**
 * JWT signing configuration.
 *
 * The lifetime is fixed at 12 hours (43 200 s) rather than read from the
 * environment: the surface contract pins `exp - iat` and a deploy-time env
 * value ("1d") would silently change a documented, asserted property.
 */
export const JWT_EXPIRES_IN_SECONDS = 43_200;

/**
 * `JWT_SECRET` is platform-provisioned. The development fallback keeps `npm run
 * start:dev` working on a laptop; it is never what a deployed pod uses.
 */
export const JWT_SECRET: string = process.env.JWT_SECRET ?? 'stockroom-development-secret';
