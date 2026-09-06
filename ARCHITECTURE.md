# Architecture

## Requested stack
- `enterprise` — Angular 19 (template default; project plan targets Angular 22) + NestJS + REST + Prisma + PostgreSQL

## Scaffolding status
- **enterprise** — ✅ newly scaffolded (repo was greenfield: only `README.md` and `.github/workflows/colossus-deploy.yml` existed)

## Layout
- `frontend/` — Angular SPA (standalone components, `app-root` selector, tRPC client wiring in `app.config.ts`)
- `backend/` — NestJS REST API under the `/api` prefix: `auth`, `items`, `locations`, `movements`, `reports`, `admin/settings`, plus a Prisma-backed health check (`/api/health`, `/api/health/deep`) and Swagger at `/api/docs`
- `.pipeline/surface.json` — generated route/component/test-id manifest consumed by the test_spec agent and Playwright generator
- `.colossus-acceptance.json` — post-deploy render-gate contract (readiness test-id + stub-rejection signatures)
- `colossus.yaml` — build manifest read by deploy agents (Angular output path, backend build/port)

## Next steps for the developer / build agents
1. `frontend/src/app/core/` still needs the typed API clients (`api.service.ts`, `items.api.ts`,
   `locations.api.ts`, `movements.api.ts`, `reports.api.ts`, `settings.api.ts`) and the auth
   interceptor; the feature components currently render preview fixtures rather than live data.
2. Register `authInterceptor` in `app.config.ts` via `provideHttpClient(withInterceptors([...]))`
   and drop the now-unused `TRPC_CLIENT` provider — the backend no longer serves `/trpc`.
3. Add the backend test suites under `backend/test/` (auth, rbac, items, movements, reports).
4. Keep `.pipeline/surface.json` in step with new routes and test-ids.

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

## Template source
- `template-enterprise/` from the shared scaffold-templates directory (Angular + NestJS + tRPC + Prisma monorepo), copied directly into the project root.
