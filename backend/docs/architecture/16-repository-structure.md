# 16 — Repository Structure

Planned structure for the new `backend/` workspace. Only `docs/architecture/` exists today; everything below is a target layout, not yet created `[REPO]`.

## 1. Monorepo layout

```
employee-management-system-main/                 <- current working directory (outer)
├── package-lock.json                            <- existing empty lockfile (leave untouched until approved)
├── employee-management-system-main/             <- existing Git repo, React frontend (untouched in plan mode)
│   ├── apps/web/                                <- existing React app
│   └── docs/project-slides.html
└── backend/                                     <- NEW
    ├── docs/
    │   └── architecture/                        <- these planning deliverables
    ├── apps/
    │   └── api/                                 <- NestJS app (API + worker entrypoints)
    │       ├── src/
    │       │   ├── main.ts                      <- API bootstrap
    │       │   ├── worker.ts                    <- BullMQ worker bootstrap
    │       │   ├── app.module.ts
    │       │   ├── config/                      <- env schema + typed config
    │       │   ├── common/                      <- guards, filters, interceptors, decorators, pipes
    │       │   ├── prisma/                      <- PrismaService, seed scripts
    │       │   ├── platform/                    <- auth, tenancy, rbac, audit, outbox,
    │       │   │                                   approvals, notifications, idempotency, storage
    │       │   └── modules/                     <- organization, employees, contracts, documents,
    │       │                                       imports, recruiting, onboarding, offboarding,
    │       │                                       attendance, leave, payroll, performance,
    │       │                                       workforce, reporting
    │       ├── prisma/
    │       │   ├── schema.prisma
    │       │   ├── migrations/                   <- Prisma + numbered raw SQL migrations
    │       │   └── seeds/
    │       ├── test/                            <- e2e setup, fixtures, testcontainers helpers
    │       ├── Dockerfile
    │       └── package.json                     <- @peoplecore/api
    ├── packages/
    │   └── shared/                              <- @peoplecore/shared: DTO/interface types, enums,
    │                                               error codes, pagination types (no runtime deps)
    ├── docker/
    │   ├── docker-compose.yml
    │   ├── docker-compose.override.yml          <- optional local tweaks
    │   ├── Dockerfile.api                       <- or keep per-app Dockerfiles
    │   └── init/                                <- DB init scripts (roles/extensions)
    ├── tests/
    │   ├── e2e/                                 <- cross-module API suites (Supertest)
    │   ├── security/                            <- tenant isolation, authz, injection suites
    │   ├── load/                                <- k6 scripts (P1.5)
    │   └── fixtures/                            <- synthetic CSVs, keys, mock provider responses
    ├── .github/
    │   └── workflows/
    │       ├── ci.yml                           <- lint, typecheck, test, build, migration check
    │       ├── docker.yml                       <- image build/push
    │       └── deploy.yml                       <- staging/prod with migration gate
    ├── scripts/                                 <- repo-level dev helpers
    ├── .env.example
    ├── .gitignore
    ├── tsconfig.base.json
    ├── jest.config.base.js
    ├── eslint.config.mjs
    ├── package.json                             <- npm workspaces root
    └── package-lock.json
```

This satisfies the brief's required structure `[BRIEF]` (`apps/api`, `apps/web`, `packages/shared`, `docker`, `tests`, `.github`, root `package.json`) while keeping the existing frontend clone intact. The web app's eventual placement is decision D-07: either add `../employee-management-system-main/apps/web` as a workspace or move it into `backend/apps/web` in a separate approved change.

## 2. npm workspaces root

```jsonc
{
  "name": "peoplecore-backend",
  "private": true,
  "workspaces": ["apps/*", "packages/*", "tests"],
  "scripts": {
    "build": "npm run build -w @peoplecore/shared && npm run build -w @peoplecore/api",
    "dev": "npm run dev -w @peoplecore/api",
    "worker": "npm run worker -w @peoplecore/api",
    "lint": "eslint .",
    "typecheck": "tsc -b",
    "test": "jest --config jest.config.base.js",
    "test:e2e": "jest --config apps/api/test/jest-e2e.json",
    "prisma:generate": "prisma generate --schema apps/api/prisma/schema.prisma",
    "prisma:migrate": "prisma migrate dev --schema apps/api/prisma/schema.prisma",
    "prisma:deploy": "prisma migrate deploy --schema apps/api/prisma/schema.prisma",
    "prisma:seed": "ts-node apps/api/prisma/seeds/index.ts",
  },
  "engines": { "node": ">=22" },
  "devDependencies": {
    "typescript": "^5.9",
    "jest": "^30",
    "ts-jest": "^29",
    "eslint": "^9",
    "prettier": "^3",
  },
}
```

Exact dependency versions are pinned during P0.1-1; no packages are assumed installed today.

## 3. Module folder convention

```
apps/api/src/modules/<domain>/
├── <domain>.module.ts
├── controllers/<resource>.controller.ts
├── services/<resource>.service.ts
├── repositories/<resource>.repository.ts
├── policies/<resource>.policy.ts
├── dto/{create,update,list,response}-*.dto.ts
├── events/<domain>.events.ts
├── workers/<domain>.worker.ts          (only if the domain owns jobs)
└── tests/{unit,policy,e2e} specs
```

Platform modules use the same shape under `src/platform/<service>/`. Each module exports a facade from `index.ts`; cross-module imports only use that facade.

## 4. File ownership and change rules

| Area                          | Owner            | Notes                                                                 |
| ----------------------------- | ---------------- | --------------------------------------------------------------------- |
| `docs/architecture/`          | Architecture     | Any ADR/decision change updates the corresponding doc in the same PR. |
| `apps/api/prisma/migrations/` | Backend + DevOps | Migrations are immutable once merged.                                 |
| `packages/shared/`            | Backend          | Types only; no NestJS imports; versioned with the API.                |
| `docker/`, `.github/`         | DevOps           | Reviewed for secrets and supply-chain changes.                        |
| Existing `apps/web/`          | Frontend         | No changes in plan mode; integration tasks scheduled separately.      |

## 5. Naming conventions

- Files: `kebab-case.ts`; classes: `PascalCase`; DTOs suffixed `.dto.ts`; specs `.spec.ts` / `.e2e-spec.ts`.
- Database tables: snake_case plural; Prisma models: PascalCase singular; enums: snake_case values.
- Queue names: `<domain>.<action>`; event types: `<aggregate>.<past-tense-action>`; permissions: `<resource>.<action>`.
- Environment variables: `PC_` prefix (e.g. `PC_DATABASE_URL`, `PC_REDIS_URL`, `PC_JWT_PRIVATE_KEY`).
