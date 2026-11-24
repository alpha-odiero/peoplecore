# 18 — Testing Strategy

Stack: Jest + Supertest (unit/integration/API) `[BRIEF]`, Playwright for browser E2E in P1.5 `[REF]`, k6 for load checks `[ASSUMPTION]`.

## 1. Test pyramid

| Layer            | Scope                                                    | Tools                                              | Speed | Example                                                |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------- | ----- | ------------------------------------------------------ |
| Unit             | Services, policies, state machine, mappers               | Jest + in-memory fakes                             | ms    | `changeStatus` rejects invalid transition.             |
| Integration      | Real Postgres + Redis + MinIO via Compose/Testcontainers | Jest + Supertest                                   | s     | Mutation commits business + audit + outbox atomically. |
| API/contract     | HTTP verbs, DTO validation, envelopes, OpenAPI diff      | Supertest                                          | s     | `POST /employees` rejects `tenantId` with 422.         |
| Authorization    | Roles × scopes × fields                                  | Jest table-driven                                  | ms/s  | Manager cannot read unrelated employee.                |
| Tenant isolation | Two tenants on same DB/connection                        | Jest + RLS assertions                              | s     | Tenant A cannot read tenant B employee by ID.          |
| E2E              | Full stack including frontend                            | Playwright                                         | min   | Login → create employee → view history.                |
| Security         | Auth abuse, injections, upload, audit immutability       | Jest/Supertest + OWASP ZAP baseline `[ASSUMPTION]` | s/min | Refresh reuse revokes family.                          |
| Load             | Latency and saturation                                   | k6                                                 | min   | 100 rps employee list p95 < 400 ms.                    |

## 2. Test environment rules

- Each Jest worker uses a unique schema or database (`peoplecore_test_<worker>`) with migrations applied once, truncated between suites.
- Redis uses a dedicated DB index; queues are drained between tests.
- MinIO uses a test bucket; objects removed after each suite.
- Clock is injectable (`Clock` interface) for time-dependent tests.
- No test uses production credentials or real PII; fixtures are synthetic.
- CI runs unit → integration → API → security → build; Playwright runs in a separate job with the Compose stack.

## 3. Critical scenario matrix (must-pass gates)

| #    | Scenario                                                           | Test type      | Expected                                                                       |
| ---- | ------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------ |
| C-01 | Tenant A requests Tenant B's employee by ID                        | API + RLS + DB | 404; RLS returns 0 rows; direct SQL with wrong `app.tenant_id` returns 0 rows. |
| C-02 | Unauthenticated request to protected endpoint                      | API            | 401 `UNAUTHENTICATED`.                                                         |
| C-03 | Employee role calls `POST /employees`                              | Authorization  | 403 `FORBIDDEN`.                                                               |
| C-04 | Manager reads unrelated employee                                   | Authorization  | 404 (scope enforced in SQL).                                                   |
| C-05 | Employee calls `GET /employees/:id` including salary field request | Redaction      | Field absent; `employees.view_salary` required.                                |
| C-06 | Invalid status transition (e.g. `archived → active`)               | Unit + API     | 409, no writes to employee/history/audit/outbox.                               |
| C-07 | Attempt UPDATE/DELETE on `audit_events` as app DB role             | DB             | Permission/trigger error.                                                      |
| C-08 | Same `eventId` delivered twice to notification consumer            | Job            | One notification row; second is no-op.                                         |
| C-09 | Same idempotency key + body replayed                               | API            | Same response status/body, `Idempotent-Replay: true`.                          |
| C-10 | Same idempotency key + different body                              | API            | 409 `IDEMPOTENCY_CONFLICT`.                                                    |
| C-11 | Refresh token replay after rotation                                | Security       | Family revoked, 401, audit event.                                              |
| C-12 | Login with unknown vs wrong-password user                          | Security       | Same 401 body and comparable timing.                                           |
| C-13 | SQL injection payload in `q`/`sort`                                | Security       | 422 or literal search; no data leak/error leakage.                             |
| C-14 | Oversized/wrong-MIME upload URL request                            | File           | 422; no presigned URL issued.                                                  |
| C-15 | Confirm upload before object exists                                | File           | 409 `STORAGE_OBJECT_MISSING`; no document row.                                 |
| C-16 | Download URL for another tenant's document                         | File + Auth    | 404/403; no presigned URL.                                                     |
| C-17 | Concurrent status changes on same employee                         | Concurrency    | One 200, one 409.                                                              |
| C-18 | Department parent set to its descendant                            | DB/API         | 409; no cycle in closure table.                                                |
| C-19 | Duplicate employee number within tenant                            | DB             | 409 `DUPLICATE_KEY`; allowed across tenants.                                   |
| C-20 | Permission revoked via role edit                                   | Authorization  | Next request uses new `permission_version`; 403.                               |
| C-21 | Bulk termination via frontend path                                 | E2E            | Each employee goes through same state machine; invalid ones rejected with 409. |
| C-22 | CSV import with duplicate rows and bad rows                        | Integration    | Per-row results; valid rows created once; audit + outbox recorded.             |

## 4. Unit tests

| Area               | Cases                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `EmployeesService` | create defaults, validation, redaction mapping, transaction calls, version conflict, history/audit/outbox writes. |
| State machine      | All 49 from/to pairs from doc 13; reason requirements; direct activation flag.                                    |
| `PolicyService`    | Role × scope × field table; union of multiple roles; deny by default.                                             |
| Token service      | Hash/verify, rotation, reuse detection, family revocation, expiry.                                                |
| Idempotency        | Hash mismatch, expiry, replay.                                                                                    |
| Outbox writer      | Event ID generation, payload scrubbing, transaction participation.                                                |
| DTO mappers        | Sensitive fields never mapped into response type.                                                                 |

## 5. Integration tests (real infrastructure)

1. **Mutation atomicity:** force a failure after business insert but before outbox insert (test hook) → transaction rolls back completely.
2. **Outbox publisher:** seed pending event, run publisher once, assert job enqueued with `jobId = eventId`, outbox status published.
3. **Duplicate job:** enqueue same job twice → one business effect.
4. **RLS:** set `app.tenant_id` to tenant A, query tables joined with tenant B IDs → no rows.
5. **Constraints:** check constraints reject invalid contract dates, bad document checksum, null tenant id.
6. **Import:** 1000-row fixture, duplicate idempotency key, upsert mode permission check.
7. **Documents:** presign → upload to MinIO → confirm → download URL → expiry; wrong MIME/oversize rejection.
8. **Migrations:** fresh DB from migrations + seed; assert system roles/permissions exist.

## 6. API and E2E tests

- Supertest suites for all P0/P1 endpoints: status codes, envelope shape, validation errors, pagination links, sorting allowlist, error `detail` field.
- OpenAPI contract test: generated spec matches committed `openapi.json`.
- Playwright (P1.5): login → create department → create employee → change status → view history → audit viewer; plus bulk terminate with invalid state and redaction checks.

## 7. Security tests

Dedicated `tests/security/` suites implement T-01…T-24 from doc 15, including header/body tenant injection, role escalation attempts, cookie flags, CSRF, rate-limit thresholds, log redaction assertions, audit immutability, insecure object access, malicious CSV, and injection fuzzing. Security tests run in CI and block merges.

## 8. Coverage gates `[ASSUMPTION]`

| Scope                                               | Minimum            |
| --------------------------------------------------- | ------------------ |
| Overall lines                                       | 80%                |
| Auth, tenancy, RBAC, lifecycle, outbox              | 90%                |
| New code in PR                                      | 85%                |
| Mutation testing (P1.5) on state machine and policy | 80% mutation score |

Coverage is necessary but not sufficient; critical scenario gates (section 3) must all pass.

## 9. Test deliverables per milestone

Each milestone in doc 19 lists its own test suite; no milestone is accepted without its tests merged and green. P1.5 adds the full security review, UAT signoff and load test report `[REF]`.
