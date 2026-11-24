# 12 — API Endpoint Specification

All endpoints are prefixed `/api/v1` `[BRIEF]`, consistent with the existing frontend's `VITE_API_BASE_URL` `[REPO]`. OpenAPI/Swagger is served at `/api/docs` in non-production (and behind auth in staging) `[REF][BRIEF]`.

## 1. Conventions

### 1.1 Envelopes

```jsonc
// single resource
{ "data": { "id": "...", "...": "..." } }

// collection
{
  "data": [ /* ... */ ],
  "meta": { "page": 1, "pageSize": 20, "total": 137, "totalPages": 7 },
  "links": { "self": "...", "next": "...", "prev": null }
}

// error (RFC 7807 problem details; `detail` is required for the frontend ApiError)
{
  "type": "https://peoplecore.app/problems/VALIDATION_FAILED",
  "title": "Validation failed",
  "status": 422,
  "detail": "status must be a valid employee status",
  "instance": "/api/v1/employees",
  "requestId": "01J...",
  "errors": [{ "field": "status", "message": "invalid enum value" }]
}
```

Success codes: 200 read/update, 201 create, 202 accepted async/MFA, 204 delete/deactivate. Empty responses use 204 with no body.

### 1.2 Validation

`class-validator` DTOs with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Unknown fields (notably `tenantId`) are rejected — this is a tenant-isolation control. Validation failure → 422.

### 1.3 Pagination, filtering, sorting

- `?page=1&pageSize=20` (default 20, max 100) `[ASSUMPTION]`.
- `?q=` free-text search (scoped fields only), plus explicit filters per endpoint.
- `?sort=lastName:asc,createdAt:desc`; allowlisted fields only.
- Filters and sorts are compiled to parameterized Prisma queries; no raw string interpolation from user input.

### 1.4 Idempotency

`Idempotency-Key: <uuid|opaque>` header required on `POST /employees`, `POST /employees/imports`, `POST /documents/upload-url`, `POST /contracts`, and all future payroll/clock/webhook endpoints `[REF][BRIEF]`. Server stores scope + key + SHA-256(body) for 24 h; replay with the same key and hash returns the cached status/body with `Idempotent-Replay: true`; same key with a different hash → 409.

### 1.5 Authorization

Every endpoint requires `Authorization: Bearer <accessToken>` except login, password forgot/reset, health. Refresh uses the `pc_refresh` cookie + CSRF header. Required permissions are stated per endpoint; ABAC scopes further restrict results.

## 2. Health and meta

| Method | Path            | Auth   | Description                                              |
| ------ | --------------- | ------ | -------------------------------------------------------- |
| GET    | `/health/live`  | none   | Process liveness → 200 `{"status":"ok"}`.                |
| GET    | `/health/ready` | none   | DB, Redis, object storage checks → 200/503.              |
| GET    | `/api/v1/me`    | Bearer | Current user, roles, permissions, scopes, employee link. |

## 3. Authentication

| Method | Path                    | Auth          | Request                                      | Response                                              | Notes                                          |
| ------ | ----------------------- | ------------- | -------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| POST   | `/auth/login`           | none          | `{ tenantSlug?, email, password, mfaCode? }` | 200 `{accessToken, expiresIn, user}` + refresh cookie | 401 generic; 202 `MFA_REQUIRED`; rate-limited. |
| POST   | `/auth/refresh`         | cookie        | `X-CSRF-Token`                               | 200 new access token + rotated cookie                 | Reuse → family revocation, 401.                |
| POST   | `/auth/logout`          | Bearer/cookie | —                                            | 204 + cleared cookie                                  | Revokes family.                                |
| POST   | `/auth/password/forgot` | none          | `{ tenantSlug, email }`                      | 202 always                                            | No enumeration.                                |
| POST   | `/auth/password/reset`  | none          | `{ token, newPassword }`                     | 204                                                   | Invalidates all sessions.                      |
| GET    | `/auth/mfa/enroll`      | Bearer        | —                                            | 200 `{ secretProvisioningUri, recoveryCodes }`        | P0.2 readiness; values returned once.          |
| POST   | `/auth/mfa/verify`      | Bearer        | `{ code }`                                   | 204                                                   | Redis challenge.                               |

`newPassword` rules: ≥12 chars, not in top-10000 breached list `[ASSUMPTION]`, Argon2id on write.

## 4. Administration (RBAC)

| Method | Path                 | Permission         | Request/Response                                                               |
| ------ | -------------------- | ------------------ | ------------------------------------------------------------------------------ |
| GET    | `/users`             | `users.read`       | Paged user list; filters `status`, `role`, `q`.                                |
| POST   | `/users`             | `users.manage`     | `{ email, firstName?, lastName?, roleIds, scope?, employeeId? }` → 201.        |
| GET    | `/users/:id`         | `users.read`       | User detail.                                                                   |
| PATCH  | `/users/:id`         | `users.manage`     | Partial update; status change disables sessions.                               |
| POST   | `/users/:id/roles`   | `users.manage`     | `{ roleIds, scope }` → 200; increments `permission_version`.                   |
| POST   | `/users/:id/disable` | `users.manage`     | 204; revokes tokens.                                                           |
| GET    | `/roles`             | `roles.read`       | Role list with permission keys.                                                |
| POST   | `/roles`             | `roles.manage`     | `{ key, name, description?, permissionKeys[] }` → 201; system roles immutable. |
| PATCH  | `/roles/:id`         | `roles.manage`     | Update name/permissions.                                                       |
| GET    | `/permissions`       | `permissions.read` | Permission catalogue grouped by domain.                                        |

## 5. Organization

Common CRUD shape for all four resources:

| Method           | Path                | Permission                            | Notes                                                                             |
| ---------------- | ------------------- | ------------------------------------- | --------------------------------------------------------------------------------- |
| GET              | `/departments`      | `departments.read`                    | Filters: `parentId`, `isActive`, `q`; returns tree flags.                         |
| POST             | `/departments`      | `departments.create`                  | `{ code, name, parentId?, managerEmployeeId?, locationId?, costCenter? }`.        |
| GET              | `/departments/:id`  | `departments.read`                    | Detail with children count.                                                       |
| PATCH            | `/departments/:id`  | `departments.update`                  | Cycle prevention → 409; optimistic lock.                                          |
| DELETE           | `/departments/:id`  | `departments.deactivate`              | Soft deactivate → 204.                                                            |
| GET/POST         | `/locations`        | `locations.read/create`               | `{ code, name, legalEntityId?, countryCode, timezone, address... }`.              |
| GET/PATCH/DELETE | `/locations/:id`    | `locations.read/update/deactivate`    | Same shape.                                                                       |
| GET/POST         | `/job-profiles`     | `job_profiles.read/create`            | `{ code, title, family?, level?, description? }`.                                 |
| GET/PATCH/DELETE | `/job-profiles/:id` | `job_profiles.read/update/deactivate` | Same shape.                                                                       |
| GET/POST         | `/positions`        | `positions.read/create`               | `{ code, title, departmentId, jobProfileId, locationId?, reportsToPositionId? }`. |
| GET/PATCH/DELETE | `/positions/:id`    | `positions.read/update/deactivate`    | Reporting-cycle prevention → 409.                                                 |

## 6. Employees

| Method | Path                            | Permission                                | Request / Response                                                                                                                                                                                                                                        |
| ------ | ------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/employees`                    | `employees.read`                          | Query: `q`, `status[]`, `departmentId`, `locationId`, `positionId`, `managerId`, `employmentType`, `from`, `to`, `page`, `pageSize`, `sort`. Returns redacted `EmployeeDto[]`.                                                                            |
| POST   | `/employees`                    | `employees.create`                        | Idempotency-Key; `{ firstName, lastName, preferredName?, workEmail?, personalEmail?, phone?, dateOfBirth?, nationalId?, employmentType, hireDate?, departmentId?, locationId?, positionId?, managerEmployeeId?, status? }` → 201. Default status `draft`. |
| GET    | `/employees/:id`                | `employees.read` + scope                  | Redacted by `PolicyService`; out-of-scope → 404.                                                                                                                                                                                                          |
| PATCH  | `/employees/:id`                | `employees.update` + scope                | Partial; `version` required; 409 on conflict.                                                                                                                                                                                                             |
| POST   | `/employees/:id/status`         | `employees.change_status`                 | `{ status, reason?, effectiveAt? }` → 200; invalid transition → 409 (doc 13).                                                                                                                                                                             |
| GET    | `/employees/:id/history`        | `employees.get_history`                   | Paged history rows (immutable).                                                                                                                                                                                                                           |
| GET    | `/employees/:id/direct-reports` | `employees.read` + scope                  | Direct-report list for manager UI.                                                                                                                                                                                                                        |
| POST   | `/employees/imports`            | `employees.create` (`upsert`: admin only) | multipart CSV or `{ objectKey }`; `{ mode }`; Idempotency-Key → 202 `{ importId }`.                                                                                                                                                                       |
| GET    | `/employees/imports/:id`        | `employees.read`                          | Status + per-row results.                                                                                                                                                                                                                                 |

`EmployeeDto` never contains `passwordHash`, internal encryption envelopes, or fields removed by redaction.

## 7. Contracts and documents

| Method | Path                                  | Permission           | Notes                                                                                                                                                  |
| ------ | ------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/contracts`                          | `contracts.create`   | `{ employeeId, contractNumber?, type, startDate, endDate?, salaryMinor, currency, payFrequency, workingHoursWeek?, legalEntityId? }`; Idempotency-Key. |
| GET    | `/contracts`                          | `contracts.read`     | Filters `employeeId`, `status`, `from`, `to`; salary fields require `employees.view_salary`.                                                           |
| PATCH  | `/contracts/:id`                      | `contracts.update`   | Version check; history + audit + outbox.                                                                                                               |
| POST   | `/employees/:id/documents/upload-url` | `documents.upload`   | `{ fileName, mimeType, sizeBytes, documentType }` → `{ documentId, url, objectKey, expiresIn, requiredHeaders }`; validates MIME/size first.           |
| POST   | `/employees/:id/documents/confirm`    | `documents.upload`   | `{ documentId, checksumSha256 }`; verifies object exists → 201; emits `document.uploaded`, queues scan job.                                            |
| GET    | `/employees/:id/documents`            | `documents.read`     | Metadata + scan status.                                                                                                                                |
| GET    | `/documents/:id/download-url`         | `documents.download` | Short-lived presigned GET URL (≤5 min) `[ASSUMPTION]`; private bucket only.                                                                            |
| DELETE | `/documents/:id`                      | `documents.delete`   | Soft delete + object lifecycle policy.                                                                                                                 |

## 8. Audit, approvals, notifications

| Method  | Path                        | Permission                         | Notes                                                                                                         |
| ------- | --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| GET     | `/audit-events`             | `audit.read`                       | Filters `actorUserId`, `resourceType`, `resourceId`, `from`, `to`, `action`; append-only, redacted snapshots. |
| GET     | `/audit-events/:id`         | `audit.read`                       | Single event.                                                                                                 |
| GET     | `/data-access-events`       | `audit.read`                       | Sensitive-record access log.                                                                                  |
| GET     | `/approvals`                | `approvals.read`                   | Filters `status`, `type`, `assignedToMe`.                                                                     |
| POST    | `/approvals/:id/decide`     | `approvals.decide`                 | `{ decision: approve\|reject, comment? }` → 200; duplicate decisions → 409.                                   |
| GET     | `/notifications`            | `notifications.read`               | Inbox; `unreadOnly`, pagination.                                                                              |
| PATCH   | `/notifications/:id/read`   | `notifications.read`               | Mark read.                                                                                                    |
| GET/PUT | `/notification-preferences` | `notifications.manage_preferences` | Channel/category preferences.                                                                                 |

## 9. Future phases (contracts to be specified in their phase)

| Phase | Endpoint families (from PDF module boundaries)                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2    | `/leave-types`, `/leave-policies`, `/leave-requests`, `/leave-balances`, `/shifts`, `/schedules`, `/attendance-events` (idempotent), `/timesheets` |
| P3    | `/compensation-plans`, `/payroll-periods`, `/payroll-runs` (idempotent, maker-checker), `/payslips`, `/payment-exports`                            |
| P4    | `/requisitions`, `/candidates`, `/applications`, `/interviews`, `/offers`, `/onboarding-cases`, `/offboarding-cases`                               |
| P5    | `/review-cycles`, `/goals`, `/reviews`, `/feedback`, `/calibrations`                                                                               |
| P6    | `/work-orders`, `/assignments`, `/shift-claims`, `/completion-proofs`                                                                              |
| P7    | `/reports`, `/analytics`, `/integrations`, `/dsar`                                                                                                 |

## 10. Error catalogue (selected)

| Code                                   | HTTP      | Meaning                                        |
| -------------------------------------- | --------- | ---------------------------------------------- |
| `VALIDATION_FAILED`                    | 422       | class-validator failure (includes `errors[]`). |
| `UNAUTHENTICATED`                      | 401       | Missing/expired access token.                  |
| `INVALID_CREDENTIALS`                  | 401       | Generic login failure.                         |
| `TOKEN_REUSE_DETECTED`                 | 401       | Refresh family revoked.                        |
| `FORBIDDEN`                            | 403       | Missing permission / scope.                    |
| `TENANT_REQUIRED` / `TENANT_NOT_FOUND` | 400 / 404 | Tenant resolution failure.                     |
| `RESOURCE_NOT_FOUND`                   | 404       | Not found in current tenant.                   |
| `INVALID_STATUS_TRANSITION`            | 409       | Employee lifecycle violation `[REF]`.          |
| `VERSION_CONFLICT`                     | 409       | Optimistic locking failure.                    |
| `DUPLICATE_KEY`                        | 409       | Tenant-scoped natural key duplicate.           |
| `IDEMPOTENCY_CONFLICT`                 | 409       | Same key, different request hash.              |
| `RATE_LIMITED`                         | 429       | Too many requests; `Retry-After`.              |
| `STORAGE_OBJECT_MISSING`               | 409       | Confirm upload before object exists.           |
| `INTERNAL_ERROR`                       | 500       | Logged with `requestId`; no details leaked.    |

## 11. OpenAPI setup

- NestJS `@nestjs/swagger` with DTO decorators (`@ApiProperty`, `@ApiResponse`), bearer + cookie auth schemes, and problem-details component schema.
- Generate `openapi.json` in CI and diff against the committed contract; breaking changes fail the build.
- Every example uses synthetic data; no real PII in docs.
