# Architecture

## Requested stack
- `enterprise` — Angular 19 (template default; project plan targets Angular 22) + NestJS + tRPC + Prisma + PostgreSQL

## Scaffolding status
- **enterprise** — ✅ newly scaffolded (repo was greenfield: only `README.md` and `.github/workflows/colossus-deploy.yml` existed)

## Layout
- `frontend/` — Angular SPA (standalone components, `app-root` selector, tRPC client wiring in `app.config.ts`)
- `backend/` — NestJS API with a tRPC router (`nestjs-trpc`), Prisma-backed `users` module, and a Terminus health check at `/health`
- `.pipeline/surface.json` — generated route/component/test-id manifest consumed by the test_spec agent and Playwright generator
- `.colossus-acceptance.json` — post-deploy render-gate contract (readiness test-id + stub-rejection signatures)
- `colossus.yaml` — build manifest read by deploy agents (Angular output path, backend build/port)

## Next steps for the developer / build agents
1. Fill in `.env` files for `backend/` (DB connection string, JWT secret, etc.) once `.env.template` files are added to the template or created per the plan's `.env.example`.
2. Implement the plan's domain: replace the template's `users` sample module with `auth`, `items`, `locations`, `movements`, `reports` per `plan.md`, updating `prisma/schema.prisma` accordingly.
3. Run `npx prisma generate` (and later `npx prisma migrate dev`) in `backend/` after editing the schema.
4. Update `.pipeline/surface.json` as new routes/components/test-ids are added — this file must stay exhaustive for downstream test generation.
5. Update `.colossus-acceptance.json`'s `expect_text` once the real front page (StockRoom login/shell) is implemented, replacing the template placeholder `reject_signatures`.
6. Run `docker compose up --build` to validate the full stack builds and serves before deploying.

## Template source
- `template-enterprise/` from the shared scaffold-templates directory (Angular + NestJS + tRPC + Prisma monorepo), copied directly into the project root.
