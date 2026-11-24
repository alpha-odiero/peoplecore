# 09 — Database Constraints, Indexing, Migration and Seed Strategy

## 1. Constraint strategy

### 1.1 Primary and foreign keys

- Every table has a UUID primary key (composite for pure join/closure tables) `[REF]`.
- Every FK is explicit and named; `ON DELETE` behaviour is chosen per relationship:
  - `CASCADE` from `Tenant` (tenant deletion removes its data) and from parent join tables.
  - `RESTRICT` where history/evidence must survive (employee → contract, history, documents).
  - `SET NULL` for optional actors/managers/locations.
- Polymorphic references (`AuditEvent.resource_id`, `UserRole.scope_ref_id`, outbox `aggregate_id`) intentionally have no FK; validity is checked by the application and, where possible, by triggers.

### 1.2 Tenant integrity (defence in depth)

1. Application layer: repository methods receive `tenantId` only from `RequestContext`; every `where` includes it.
2. ORM layer: composite unique keys include `tenant_id` (e.g. `employees(tenant_id, employee_number)`) `[REF]`.
3. Database layer: RLS policies (section 2) deny cross-tenant rows even if application code is wrong.

### 1.3 Check constraints (raw SQL)

| Table                  | Constraint                                                                                                                                                               | Purpose                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `tenants`              | `employee_number_padding BETWEEN 3 AND 12`                                                                                                                               | Avoid absurd generated numbers.  |
| `users`                | `status <> 'active' OR password_hash <> ''`                                                                                                                              | No active credential-less user.  |
| `user_roles`           | `scope_type IN ('tenant') AND scope_ref_id IS NOT NULL` is invalid; for `department`/`location`/`direct_reports` a ref is required, for `self`/`tenant` it must be NULL. | Scope integrity.                 |
| `refresh_tokens`       | `status <> 'active' OR expires_at > now()` is enforced in query logic; check `expires_at > created_at`.                                                                  | Token sanity.                    |
| `employment_contracts` | `end_date IS NULL OR end_date >= start_date`; `(salary_minor IS NULL) = (currency IS NULL)`                                                                              | Date/money consistency.          |
| `employees`            | `termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date`; `status <> 'terminated' OR termination_date IS NOT NULL` `[ASSUMPTION]`                | Lifecycle consistency.           |
| `employment_history`   | `to_values <> '{}'::jsonb`                                                                                                                                               | History always records a change. |
| `employee_documents`   | `size_bytes > 0 AND size_bytes <= 52428800`; `checksum_sha256 ~ '^[0-9a-f]{64}$'`                                                                                        | Upload validation at DB layer.   |
| `domain_event_outbox`  | `attempts >= 0`; `status <> 'published' OR published_at IS NOT NULL`                                                                                                     | Publisher sanity.                |
| `approval_steps`       | `step_order > 0`; exactly one `pending` step per request (partial unique index)                                                                                          | Workflow integrity.              |
| `leave_requests`       | `end_at > start_at`; `duration_minutes > 0`                                                                                                                              | Absence sanity.                  |
| all money columns      | `salary_minor >= 0`, `amount_minor >= 0` where negative values are not meaningful                                                                                        | Prevent negative money.          |
| `payroll_runs`         | `status <> 'paid' OR paid_at IS NOT NULL`                                                                                                                                | Lifecycle consistency.           |

### 1.4 Immutability

- Application DB role gets `SELECT, INSERT` on `audit_events`, `data_access_events`, `employment_history`, and `domain_event_outbox` (INSERT only for events; UPDATE limited to publisher columns via a SECURITY DEFINER function).
- Triggers reject `UPDATE`/`DELETE` on immutable tables, with allowance for `domain_event_outbox.status/attempts/available_at/published_at/last_error` updates by the publisher role only.
- Future immutable tables: `payslips`, `leave_accrual_ledger`, approved `timesheets`, `payroll_runs` after approval `[REF]`.

### 1.5 Audit fields `[REF]`

`created_at`, `created_by`, `updated_at`, `updated_by`, `version` on mutable tables; `occurred_at` on immutable event tables. `updated_at` maintained by trigger so raw SQL writes are covered. `version` used for optimistic locking (`UPDATE ... WHERE version = ?`, 409 on mismatch).

## 2. Row-Level Security (RLS) `[REF]`

RLS is **defence-in-depth**, not the primary isolation mechanism; tenant scoping in queries remains mandatory so query plans and developer intent stay explicit.

```sql
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON employees
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

Applied to every tenant-owned table via generated migration. Key rules:

- Application connects as `pc_app` (NO BYPASSRLS). Migrations use `pc_migrator` (BYPASSRLS allowed). Reporting uses `pc_reporter` with separate read-only policies.
- `RequestContextService` sets `app.tenant_id` per transaction (`SET LOCAL`). Pooled connections reset settings on return; tests assert a missing setting returns zero rows.
- `AuditEvent` writes remain possible because the policy uses the same tenant claim; auditors read through the same policy.
- Cross-tenant FK inserts are automatically rejected by `WITH CHECK`.
- RLS is verified by an automated test that attempts reads/writes with two tenant contexts against the same connection.

## 3. Indexing strategy

### 3.1 Rules

- Every `tenant_id` column is indexed, usually as the leading column of a composite index `[REF]`.
- Index the actual query predicates: list filters, FK lookups, status + time sorts, outbox claim query.
- Partial indexes for hot subsets (active rows, pending outbox, unread notifications).
- Avoid low-selectivity standalone indexes (e.g. `status` alone); prefer composite.
- No index on encrypted columns; search only on non-sensitive or deterministically hashed fields.
- Measure with `EXPLAIN (ANALYZE, BUFFERS)` in P1 performance tests; remove unused indexes via `pg_stat_user_indexes`.

### 3.2 Required indexes (beyond doc 08)

| Table                       | Index                                                                                                  | Query served                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `employees`                 | `(tenant_id, status, last_name, first_name)`                                                           | Employee list with status filter + sort.  |
| `employees`                 | `(tenant_id, department_id, status)`                                                                   | Department-scoped lists.                  |
| `employees`                 | `(tenant_id, manager_employee_id, status)`                                                             | Direct-report scope checks.               |
| `employees`                 | GIN `(to_tsvector('simple', first_name \|\| ' ' \|\| last_name))`                                      | Fuzzy/name search `[ASSUMPTION]`.         |
| `employees`                 | unique partial `(tenant_id, work_email) WHERE work_email IS NOT NULL`                                  | Duplicate work email prevention.          |
| `users`                     | unique partial `(tenant_id, employee_id) WHERE employee_id IS NOT NULL`                                | 1:1 user ↔ employee.                      |
| `user_roles`                | unique `(tenant_id, user_id, role_id, COALESCE(scope_ref_id, '00000000-0000-0000-0000-000000000000'))` | PDF-required role uniqueness `[REF]`.     |
| `refresh_tokens`            | `(family_id)` and `(status, expires_at)`                                                               | Rotation + reuse detection + cleanup.     |
| `audit_events`              | `(tenant_id, occurred_at DESC)`; `(tenant_id, resource_type, resource_id)`                             | PDF-required audit indexes `[REF]`.       |
| `domain_event_outbox`       | partial `(available_at, id) WHERE status='pending'`                                                    | `FOR UPDATE SKIP LOCKED` publisher claim. |
| `employee_documents`        | `(tenant_id, employee_id, status)`                                                                     | Document lists.                           |
| `employment_history`        | `(tenant_id, employee_id, effective_at DESC)`                                                          | `getHistory()`.                           |
| `notifications`             | `(tenant_id, user_id, read_at) WHERE read_at IS NULL`                                                  | Inbox.                                    |
| `idempotency_keys`          | unique `(tenant_id, scope, idem_key)`, `(expires_at)`                                                  | Replay + cleanup job.                     |
| future: `attendance_events` | unique `(tenant_id, idempotency_key)`                                                                  | Clock-event idempotency `[REF]`.          |
| future: `payroll_runs`      | unique `(tenant_id, idempotency_key)`                                                                  | Payroll idempotency `[REF]`.              |
| future: `leave_balance`     | unique `(tenant_id, employee_id, leave_type_id, period_year)`                                          | Balance integrity.                        |

## 4. Migration strategy `[REF]`

1. **Tooling:** Prisma Migrate for schema; numbered SQL migrations for extension/trigger/RLS/check/partial-index work, applied in lexicographic order with `prisma migrate deploy`.
2. **Forward-only:** No editing applied migrations. Corrections are new migrations. Rollback is a documented forward fix or a rehearsed restore from backup.
3. **Expand → migrate → contract:** Add nullable columns first, backfill in batches, add constraints/indexes `CONCURRENTLY`, then remove old columns in a later release. This supports zero-downtime deploys.
4. **Deployment gate:** CI runs `prisma migrate diff --exit-code` to detect drift; CD runs migrations as a pre-deploy job; API pods start only after success. Backwards-compatible schema for at least one release (old API must run on new schema).
5. **Large tables:** Use `CREATE INDEX CONCURRENTLY`, batched `UPDATE` with `WHERE id > :last AND id <= :last + 1000`, statement timeouts, and maintenance-window scheduling.
6. **Enum changes:** New enum values are additive; removals require data migration first. Prisma enum changes are reviewed manually.
7. **Tenant backfill:** Adding `tenant_id` to an existing table requires backfill, `NOT NULL`, FK, index, and RLS in the same migration chain; never leave a table tenant-less.
8. **Testing:** Each migration is applied to a fresh Postgres 16 container in CI; seed runs afterwards; integration tests then execute.
9. **Audit of migrations:** Migration execution itself is logged by CI/CD with actor, commit SHA and duration.

## 5. Seed-data strategy

Seeds are idempotent (upsert by natural key), Environment-aware, and never overwrite user data.

| Seed                  | Content                                                                                                                            | Environment              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `001_permissions`     | Full `resource.action` catalogue from doc 11 (idempotent by `key`).                                                                | all                      |
| `002_roles`           | Six system roles with their permission grants.                                                                                     | all                      |
| `003_platform_tenant` | Optional internal tenant for platform operators.                                                                                   | prod (opt-in)            |
| `004_demo_tenant`     | Demo tenant, departments, locations, job profiles, positions, ~20 synthetic employees/contracts/documents metadata.                | dev/test only            |
| `005_demo_users`      | One user per seeded role with strong random dev passwords printed only in dev logs, Argon2id-hashed; documented in developer docs. | dev/test only            |
| `006_lookups`         | Leave types, pay components, document types, checklist templates for later phases.                                                 | dev/test; subset in prod |

Rules:

- **No real PII** in any seed; synthetic names/emails only.
- Production seeds create only permissions, system roles and (optionally) the first tenant admin from a one-time bootstrap command with secrets from the environment — never a default password.
- Seeds write through the same service layer where practical so audit/outbox behaviour is exercised, or explicitly bypass with a recorded `system` actor for reference data.
- `npm run prisma:seed` and `npm run db:reset` are documented in P0.1-8 developer docs.
