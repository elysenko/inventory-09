# Test Specification

> **WARNING — `surface.json` is stale and contradicts the spec.** `.pipeline/surface.json` was written by the
> scaffolder and lists only `GET /health`, `GET /trpc/users.findAll`, `GET /trpc/users.findById` plus `app-root` /
> `app-home` components and `users-*` test-ids. None of that is StockRoom. The authoritative API surface used below is
> the **Surface contract in `.pipeline/tasks.md`** (which matches `requirements`-equivalent spec text supplied to this
> agent; there is no `requirements/spec.md` on disk). The three `surface.json` routes are still covered verbatim, in
> **API tests §Legacy scaffold surface**, because rule 1 requires it and because they are live in the scaffold today.
> **Action for the pipeline:** `surface.json` and `.colossus-acceptance.json` (`reject_signatures` still target the
> template `Users` page, `expect_text` is empty) must be regenerated before these tests are considered exhaustive.

> **Credentials.** The scaffold seed (`backend/prisma/seed/seed.js`) materialises logins from `COLOSSUS_ACCOUNTS_JSON`
> and explicitly forbids demo users, so tests MUST resolve manager/clerk/admin credentials from that env var, not from
> the spec's literal `manager@demo` / `clerk@demo` / `Demo1234!`. Roles below use the resolved enum
> `{USER, CLERK, MANAGER, ADMIN}`; `ADMIN` satisfies every `MANAGER` assertion.

> **Fixtures.** The shipped seed is essential-only (no catalogue). Every test that needs items/locations/stock MUST
> create them through the API in setup and tear them down; no test may assume `SKU-001`…`SKU-008` or `Zone A/B/C` exist.

## Coverage summary
- Total cases: 249 (215 API + 16 journeys + 18 data-integrity)
- API endpoints covered: 23 / 23 — all 3 routes listed in `surface.json` plus the 20 real StockRoom endpoints from the `tasks.md` surface contract that `surface.json` omits
- User journeys covered: 16

## API tests

All paths are under the global prefix `/api` unless stated. Every case asserts the response body never contains the
keys `passwordHash` / `password` and never contains a bcrypt hash (`$2`-prefixed string).

### `GET /api/health`
- **Happy path**: [API-001] No `Authorization` header → `200`, body `.status === 'ok'`. Terminus envelope
  (`{status,info,details}`) is acceptable as long as `.status === 'ok'`.
- **Validation failures**: n/a (no inputs).
- **Auth failures**: [API-002] Public — with no header and with a garbage header `Authorization: Bearer nope`, both
  return `200`, never `401`. Confirms the global `APP_GUARD` honours `@Public()`.
- **Idempotency / edge cases**: [API-003] Liveness must not depend on the DB — with Postgres stopped, `/api/health`
  still returns `200` (only `/api/health/deep` degrades). [API-004] The scaffold's Terminus check self-pings
  `http://localhost:$PORT/trpc`; if the tRPC layer is removed or the prefix moves it to `/api/trpc`, this endpoint must
  still return `200` and must not 503 on its own reflection.

### `GET /api/health/deep`
- **Happy path**: [API-005] DB up → `200`, body indicates ok (`{status:'ok', db:'up'}` or Terminus `status:'ok'`), and
  the request completes in < 2s.
- **Validation failures**: n/a.
- **Auth failures**: [API-006] Public → `200` with no token.
- **Idempotency / edge cases**: [API-007] Point `DATABASE_URL` at a dead port (or stop Postgres) → `503`, body status
  not `'ok'`; the process stays up and `/api/health` still returns `200`. [API-008] Called 5× in a row → 5× `200`, no
  connection-pool exhaustion (no 500s).

### `POST /api/auth/signup`
- **Happy path**: [API-009] Users table non-empty, `{email:'signup.a@example.test', password:'Demo1234!'}` → `201`,
  body `{accessToken, user:{id,email,role}}`; `accessToken` is a 3-segment JWT; `user.role` is the non-privileged
  default (`CLERK`/`USER`), never `MANAGER`/`ADMIN`. [API-010] Users table truncated (empty) → first signup returns
  `user.role === 'MANAGER'`. [API-011] Non-RFC email `clerk@demo` → `201` (DTO uses `IsString`, not `IsEmail`).
  [API-012] Returned `accessToken` is immediately accepted by `GET /api/auth/me`, which echoes the same `id`/`role`.
- **Validation failures**: [API-013] `{}` → `400` with messages naming both `email` and `password`.
  [API-014] `{email:'x@y.test'}` (no password) → `400`. [API-015] `{email:'', password:'Demo1234!'}` → `400`.
  [API-016] `{email:'x@y.test', password:''}` → `400`.
  [API-017] **Privilege-escalation guard**: `{email, password, role:'ADMIN'}` → `whitelist:true` strips `role`; the
  created user's role is the default, and `GET /api/auth/me` with the returned token shows a non-admin role.
  [API-018] `{email, password, isAdmin:true, id:'forced-id'}` → unknown props stripped; generated `id` is a fresh uuid.
- **Auth failures**: [API-019] Public — succeeds with no `Authorization` header.
- **Idempotency / edge cases**: [API-020] Signing up the same email twice → second call `409` (or `400`) with a
  field-level `email` error, and exactly **one** `User` row exists for that email.

### `POST /api/auth/login`
- **Happy path**: [API-021] Seeded MANAGER credentials → `200`, `{accessToken, user:{id,email,role:'MANAGER'}}`.
  [API-022] Seeded clerk-equivalent credentials → `200`, role is `CLERK`/`USER`.
  [API-023] Decoded JWT payload carries the user id (`sub`) and role, and `exp - iat === 43200` (12h) ±60s.
- **Validation failures**: [API-024] `{}` → `400`. [API-025] `{password:'x'}` (no email) → `400`.
  [API-026] `{email:123, password:'x'}` (wrong type) → `400`, not `500`.
- **Auth failures**: [API-027] Correct email + wrong password → `401`; body contains no hint that the email exists.
  [API-028] Unknown email → `401` with a body **identical in shape and message** to API-027 (no user enumeration).
  [API-029] Correct email, password differing only in case → `401`.
- **Idempotency / edge cases**: [API-030] Two consecutive logins for the same user both return `200` with usable
  tokens (stateless — the first token is not invalidated).

### `GET /api/auth/me`
- **Happy path**: [API-031] MANAGER token → `200` `{id,email,role:'MANAGER'}`, and `id` matches the login response.
  [API-032] Clerk token → `200`, role is the clerk-equivalent.
- **Validation failures**: n/a.
- **Auth failures**: [API-033] No header → `401`. [API-034] `Authorization: Bearer abc.def.ghi` (malformed) → `401`.
  [API-035] JWT signed with a different secret → `401`. [API-036] JWT with `exp` in the past → `401`.
  [API-037] `Authorization: <token>` without the `Bearer ` scheme → `401`.
- **Idempotency / edge cases**: [API-038] Body contains no `passwordHash` key.

### `POST /api/auth/logout`
- **Happy path**: [API-039] Authed → `204` with an empty body.
- **Validation failures**: n/a.
- **Auth failures**: [API-040] No token → `401`.
- **Idempotency / edge cases**: [API-041] Called twice with the same token → `204` both times, never `500`.
  [API-042] Documented statelessness: the token still authenticates `GET /api/auth/me` after logout (server keeps no
  denylist) — assert `200`, so a future move to server-side revocation is a deliberate, test-visible change.

### `GET /api/items`
- **Happy path**: [API-043] Clerk token → `200`; envelope `{data:[], page, pageSize, total}` (or a bare array — assert
  against `core/models.ts`, and assert the same shape as `GET /api/movements`). [API-044] Each element has
  `id, sku, name, unit, reorderAt, totalQty`; for a fixture item with stock 12@A + 8@B, `totalQty === 20`.
  [API-045] A fixture item with zero `StockLevel` rows still appears, with `totalQty === 0` (not omitted, not `null`).
- **Validation failures**: [API-046] `?page=0` and `?page=-1` → `400` (or clamped to 1 — assert one deterministic
  behaviour, never `500`). [API-047] `?pageSize=abc` → `400`. [API-048] `?pageSize=100000` → `400` or clamped to the
  documented max; the response must not return the entire table. [API-049] `?lowOnly=maybe` → `400` or coerced to
  `false`, deterministically.
- **Auth failures**: [API-050] No token → `401`.
- **Idempotency / edge cases**: [API-051] `?q=SKU-T01` returns only rows whose `sku` or `name` matches; `?q=` (empty)
  behaves as unfiltered. [API-052] `?q=zzz-no-such-item` → `200` with `data: []` and `total: 0`, **not** `404`.
  [API-053] `?q=sku-t01` (lowercase) matches `SKU-T01` if search is case-insensitive — assert the documented choice.
  [API-054] `?lowOnly=true` returns exactly the items with `totalQty <= reorderAt`; the id set equals the id set from
  `GET /api/reports/low-stock` at the same instant. [API-055] `?sort=sku` ascending, `?sort=-sku` descending; an
  unsupported `?sort=bogus` → `400` or ignored, deterministically. [API-056] `?pageSize=2&page=1` vs `page=2` return
  disjoint id sets, each ≤ 2 rows, with `total` identical across both calls. [API-057] Repeating the identical request
  twice returns identical ordering (stable sort — no non-deterministic tie-breaking).

### `GET /api/items/:id`
- **Happy path**: [API-058] `200` with the item fields plus `byLocation: [{locationId, locationName, qty}]`.
  [API-059] `sum(byLocation[].qty) === totalQty`, and that `totalQty` equals the value the same item shows in
  `GET /api/items`.
- **Validation failures**: [API-060] `:id` = `not-a-uuid` → `400` or `404` (assert one), never `500`.
- **Auth failures**: [API-061] No token → `401`. [API-062] Clerk token → `200` (read is not manager-gated).
- **Idempotency / edge cases**: [API-063] Well-formed but unknown uuid → `404`. [API-064] Item with no stock anywhere →
  `200`, `byLocation: []`, `totalQty: 0`.

### `POST /api/items`
- **Happy path**: [API-065] MANAGER, `{sku:'SKU-T01', name:'Test Widget', unit:'ea', reorderAt:10, description:'d'}` →
  `201` with a uuid `id`, `totalQty: 0`; a follow-up `GET /api/items?q=SKU-T01` returns exactly it.
  [API-066] `description` omitted → `201` with `description` null/absent (it is optional).
- **Validation failures**: [API-067] Missing `sku` → `400` naming `sku`. [API-068] Missing `name` → `400`.
  [API-069] Missing `unit` → `400`. [API-070] `reorderAt: -1` → `400`. [API-071] `reorderAt: 1.5` → `400`
  (integer only). [API-072] `reorderAt: '10'` → transformed to number `10` and `201` (`transform:true`), or `400` —
  assert the DTO's one behaviour. [API-073] `sku: ''` → `400`. [API-074] Unknown field `totalQty: 999` is stripped by
  `whitelist:true`; the created item's `totalQty` is `0`.
- **Auth failures**: [API-075] No token → `401`. [API-076] Clerk token → `403` (and no row is created).
  [API-077] ADMIN token → `201` (admin inherits manager).
- **Idempotency / edge cases**: [API-078] **Duplicate SKU**: POST the same `sku` twice → second response is `409`
  (`422` acceptable) carrying a field-level error keyed on `sku`, not a raw Prisma `P2002` dump or a `500`; the DB holds
  exactly **one** row with that sku.

### `PATCH /api/items/:id`
- **Happy path**: [API-079] MANAGER updates `{name:'Renamed', reorderAt:25}` → `200` with the new values; `sku`,
  `unit` and `description` are unchanged. [API-080] Partial update of a single field leaves all others intact.
- **Validation failures**: [API-081] `reorderAt: -5` → `400`. [API-082] `reorderAt: 'x'` → `400`.
  [API-083] Empty body `{}` → `200` no-op or `400` — assert one deterministic behaviour.
  [API-084] Unknown field `totalQty: 5` stripped; recomputed `totalQty` is unaffected.
- **Auth failures**: [API-085] No token → `401`. [API-086] Clerk token → `403` and the row is unchanged.
- **Idempotency / edge cases**: [API-087] PATCH `sku` to another existing item's sku → `409` with a `sku` field error;
  **both** rows are left unchanged. [API-088] Unknown id → `404`. [API-089] Applying the same PATCH twice yields an
  identical final row.

### `DELETE /api/items/:id`
- **Happy path**: [API-090] MANAGER deletes an item with zero stock and zero movements → `204`/`200`; a subsequent
  `GET /api/items/:id` → `404` and it is absent from `GET /api/items`.
- **Validation failures**: [API-091] `:id` malformed → `400`/`404`, never `500`.
- **Auth failures**: [API-092] No token → `401`. [API-093] Clerk token → `403` and the item still exists.
- **Idempotency / edge cases**: [API-094] **Blocked — stock**: item with any `StockLevel.qty > 0` → `409`/`422` with a
  message naming stock; the item and its stock rows are untouched. [API-095] **Blocked — history**: item at qty 0
  everywhere but with ≥1 `Movement` row → `409`/`422`; the item and its `Movement` rows survive (audit history is never
  cascade-deleted). [API-096] Unknown id → `404`. [API-097] Deleting the same id twice → second call `404`.

### `GET /api/locations`
- **Happy path**: [API-098] Clerk token → `200`, array of `{id, name, zone}`; includes every location created in
  fixtures.
- **Validation failures**: n/a.
- **Auth failures**: [API-099] No token → `401`.
- **Idempotency / edge cases**: [API-100] With no locations at all → `200` `[]`, not `404` (movement form must render
  an empty-picker state).

### `POST /api/locations`
- **Happy path**: [API-101] MANAGER, `{name:'Zone T', zone:'T'}` → `201` with uuid `id`; it appears in
  `GET /api/locations`.
- **Validation failures**: [API-102] Missing `name` → `400`. [API-103] Missing `zone` → `400`.
  [API-104] `name: ''` → `400`. [API-105] Unknown field stripped by whitelist.
- **Auth failures**: [API-106] No token → `401`. [API-107] Clerk → `403`, no row created. [API-108] ADMIN → `201`.
- **Idempotency / edge cases**: [API-109] Duplicate `name` (`Location.name @unique`, required for seed idempotency) →
  `409` with a `name` field error; exactly one row with that name.

### `PATCH /api/locations/:id`
- **Happy path**: [API-110] MANAGER renames a location → `200` with the new `name`/`zone`; stock held there is
  unaffected (`GET /api/items/:id` byLocation qty unchanged, `locationName` updated).
- **Validation failures**: [API-111] `name: ''` → `400`. [API-112] Empty body → deterministic `200` no-op or `400`.
- **Auth failures**: [API-113] No token → `401`. [API-114] Clerk → `403`.
- **Idempotency / edge cases**: [API-115] Rename to an existing other location's name → `409`, `name` field error,
  both rows unchanged. [API-116] Unknown id → `404`.

### `DELETE /api/locations/:id`
- **Happy path**: [API-117] MANAGER deletes a location holding no stock → `204`/`200`; absent from `GET /api/locations`.
- **Validation failures**: [API-118] Malformed id → `400`/`404`, never `500`.
- **Auth failures**: [API-119] No token → `401`. [API-120] Clerk → `403`, location survives.
- **Idempotency / edge cases**: [API-121] **Blocked**: location with any `StockLevel.qty > 0` → `409`/`422` with a
  message the UI can display; the location and the stock survive. [API-122] Location with only zero-qty `StockLevel`
  rows → allowed, and those rows cascade away without touching `Movement` history. [API-123] Unknown id → `404`.
  [API-124] Delete twice → second `404`.

### `POST /api/movements`
- **Happy path**: [API-125] **IN**: clerk token, `{type:'IN', itemId:I, toLocId:A, qty:50}` → `201`; `GET /api/items/:I`
  shows `A: 50`, `totalQty: 50`; the created `Movement.userId` is the **calling clerk**, not a body-supplied id.
  [API-126] **OUT**: `{type:'OUT', itemId:I, fromLocId:A, qty:20}` against 50 → `201`; balance `A: 30`.
  [API-127] **TRANSFER**: `{type:'TRANSFER', itemId:I, fromLocId:A, toLocId:B, qty:10}` against `A:30` → `201`;
  `A: 20`, `B: 10`, `totalQty` still `30`. [API-128] Optional `note` is persisted and returned in
  `GET /api/movements`. [API-129] IN to a location with no existing `StockLevel` row creates it via upsert at exactly
  `qty` (one row, not two).
- **Validation failures**: [API-130] `IN` with `fromLocId` supplied → `400`/`422`. [API-131] `IN` without `toLocId` →
  `400`/`422`. [API-132] `OUT` with `toLocId` supplied → `400`/`422`. [API-133] `OUT` without `fromLocId` →
  `400`/`422`. [API-134] `TRANSFER` missing `toLocId` → `400`/`422`. [API-135] `TRANSFER` missing `fromLocId` →
  `400`/`422`. [API-136] `TRANSFER` with `fromLocId === toLocId` → `400`/`422` with a "must differ" message.
  [API-137] `type:'MOVE'` (not in the enum) → `400`. [API-138] `qty: 0` → `400`. [API-139] `qty: -5` → `400`.
  [API-140] `qty: 1.5` → `400`. [API-141] `qty` missing → `400`. [API-142] `qty: '10'` → coerced to `10` and `201`, or
  `400` — one deterministic behaviour. [API-143] Unknown `itemId` (valid uuid) → `404`/`422`, never `500`.
  [API-144] Unknown `toLocId`/`fromLocId` → `404`/`422`, never a foreign-key `500`. [API-145] Body-supplied
  `userId:'<other user id>'` is stripped by whitelist; the row records the caller.
- **Auth failures**: [API-146] No token → `401`. [API-147] Clerk token → `201` — recording movements is **not**
  manager-gated (a `403` here is a defect).
- **Idempotency / edge cases**: [API-148] **Insufficient stock (OUT)**: balance 5, `OUT 10` → `422` "Insufficient
  stock"; balance is still exactly 5 **and** the `Movement` row count for that item is unchanged (the transaction
  aborts before the audit row is written). [API-149] **Insufficient stock (TRANSFER)**: balance `A:5`, transfer 10
  A→B → `422`; `A` still 5, `B` unchanged, no `Movement` row, and `B` is not created at qty 0 by a partial write.
  [API-150] `OUT` from a location with **no** `StockLevel` row at all → `422` (the conditional `updateMany` matches 0
  rows), no row created, no negative row created. [API-151] `OUT` of exactly the full balance (5 of 5) → `201`, leaving
  qty `0` (boundary of `qty: {gte: qty}`). [API-152] **Concurrency**: two `OUT 30` requests fired in parallel against a
  balance of 50 → exactly one `201` and one `422`; final balance `20`; exactly one new `Movement` row; the balance is
  never negative at any point. [API-153] **Immutability**: `PATCH /api/movements/:id`, `PUT /api/movements/:id` and
  `DELETE /api/movements/:id` all return `404`/`405` — no mutation path exists.

### `GET /api/movements`
- **Happy path**: [API-154] MANAGER → `200`; rows joined to `item.sku`/`item.name`, `fromLocation.name`,
  `toLocation.name`, `user.email` (`from`/`to` names are null for `IN`/`OUT` respectively, not the string "null").
  [API-155] `createdAt` is monotonically non-increasing across the page (desc order).
  [API-156] The paginated envelope matches `GET /api/items` (`{data,page,pageSize,total}`).
- **Validation failures**: [API-157] `?from=not-a-date` → `400`. [API-158] `?type=BOGUS` → `400`.
  [API-159] `?page=0` → `400` or clamped. [API-160] `?from` later than `?to` → `400` or an empty result set —
  deterministic, never `500`. [API-161] `?itemId=not-a-uuid` → `400`/empty, never `500`.
- **Auth failures**: [API-162] No token → `401`. [API-163] **Clerk token → `403`** (the audit log is manager-only).
  [API-164] MANAGER → `200`; [API-165] ADMIN → `200`.
- **Idempotency / edge cases**: [API-166] `?itemId=I` returns only rows for `I`. [API-167] `?type=OUT` returns only
  `OUT` rows. [API-168] `?userId=U` returns only `U`'s rows. [API-169] Date range: with movements stamped day-1,
  day-5 and day-9, `?from=day-3&to=day-7` returns only the day-5 row; boundary inclusivity (`from`/`to` inclusive) is
  asserted explicitly with a movement stamped exactly at `from`. [API-170] Combined `?itemId=I&type=OUT` returns the
  intersection, not the union. [API-171] `?page=1` and `?page=2` at `pageSize=2` are disjoint with a constant `total`.
  [API-172] Filters matching nothing → `200` `{data: []}`, not `404`.

### `GET /api/reports/low-stock`
- **Happy path**: [API-173] MANAGER → `200` array of `{itemId, sku, name, totalQty, reorderAt, shortfall}`.
  [API-174] Every returned row satisfies `totalQty <= reorderAt` and `shortfall === reorderAt - totalQty`.
  [API-175] Rows are sorted by `shortfall` **descending**.
- **Validation failures**: n/a (no inputs).
- **Auth failures**: [API-176] No token → `401`. [API-177] Clerk → `403`. [API-178] MANAGER → `200`.
  [API-179] ADMIN → `200`.
- **Idempotency / edge cases**: [API-180] **Spec scenario**: an item at total `7` with `reorderAt 10` **is** present
  with `shortfall 3`; an item at total `40` with `reorderAt 10` is **absent**. [API-181] Boundary: `totalQty === 
  reorderAt` (e.g. 10 vs 10) **is** included, with `shortfall 0` (predicate is `<=`, not `<`). [API-182] An item with
  no `StockLevel` rows at all is treated as `totalQty 0` and included (documents the outer-join behaviour rather than
  silently dropping it). [API-183] `totalQty` here equals the `totalQty` the same item reports in `GET /api/items`.
  [API-184] Nothing low → `200` `[]`, not `404` (drives the UI empty state).

### `GET /api/admin/settings`
- **Happy path**: [API-185] ADMIN → `200` with one entry per provisioned service key covering **postgresql**, **minio**
  and **llm**; each entry is `{key, value (masked or null), configured: boolean}`.
  [API-186] `configured: true` only when a real value is present.
- **Validation failures**: n/a.
- **Auth failures**: [API-187] No token → `401`. [API-188] Clerk → `403`. [API-189] **MANAGER → `403`** (admin-only,
  stricter than the manager routes). [API-190] ADMIN → `200`.
- **Idempotency / edge cases**: [API-191] **Secret masking**: the full raw value of a configured key (e.g. the complete
  `DATABASE_URL` or minio secret) does **not** appear anywhere in the response body; only a mask (e.g. `••••1234`) or
  null. [API-192] A key whose value is absent **or** equals the sentinel `PLACEHOLDER_CONFIGURE_IN_SETTINGS` reports
  `configured: false`.

### `PATCH /api/admin/settings`
- **Happy path**: [API-193] ADMIN, `{entries:[{key:'MINIO_ACCESS_KEY', value:'abc123'}]}` → `200`; a subsequent `GET`
  shows that key `configured: true` with a masked value.
- **Validation failures**: [API-194] `entries: []` → `400` or `200` no-op — deterministic. [API-195] `{key}` with no
  `value` → `400`. [API-196] `value: 12345` (non-string) → `400`. [API-197] Unknown/unlisted key → `400` (rejected) or
  accepted per the documented allowlist — one deterministic behaviour, never `500`. [API-198] Malformed body (not an
  object) → `400`.
- **Auth failures**: [API-199] No token → `401`. [API-200] Clerk → `403` and no `SystemSetting` row is written.
  [API-201] MANAGER → `403`.
- **Idempotency / edge cases**: [API-202] The same PATCH applied twice leaves exactly **one** `SystemSetting` row for
  that key (upsert, not insert) with a bumped `updatedAt`. [API-203] **`resolveConfig` precedence**: with a real env
  var set *and* a differing `SystemSetting` row present, `resolveConfig(key)` returns the **env** value.
  [API-204] With the env var unset (or equal to `PLACEHOLDER_CONFIGURE_IN_SETTINGS`), `resolveConfig` returns the
  stored row's value. [API-205] With neither set, `resolveConfig` returns `null` and any endpoint depending on that
  service surfaces `ServiceUnconfiguredError` as HTTP `503` (not `500`).

### Legacy scaffold surface (the three routes actually listed in `surface.json`)

These exist in the scaffold today and are listed in `surface.json`; they are **not** part of the StockRoom spec. They
are tested as a contract/regression boundary, and the pipeline must decide (open question in `tasks.md`) whether to
keep or delete the tRPC layer.

#### `GET /health`
- **Happy path**: [API-206] Before the global `api` prefix lands, `GET /health` → `200`. After `setGlobalPrefix('api')`,
  `GET /api/health` → `200`; assert **exactly one** of the two paths serves the check and that `surface.json` and the
  k8s probe paths agree with whichever it is.
- **Validation failures**: n/a.
- **Auth failures**: [API-207] Public on whichever path it resolves to — never `401`.
- **Idempotency / edge cases**: [API-208] Deploy-config drift guard: the readiness/liveness probe path used by the
  k8s manifests and by `colossus.yaml` (`backend.port: 3001`, while the spec/Dockerfile assume `3000`) resolves to a
  `200` at the port the container actually listens on.

#### `GET /trpc/users.findAll`
- **Happy path**: [API-209] If the tRPC layer is retained, an authorised call returns `200` with the tRPC envelope and
  a JSON array of users.
- **Validation failures**: n/a (no input).
- **Auth failures**: [API-210] **Highest-risk legacy case** — an *unauthenticated* call must not return user rows.
  Expect `401` (route brought under the global guard) or `404` (layer removed). A `200` returning the user table is a
  security defect and fails the suite.
- **Idempotency / edge cases**: [API-211] If retained and reachable, no element contains `passwordHash` (the scaffold
  returns raw Prisma `User` rows, which include it — this must be projected away or the route removed).

#### `GET /trpc/users.findById`
- **Happy path**: [API-212] Retained + authorised, valid uuid → `200` with a single user object (or `null` for an
  unknown id), never containing `passwordHash`.
- **Validation failures**: [API-213] `id` that is not a uuid → `400` from the zod input schema, never `500`.
- **Auth failures**: [API-214] Unauthenticated → `401` or `404`, never a `200` exposing a user record.
- **Idempotency / edge cases**: [API-215] If the layer is deleted, `GET /trpc/users.findById` → `404` **and**
  `.pipeline/surface.json` no longer lists it (manifest/reality drift check).

## UI / journey tests

Selectors: prefer `data-testid`. `.colossus-acceptance.json` requires `data-testid="app-ready"` on the rendered shell
and currently lists stale `reject_signatures` (`home-title">Users<`, `Loading...`, `Failed to load users.`) — every
journey asserts none of those template strings appear.

### Journey: Unauthenticated smoke — the `StockRoom` brand oracle
- **Steps**: 1) Clear `localStorage`. 2) Navigate to `/` (base href included). 3) Wait for network idle.
- **Expected outcomes**: URL settles on `/login` (with or without `?returnUrl=`); the DOM contains the literal text
  `StockRoom`; `document.title` contains `StockRoom`; the string is present in the served `index.html` **before**
  Angular bootstraps (assert against the raw HTTP response body of `/`, not just the rendered DOM — this is the
  redirect-timing mitigation the spec calls out); `data-testid="app-ready"` is present; the page is the SPA, not an
  nginx directory listing (no `Index of /` text).
- **Negative path**: With the API container stopped, `/` still renders the login view and the brand (the shell must not
  blank out on a failed bootstrap XHR); an inline error is acceptable, a white screen is not.

### Journey: Sign in as a clerk-level user
- **Steps**: 1) `/login`. 2) Type the clerk email + password (from `COLOSSUS_ACCOUNTS_JSON`). 3) Submit.
- **Expected outcomes**: URL becomes `/items`; the shell header shows the brand and the signed-in email; a token is
  present in `localStorage` under a single key; nav shows **Items** and **New movement** and **hides** Movements (audit
  log), Low stock and Admin settings.
- **Negative path**: Wrong password → stays on `/login`, an inline error is rendered (no browser alert, no unhandled
  console error), no token is written to `localStorage`, and the password field is cleared or retained per design but
  never echoed into the URL.

### Journey: Sign in as a manager
- **Steps**: 1) `/login`. 2) Enter manager credentials. 3) Submit.
- **Expected outcomes**: Lands on `/items`; nav additionally shows **Movements**, **Locations** and **Low stock**;
  Items list shows manager-only actions (New item, Edit, Delete).
- **Negative path**: Submitting with an empty email or password shows inline required-field errors and issues **no**
  network request.

### Journey: Sign up a new account
- **Steps**: 1) `/signup`. 2) Enter a fresh email + password. 3) Submit.
- **Expected outcomes**: Auto-authenticated and redirected to `/items`; the new session is clerk-level (no manager nav);
  the brand renders on the signup page too.
- **Negative path**: Re-submitting the same email → inline field error on `email` (surfaced from the API `409`), the
  user stays on `/signup`, and no token is stored.

### Journey: Browse, search, filter and paginate the item catalogue
- **Steps**: 1) Signed in as clerk, go to `/items`. 2) Type a SKU into the search box. 3) Toggle **Low stock only**.
  4) Click a column header to sort. 5) Page forward.
- **Expected outcomes**: The table shows SKU, name, unit, reorderAt and total on hand; each interaction writes its
  state into the URL query string (`?q=`, `?lowOnly=true`, `?sort=`, `?page=2`) via `router.navigate`, and a full page
  reload of that URL reproduces the identical table (deep-linkable). Loading and empty states render distinctly.
- **Negative path**: A search matching nothing shows an explicit empty state (not a spinner, not the stale previous
  rows, not the template string `Failed to load users.`); with the API returning `500`, an inline error state renders
  with a retry affordance.

### Journey: Inspect an item's stock breakdown and history
- **Steps**: 1) From `/items`, click a row. 2) On `/items/:id`, read the per-location table. 3) Click the **History**
  tab. 4) Reload the page on `?tab=history`.
- **Expected outcomes**: The per-location quantities **sum to the total on hand shown on the list page** for the same
  item; the tab state lives in `?tab=stock|history` and survives reload; the history tab lists that item's movements
  newest-first with type, qty, from/to and user.
- **Negative path**: Navigating to `/items/<unknown-uuid>` renders a not-found state, not a crash or an infinite
  spinner.

### Journey: Manager creates an item, including the duplicate-SKU rejection
- **Steps**: 1) Manager → `/items/new`. 2) Fill sku/name/unit/reorderAt. 3) Save. 4) Create a second item reusing the
  same SKU. 5) Save.
- **Expected outcomes**: First save redirects to the list (or detail) and the new item is visible with total on hand 0.
  The second save keeps the user on the form and renders the server's duplicate-SKU error **inline on the `sku`
  field** — not a toast-only, not a raw `P2002`/stack trace — and the list still contains exactly one row with that SKU.
- **Negative path**: `reorderAt: -1` and a blank `name` are blocked client-side with inline messages and no request is
  sent; submitting while offline surfaces a form-level error and does not silently discard the input.

### Journey: Manager edits and deletes an item (delete blocked by stock/history)
- **Steps**: 1) `/items/:id/edit`, change the name, save. 2) Return to the list, click Delete on an item that holds
  stock — the confirm opens as `?modal=delete&id=`. 3) Confirm. 4) Repeat on a clean, stock-free, movement-free item.
- **Expected outcomes**: The edit persists and is reflected in the list. The confirm dialog's open state is URL-driven
  (reloading the `?modal=delete&id=` URL re-opens it; Back closes it). Deleting the stocked item shows the server's
  "cannot delete — stock exists" message and the row remains. Deleting the clean item removes the row.
- **Negative path**: Cancelling the dialog clears the `modal` query params and deletes nothing.

### Journey: Manager manages locations
- **Steps**: 1) `/locations`. 2) `/locations/new`, create `Zone T`. 3) Edit its zone. 4) Attempt to delete a location
  that holds stock. 5) Delete an empty location.
- **Expected outcomes**: Create/edit persist and are listed. The stocked-location delete is refused with a readable
  inline message and the location survives; the empty one is removed.
- **Negative path**: Creating a second location with the same name shows an inline `name` error; a clerk navigating
  directly to `/locations/new` is redirected away (see the role-gating journey).

### Journey: Record IN / OUT / TRANSFER movements, including insufficient stock
- **Steps**: 1) Clerk → `/movements/new`. 2) Choose type **IN**, pick item + destination, qty 50, submit. 3) Switch to
  **OUT**, qty 20, submit. 4) Switch to **TRANSFER**, from A to B, qty 10, submit. 5) Attempt an **OUT** of 10 against
  a balance of 5.
- **Expected outcomes**: The form shows only the destination field for IN, only the source field for OUT, and both for
  TRANSFER, switching live with the type selector; each success confirms and the item detail reflects 50 → 30 →
  (A 20 / B 10) with the **total unchanged by the transfer**. The over-draw attempt renders "Insufficient stock"
  **inline** on the form, the user stays on the form with their input intact, and the item's balance is still 5.
- **Negative path**: Selecting the same location as both source and destination for a TRANSFER blocks submission with a
  "must differ" message; qty 0 / negative / decimal is rejected inline; prefill from
  `/movements/new?type=OUT&itemId=…&fromLocId=…` populates the form correctly on load.

### Journey: Manager filters the movement audit log
- **Steps**: 1) Manager → `/movements`. 2) Filter by item. 3) Add a type filter. 4) Set a date range. 5) Page forward.
  6) Reload the resulting URL.
- **Expected outcomes**: The table shows date, type, item, from, to, qty, user and note, newest-first; every filter is
  reflected in `?itemId=&type=&from=&to=&page=` and the reloaded URL reproduces the same filtered rows; combined
  filters intersect.
- **Negative path**: A filter combination matching nothing renders an explicit "no movements match" empty state; there
  is **no** edit or delete control on any audit row (movements are immutable).

### Journey: Manager reads the low-stock report
- **Steps**: 1) Manager → `/reports/low-stock` (via nav).
- **Expected outcomes**: Table of item, total on hand, reorder point and shortfall, sorted by shortfall descending;
  the rows match `GET /api/reports/low-stock`; an item at 7 with reorder point 10 is listed, a 40-unit item is not.
- **Negative path**: When nothing is below threshold the page shows an explicit "nothing is low on stock" empty state
  (the spec's seed-driven "non-empty on first load" expectation cannot hold under the essential-only scaffold seed, so
  the empty state is the required behaviour, not a bug).

### Journey: Admin configures service credentials
- **Steps**: 1) Sign in as admin. 2) Nav → `/admin/settings`. 3) Read the banner. 4) Fill the minio credential form.
  5) Save. 6) Reload.
- **Expected outcomes**: One card per provisioned service (**postgresql**, **minio**, **llm**), each with a
  configured/unconfigured badge; a prominent banner lists every still-unconfigured service in the form
  "The following need credentials to activate: …"; after saving, the minio badge flips to configured, the banner drops
  minio, and the value renders masked (the raw secret is never displayed or present in the page source) — all of which
  survives reload.
- **Negative path**: Saving an empty value shows an inline error; the banner disappears entirely only when every
  service is configured.

### Journey: Role gating — nav hiding *and* direct-URL enforcement
- **Steps**: For each of clerk, manager and admin: 1) inspect the nav; 2) type each manager/admin-only URL directly
  into the address bar (`/movements`, `/locations`, `/locations/new`, `/reports/low-stock`, `/items/new`,
  `/items/:id/edit`, `/admin/settings`).
- **Expected outcomes**: Clerk sees no Movements/Locations/Low-stock/Admin links, and direct navigation to each is
  refused by `roleGuard` (redirect to `/items` or a forbidden view) — never a rendered manager screen and never a
  blank page. Manager reaches all manager routes but is refused `/admin/settings`. Admin reaches everything.
- **Negative path**: Hand-editing `localStorage` to claim `role: 'ADMIN'` may unhide the nav links, but the underlying
  API calls still return `403` and the screen renders an error rather than data — the server is the real enforcement.

### Journey: Session expiry and logout
- **Steps**: 1) Sign in. 2) Corrupt/expire the stored token. 3) Trigger a data request (e.g. reload `/items`).
  4) Separately: sign in, click Logout.
- **Expected outcomes**: The 401 interceptor clears the session and redirects to `/login?returnUrl=%2Fitems`; signing in
  from there returns the user to `/items`. Logout clears the token key from `localStorage` and lands on `/login`;
  pressing Back does not restore an authenticated screen with data.
- **Negative path**: After logout, navigating directly to `/items` redirects to `/login`, not a flash of the
  authenticated shell populated with the previous user's rows.

### Journey: Full-stack build gate
- **Steps**: 1) `docker compose up --build` from a clean checkout (no `node_modules`, no images). 2) Wait for
  readiness. 3) `curl` the API health endpoint. 4) `curl` the root page. 5) Deep-link directly to `/items/…` .
- **Expected outcomes**: Both images build (Prisma client generation runs **before** the Nest build); the health/deep
  endpoint returns `200`; the root page returns the SPA HTML containing `StockRoom`; the deep link returns the SPA
  (nginx `try_files … /index.html`), not a `404`; `/api/*` is proxied to the API from the same origin (no CORS error
  in the console).
- **Negative path**: The root page must not be an nginx **directory listing** — the Angular output path
  (`dist/<app>/browser`, and `colossus.yaml` says `dist/frontend/browser` while the spec says `dist/stockroom-web`)
  must match what the Dockerfile copies. A directory listing or an empty page fails the gate.

## Data integrity tests

Each assertion snapshots the relevant DB state before the mutation and re-reads it after (direct SQL, not the API,
where the invariant is about storage).

- [DATA-01] **Non-negative stock**: after every movement in the suite, `SELECT min(qty) FROM "StockLevel"` is `>= 0`.
  No code path may produce a negative quantity.
- [DATA-02] **IN conservation**: an `IN` of `q` increases `SUM(qty)` for that item by exactly `q` and appends exactly
  one `Movement` row.
- [DATA-03] **OUT conservation**: an `OUT` of `q` decreases the item's `SUM(qty)` by exactly `q`, and decreases it only
  at `fromLocId`.
- [DATA-04] **TRANSFER conservation**: a transfer leaves the item's `SUM(qty)` across all locations **unchanged**;
  source `-q`, destination `+q`, no other row touched.
- [DATA-05] **Atomic rejection**: after a rejected movement (insufficient stock *or* DTO validation failure), the
  `Movement` row count and every `StockLevel.qty` are byte-identical to the pre-request snapshot — no partial write,
  no orphaned zero-qty destination row.
- [DATA-06] **Append-only audit**: the `Movement` row count is monotonically non-decreasing across the whole suite;
  no endpoint updates or deletes a `Movement`; `Movement.createdAt` and `userId` are never rewritten.
- [DATA-07] **StockLevel uniqueness**: repeated `IN`s for the same `(itemId, locationId)` mutate one row; the DB has at
  most one row per pair (`@@unique([itemId, locationId])` holds after every test).
- [DATA-08] **SKU uniqueness**: after a duplicate-SKU create *and* a duplicate-SKU PATCH,
  `SELECT count(*) FROM "Item" WHERE sku = ?` is exactly 1.
- [DATA-09] **Location name uniqueness**: after a duplicate-name create, exactly one row holds that name (this is what
  makes seed re-runs idempotent).
- [DATA-10] **Breakdown consistency**: for every item, `sum(byLocation.qty)` from `GET /api/items/:id` equals `totalQty`
  from `GET /api/items`, which equals `SELECT SUM(qty) FROM "StockLevel" WHERE "itemId" = ?`.
- [DATA-11] **Low-stock predicate fidelity**: the id set from `GET /api/reports/low-stock` equals the id set from a
  direct `SELECT i.id FROM "Item" i LEFT JOIN "StockLevel" s ON s."itemId"=i.id GROUP BY i.id
  HAVING COALESCE(SUM(s.qty),0) <= i."reorderAt"` — same rows, no off-by-one at the `<=` boundary.
- [DATA-12] **Delete guards preserve history**: a blocked item/location delete leaves the entity, its `StockLevel` rows
  and all referencing `Movement` rows intact; an allowed delete never cascades away `Movement` rows (audit history
  outlives the catalogue entity).
- [DATA-13] **Password storage**: every `User.passwordHash` matches `^\$2[aby]?\$` (bcrypt) and equals no plaintext in
  the fixtures; `SELECT` over the table finds no column containing a test password verbatim.
- [DATA-14] **No secret leakage**: the concatenated JSON of every response captured by the suite contains neither the
  substring `passwordHash` nor any fixture password nor a `$2`-prefixed hash.
- [DATA-15] **SystemSetting cardinality**: at most one row per `key` after repeated PATCHes; `updatedAt` advances on
  each write.
- [DATA-16] **Seed idempotency**: running `node prisma/seed/seed.js` twice against a populated DB leaves the row counts
  of `colossus_accounts`, `User`, `Location` and `Item` unchanged, and re-asserts the platform account hashes so the
  platform-held passwords still authenticate afterwards.
- [DATA-17] **Role integrity**: no signup or PATCH path can produce a `MANAGER`/`ADMIN` row other than the
  empty-table bootstrap rule and the `COLOSSUS_ACCOUNTS_JSON` materialisation; assert the admin/manager row count is
  unchanged after the whole suite except where a test deliberately bootstraps one.
- [DATA-18] **Movement referential integrity**: every `Movement` row has a resolvable `itemId` and `userId`, and its
  `fromLocId`/`toLocId` nullability matches its `type` (`IN`: from is null; `OUT`: to is null; `TRANSFER`: both set
  and different).

## Out of scope

- **The Prisma 7 / NestJS 11 / Angular 22 / `bcrypt` upgrade.** The scaffold ships Prisma 6 (`prisma-client-js`),
  Angular 19 and `bcryptjs`; `tasks.md` records this as an open question and targets the installed versions. Tests
  assert behaviour, not package versions, and no test asserts the `prisma-client` generator, the
  `src/generated/prisma` output path or `moduleFormat = "cjs"`.
- **Literal `manager@demo` / `clerk@demo` / `Demo1234!` accounts.** The scaffold seed forbids demo users; credentials
  come from `COLOSSUS_ACCOUNTS_JSON`. If the pipeline later mandates the literal accounts, add login cases for them.
- **Seeded catalogue data (`SKU-001`…`SKU-008`, `Zone A/B/C`) and a non-empty low-stock report on first load.** The
  shipped seed is essential-only and the build gate flags unguarded fixtures, so tests create their own data and the
  low-stock empty state is treated as correct.
- **minio and llm feature behaviour.** Only the credential plumbing (`/api/admin/settings`, `resolveConfig`, the
  unconfigured banner) is specified; no object-storage or LLM feature exists to test.
- **k8s manifests, Ingress, the Colossus deploy workflow and `baseHref` substitution.** Not exercised beyond the local
  `docker compose` build gate. The `colossus.yaml` drift (`backend.port: 3001` and `dist/frontend/browser` vs the
  spec's `3000` and `dist/stockroom-web/browser`) is flagged in API-208 / the build-gate journey but its resolution is
  a deploy-config decision, not a test outcome.
- **CORS.** Single-origin nginx deployment; the scaffold's `enableCors(FRONTEND_URL)` is only relevant to local
  `ng serve` and is not asserted.
- **Token refresh, server-side revocation/denylist, password reset, email verification, account lockout and rate
  limiting.** The spec defines none; API-042 pins the current stateless-logout behaviour so a future change is visible.
- **Swagger/OpenAPI document contents** at `/api/docs`.
- **Concurrency beyond the single documented double-`OUT` race (API-152).** No sustained load, soak or throughput
  testing; no multi-item or transfer-vs-transfer race matrix.
- **Accessibility (WCAG/ARIA/keyboard), internationalisation, responsive breakpoints, visual regression and the
  cross-browser matrix.** The spec is silent; journeys run in one Chromium target.
- **Performance budgets** (bundle size, TTI, query latency) beyond the two coarse timeouts in API-005 and the health
  checks.
- **The `nestjs-trpc` layer's own behaviour** beyond the three exposure/regression cases in §Legacy scaffold surface.
  Whether the layer is kept or deleted is an unresolved question in `tasks.md`; the tests only require that it does not
  leak user records and that `surface.json` matches whichever choice is made.
