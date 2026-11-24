# 03 — Non-Functional Requirements

Every NFR includes a measurable target. Where the PDF gives no number, the target is marked `[ASSUMPTION]` and must be confirmed.

## NFR-1 — Security `[REF][BRIEF]`

| ID       | Requirement        | Target                                                                                                     |
| -------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| NFR-1.1  | Password hashing   | Argon2id, memory ≥ 64 MiB, iterations ≥ 3, parallelism 1–2 (tune on hardware).                             |
| NFR-1.2  | Access token       | JWT signed RS256/EdDSA, 15-minute lifetime, validated issuer/audience/tenant claim.                        |
| NFR-1.3  | Refresh token      | Opaque ≥ 256-bit, SHA-256 hash at rest, rotation on use, family revocation on reuse.                       |
| NFR-1.4  | Transport          | TLS 1.2+ in all non-local environments; HSTS; refresh cookie `HttpOnly; Secure; SameSite=Strict`.          |
| NFR-1.5  | Tenant isolation   | Zero cross-tenant reads/writes in automated tests; RLS enabled as defence-in-depth.                        |
| NFR-1.6  | Least privilege    | Separate Prisma/DB roles: app (CRUD + audit INSERT only), migrator (DDL), reporter (SELECT on read model). |
| NFR-1.7  | Encryption         | PII field-level encryption or vault; encrypted backups; envelope encryption keys from secrets manager.     |
| NFR-1.8  | Rate limiting      | Login 5/15min per IP+email; refresh 30/min per IP; forgot 10/hour per email `[ASSUMPTION]`.                |
| NFR-1.9  | Secrets            | No secret in source, logs, errors, or audit snapshots; automated secret scanning in CI.                    |
| NFR-1.10 | Audit immutability | Application role cannot UPDATE/DELETE audit, history, payroll snapshots, ledger rows.                      |
| NFR-1.11 | Dependency hygiene | `npm audit --omit=dev` high/critical = 0 on PR; weekly Dependabot. `[ASSUMPTION]`                          |

## NFR-2 — Performance `[REF][ASSUMPTION targets]`

| ID      | Requirement                                 | Target                                                                           |
| ------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| NFR-2.1 | API p95 latency, simple CRUD                | < 200 ms excluding network.                                                      |
| NFR-2.2 | API p95 latency, employee list with filters | < 400 ms for 100k employees in tenant.                                           |
| NFR-2.3 | Auth login p95                              | < 500 ms (Argon2id dominates).                                                   |
| NFR-2.4 | Outbox publish lag                          | p95 < 5 s; alert > 60 s.                                                         |
| NFR-2.5 | Background job retry                        | Exponential backoff base 5 s, max 5 attempts, DLQ after exhaustion.              |
| NFR-2.6 | Pagination                                  | Default 20, max 100; capped query cost; no unbounded list endpoints.             |
| NFR-2.7 | Scaling                                     | API and worker stateless; horizontal scale; read replicas for reporting `[REF]`. |

## NFR-3 — Availability and resilience `[REF]`

| ID      | Requirement                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------- |
| NFR-3.1 | Health endpoints: liveness (process), readiness (DB, Redis, object storage).                      |
| NFR-3.2 | Database backups with PITR, object storage versioning, documented and rehearsed restore runbooks. |
| NFR-3.3 | Circuit breakers around external providers; retries with jitter; DLQ with replay tooling.         |
| NFR-3.4 | Graceful shutdown: stop accepting jobs, drain BullMQ workers, close DB/Redis pools.               |
| NFR-3.5 | Migrations are forward-only, reversible via documented rollback, gated in CI/CD.                  |
| NFR-3.6 | Availability target 99.5% in year 1 `[ASSUMPTION]`; RPO ≤ 15 min, RTO ≤ 4 h `[ASSUMPTION]`.       |

## NFR-4 — Compliance and privacy `[REF][BRIEF]`

| ID      | Requirement                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| NFR-4.1 | Data minimization: collect only required fields; sensitive fields explicit and encrypted.                   |
| NFR-4.2 | Retention policies per document/resource class; legal hold flag blocks deletion.                            |
| NFR-4.3 | DSAR export/delete workflows designed for P7; data model must support them now (tenant + employee linkage). |
| NFR-4.4 | Payroll controls: maker-checker, segregation of duties, change audit, locked periods.                       |
| NFR-4.5 | Audit log captures access to sensitive records (data access log as part of AuditEvent metadata).            |
| NFR-4.6 | No PII in logs, traces, error messages, or queue payloads beyond opaque IDs `[ASSUMPTION]`.                 |

## NFR-5 — Observability `[REF][BRIEF]`

| ID      | Requirement                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------- |
| NFR-5.1 | Pino JSON logs with `requestId`, `tenantId`, `userId`, `correlationId`; redaction paths for secrets/PII. |
| NFR-5.2 | Metrics: HTTP latency/status, job failures, queue lag, payroll run status, approval SLA.                 |
| NFR-5.3 | OpenTelemetry tracing across API → worker → external calls `[REF]`.                                      |
| NFR-5.4 | Problem-details error responses include `requestId` for support correlation.                             |
| NFR-5.5 | Alerts on auth failure spike, outbox lag, DLQ depth, disk/connection saturation.                         |

## NFR-6 — Maintainability and testability `[REF][BRIEF]`

| ID      | Requirement                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| NFR-6.1 | Domain modules with explicit public interfaces; no cross-module repository access.                          |
| NFR-6.2 | Controllers thin; business logic in services; persistence in repositories; DI everywhere.                   |
| NFR-6.3 | Typecheck and lint clean on every commit; no `any` in new backend code (except generated/proxy boundaries). |
| NFR-6.4 | Unit-testable services with injected Prisma/clock/event bus; no hidden global state.                        |
| NFR-6.5 | Test coverage gates: 80% lines overall, 90% on auth, tenancy, lifecycle, permissions `[ASSUMPTION]`.        |
| NFR-6.6 | All accepted architecture decisions recorded in `docs/architecture/`; changes update docs in the same PR.   |

## NFR-7 — Compatibility `[REPO]`

| ID      | Requirement                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| NFR-7.1 | Backend listens on port 3000 in development and serves `/api/v1`.                                            |
| NFR-7.2 | Error body includes `detail` string (frontend `ApiError` contract).                                          |
| NFR-7.3 | Bearer JWT accepted from `Authorization` header; refresh cookie added without breaking existing header flow. |
