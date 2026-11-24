# PEOPLECORE Backend Architecture

Status: **IMPLEMENTED BASELINE — see `docs/audit/PEOPLECORE_FINAL_IMPLEMENTATION_REPORT.md` for current implementation status and verification evidence.**

The documents in this directory remain the architecture baseline. Runtime implementation lives under `apps/api`, persistence under `apps/api/prisma`, shared contracts under `packages/shared`, and operations verification under `tests`.

## Source labels used throughout the documents

| Label          | Meaning                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `[REF]`        | Explicitly stated in `employment-management-system-plan.pdf` (10 pages, generated 2026-11-21).                   |
| `[BRIEF]`      | Explicitly required by the backend architecture brief supplied with this task.                                   |
| `[REPO]`       | Observed in the existing repository by direct inspection.                                                        |
| `[ASSUMPTION]` | A recommendation/addition that is **not** stated in the reference PDF; needs confirmation before implementation. |

Nothing in this document set silently replaces a decision from the reference PDF. Where the brief adds detail (e.g. Argon2id, cookie transport, MinIO), it is recorded as `[BRIEF]` and composed with the PDF rather than substituted for it.

## Reference document handling

The referenced `employment-management-system-plan.pdf` was **not** inside the repository; it was found at `C:\Users\lenovo\Downloads\employment-management-system-plan.pdf` and text-extracted for analysis. It contains a repeated/duplicated "Data Architecture" and "API & Integration Design" section on page 5, and one truncated sentence ("Webhooks: signed, retry wit"). The plan relies on the later, complete observability section (retries/backoff/DLQ/circuit breakers) for those details and does **not** invent additional webhook semantics.

## Deliverable index

| #   | Document                                                                   | Covers                                                                                           |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 00  | [Repository inspection](00-repository-inspection.md)                       | Existing files, deps, frontend, backend, schemas, inconsistencies, preservation decisions        |
| 01  | [System requirements](01-system-requirements.md)                           | Stakeholders, constraints, assumptions, scope, success criteria                                  |
| 02  | [Functional requirements](02-functional-requirements.md)                   | Module-level functional requirements, FR IDs                                                     |
| 03  | [Non-functional requirements](03-non-functional-requirements.md)           | Security, performance, availability, compliance, observability NFRs                              |
| 04  | [High-level architecture](04-high-level-architecture.md)                   | Context, containers, components, data flows, deployment view                                     |
| 05  | [Backend module architecture](05-backend-module-architecture.md)           | Domain modules, public interfaces, module boundaries, dependency rules                           |
| 06  | [Database entity inventory](06-database-entity-inventory.md)               | Every entity: purpose, attributes/types, nullability, keys, FKs, indexes, tenant, classification |
| 07  | [ERD](07-erd.md)                                                           | Mermaid ER diagrams per domain plus cross-domain overview                                        |
| 08  | [Prisma schema design](08-prisma-schema-design.md)                         | Complete `schema.prisma` design draft, enums, relations, raw SQL follow-ups                      |
| 09  | [Constraints and indexing](09-constraints-and-indexing.md)                 | DB constraints, RLS, indexes, migrations, seed strategy                                          |
| 10  | [Authentication and authorization](10-authentication-authorization.md)     | Tokens, sessions, tenant resolution, RBAC+ABAC, redaction                                        |
| 11  | [RBAC permission matrix](11-rbac-permission-matrix.md)                     | Roles, permissions, scopes, matrix                                                               |
| 12  | [API endpoint specification](12-api-endpoint-specification.md)             | `/api/v1` endpoints, DTOs, envelopes, errors, pagination, idempotency                            |
| 13  | [Employee lifecycle state machine](13-employee-lifecycle-state-machine.md) | Transition matrix, side effects, 409 behaviour                                                   |
| 14  | [Event-driven architecture](14-event-driven-architecture.md)               | Outbox, event catalogue, BullMQ queues, retries, idempotency                                     |
| 15  | [Security threat assessment](15-security-threat-assessment.md)             | Attack scenarios, mitigations, verification tests                                                |
| 16  | [Repository structure](16-repository-structure.md)                         | Monorepo layout, workspace boundaries, module folder conventions                                 |
| 17  | [Docker and DevOps plan](17-docker-devops-plan.md)                         | Compose stack, env validation, CI/CD, migrations, backups, monitoring                            |
| 18  | [Testing strategy](18-testing-strategy.md)                                 | Test pyramid, critical scenarios, fixtures, coverage gates                                       |
| 19  | [Implementation roadmap](19-implementation-roadmap.md)                     | P0.1–P7 milestones, dependencies, acceptance criteria, deliverables                              |
| 20  | [Development task breakdown](20-development-task-breakdown.md)             | Ticket-level tasks with acceptance criteria                                                      |

## Implementation notes

- Multi-tenant isolation uses `TenantGuard`, `PrismaService` tenant-context extension, and PostgreSQL RLS. New business-domain tables are covered by forward-only RLS migration `20261123181500_tenant_rls_business_domains`.
- Authentication uses Argon2 password verification with constant-work handling for unknown users, access tokens with permission-version claims, and cached principals invalidated by tenant/user/version.
- API modules include HR core, auth/platform, leave, attendance, payroll, recruiting, performance, approvals, notifications, reporting inputs, and dashboard aggregates.
- Reliability uses an outbox dispatcher. It runs directly on a 5-second interval when Redis is not configured and through BullMQ when Redis is available.
- The frontend consumes `/api/v1` through a typed client with bearer-token injection and 15-second request timeouts.
- Remaining architecture gaps are locations/job profiles/positions/hierarchy CRUD, a true org-chart hierarchy endpoint, a dedicated reporting aggregate endpoint, and Docker-based smoke verification.

## Decisions to confirm before P0.1

These are carried over from the PDF's "Ready-to-Build Checklist" `[REF]` plus items discovered during inspection.

| ID   | Decision                 | Recommendation in this plan                                                                                                                            | Source                                                  |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| D-01 | Tenant resolution        | Subdomain primary; `X-Tenant-Slug` for local/dev and API clients. Never accept `tenantId` in request bodies.                                           | `[REF]` checklist + `[BRIEF]`                           |
| D-02 | Token transport          | Access token in `Authorization: Bearer`; refresh token in `HttpOnly; Secure; SameSite=Strict` cookie.                                                  | `[BRIEF]` (PDF checklist asked to confirm)              |
| D-03 | Employee number          | Tenant-scoped generated `EMP-000001` (configurable prefix/padding in `Tenant` settings).                                                               | `[ASSUMPTION]` (PDF checklist asked to confirm)         |
| D-04 | UUID version             | UUIDv7 (`pg_uuidv7`) for time-ordered index locality; UUIDv4 fallback if extension unavailable. Still UUID everywhere.                                 | `[ASSUMPTION]` (PDF says UUID/ULID)                     |
| D-05 | Permission name conflict | Canonical `employees.change_status`; frontend's `employees.manage_status` `[REPO]` must be migrated during integration. No alias in backend.           | `[BRIEF]` vs `[REPO]`                                   |
| D-06 | Backend placement        | New `backend/` folder at the outer working directory root (per instruction). Existing nested Git repo with `apps/web` is left untouched.               | `[REPO]` + user instruction                             |
| D-07 | Web integration          | Existing web app remains at `employee-management-system-main/apps/web` and is integrated through `VITE_API_BASE_URL`; no workspace move was performed. | `[REPO]` + implemented integration                      |
| D-08 | Legal entity             | Included as an explicit Organization entity because the PDF lists it as Core HR-owned.                                                                 | `[REF]`                                                 |
| D-09 | Auth rate limits         | 5 failed logins / 15 min per IP+email, exponential lock; 10 resets/hour per email.                                                                     | `[ASSUMPTION]` (PDF requires rate limiting, no numbers) |
| D-10 | SSO/SCIM                 | Deferred to P7 per PDF; MFA-ready data model only in P0.                                                                                               | `[REF]`                                                 |
