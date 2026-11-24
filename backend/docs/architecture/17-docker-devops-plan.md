# 17 — Docker and DevOps Plan

Based on the PDF's deployment/observability guidance `[REF]`, the brief's stack `[BRIEF]`, and the frontend's expected local URL `[REPO]`.

## 1. Development Docker Compose

Services (all with health checks and named volumes):

| Service    | Image                            | Ports      | Purpose                                                                                      |
| ---------- | -------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `postgres` | `postgres:16`                    | 5432       | Primary DB; init scripts create `pc_app`, `pc_migrator`, `pc_reporter` roles and extensions. |
| `redis`    | `redis:7-alpine`                 | 6379       | Cache, rate limits, BullMQ queues.                                                           |
| `minio`    | `minio/minio`                    | 9000, 9001 | S3-compatible private object storage; bucket `peoplecore-docs` created at startup.           |
| `mailhog`  | `mailhog/mailhog`                | 1025, 8025 | Email capture for local notification testing.                                                |
| `api`      | built from `apps/api/Dockerfile` | 3000       | NestJS API + Swagger; depends on healthy postgres/redis/minio.                               |
| `worker`   | same image, different command    | —          | BullMQ workers; same env/volumes.                                                            |

Optional `web` service can run the existing Vite app on 5173 once D-07 is resolved; today the frontend is run from its own folder. `docker compose up --build` must bring the full backend stack healthy (P0.1-4).

Containers run as non-root, use multi-stage builds (`deps → build → runtime`), `.dockerignore` excludes `node_modules`, `dist`, `.env`, and images are pinned by digest in staging/prod.

## 2. Environment variable validation

Zod schema validated at bootstrap (`config/env.schema.ts`); the process fails fast with a redacted error listing missing keys.

| Variable                                                                                 | Example                                            | Required               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------- |
| `PC_NODE_ENV`                                                                            | `development`                                      | yes                    |
| `PC_PORT`                                                                                | `3000`                                             | yes                    |
| `PC_DATABASE_URL`                                                                        | `postgresql://pc_app:...@postgres:5432/peoplecore` | yes                    |
| `PC_DATABASE_MIGRATOR_URL`                                                               | migrator role URL                                  | CI/CD only             |
| `PC_REDIS_URL`                                                                           | `redis://redis:6379`                               | yes                    |
| `PC_S3_ENDPOINT`, `PC_S3_BUCKET`, `PC_S3_ACCESS_KEY`, `PC_S3_SECRET_KEY`, `PC_S3_REGION` | MinIO/S3 config                                    | yes                    |
| `PC_JWT_PRIVATE_KEY`, `PC_JWT_PUBLIC_KEY`                                                | EdDSA/RS256 key pair (base64 PEM)                  | yes                    |
| `PC_JWT_ISSUER`, `PC_JWT_AUDIENCE`                                                       | `peoplecore-api`, `peoplecore-web`                 | yes                    |
| `PC_ACCESS_TTL_SECONDS`                                                                  | `900`                                              | yes                    |
| `PC_REFRESH_TTL_DAYS`                                                                    | `7`                                                | yes                    |
| `PC_ENCRYPTION_KEY`                                                                      | AES-GCM key for PII fields                         | yes                    |
| `PC_COOKIE_SECRET`                                                                       | CSRF/HMAC secret                                   | yes                    |
| `PC_SMTP_URL`, `PC_MAIL_FROM`                                                            | Mailhog/provider                                   | yes                    |
| `PC_RATE_LIMIT_*`                                                                        | limits from doc 10                                 | optional with defaults |
| `PC_CORS_ORIGINS`                                                                        | `http://localhost:5173`                            | yes                    |
| `PC_LOG_LEVEL`                                                                           | `debug` / `info`                                   | optional               |

`.env.example` contains only placeholders. Secrets come from GitHub Secrets in CI and a secrets manager in staging/prod; no `.env` is copied into images.

## 3. Migration strategy in the pipeline

1. PR: `prisma format`, `prisma validate`, `prisma migrate diff --exit-code --from-migrations --to-schema-datamodel` — fails on drift or uncommitted schema changes.
2. Build: generate Prisma client, typecheck, run unit/integration tests against a fresh Postgres 16 service container.
3. Deploy (staging → production): dedicated migration job runs `prisma migrate deploy` with `pc_migrator`, then health-check gate, then rolling deploy of API/worker. Rollback = redeploy previous image; schema changes follow expand/contract (doc 09).
4. Production requires manual approval for destructive migrations; backups are taken immediately before deployment.

## 4. GitHub Actions

| Workflow     | Jobs                                                                                                                                                                                                                    | Triggers              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `ci.yml`     | `lint` (ESLint + Prettier check), `typecheck` (tsc -b), `unit` (Jest), `integration` (Jest + Postgres/Redis service containers), `migration-check`, `build` (npm run build), `openapi-diff`, `secret-scan`, `npm audit` | PR + push to main     |
| `docker.yml` | build API/worker images, scan with Trivy `[ASSUMPTION]`, push to registry with SHA tag                                                                                                                                  | push to main          |
| `deploy.yml` | `migrate` (gated), `deploy-staging`, smoke tests, manual approval, `deploy-production`, post-deploy health + alert check                                                                                                | release/tag or manual |

Branch protection requires all CI checks green. Dependabot weekly updates for npm, Docker and Actions.

## 5. Health checks

- `/health/live` — no dependency checks; used by container liveness probe.
- `/health/ready` — DB `SELECT 1`, Redis `PING`, object storage bucket head; readiness probe and deployment gate.
- Worker health: BullMQ queue connection + heartbeat key in Redis; unhealthy worker is restarted.
- Compose healthchecks gate `depends_on: condition: service_healthy`.

## 6. Observability

- **Logs:** Pino JSON to stdout, redaction paths for `password`, `token`, `authorization`, `*.Enc`, `salaryMinor`, `configEnc`. Every log includes `requestId`, `tenantId` (when known), `userId`, `correlationId`.
- **Metrics:** Prometheus endpoint on an internal port; HTTP duration/status, auth failures, outbox pending/published, queue depth/lag, job failures, DLQ depth, DB pool stats.
- **Tracing:** OpenTelemetry SDK with instrumentation for HTTP, Prisma and BullMQ; trace context propagated to workers `[REF]`.
- **Dashboards/alerts:** latency p95, 5xx rate, login-failure spike, outbox lag > 60 s, DLQ depth > 0, queue age, disk/connection saturation.
- Error responses carry `requestId` so support can correlate logs.

## 7. Environments

| Environment | Infrastructure                                | Data                                       | Access                 |
| ----------- | --------------------------------------------- | ------------------------------------------ | ---------------------- |
| Development | Docker Compose                                | Synthetic seeds                            | Local developers       |
| CI          | Ephemeral service containers                  | Fresh per job                              | GitHub Actions         |
| Staging     | Managed containers, managed Postgres/Redis/S3 | Anonymized copy of schema + synthetic data | Team + UAT             |
| Production  | Containers with HA Postgres and replicas      | Real tenant data                           | Restricted, JIT access |

## 8. Backup and recovery `[REF]`

- Postgres: automated base backups + WAL archiving for PITR; RPO ≤ 15 min, RTO ≤ 4 h `[ASSUMPTION]`.
- Object storage: versioning enabled, cross-region replication in production `[ASSUMPTION]`.
- Restore runbook: (1) declare incident, (2) isolate, (3) restore to scratch instance, (4) verify row counts/checksums, (5) promote, (6) replay outbox events if needed, (7) postmortem. Rehearsed in staging each release quarter `[ASSUMPTION]`.
- Backups encrypted; restore permissions limited to DevOps break-glass role; restore attempts audited.

## 9. Developer onboarding (P0.1-8)

Documented steps: clone → `npm install` → `cp .env.example .env` → `docker compose up -d` → `npm run prisma:deploy && npm run prisma:seed` → `npm run dev` → `npm run worker` → open Swagger at `http://localhost:3000/api/docs`. Target: new developer boots the stack in under 15 minutes `[REF]`.
