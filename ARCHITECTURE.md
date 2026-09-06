# Architecture

## Requested stack
- `enterprise` — Angular 19 (template default; project plan targets Angular 22) + NestJS + REST + Prisma + PostgreSQL

## Scaffolding status
- **enterprise** — ✅ newly scaffolded (repo was greenfield: only `README.md` and `.github/workflows/colossus-deploy.yml` existed)

## Layout
- `frontend/` — Angular SPA (standalone components, `app-root` selector); all data access goes through `core/api.service.ts` over REST to `/api`, with `core/auth.interceptor.ts` registered in `app.config.ts`
- `backend/` — NestJS REST API under the `/api` prefix: `auth`, `items`, `locations`, `movements`, `reports`, `admin/settings`, plus a Prisma-backed health check (`/api/health`, `/api/health/deep`) and Swagger at `/api/docs`
- `.pipeline/surface.json` — generated route/component/test-id manifest consumed by the test_spec agent and Playwright generator
- `.colossus-acceptance.json` — post-deploy render-gate contract (readiness test-id + stub-rejection signatures)
- `colossus.yaml` — build manifest read by deploy agents (Angular output path, backend build/port)

## Next steps for the developer / build agents
1. Add the backend test suites under `backend/test/` (auth, rbac, items, movements, reports).
2. Keep `.pipeline/surface.json` in step with new routes and test-ids.

## Decisions taken during the backend pass
- **REST, not tRPC.** The scaffold's `nestjs-trpc@2.x` layer did not compile against NestJS 11
  (`TrpcModule`/`TrpcRouter`/`TrpcProcedure` are not exported; the package renamed them), so
  `npm run build` failed with 4 errors before any feature code existed. The whole spec surface —
  and every test scenario — is REST under `/api`, so the tRPC layer and the sample `users` module
  were removed rather than repaired. `@trpc/server`, `nestjs-trpc` and `zod` left the backend
  dependency set with them, as did `@nestjs/terminus`/`@nestjs/axios` once the health check
  stopped self-pinging over HTTP.
- **Port 3001.** `colossus.yaml` declares `backend.port: 3001` while the scaffold listened on
  3000; the deploy manifests read colossus.yaml, so 3001 is now the default in `main.ts`, the
  `EXPOSE`/`PORT` in `backend/Dockerfile`, the nginx `/api` upstream and `proxy.conf.json`.
- **Authenticated by default.** `JwtAuthGuard` and `RolesGuard` are registered as global
  `APP_GUARD`s, so a new controller ships protected unless it opts out with `@Public()`.

## Decisions taken during the service pass
- **One HTTP surface.** Every screen calls `core/api.service.ts` rather than injecting
  `HttpClient` directly, so route paths, query-param encoding and the `{data,page,pageSize,total}`
  envelope stay in one place. The preview fixtures the UI pass shipped are gone; each component
  loads from the API and keeps its existing loading / empty / error branches.
- **`/api` is origin-absolute.** It matches `glue.frontend_api_base` in `colossus.stack.json` and
  the `location /api/` block in `nginx.conf`. It deliberately does not follow `<base href>`:
  `index.html` rewrites that to a path prefix when the SPA is mounted under one, while nginx still
  serves the API at the origin root.
- **`TRPC_CLIENT` removed.** The backend never served `/trpc`. `@trpc/client`, `ngx-trpc`, `zod`
  and the unused `@angular/ssr` left `frontend/package.json` with it, along with
  `trpc-client.types.ts`.
- **Token read from storage in the interceptor, not from `AuthService`.** Injecting the service
  would close the loop `HttpClient -> interceptor -> AuthService -> ApiService -> HttpClient` and
  Angular could not construct the client. A 401 from `/auth/login` is left alone so the form can
  render it inline; any other 401 clears the session and redirects with a `returnUrl`.
- **The server owns the rules, the client only pre-empts them.** Duplicate SKU / location name,
  sufficiency of stock and the delete guards are all decided server-side and surfaced from the
  response `fieldErrors`; the client-side equivalents exist only to keep the user out of an
  obviously invalid submit, since a local check cannot win a race against a concurrent write.
- **Date bounds pass through unwidened.** `MovementsService.endOfRange` already stretches a
  date-only `to` to the end of that day, so the client sends the raw `YYYY-MM-DD` from the date
  input rather than duplicating a rule that could drift.

## Template source
- `template-enterprise/` from the shared scaffold-templates directory (Angular + NestJS + tRPC + Prisma monorepo), copied directly into the project root.
