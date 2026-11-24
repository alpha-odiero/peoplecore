# 01 — System Requirements Specification

## 1. Purpose

PEOPLECORE is a production-grade Employment Management System (EMS) that acts as the HR system of record across the full employee lifecycle. This specification consolidates the reference architecture plan `[REF]`, the backend brief `[BRIEF]`, and observed repository constraints `[REPO]`.

## 2. Stakeholders

| Stakeholder           | Needs                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| Tenant Admin          | Manage tenant configuration, users, roles, and sensitive operations.          |
| HR Admin / HR Manager | Maintain organization, employees, contracts, documents, and approvals.        |
| Manager               | View and act on direct reports; approve limited workflows.                    |
| Employee              | Self-service profile/documents; later leave, payslips, performance.           |
| Auditor               | Read-only access to audit and compliance evidence.                            |
| Developer / DevOps    | Reproducible local stack, automated quality gates, safe migrations.           |
| Security / Compliance | Tenant isolation, least privilege, immutable evidence, encryption, retention. |

## 3. Scope

### 3.1 In scope for this backend plan

- Complete relational data architecture for all 12 planned capability areas `[REF][BRIEF]`.
- Multi-tenant shared-DB/shared-schema design with `tenant_id` isolation and RLS evaluation `[REF][BRIEF]`.
- Authentication, RBAC+ABAC, field-level redaction, audit-by-default `[REF][BRIEF]`.
- Versioned REST API `/api/v1` with OpenAPI `[REF][BRIEF]`.
- Transactional outbox + BullMQ workers `[REF][BRIEF]`.
- Private object storage with presigned URLs and AV-scan readiness `[REF][BRIEF]`.
- P0/P1 implementation-ready design; P2–P7 architecture and data model only `[REF]`.

### 3.2 Out of scope now

- Microservices, Kubernetes manifests, SSO/SCIM, analytics warehouse, production payroll/tax rule engines, mobile app, employee portal UI. All are either future phases `[REF]` or explicitly deferred by the brief.

## 4. Business constraints

| ID   | Constraint                                                                                          | Source              |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------- |
| C-01 | Deployment model: multi-tenant SaaS-ready, single-tenant deployable; shared DB with `tenant_id`.    | `[REF]` + `[BRIEF]` |
| C-02 | Target org size: SMB to mid-market initially; architecture must scale up.                           | `[REF]`             |
| C-03 | Jurisdiction-specific payroll/tax/leave rules must be configurable rule + adapter, never hardcoded. | `[REF]`             |
| C-04 | This system is the HR master; external IdP/payroll/accounting integrations may be added later.      | `[REF]`             |
| C-05 | Admin/HR/Manager web app first; employee portal later.                                              | `[REF]`             |
| C-06 | Generic/global Core HR first; payroll/tax deferred to P3.                                           | `[REF]`             |
| C-07 | Email/password + MFA-ready first; SSO/SCIM in P7.                                                   | `[REF]`             |
| C-08 | Existing frontend code is preserved; backend integrates through `/api/v1`.                          | `[REPO]`            |

## 5. Technical constraints

| ID   | Constraint                                                                                    | Source              |
| ---- | --------------------------------------------------------------------------------------------- | ------------------- |
| T-01 | Node.js 22+, TypeScript, NestJS modular monolith; no microservices at this stage.             | `[BRIEF]` + `[REF]` |
| T-02 | PostgreSQL 16+ and Prisma; UUID identifiers; decimal-safe or integer minor units for money.   | `[BRIEF]` + `[REF]` |
| T-03 | Redis + BullMQ for jobs; Pino logging; Jest + Supertest; Docker Compose; GitHub Actions.      | `[BRIEF]` + `[REF]` |
| T-04 | MinIO for local storage, S3-compatible production storage; private objects only.              | `[BRIEF]` + `[REF]` |
| T-05 | npm workspaces monorepo.                                                                      | `[BRIEF]`           |
| T-06 | Argon2id, short-lived JWT, opaque rotating refresh tokens, HttpOnly Secure cookie, RBAC+ABAC. | `[BRIEF]` + `[REF]` |
| T-07 | Swagger/OpenAPI and class-validator DTOs.                                                     | `[BRIEF]`           |
| T-08 | Frontend expects port 3000 and `/api/v1`.                                                     | `[REPO]`            |

## 6. Functional scope summary

FR IDs are enumerated in [02-functional-requirements.md](02-functional-requirements.md). Summary: tenant/user/role administration, organization management, employee lifecycle, contracts, documents, audit, approvals, notifications, imports, and future phases for time/leave, payroll, recruiting, performance, workforce, and reporting.

## 7. Non-functional scope summary

See [03-non-functional-requirements.md](03-non-functional-requirements.md): security, tenant isolation, performance, availability, auditability, observability, maintainability, testability, and compliance.

## 8. Success criteria (acceptance at platform level)

1. `docker compose up` starts Postgres, Redis, MinIO, Mailhog, API, and worker with health checks green `[REF]`.
2. CI is green on PR: lint, typecheck, unit/integration tests, build, migration check `[REF][BRIEF]`.
3. All tenant-owned reads/writes are scoped through a validated tenant context; cross-tenant access tests fail the build if they ever pass incorrectly `[REF][BRIEF]`.
4. Every business mutation writes the business row, audit event, and outbox row in one transaction `[REF]`.
5. Invalid employee status transitions return HTTP 409 and create no state change `[REF]`.
6. Private documents are reachable only through short-lived, permission-checked presigned URLs `[REF][BRIEF]`.
7. Sensitive fields are redacted by default in API responses, logs, and audit snapshots `[REF][BRIEF]`.
8. Duplicate jobs/events do not create duplicate business records `[REF][BRIEF]`.

## 9. Assumptions requiring sign-off

| ID   | Assumption                                                                                                                      | Why it matters                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| A-01 | Tenant slug is resolved from subdomain or `X-Tenant-Slug`; no `tenantId` in bodies.                                             | Affects auth flow and all guards.          |
| A-02 | UUIDv7 generation is acceptable.                                                                                                | Affects extension/migration choices.       |
| A-03 | Employee numbers are generated per tenant as `EMP-000001`.                                                                      | Affects uniqueness and import mode.        |
| A-04 | Refresh cookie path is `/api/v1/auth`; cookie name `pc_refresh`.                                                                | Affects frontend/API integration.          |
| A-05 | P1 document AV scanning is "integration readiness" only — status fields and a scanner queue; actual scanner engine is external. | Prevents overstating production readiness. |
| A-06 | Permission cache TTL 60s with explicit invalidation on role changes.                                                            | Affects RBAC freshness.                    |
| A-07 | Pagination is offset-based in P1; keyset added for high-volume endpoints later.                                                 | Matches frontend's page-based UI.          |
