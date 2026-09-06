# Pipeline Task Decomposition

## Summary
StockRoom is a two-service inventory-management app: a NestJS 11 + Prisma (Postgres) JWT-authed REST API under `backend/` and an Angular standalone SPA under `frontend/`, served together behind nginx (SPA at `/`, reverse-proxy `/api` → api:3000). Users authenticate with email + password; **clerk**-level users can browse the item catalogue, view per-location stock and record stock movements, while **manager**/**admin**-level users additionally manage items and locations, read the immutable movement audit log and run the low-stock report. Stock is held as `StockLevel(itemId, locationId, qty)` rows; every `IN` / `OUT` / `TRANSFER` movement is applied inside a single Prisma transaction using a conditional `updateMany` guard so over-draws are rejected race-safely and no `Movement` row is written when the balance is insufficient. An admin settings screen at `/admin/settings` exposes credentials for the provisioned backing services (postgresql, minio, llm), resolved env-first then from a `SystemSetting` DB row.

## Surface contract

### Backend REST routes (all under global prefix `/api`)
| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | public | `{status:'ok'}` |
| GET | `/api/health/deep` | public | runs `SELECT 1`; 503 on failure |
| POST | `/api/auth/signup` | public | `{email,password}` → `{accessToken,user}`; role `MANAGER` if user table empty, else `CLERK` |
| POST | `/api/auth/login` | public | `{email,password}` → `{accessToken,user:{id,email,role}}`; 401 on bad creds |
| GET | `/api/auth/me` | authed | current user |
| POST | `/api/auth/logout` | authed | 204, client discards token |
| GET | `/api/items` | authed | `?q=&lowOnly=&sort=&page=&pageSize=`; each item includes `totalQty` |
| GET | `/api/items/:id` | authed | item + per-location breakdown |
| POST | `/api/items` | manager | 409/422 on duplicate `sku` (Prisma `P2002`) |
| PATCH | `/api/items/:id` | manager | |
| DELETE | `/api/items/:id` | manager | blocked if non-zero stock or any movements |
| GET | `/api/locations` | authed | populates movement form |
| POST/PATCH/DELETE | `/api/locations[/:id]` | manager | delete blocked while location holds stock |
| POST | `/api/movements` | authed | `{type,itemId,fromLocId?,toLocId?,qty,note?}` |
| GET | `/api/movements` | manager | `?itemId=&type=&from=&to=&userId=&page=`, `createdAt desc`, joined names |
| GET | `/api/reports/low-stock` | manager | items where `SUM(qty) <= reorderAt`, sorted by shortfall desc |
| GET | `/api/admin/settings` | admin | service/integration keys with masked values + configured flag |
| PATCH | `/api/admin/settings` | admin | upsert key/value pairs |

### Frontend routes (`frontend/src/app/app.routes.ts`)
- `/login`, `/signup` — public
- `/` → redirect `/items`
- `/items` — authed; `?q=&lowOnly=&sort=&page=`
- `/items/new`, `/items/:id/edit` — manager
- `/items/:id` — authed; `?tab=stock|history`
- `/locations` — manager; `/locations/new`, `/locations/:id/edit` — manager
- `/movements/new` — authed; `?type=IN|OUT|TRANSFER&itemId=&fromLocId=&toLocId=`
- `/movements` — manager; `?itemId=&type=&from=&to=&page=`
- `/reports/low-stock` — manager
- `/admin/settings` — admin
- Destructive confirms are URL state: `?modal=delete&id=`

### Entities
`User(id, email @unique, name?, passwordHash, role Role, createdAt, updatedAt)`,
`Role { USER, CLERK, MANAGER, ADMIN }`,
`ColossusAccount` (scaffolder-owned, preserve as-is),
`Item(id, sku @unique, name, description?, unit, reorderAt Int, createdAt)`,
`Location(id, name @unique, zone, createdAt)`,
`StockLevel(id, itemId, locationId, qty Int @default(0))` with `@@unique([itemId, locationId])`,
`Movement(id, type MovementType, itemId, fromLocId?, toLocId?, qty Int, note?, userId, createdAt)`,
`MovementType { IN, OUT, TRANSFER }`,
`SystemSetting(key @id, value, updatedAt)`.

### Role mapping (auth model = `full_auth`)
`ADMIN` ⊇ `MANAGER` capabilities. Manager-only endpoints accept `MANAGER` **and** `ADMIN`. `CLERK` and `USER` are the non-privileged authenticated roles; new signups default to `USER`/`CLERK` per the rule above.

## db_agent tasks
- [ ] Extend `backend/prisma/schema.prisma` `enum Role` to `{ USER, CLERK, MANAGER, ADMIN }`, keeping `role Role @default(USER)` on `User`; do not remove `ColossusAccount` or the existing `User` fields.
- [ ] Add `Item` model to `schema.prisma`: `id String @id @default(uuid())`, `sku String @unique`, `name String`, `description String?`, `unit String`, `reorderAt Int @default(0)`, `createdAt DateTime @default(now())`, relations to `StockLevel[]` and `Movement[]`.
- [ ] Add `Location` model: `id`, `name String @unique`, `zone String`, `createdAt`, with `stockLevels StockLevel[]` and the two named `Movement` back-relations (`movementsFrom`, `movementsTo`).
- [ ] Add `StockLevel` model: `id`, `itemId`, `locationId`, `qty Int @default(0)`, `@@unique([itemId, locationId])`, `@@index([locationId])`, cascade delete from `Item` and `Location`.
- [ ] Add `Movement` model + `enum MovementType { IN OUT TRANSFER }`: `id`, `type`, `itemId`, `fromLocId String?`, `toLocId String?`, `qty Int`, `note String?`, `userId`, `createdAt`, with `@@index([itemId, createdAt])` and `@@index([createdAt])` for the filterable audit log.
- [ ] Add `SystemSetting` model: `key String @id`, `value String`, `updatedAt DateTime @updatedAt` (backs `resolveConfig` for postgresql / minio / llm credentials).
- [ ] Generate the migration for all of the above (`prisma migrate dev --name stockroom_core`) and verify `prisma generate` succeeds against the client provider already configured in the scaffold.
- [ ] Extend `backend/prisma/seed/seed.js` idempotently (upsert on natural keys) without breaking the existing `COLOSSUS_ACCOUNTS_JSON` account materialisation: 3 locations (`Zone A`, `Zone B`, `Zone C` by `name`), 8 items `SKU-001`…`SKU-008` with varied `reorderAt`, and opening `StockLevel` rows that leave 2–3 items at or below their `reorderAt` so `/reports/low-stock` is non-empty on first load.

## backend_agent tasks
- [ ] In `src/main.ts`, set global prefix `api` and `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`; leave the existing bootstrap/health wiring intact.
- [ ] Build `src/auth/` — `auth.module.ts`, `auth.service.ts` (bcrypt compare against `passwordHash`), `jwt.strategy.ts` (12h expiry, `Authorization: Bearer`), `dto/login.dto.ts` and `dto/signup.dto.ts` (validate email with `IsString`, not `IsEmail`, so `clerk@demo` passes).
- [ ] Implement `auth.controller.ts`: `POST /api/auth/login`, `POST /api/auth/signup` (role `MANAGER` when the user table is empty, else `CLERK`), `GET /api/auth/me`, `POST /api/auth/logout` (204).
- [ ] Register `JwtAuthGuard` as a global `APP_GUARD` with a `@Public()` metadata escape hatch (`public.decorator.ts`), plus `roles.guard.ts`, `roles.decorator.ts`, `current-user.decorator.ts`; mark both health endpoints and the auth login/signup routes `@Public()`. `@Roles('MANAGER')` must also admit `ADMIN`.
- [ ] Build `src/items/` module/service/controller with `dto/create-item.dto.ts`, `dto/update-item.dto.ts`, `dto/query-items.dto.ts`: `GET /api/items` returns items + `totalQty` (summed `StockLevel`) with `q`/`lowOnly`/`sort`/`page`/`pageSize`; `GET /api/items/:id` returns the item plus its per-location breakdown.
- [ ] Add manager-only `POST/PATCH/DELETE /api/items`, catching Prisma `P2002` on `sku` → 409 with a field-level `sku` error, and rejecting deletion of an item that has non-zero stock or any movement rows.
- [ ] Build `src/locations/` module/service/controller + create/update DTOs: `GET /api/locations` for any authed role; `POST/PATCH/DELETE` manager-only with deletion blocked while the location holds stock.
- [ ] Implement `src/movements/movements.service.ts` per-type validation: `IN` requires `toLocId` only, `OUT` requires `fromLocId` only, `TRANSFER` requires both and they must differ; `qty` must be an integer ≥ 1 — reject with 400/422 otherwise.
- [ ] Implement the movement write inside `prisma.$transaction`: decrement via conditional `stockLevel.updateMany({ where: { itemId, locationId: fromLocId, qty: { gte: qty } }, data: { qty: { decrement: qty } } })` and throw `UnprocessableEntityException('Insufficient stock')` when `count !== 1`; increment via `upsert`; `TRANSFER` does guarded decrement then increment in the same transaction; the `Movement` row is written last so a rejected over-draw leaves no audit row.
- [ ] Add `movements.controller.ts` + `dto/create-movement.dto.ts`, `dto/query-movements.dto.ts`: `POST /api/movements` (any authed role, `userId` from `@CurrentUser`), `GET /api/movements` manager-only, `createdAt desc`, joined to user/item/location names, filterable by `itemId`, `type`, `from`, `to`, `userId`, `page`. No update or delete endpoint — movements are immutable.
- [ ] Build `src/reports/` — `GET /api/reports/low-stock`, manager-only: aggregate `StockLevel` by item, return those with `totalQty <= reorderAt` including `totalQty`, `reorderAt` and `shortfall`, sorted by shortfall desc.
- [ ] Add `src/health/health.controller.ts` `GET /api/health/deep` running `SELECT 1` via `PrismaService` and returning 503 on failure (keep the existing `/api/health`).
- [ ] Create `src/config/config.service.ts` exporting `resolveConfig(key: string): Promise<string | null>` — reads `process.env[key]` first; if the value is absent or equals `PLACEHOLDER_CONFIGURE_IN_SETTINGS`, falls back to the `SystemSetting` row with that key; returns `null` if neither is set. Export a `ServiceUnconfiguredError` that maps to HTTP 503.
- [ ] Build `src/admin/settings/` — `GET /api/admin/settings` (admin role required) listing the service keys for **postgresql**, **minio** and **llm** with masked values and a `configured` boolean, and `PATCH /api/admin/settings` upserting key/value pairs into `SystemSetting`.
- [ ] Register all new modules (`AuthModule`, `ItemsModule`, `LocationsModule`, `MovementsModule`, `ReportsModule`, `AdminSettingsModule`) in `src/app.module.ts` alongside the existing Prisma/health/tRPC modules so the scaffolded build keeps compiling.

## ui_agent tasks
- [ ] Put `StockRoom` in `frontend/src/index.html` `<title>` **and** as static app-shell markup inside `<app-root>` so the brand is in the DOM before Angular bootstraps and survives the unauthenticated `/` → `/login` redirect.
- [ ] Rewrite `src/app/app.routes.ts` with every route in the Surface contract, each carrying a `data.flow` node; attach `authGuard` to all non-public routes and `roleGuard(['MANAGER','ADMIN'])` to the manager routes and `roleGuard(['ADMIN'])` to `/admin/settings`.
- [ ] Build `src/app/shared/shell.component.ts` — brand header, nav (Items, Movements, Locations, Low stock, Admin settings), current user + logout; manager/admin-only links hidden by role.
- [ ] Build `src/app/shared/confirm-dialog.component.ts` driven by `?modal=delete&id=` query params (no buried component state).
- [ ] Build `src/app/features/auth/login.component.ts` and `signup.component.ts` — reactive forms, brand rendered on the page, inline 401/validation errors, honour `?returnUrl=`.
- [ ] Build `src/app/features/items/item-list.component.ts` — table of SKU, name, unit, reorderAt, total on hand; search box, `lowOnly` toggle, sort and pagination read from `route.queryParamMap` and written back via `router.navigate({queryParams})`; empty / loading / error states.
- [ ] Build `src/app/features/items/item-detail.component.ts` — per-location stock breakdown (sum equals the displayed total) and a movement-history tab, switched by `?tab=stock|history`.
- [ ] Build `src/app/features/items/item-form.component.ts` — create/edit form for sku, name, description, unit, reorderAt with inline server-validation errors (duplicate SKU surfaced on the `sku` field).
- [ ] Build `src/app/features/locations/location-list.component.ts` and `location-form.component.ts` (name, zone) with delete-blocked messaging when the location holds stock.
- [ ] Build `src/app/features/movements/movement-form.component.ts` — type selector that switches which location fields are shown (`IN`: to only, `OUT`: from only, `TRANSFER`: both, must differ), item + location pickers, qty ≥ 1, and surfaces the "Insufficient stock" error inline; prefill from `?type=&itemId=&fromLocId=&toLocId=`.
- [ ] Build `src/app/features/movements/movement-log.component.ts` — audit table (date, type, item, from, to, qty, user, note) with item / type / date-range filters and pagination bound to query params.
- [ ] Build `src/app/features/reports/low-stock.component.ts` — table of item, totalQty, reorderAt, shortfall sorted by shortfall desc, with an explicit "nothing is low on stock" empty state.
- [ ] Build `src/app/features/admin/settings.component.ts` at `/admin/settings` — one card per provisioned service (**postgresql**, **minio**, **llm**) showing a configured/unconfigured badge and a credential form posting to `PATCH /api/admin/settings`; render a prominent banner listing any service whose credentials are still unconfigured: "The following need credentials to activate: …".
- [ ] Add hand-rolled SCSS/CSS in `src/styles.*` for the shell, tables, forms, badges and banner; no external UI kit.

## service_agent tasks
- [ ] Write `src/app/core/models.ts` — TypeScript interfaces for `User`, `Role`, `Item`, `ItemWithTotals`, `Location`, `StockLevel`, `Movement`, `MovementType`, `LowStockRow`, `SettingEntry`, and the paginated-list envelope, matching the backend response shapes exactly.
- [ ] Write `src/app/core/api.service.ts` — typed `HttpClient` wrapper over the `/api` base with a shared error normaliser that maps 401/403/409/422/503 into a `{message, fieldErrors}` shape the UI can render inline.
- [ ] Write `src/app/core/auth.service.ts` — `login`, `signup`, `logout`, `me`; `currentUser` signal hydrated from `localStorage`; token stored under a single key and cleared on logout; `isManager()` / `isAdmin()` helpers used by nav and guards.
- [ ] Write `src/app/core/auth.interceptor.ts` — attach `Authorization: Bearer <token>` to `/api` requests, and on 401 clear the session and redirect to `/login?returnUrl=<current url>`.
- [ ] Write `src/app/core/auth.guard.ts` and `src/app/core/role.guard.ts` (`roleGuard(roles: Role[])`, treating `ADMIN` as satisfying `MANAGER`), and register the interceptor in `src/app/app.config.ts` via `provideHttpClient(withInterceptors([...]))`.
- [ ] Write `src/app/core/items.api.ts` — `list(query)`, `get(id)`, `create`, `update`, `remove`, serialising `q`/`lowOnly`/`sort`/`page`/`pageSize` into query params.
- [ ] Write `src/app/core/locations.api.ts` — `list`, `create`, `update`, `remove`.
- [ ] Write `src/app/core/movements.api.ts` — `create(dto)` and `list(filters)` with `itemId`/`type`/`from`/`to`/`userId`/`page` serialisation.
- [ ] Write `src/app/core/reports.api.ts` (`lowStock()`) and `src/app/core/settings.api.ts` (`get()`, `patch(entries)` against `/api/admin/settings`).

## tester tasks
- [ ] Unit-test `MovementsService`: per-type field validation (`IN` rejects `fromLocId`, `OUT` rejects `toLocId`, `TRANSFER` rejects equal locations, `qty < 1` rejected).
- [ ] Unit-test that a rejected over-draw leaves the balance untouched **and** writes no `Movement` row, and that a `TRANSFER` conserves the item's total quantity.
- [ ] E2E (`backend/test/auth.e2e-spec.ts`): unauthenticated requests to every data endpoint (`/api/items`, `/api/locations`, `/api/movements`, `/api/reports/low-stock`, `/api/admin/settings`) return 401; login with seeded credentials returns a token; `GET /api/auth/me` reflects the role.
- [ ] E2E (`backend/test/rbac.e2e-spec.ts`): clerk `POST /api/items` → 403, clerk `GET /api/movements` → 403, clerk `GET /api/reports/low-stock` → 403; manager succeeds on all three; non-admin `GET /api/admin/settings` → 403.
- [ ] E2E items: duplicate `sku` returns a validation error and exactly one row remains stored; deleting an item with stock or movements is blocked.
- [ ] E2E (`backend/test/movements.e2e-spec.ts`) balance walk: `IN 50` → 50; `OUT 20` → 30; `TRANSFER 10` → 20/10 with unchanged total; `OUT 10` against a balance of 5 → error with the balance still 5.
- [ ] E2E reports: low-stock includes the item at 7 with `reorderAt` 10 and excludes the 40-unit item; shortfall ordering is descending.
- [ ] E2E movements log: filtering by `itemId` and by `from`/`to` date range returns only matching rows in `createdAt desc` order.
- [ ] E2E health: `GET /api/health` → 200 `{status:'ok'}`; `GET /api/health/deep` → 200 with the DB up.
- [ ] E2E admin settings: `PATCH /api/admin/settings` as admin upserts a `SystemSetting` row, `GET` returns it masked with `configured: true`, and `resolveConfig` prefers a real env var over the stored row.
- [ ] Browser smoke: load `/` unauthenticated → redirected sign-in view renders and the DOM contains `StockRoom`; then sign in as each seeded role and assert the role-appropriate navigation (clerk sees no Movements/Low-stock/Admin links, manager does).
- [ ] Build gate: `docker compose up --build` from clean, then assert `/api/health/deep` returns 200 and the root page serves the SPA (not an nginx directory listing) — i.e. the Angular `dist/<app>/browser` copy path is correct.

## Open questions
- **Spec vs. scaffolder stack drift.** The spec specifies Prisma 7 (`provider = "prisma-client"`, `output = "../src/generated/prisma"`, `moduleFormat = "cjs"`), Angular 22, `bcrypt`, and NestJS `^11`. The scaffolded repo ships Prisma `^6` with `prisma-client-js`, Angular `^19`, `bcryptjs`, and a `nestjs-trpc` layer. These tasks target **the versions already installed** to avoid a build-breaking upgrade mid-pipeline. If the pinned Prisma 7 / Angular 22 set is mandatory, that upgrade must be its own scoped task before db_agent starts.
- **REST vs. tRPC.** The spec's surface (and every test scenario) is REST under `/api`. The scaffold provides a tRPC router with a `users` sub-router. Plan of record: add the REST controllers and leave the existing tRPC scaffold untouched so nothing breaks. Confirm whether the tRPC layer should instead be removed.
- **Role vocabulary.** The auth model supplies `admin` + `user`; the spec uses `clerk` + `manager`. Resolved as `Role { USER, CLERK, MANAGER, ADMIN }` with `@default(USER)` and `ADMIN` inheriting all `MANAGER` permissions. Confirm this mapping, and confirm which role the platform's provisioned `user` login should carry (currently `USER`, treated as clerk-equivalent).
- **Demo seed accounts.** The spec asks for `manager@demo` / `clerk@demo` with `Demo1234!`; the scaffold materialises logins from `COLOSSUS_ACCOUNTS_JSON` and its comments say never to add demo users. These tasks seed catalogue data only and rely on the platform accounts for login. Confirm whether the literal `@demo` accounts are still required.
- **minio and llm have no spec behaviour.** They are provisioned deployments, so admin-settings plumbing is included, but the spec describes no object storage or LLM feature. No client module or feature surface has been invented for them.
- **`<spec_integrations>` contained a single entry named "None. The spec declares no third-party APIs, SDKs, or external services."** — treated as a parsing artefact of the spec's "Integrations: None" line. No integration client module was created. Confirm no real integration was intended.
- **Location natural key.** Seed idempotency requires upserting locations by name, so `Location.name` is modelled as `@unique`; the spec does not state this explicitly.
