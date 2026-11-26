# PEOPLECORE Backend

NestJS API for the PeopleCore employment management system. The backend is a Node workspace containing the API, shared contracts, and test utilities.

## Requirements

- Node.js `>=22 <25`
- npm
- PostgreSQL 14+ (or compatible)
- Redis is optional for local development; the API falls back to an in-memory cache when `PC_REDIS_URL` is empty

## Setup

From `backend/`:

```bash
npm install
cp .env.example .env
```

Update `.env` with a valid `DATABASE_URL` and replace all placeholder secrets. Never commit `.env`.

Prepare the database:

```bash
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
```

For local schema iteration, use `npm run prisma:migrate`. Applied migrations are forward-only; do not rewrite them.

## Run

```bash
npm run dev
```

The API listens on `PC_API_PORT` (default `3000`) and exposes `/api/v1`. Swagger is enabled when `PC_SWAGGER_ENABLED=true`.

Start the outbox worker separately:

```bash
npm run worker
```

Without Redis, the worker dispatches pending outbox events directly every 5 seconds. With Redis, it schedules BullMQ dispatch jobs.

## Deployment on Render (Supabase)

Set the Render service **Root Directory** to `backend` (this directory). Render injects environment variables; do not add a `.env` file to the service.

Copy both database strings from **Supabase Dashboard → Project Settings → Database → Connect → Session pooler** (port `5432`, pooler host). Do not use the `db.<ref>.supabase.co` direct host: it is IPv6-only and Render is IPv4-only without the IPv4 add-on. Percent-encode special characters in the password before pasting.

| Variable       | Purpose                                           |
| -------------- | ------------------------------------------------- |
| `DATABASE_URL` | Prisma Client runtime connection                  |
| `DIRECT_URL`   | Prisma CLI connection for `prisma migrate deploy` |

Both should be the same Session pooler string, copied verbatim (including any query parameters). Set all other variables from `.env.example` (JWT/CSRF secrets, cookie and CORS settings) in Render as well. In production, local `.env` files are ignored so Render's values always win.

- **Build command:** `npm ci && npm run build`
- **Start command:** `npm run start:prod`

`start:prod` applies existing migrations forward-only before starting the API; it never resets or recreates the database.

On startup the API writes `[database-diagnostics]` lines containing only whether `DATABASE_URL` is set, the parsed host, port, database name, whether the host is a Supabase pooler, and DNS/TCP results. Credentials and full URLs are never logged; use these lines to confirm Render received the pooler URL. In production (`NODE_ENV=production`) startup is refused if `DATABASE_URL` was not present before module loading, so a local `.env` cannot silently override Render's value.

## Build and verification

```bash
npm run build
npm run typecheck
npm run lint
npm run format:check
npm run security:secrets
npm test
npm run test:e2e
```

Latest executed results:

- `npm test`: 4 suites / 89 tests pass.
- `npm run test:e2e`: 4 suites / 33 tests pass against real PostgreSQL.
- `npm run typecheck`, `npm run lint`, `npm run prisma:validate`, `npm run format:check`, `npm run security:secrets`: pass.

## Workspace layout

```text
backend/
├── apps/api/
│   ├── prisma/                 # schema, migrations, seeds
│   ├── src/
│   │   ├── common/             # shared utilities and services
│   │   ├── modules/            # HR and business domain modules
│   │   ├── platform/           # auth, tenancy, cache, outbox, metrics
│   │   ├── app.module.ts
│   │   └── worker.ts
│   └── test/                   # e2e specs and Jest config
├── docs/architecture/          # architecture baseline documents
├── packages/shared/            # shared permissions and DTO contracts
├── scripts/                    # secret scanner and operational scripts
└── tests/                      # operational/load test assets
```

## Architecture notes

- Tenant context is set through `TenantGuard` and the Prisma tenant extension, backed by PostgreSQL RLS policies.
- Access tokens include a permission-version claim; cached principals are revalidated before use.
- Unknown-user login performs constant-work Argon2 verification.
- Business domains include approvals, notifications, leave, attendance, payroll, recruiting, and performance.
- Dashboard summaries include active employees, pending leave requests, today’s attendance, and open positions.
- Outbox events are retried with backoff and exposed through Prometheus counters.

Detailed architecture documents are in `docs/architecture/README.md`. Implementation evidence and remaining gaps are in `../docs/audit/PEOPLECORE_FINAL_IMPLEMENTATION_REPORT.md`.

## Operational limitations

- Docker Compose smoke verification is blocked on hosts without Docker CLI/Compose.
- `psql` and `redis-cli` are not required for local verification; Prisma/Jest and cache fallback are sufficient.
- Existing tenants may need seed rerun or explicit grants for newer permissions such as `dashboard.read`, `reports.read`, and leave/attendance permissions.
