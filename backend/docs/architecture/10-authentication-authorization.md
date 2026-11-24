# 10 — Authentication and Authorization Design

Combines the PDF's P0.2/P0.3 detailed design `[REF]` with the brief's requirements `[BRIEF]`.

## 1. Tenant resolution `[REF] checklist D-01`

1. For browser requests: subdomain (`acme.peoplecore.app`) is the primary tenant signal.
2. For local/API clients: `X-Tenant-Slug` header, validated against the `tenants.slug` catalogue and the authenticated user's membership.
3. Login accepts `tenantSlug` (or host) to identify the tenant; no `tenantId` is ever accepted in a request body.
4. `TenantGuard` resolves the tenant once, stores it in `RequestContext`, and sets PostgreSQL `app.tenant_id` for the transaction. Missing/invalid slug → 400 `TENANT_REQUIRED` / 404 `TENANT_NOT_FOUND`. A user who is not a member → 403.

## 2. Authentication flows

### 2.1 Login

```
POST /api/v1/auth/login   { tenantSlug?, email, password, mfaCode? }
```

1. Rate-limit check (IP + email + tenant).
2. Look up `users` by `(tenant_id, email)`; always run a dummy Argon2id verification for unknown users to avoid timing enumeration.
3. Verify Argon2id hash; on failure increment `failed_login_count`, lock after 5 failures/15 min `[ASSUMPTION]`, return generic `401 INVALID_CREDENTIALS`.
4. If `mfa_enabled` and no `mfaCode`, return `202 MFA_REQUIRED` with a short-lived challenge handle stored in Redis (never reveal whether the password was wrong).
5. On success: issue 15-minute RS256/EdDSA JWT access token (PDF prefers RS256/EdDSA `[REF]`) and an opaque 32-byte refresh token; store only SHA-256 hash with `family_id`, `expires_at` (7 days) `[ASSUMPTION]`.
6. Access token returned in body `{ accessToken, expiresIn, user }`; refresh token set as cookie `pc_refresh` with `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800` `[BRIEF]`.
7. Write audit event `AUTH_LOGIN` and outbox `UserLoggedIn`; reset failure counters.

### 2.2 Refresh (rotation + reuse detection)

```
POST /api/v1/auth/refresh   (cookie only, CSRF token header required)
```

1. Hash the presented refresh token; look up `refresh_tokens`.
2. Unknown/expired → 401, clear cookie.
3. `status = 'rotated'/'revoked'` but not expired → **reuse detected**: revoke every token in `family_id`, audit `AUTH_TOKEN_REUSE`, 401, alert.
4. Valid `active` token → mark rotated, create new token in the same `family_id`, issue new access token, set new cookie. Rotation and read are one DB transaction.
5. Reuse detection also triggers on a token whose `used_at` is already set.

### 2.3 Logout

`POST /api/v1/auth/logout` revokes the presented token family, clears the cookie, writes `AUTH_LOGOUT`. Authenticated via access token or refresh cookie.

### 2.4 Password recovery

1. `POST /auth/password/forgot { tenantSlug, email }` always returns `202 Accepted` regardless of account existence; rate-limited 10/hour/email.
2. A single-use token (32 random bytes) is hashed and stored with 30-minute expiry `[ASSUMPTION]`; notification job sends the link.
3. `POST /auth/password/reset { token, newPassword }` verifies hash + expiry, updates Argon2id hash, increments `permission_version`, revokes all refresh families of the user, audits `AUTH_PASSWORD_RESET`.

### 2.5 MFA readiness `[REF] MFA-ready, SSO/SCIM P7`

- `users.mfa_secret_enc` (encrypted TOTP secret) and `mfa_recovery_codes` (hashed) exist now.
- Enrollment endpoints can be implemented in P0.2 or deferred, but data model and audit fields are ready.
- Challenge verification is Redis-backed and short-lived (5 min, max 5 attempts) `[ASSUMPTION]`.
- SSO/SCIM are explicitly P7; no OIDC/SAML code in P0/P1.

### 2.6 Access token claims

```json
{
  "sub": "<user uuid>",
  "tid": "<tenant uuid>",
  "eid": "<employee uuid or null>",
  "roles": ["hr_admin"],
  "perm": "42",
  "scopes": [{ "type": "department", "ref": "<uuid>" }],
  "iss": "peoplecore-api",
  "aud": "peoplecore-web",
  "iat": 1730000000,
  "exp": 1730000900,
  "jti": "<uuid>"
}
```

Permissions are also re-read from Redis using `tid:sub:perm` and invalidated when `permission_version` changes; this avoids stale privilege after role edits.

## 3. Authorization: RBAC + ABAC `[REF][BRIEF]`

### 3.1 Layers

1. **Authentication** — `JwtAuthGuard` verifies token, loads user status, rejects disabled/locked users.
2. **Permission** — `@RequirePermissions('employees.read')` + `PermissionGuard` checks the permission catalogue and denies by default.
3. **Scope (ABAC)** — `PolicyService.can(ctx, action, resource)` evaluates:
   - `self`: `resource.employeeId === ctx.employeeId` or `resource.userId === ctx.userId`.
   - `direct_reports`: employee is in `ctx.employeeId`'s reporting subtree (using `OrgUnitClosure` / recursive CTE).
   - `department`: `resource.departmentId ∈ ctx.departmentScopes`.
   - `location`: `resource.locationId ∈ ctx.locationScopes`.
   - `entire_tenant`: tenant matches (always required).
   - Attribute conditions additionally include employee `status` (e.g. terminated records need explicit permission) `[REF]`.
4. **Field-level** — `visibleFields(ctx, resource, dto)` returns allowed fields; response serializer redacts the rest.

### 3.2 Field sensitivity map

| Field(s)                                                                        | Required permission to view                   | Redaction        |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ---------------- |
| `salaryMinor`, `payFrequency`, compensation/payslip data                        | `employees.view_salary` or `payroll.manage`   | omitted          |
| `nationalIdEnc`, `dateOfBirthEnc`, `personalEmailEnc`, `phoneEnc`, `addressEnc` | `employees.read_sensitive` (HR roles) or self | omitted / masked |
| `notesEnc`, performance feedback                                                | owner, manager in scope, HR                   | omitted          |
| documents                                                                       | `documents.read` + scope                      | URL withheld     |
| audit before/after                                                              | `audit.read` + redaction of secret paths      | values masked    |

Frontend users with only `employees.read` see full name, work email, department, title and status — matching the existing UI `[REPO]`.

### 3.3 RequestContext `[REF]`

```ts
interface RequestContext {
  requestId: string;
  correlationId?: string;
  tenantId: string;
  tenantSlug: string;
  userId?: string;
  employeeId?: string;
  roles: string[];
  permissions: Set<string>;
  scopes: Array<{ type: ScopeType; ref?: string }>;
  ip?: string;
  userAgent?: string;
}
```

Stored in `AsyncLocalStorage`; injected into repositories and services. Never constructed from client-provided tenant/user IDs.

### 3.4 Guards and interceptors order

`RequestIdInterceptor → TenantGuard → JwtAuthGuard → PermissionGuard → PolicyGuard → ValidationPipe → Controller → Service → RedactionInterceptor → ExceptionFilter`

### 3.5 Permission cache `[REF]`

- Key `pc:perm:{tenantId}:{userId}:{permissionVersion}`; value roles, permissions, scopes; TTL 60 s `[ASSUMPTION]`.
- Invalidated on role grant/revoke, user-role change or password reset by incrementing `permission_version`.

## 4. Rate limiting and abuse controls

| Endpoint                | Limit               | Key                                |
| ----------------------- | ------------------- | ---------------------------------- |
| `/auth/login`           | 5 attempts / 15 min | tenant + IP + email                |
| `/auth/refresh`         | 30 / min            | IP                                 |
| `/auth/password/forgot` | 10 / hour           | email                              |
| `/auth/mfa/verify`      | 5 / 5 min           | challenge id                       |
| All API                 | 300 / min           | tenant + user (or IP if anonymous) |

Implemented with Redis sliding-window counters; returns `429` with `Retry-After`. Login failures produce audit events for alerting.

## 5. Secure transport and cookies

- TLS everywhere except local Compose; HSTS in staging/prod.
- Refresh cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, scoped path; CSRF token required for cookie-authenticated POSTs (double-submit token in a non-HttpOnly cookie + header) `[ASSUMPTION]`.
- Access token stays in memory in the frontend (migration from `localStorage['ems_access_token']` is a follow-up integration task, not part of plan mode).
- CORS allowlist per environment; credentials enabled only for trusted web origins.

## 6. Error semantics

- 401: missing/invalid/expired access token, invalid credentials, token reuse.
- 403: missing permission, out-of-scope resource, disabled user.
- 404: resource not found **within tenant** (never reveal existence in another tenant).
- 409: invalid state transition, version conflict, duplicate natural key, idempotency conflict.
- 429: rate limit.
  All errors use RFC 7807 problem details with `detail` and `requestId` (doc 12).

## 7. Security assertions to test

See docs 15 and 18: cross-tenant IDOR, missing permission, manager scope, salary redaction, refresh reuse family revocation, audit immutability, rate limits, cookie attributes, timing-safe unknown-user login.
