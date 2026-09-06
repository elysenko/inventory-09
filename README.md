# StockRoom

Inventory management for a small warehouse: an item catalogue, per-location
stock levels, an immutable movement log (`IN` / `OUT` / `TRANSFER`) and a
low-stock report.

- `backend/` — NestJS 11 REST API on Prisma + PostgreSQL, JWT authenticated
- `frontend/` — Angular SPA, served by nginx which also reverse-proxies `/api`

## Running locally

```bash
# 1. Postgres
docker compose up -d postgres

# 2. API — http://localhost:3001/api (Swagger at /api/docs)
cd backend
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate deploy
node prisma/seed/seed.js      # materialises the platform logins
npm run start:dev

# 3. SPA — http://localhost:4200, proxying /api to the API
cd frontend
npm install
npx ng serve --proxy-config proxy.conf.json
```

## Accounts

Logins are platform-owned. `prisma/seed/seed.js` reads `COLOSSUS_ACCOUNTS_JSON`
from the environment and materialises one `colossus_accounts` row and one `User`
per entry, bcrypt-hashed exactly as the auth service verifies it. No credentials
are stored in this repository — Colossus provides the passwords for the
environment you are working against.

## Roles

| Role | Can do |
| --- | --- |
| `USER` / `CLERK` | Browse the catalogue and per-location stock; record movements |
| `MANAGER` | The above, plus manage items and locations, read the movement log and the low-stock report |
| `ADMIN` | The above, plus `/admin/settings` (service credentials) |

`ADMIN` satisfies every `MANAGER` requirement; the reverse is not true, so the
settings screen stays stricter than the management screens.

## API

Every route is under the `/api` prefix. Full, always-current reference:
`GET /api/docs`. Health endpoints are public — `/api/health` is liveness (no
dependencies) and `/api/health/deep` verifies the database and answers 503 when
it is unreachable.

## Deploying

`colossus.yaml` is the build manifest: the Angular output path, and the backend
build directory and port (3001, which the nginx `/api` upstream matches). The
deploy pipeline builds both Dockerfiles, runs `npx prisma migrate deploy` plus
the seed, and serves the SPA with the API behind the same origin.
