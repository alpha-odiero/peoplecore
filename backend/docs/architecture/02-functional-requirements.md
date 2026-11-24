# 02 — Functional Requirements

Source keys: `[REF]` reference PDF, `[BRIEF]` task brief, `[REPO]` existing frontend. IDs are stable and used by the test matrix (doc 18) and roadmap (doc 19).

## FR-1 — Identity, tenancy and access `[REF][BRIEF]`

| ID     | Requirement                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| FR-1.1 | Provision tenant with slug, name, locale, timezone, default currency and settings.                                                |
| FR-1.2 | Register/invite users within a tenant; unique email per tenant; optional link to an employee record.                              |
| FR-1.3 | Authenticate by email + password using Argon2id verification; issue 15-minute JWT access token and opaque rotating refresh token. |
| FR-1.4 | Rotate refresh token on every use, hash it at rest, detect reuse by family, revoke the whole family on reuse.                     |
| FR-1.5 | Support logout (revoke family + clear cookie) and password recovery without account enumeration.                                  |
| FR-1.6 | Enforce login/forgot/refresh rate limits and temporary lockout.                                                                   |
| FR-1.7 | Store MFA enrollment data (encrypted secret, hashed recovery codes) without enabling full MFA flows before it is scheduled.       |
| FR-1.8 | Resolve tenant context only from authenticated session + validated slug/subdomain; reject client-supplied `tenantId`.             |
| FR-1.9 | Expose `/me` with user, roles, permissions, scopes and employee link.                                                             |

## FR-2 — RBAC, ABAC and redaction `[REF][BRIEF]`

| ID     | Requirement                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| FR-2.1 | Seed six roles: Tenant Admin, HR Admin, HR Manager, Manager, Employee, Auditor.                                |
| FR-2.2 | Manage roles and their `resource.action` permissions; user-role assignments carry a scope.                     |
| FR-2.3 | Evaluate access scopes: Self, Direct reports, Department, Location, Entire tenant.                             |
| FR-2.4 | Apply field-level access control for salary, national ID, DOB, personal contact data and performance feedback. |
| FR-2.5 | Cache resolved permissions per `tenantId:userId:permissionVersion` in Redis with invalidation on role change.  |
| FR-2.6 | Deny by default; missing permission yields 403, unauthenticated yields 401.                                    |

## FR-3 — Organization management `[REF][BRIEF][REPO]`

| ID     | Requirement                                                                      |
| ------ | -------------------------------------------------------------------------------- |
| FR-3.1 | CRUD for departments with parent hierarchy and cycle prevention; no hard delete. |
| FR-3.2 | CRUD for locations with country code and timezone; no hard delete.               |
| FR-3.3 | CRUD for job profiles (job titles/families/levels).                              |
| FR-3.4 | CRUD for positions with department, job profile, location and reporting line.    |
| FR-3.5 | Maintain legal entity records (Core HR-owned per PDF).                           |
| FR-3.6 | Enforce tenant-scoped unique codes; publish `OrgStructureChanged`.               |

## FR-4 — Employee master `[REF][BRIEF][REPO]`

| ID     | Requirement                                                                                              |
| ------ | -------------------------------------------------------------------------------------------------------- |
| FR-4.1 | Create employee with generated tenant-scoped employee number and status `draft` by default.              |
| FR-4.2 | `findById`, `list`, `update`, `changeStatus`, `getHistory` service operations.                           |
| FR-4.3 | Server-side search, filter, sort and pagination matching frontend capabilities.                          |
| FR-4.4 | Statuses: draft, onboarding, active, on_leave, suspended, terminated, archived.                          |
| FR-4.5 | Validated state-transition matrix; invalid transitions return 409 with no write.                         |
| FR-4.6 | Every relevant mutation writes employment history, audit event and outbox event in the same transaction. |
| FR-4.7 | Sensitive fields encrypted at rest and redacted by policy in responses.                                  |
| FR-4.8 | Optimistic concurrency via `version` on updates.                                                         |

## FR-5 — Contracts and employment history `[REF][BRIEF]`

| ID     | Requirement                                                                            |
| ------ | -------------------------------------------------------------------------------------- |
| FR-5.1 | `ContractsService.create/list/update` with tenant/employee scoping.                    |
| FR-5.2 | Store salary as `BigInt` minor units + currency + pay frequency; never floating point. |
| FR-5.3 | Immutable employment history rows with from/to snapshots, effective date and actor.    |

## FR-6 — Documents and imports `[REF][BRIEF]`

| ID     | Requirement                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------- |
| FR-6.1 | `uploadUrl`, `confirmUpload`, `list`, `downloadUrl` for employee documents.                             |
| FR-6.2 | Private object storage, tenant-prefixed keys, presigned URLs with short TTL.                            |
| FR-6.3 | Validate file size and MIME type before issuing upload URL; verify object exists on confirm.            |
| FR-6.4 | Record metadata, checksum, uploader, scan status; emit `document.uploaded`; queue AV scan.              |
| FR-6.5 | CSV employee import with validate-first, per-row results, idempotency key+hash, 5MB/1000 rows P1 limit. |
| FR-6.6 | Import modes `create_only` (default) and admin-only `upsert_by_employee_number`.                        |

## FR-7 — Audit and compliance `[REF][BRIEF]`

| ID     | Requirement                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------ |
| FR-7.1 | Append-only audit events with actor, action, resource, before/after snapshots, request metadata. |
| FR-7.2 | Audit read endpoint scoped by tenant and authorization (`audit.read`).                           |
| FR-7.3 | Application DB role has INSERT/SELECT on audit tables only; no UPDATE/DELETE.                    |
| FR-7.4 | Redact secrets and sensitive PII in audit snapshots and logs.                                    |

## FR-8 — Platform services `[REF][BRIEF]`

| ID     | Requirement                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| FR-8.1 | Transactional outbox: event row committed with business mutation; publisher polls and publishes at-least-once. |
| FR-8.2 | Generic approval engine: approval requests and ordered steps with decisions.                                   |
| FR-8.3 | Notifications with in-app/email channels, preferences, dedupe key and delivery audit.                          |
| FR-8.4 | Idempotency key store for applicable POST endpoints.                                                           |
| FR-8.5 | Health checks (`/health/live`, `/health/ready`) and structured request logging.                                |

## FR-9 — Future business domains (data model now, implementation later) `[REF]`

| Domain                 | Functional scope recorded in the architecture                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recruiting/ATS         | Requisitions, postings, candidates, applications, stages, interviews, scorecards, offers; offer accepted → onboarding case + pending employee.                            |
| Onboarding/Offboarding | Checklist templates, tasks, due dates, evidence, provisioning requests, probation, exit tasks; triggered by hire/termination events.                                      |
| Time & Attendance      | Shift templates, schedules, clock events, timesheets, overtime/exception rules; approved time flows to payroll/work orders.                                               |
| Leave & Absence        | Policies, accrual ledger, requests/approvals, balances, holidays, blackout rules; accrual/carryover/proration/eligibility.                                                |
| Payroll & Compensation | Compensation plans/history, pay components, payroll runs, payslips, adjustments, exports, reconciliation; pluggable jurisdiction adapters, maker-checker, locked periods. |
| Performance            | Cycles, goals, check-ins, reviews, feedback, calibration, action plans with strict visibility rules.                                                                      |
| Workforce/Work Orders  | Worker profiles, rate cards, work orders, assignments, shift claims, completion proof, approval, billing exports.                                                         |
| Reporting              | Operational reports and analytics read model/warehouse (future); read replicas for reporting.                                                                             |

## FR-10 — API and integration `[REF][BRIEF][REPO]`

| ID      | Requirement                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FR-10.1 | All endpoints under `/api/v1`; REST + OpenAPI/Swagger.                                                                                   |
| FR-10.2 | Consistent envelopes, RFC 7807 problem-details errors, DTO validation via class-validator.                                               |
| FR-10.3 | Idempotency for payroll, clock events, webhooks, imports and payment callbacks `[REF]`; P1 applies it to imports and selected mutations. |
| FR-10.4 | Signed webhooks with retry/backoff/DLQ as integration capability (detailed design in later phase; PDF text truncated).                   |
| FR-10.5 | Backwards-compatible `/v1` evolution.                                                                                                    |
