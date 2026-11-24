# 20 — Development Task Breakdown with Acceptance Criteria

Ticket IDs are stable and referenced in doc 19. Estimates: S ≤ 1 day, M 2–4 days, L > 4 days (planning estimates, not commitments). All tickets follow the Definition of Done in section 8.

## P0.1 — Project foundation

| ID     | Task                                                                                                                                  | Depends on     | Acceptance criteria                                                                                                                                        | Est |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| P0.1-1 | Repo bootstrap: root `backend/package.json` workspaces, shared/api packages, tsconfig, ESLint, Prettier, `.gitignore`, `.env.example` | D-06           | `npm install` from `backend/` succeeds; `npm run lint`, `npm run typecheck` run with no errors; Node 22 enforced via `engines`.                            | S   |
| P0.1-2 | API scaffold: NestJS app, global ValidationPipe, exception filter, Pino interceptor, Swagger, config schema                           | P0.1-1         | API starts on :3000; `/api/docs` renders; unknown field in request → 422; error body has `detail` + `requestId`; logs are JSON with correlation IDs.       | S   |
| P0.1-3 | Web scaffold wiring check: verify existing `apiClient` can call `/health/live`; no frontend code changes                              | P0.1-2         | Manual/from frontend folder: health call succeeds with `VITE_API_BASE_URL=http://localhost:3000/api/v1`; findings documented.                              | S   |
| P0.1-4 | Docker Compose: postgres 16, redis 7, minio, mailhog, api, worker; healthchecks; non-root images                                      | P0.1-2         | `docker compose up --build` brings all services healthy; MinIO bucket created; Mailhog reachable; worker connected to Redis.                               | M   |
| P0.1-5 | Prisma baseline: schema from doc 08, migrations incl. citext/uuidv7/triggers/check/RLS, seed runner                                   | P0.1-4         | `prisma generate/validate/migrate dev/db seed` succeed on fresh DB; system permissions/roles/demo tenant seeded; RLS policy present on every tenant table. | M   |
| P0.1-6 | CI pipeline: lint, typecheck, unit/integration, build, migration drift check, secret scan, npm audit                                  | P0.1-1, P0.1-5 | PR checks all green; a deliberate schema drift fails `migration-check`; a seeded fake secret fails secret scan.                                            | M   |
| P0.1-7 | Observability baseline: request IDs, problem details, Prometheus endpoint, OTel skeleton, Pino redaction                              | P0.1-2         | Logs contain `requestId`/`tenantId`; fake password string absent from logs; `/metrics` exposes http metrics.                                               | S   |
| P0.1-8 | Developer docs and ADRs: onboarding guide, env reference, ADR-001…006                                                                 | P0.1-1…7       | New developer boots stack in <15 min following docs only; ADRs committed.                                                                                  | S   |

## P0.2 — Authentication and tenancy

| ID     | Task                                                                          | Depends on | Acceptance criteria                                                                                                                         | Est |
| ------ | ----------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| P0.2-1 | Tenant model, slug/subdomain guard, `RequestContext`, `app.tenant_id` setting | P0.1-5     | Two tenants isolated in one DB; missing slug → 400; mismatched header → 403; body `tenantId` → 422.                                         | M   |
| P0.2-2 | User model + Argon2id password service                                        | P0.2-1     | Hashes are Argon2id with documented params; unknown user path performs dummy verification; plaintext never stored.                          | S   |
| P0.2-3 | Login + access JWT + refresh cookie issuance                                  | P0.2-2     | 200 body matches contract; cookie flags exactly as doc 10; access token claims include tid/sub/eid/perm version; 401 generic.               | M   |
| P0.2-4 | Refresh rotation, reuse detection, family revocation, logout                  | P0.2-3     | Rotation issues new token in same family; replay of old token → 401 + whole family revoked + audit event; logout revokes and clears cookie. | M   |
| P0.2-5 | Password recovery (forgot/reset) without enumeration                          | P0.2-2     | Both endpoints return 202/204 uniformly; token single-use, 30-min expiry; reset revokes all families; audit written.                        | M   |
| P0.2-6 | Rate limiting + lockout + MFA-ready data model                                | P0.2-3     | 5 failures/15 min lock; limits from doc 10 enforced in Redis; MFA tables and enrollment endpoint present; SSO/SCIM absent.                  | M   |
| P0.2-7 | `/me` endpoint + frontend auth migration notes                                | P0.2-3     | Response maps cleanly to frontend `User` type; notes list required frontend changes (no edits made).                                        | S   |
| P0.2-8 | Auth e2e + security tests (C-01, C-02, C-11, C-12, cookie flags)              | P0.2-1…7   | All listed gates green in CI; cross-tenant and reuse tests pass.                                                                            | M   |

## P0.3 — RBAC and audit

| ID     | Task                                                                  | Depends on     | Acceptance criteria                                                                                                      | Est |
| ------ | --------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ | --- |
| P0.3-1 | Permission catalogue + six role seeds + RolePermission/UserRole       | P0.2-1         | Seed produces all permissions and roles from doc 11; system roles immutable; unique `(tenant,user,role,scope)` enforced. | M   |
| P0.3-2 | PermissionGuard + `@RequirePermissions` + deny-by-default             | P0.3-1         | Every P0/P1 controller declares permission; missing → 403; unauthorized by default if decorator absent.                  | S   |
| P0.3-3 | PolicyService scopes (Self/Direct reports/Department/Location/Tenant) | P0.3-1         | Table-driven tests pass for all scopes; out-of-scope detail → 404; list filters applied in SQL.                          | M   |
| P0.3-4 | Field-level redaction + sensitive field map                           | P0.3-3         | Salary/PII fields omitted for unauthorized roles; redaction applies to responses, audit snapshots and logs.              | M   |
| P0.3-5 | Permission cache with version invalidation                            | P0.3-1         | Redis key format from doc 10; role change increments version and next request reflects new permissions.                  | S   |
| P0.3-6 | AuditEvent/DataAccessEvent writer + immutability grants/triggers      | P0.1-5, P0.3-4 | App role cannot UPDATE/DELETE; audit includes redacted before/after, request/correlation IDs.                            | M   |
| P0.3-7 | Audit read endpoints + policy/e2e tests (C-03…C-07, C-20)             | P0.3-6         | Auditor can read audit only; all critical gates green.                                                                   | M   |

## P0.4 — Platform services

| ID     | Task                                                            | Depends on     | Acceptance criteria                                                                                                           | Est |
| ------ | --------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- | --- |
| P0.4-1 | Outbox table writer + SQL claim publisher (`SKIP LOCKED`)       | P0.3-6         | Business + audit + outbox commit atomically; claim uses partial index; duplicate claim impossible with concurrent publishers. | M   |
| P0.4-2 | BullMQ queues, worker entrypoint, retry/backoff/DLQ, replay CLI | P0.4-1         | Exponential backoff 5 attempts; failed jobs in DLQ; replay CLI documented and tested.                                         | M   |
| P0.4-3 | Event catalogue + typed payloads + idempotent consumers         | P0.4-2         | All events from doc 14 typed; `jobId=eventId`; duplicate delivery produces no duplicate effect (C-08).                        | M   |
| P0.4-4 | ApprovalRequest/ApprovalStep engine + API                       | P0.3           | Ordered steps; duplicate decision → 409; decisions emit events; scope-based approver resolution.                              | M   |
| P0.4-5 | Notifications, preferences, email worker (Mailhog)              | P0.4-3         | Inbox works; dedupe key prevents duplicates; email delivered locally; failures retry/DLQ.                                     | M   |
| P0.4-6 | Idempotency interceptor + store (C-09, C-10)                    | P0.4-1         | Replay same key/body → cached response + header; different body → 409; expiry cleanup job.                                    | M   |
| P0.4-7 | Storage service presign helpers + private bucket policy         | P0.1-4, P0.3   | Presign only for permitted roles; bucket has no public access; key prefix includes tenant.                                    | S   |
| P0.4-8 | Metrics, outbox lag monitor, DLQ alerts                         | P0.1-7, P0.4-2 | Dashboard shows queue/outbox metrics; alerts fire in test by injecting lag.                                                   | S   |

## P0.5 — Administration

| ID     | Task                                             | Depends on     | Acceptance criteria                                                                                   | Est |
| ------ | ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------- | --- |
| P0.5-1 | Users API: invite/update/disable/role assignment | P0.3           | CRUD from doc 12; permission + scope enforced; all mutations audited; disable revokes tokens.         | M   |
| P0.5-2 | Roles/permissions API + admin matrix view data   | P0.3           | Tenant Admin can grant; HR Admin read-only; system roles cannot be changed; permission_version bumps. | M   |
| P0.5-3 | Audit viewer + notification inbox endpoints      | P0.3-7, P0.4-5 | Paged/filtered results; redacted snapshots; unread filter.                                            | S   |
| P0.5-4 | Tenant settings endpoints                        | P0.2-1         | Timezone/currency/locale/employee-number config readable and editable by Tenant Admin; validated.     | S   |
| P0.5-5 | Admin e2e suite + frontend integration notes     | P0.5-1…4       | Full admin journey green; notes list frontend changes for auth/permissions (no edits made).           | M   |

## P1.1 — Organization management

| ID     | Task                                                            | Depends on | Acceptance criteria                                                                                 | Est |
| ------ | --------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- | --- |
| P1.1-1 | Legal entity + location models/CRUD                             | P0.5       | Unique codes per tenant; no hard delete; audit/outbox on writes.                                    | S   |
| P1.1-2 | Department CRUD + parent hierarchy + closure + cycle prevention | P1.1-1     | Set parent to descendant → 409; closure table consistent; subtree query returns correct set (C-18). | M   |
| P1.1-3 | Job profile + position CRUD + reporting-cycle prevention        | P1.1-2     | Codes unique per tenant; reporting cycles rejected; positions reference dept/profile/location.      | M   |
| P1.1-4 | Org facades consumed by Employees + tests                       | P1.1-3     | `resolveOrgContext` returns manager/dept/location scopes from transaction; org e2e green.           | S   |

## P1.2 — Employee management

| ID     | Task                                                     | Depends on | Acceptance criteria                                                                           | Est |
| ------ | -------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- | --- |
| P1.2-1 | Employee model + number generator + create/findById      | P1.1, P0.4 | `EMP-000001` per tenant config; unique number; error on duplicate; redacted response.         | M   |
| P1.2-2 | List with search/filter/sort/pagination + manager scope  | P1.2-1     | All query params from doc 12 supported; manager sees only reports; p95 < 400 ms at 100k rows. | M   |
| P1.2-3 | Update with optimistic locking + audit/outbox/history    | P1.2-1     | Version conflict → 409; each accepted update writes three rows atomically.                    | M   |
| P1.2-4 | Lifecycle state machine + changeStatus endpoint (doc 13) | P1.2-1     | 49 pairs match matrix; invalid → 409 no writes; side effects correct (C-06, C-17).            | M   |
| P1.2-5 | getHistory + direct-reports endpoints                    | P1.2-4     | History immutable, ordered; direct reports scoped; permission checks pass.                    | S   |
| P1.2-6 | Employee e2e + redaction + lifecycle test suite          | P1.2-1…5   | All doc 18 employee gates green; frontend status mapping notes produced.                      | M   |

## P1.3 — Contracts and employment history

| ID     | Task                                           | Depends on | Acceptance criteria                                                                                           | Est |
| ------ | ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- | --- |
| P1.3-1 | Contract CRUD + minor-unit money + status      | P1.2       | No float anywhere; DB check enforces currency/salary pairing; unique contract number per tenant.              | M   |
| P1.3-2 | History writer for contract/status/org changes | P1.3-1     | from/to snapshots correct; rows immutable; actor + effective date recorded.                                   | M   |
| P1.3-3 | Termination side effects + events              | P1.3-2     | Sets termination date, requires reason, emits `EmployeeStatusChanged`, triggers future offboarding via event. | S   |
| P1.3-4 | Contract e2e + immutability/money tests        | P1.3-1…3   | Salary redaction verified; history update attempt fails; all gates green.                                     | S   |

## P1.4 — Documents and imports

| ID     | Task                                                           | Depends on           | Acceptance criteria                                                                            | Est |
| ------ | -------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------- | --- |
| P1.4-1 | Document metadata model + upload URL endpoint                  | P0.4-7, P1.2         | MIME/size validation; tenant-prefixed key; 5-min URL; no public ACL (C-14).                    | M   |
| P1.4-2 | Confirm upload + checksum + scan status + `document.uploaded`  | P1.4-1               | Missing object → 409; checksum stored; scan job enqueued; event emitted atomically (C-15).     | M   |
| P1.4-3 | List + download URL + delete                                   | P1.4-2               | Permission/scope checked; URL expires; cross-tenant document → 404 (C-16).                     | S   |
| P1.4-4 | CSV import worker (validate-first, modes, limits, idempotency) | P1.2, P0.4-6, P0.4-3 | 5MB/1000 rows; per-row results; upsert admin-only; duplicate key no-op; audit + outbox (C-22). | L   |
| P1.4-5 | File/import e2e + malicious CSV fixtures                       | P1.4-1…4             | All file and import gates green.                                                               | M   |

## P1.5 — Testing and hardening

| ID     | Task                                                   | Depends on | Acceptance criteria                                                                                | Est |
| ------ | ------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------- | --- |
| P1.5-1 | Security suite T-01…T-24                               | P1.4       | All scenarios automated and green; report generated.                                               | L   |
| P1.5-2 | Playwright E2E journeys                                | P1.4       | Login → create → status change → history → audit green; bulk terminate partial-failure case green. | M   |
| P1.5-3 | Load/performance test + tuning                         | P1.5-2     | p95 targets from doc 03 met; slow queries indexed; report archived.                                | M   |
| P1.5-4 | Coverage gates + mutation test on state machine/policy | P1.5-1     | 80/90% coverage thresholds and mutation score met.                                                 | M   |
| P1.5-5 | Backup/restore drill + runbook                         | P0.1-4     | Restore to scratch DB succeeds; runbook updated with timings.                                      | M   |
| P1.5-6 | UAT support + security review + signoff                | P1.5-1…5   | Frontend UAT signoff `[REF]`; no high/critical vulnerabilities; readiness checklist complete.      | M   |

## P2–P7 task summaries

| Milestone | Key tickets (each with its own tests + acceptance criteria in phase plan)                                                                                                                                                                                                                   | Est |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| P2        | P2-1 shift/schedule models; P2-2 idempotent clock events; P2-3 timesheets/overtime/exceptions; P2-4 leave types/policies; P2-5 accrual ledger + balances; P2-6 leave requests + approvals; P2-7 holidays/blackouts; P2-8 E2E.                                                               | L   |
| P3        | P3-1 compensation plans/changes; P3-2 pay components + tax rule adapters; P3-3 periods/locking; P3-4 payroll runs + immutable snapshots; P3-5 payslips/adjustments; P3-6 payment exports + reconciliation; P3-7 maker-checker controls; P3-8 E2E + audit.                                   | L   |
| P4        | P4-1 requisitions/postings; P4-2 candidates/applications/stages; P4-3 interviews/scorecards; P4-4 offers + offer-accepted flow; P4-5 checklist templates/cases/tasks; P4-6 provisioning/probation/exit/asset/access-revocation; P4-7 E2E hire-to-productive and termination-to-offboarding. | L   |
| P5        | P5-1 cycles/goals; P5-2 check-ins/reviews/feedback; P5-3 ratings/calibration; P5-4 competencies/PIP/promotions; P5-5 visibility tests.                                                                                                                                                      | L   |
| P6        | P6-1 worker profiles/rate cards; P6-2 work orders/assignments; P6-3 shift claims/completion proof; P6-4 approvals/billing exports; P6-5 idempotency E2E.                                                                                                                                    | M   |
| P7        | P7-1 event projections/warehouse; P7-2 reporting API; P7-3 SSO/SCIM; P7-4 DSAR export/delete + legal hold; P7-5 read replicas; P7-6 enterprise security review.                                                                                                                             | L   |

## 8. Definition of Done (all tickets)

1. Code, tests and docs merged in the same PR; architecture docs updated if decisions changed.
2. Lint, typecheck, unit/integration/e2e checks green in CI.
3. Migrations reviewed, forward-compatible, and applied in a fresh environment.
4. New endpoints have OpenAPI annotations and permission metadata.
5. No secrets, PII or verbose internals in logs/errors/docs.
6. Audit/outbox behaviour verified for every new mutation.
7. Acceptance criteria above individually checked off in the PR description.
