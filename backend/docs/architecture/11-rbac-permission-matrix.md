# 11 — RBAC Permission Matrix

Permission format is `resource.action` `[REF]`. The six roles are exactly those in the PDF/brief `[REF][BRIEF]`. Matrix codes: **F** full, **C** create, **R** read, **U** update, **D** deactivate/delete, **S** scoped by ABAC, **X** redacted/limited, **–** no access.

## 1. Permission catalogue (seed data)

| Domain       | Permission                                                       | Description                                       |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------- |
| Auth         | `users.manage`                                                   | Invite, update, disable, reset users.             |
| Auth         | `users.read`                                                     | List/view users.                                  |
| Auth         | `roles.manage`                                                   | Create/edit roles and grants.                     |
| Auth         | `roles.read`                                                     | View roles and matrices.                          |
| Auth         | `permissions.read`                                               | View permission catalogue.                        |
| Organization | `departments.create` / `.read` / `.update` / `.deactivate`       | Department CRUD.                                  |
| Organization | `locations.create` / `.read` / `.update` / `.deactivate`         | Location CRUD.                                    |
| Organization | `job_profiles.create` / `.read` / `.update`                      | Job profile CRUD.                                 |
| Organization | `positions.create` / `.read` / `.update`                         | Position CRUD.                                    |
| Employees    | `employees.create`                                               | Create employee records/imports.                  |
| Employees    | `employees.read`                                                 | List/view non-sensitive employee data.            |
| Employees    | `employees.update`                                               | Update employee profile.                          |
| Employees    | `employees.change_status`                                        | Perform state transitions (canonical name, D-05). |
| Employees    | `employees.read_sensitive`                                       | View national ID, DOB, private contact data.      |
| Employees    | `employees.view_salary`                                          | View salary/compensation fields.                  |
| Employees    | `employees.get_history`                                          | View employment history.                          |
| Contracts    | `contracts.create` / `.read` / `.update`                         | Contract CRUD.                                    |
| Documents    | `documents.upload` / `.read` / `.download` / `.delete`           | Private document lifecycle.                       |
| Platform     | `audit.read`                                                     | Read audit and data-access events.                |
| Platform     | `approvals.create` / `.read` / `.decide`                         | Approval workflows.                               |
| Platform     | `notifications.read` / `.manage_preferences`                     | Inbox and preferences.                            |
| Platform     | `imports.create` / `.read`                                       | CSV imports (upsert mode admin-only).             |
| Platform     | `integrations.manage`                                            | Provider connections (P7).                        |
| Leave        | `leave.request` / `.read` / `.approve` / `.manage_policies`      | P2.                                               |
| Attendance   | `attendance.record` / `.read` / `.manage` / `timesheets.approve` | P2.                                               |
| Payroll      | `payroll.manage` / `.read` / `.approve` / `.export`              | P3 (maker-checker: `.manage` ≠ `.approve`).       |
| Recruiting   | `recruiting.manage` / `.read`                                    | P4.                                               |
| Onboarding   | `onboarding.manage` / `.read`                                    | P4.                                               |
| Performance  | `performance.read` / `.manage` / `.calibrate`                    | P5.                                               |
| Workforce    | `workforce.manage` / `.read` / `.approve`                        | P6.                                               |
| Reporting    | `reports.read` / `reports.export`                                | P7.                                               |

`employees.manage_status` used by the existing frontend `[REPO]` is **not** a backend permission; it maps to `employees.change_status` (D-05).

## 2. Role definitions

| Role key       | Purpose                                                                         | Default scope                     |
| -------------- | ------------------------------------------------------------------------------- | --------------------------------- |
| `tenant_admin` | Full tenant administration including users/roles and sensitive data.            | entire_tenant                     |
| `hr_admin`     | Day-to-day HR operations and configuration.                                     | entire_tenant                     |
| `hr_manager`   | HR business partner with scoped employee ownership.                             | department or location (assigned) |
| `manager`      | Line manager for direct reports.                                                | direct_reports                    |
| `employee`     | Self-service only.                                                              | self                              |
| `auditor`      | Read-only compliance visibility; no sensitive values unless explicitly granted. | entire_tenant (read-only)         |

## 3. P0/P1 permission matrix

| Permission                                     | Tenant Admin | HR Admin    | HR Manager | Manager                                 | Employee                 | Auditor           |
| ---------------------------------------------- | ------------ | ----------- | ---------- | --------------------------------------- | ------------------------ | ----------------- |
| `users.manage`, `roles.manage`                 | F            | R (limited) | –          | –                                       | –                        | –                 |
| `users.read`, `roles.read`, `permissions.read` | F            | R           | –          | –                                       | –                        | R                 |
| `departments.create/update/deactivate`         | F            | F           | R/U        | R                                       | –                        | –                 |
| `departments.read`                             | F            | F           | S          | S                                       | R                        | R                 |
| `locations.*`, `job_profiles.*`, `positions.*` | F            | F           | R/U        | R                                       | R                        | R                 |
| `employees.create`                             | F            | F           | S          | –                                       | –                        | –                 |
| `employees.read`                               | F            | F           | S          | S (direct reports)                      | S (self)                 | X (redacted)      |
| `employees.update`                             | F            | F           | S          | S                                       | S (self, limited fields) | –                 |
| `employees.change_status`                      | F            | F           | S          | S (direct reports, limited transitions) | –                        | –                 |
| `employees.read_sensitive`                     | F            | F           | S          | –                                       | S (self)                 | –                 |
| `employees.view_salary`                        | F            | F           | S          | –                                       | –                        | –                 |
| `employees.get_history`                        | F            | F           | S          | S                                       | S (self)                 | R                 |
| `contracts.create/read/update`                 | F            | F           | S          | X                                       | S (self, read)           | R (redacted)      |
| `documents.upload/read/download/delete`        | F            | F           | S          | S                                       | S (self)                 | R (metadata only) |
| `approvals.create/read/decide`                 | F            | F           | F          | S                                       | S (self)                 | R                 |
| `notifications.read/manage_preferences`        | F            | F           | F          | F                                       | F (self)                 | F (self)          |
| `imports.create/read`                          | F            | F           | –          | –                                       | –                        | –                 |
| `audit.read`                                   | F            | R           | –          | –                                       | –                        | R                 |
| `integrations.manage`                          | F            | –           | –          | –                                       | –                        | –                 |

This is the PDF's summary matrix expanded to granular permissions; the PDF's high-level pattern (full/R- limited/scoped/redacted) is preserved `[REF]`.

## 4. Scope semantics

| Scope            | Applies when                                  | Enforcement                                                               |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `self`           | Actor is the subject employee/user.           | `resource.employeeId = ctx.employeeId` or `resource.userId = ctx.userId`. |
| `direct_reports` | Subject is in manager's reporting subtree.    | Recursive CTE over `employees.manager_employee_id` or `org_unit_closure`. |
| `department`     | Subject department is in assigned scope refs. | `resource.departmentId IN ctx.scopeRefs(type='department')`.              |
| `location`       | Subject location is in assigned scope refs.   | `resource.locationId IN ctx.scopeRefs(type='location')`.                  |
| `entire_tenant`  | No additional predicate.                      | `tenant_id = ctx.tenantId` always.                                        |

A user can hold multiple `UserRole` rows; effective access is the **union** of permissions, and effective data visibility is the **union** of scopes. A `tenant_admin` assignment cannot be created by `hr_admin`; only `tenant_admin` (or a platform operator via controlled bootstrap) may grant it.

## 5. Field-level matrix (selected)

| Field                                                                          | Tenant Admin               | HR Admin | HR Manager       | Manager           | Employee       | Auditor                     |
| ------------------------------------------------------------------------------ | -------------------------- | -------- | ---------------- | ----------------- | -------------- | --------------------------- |
| `employeeNumber`, `firstName`, `lastName`, `workEmail`, `status`, `department` | visible (scoped)           | visible  | visible (scoped) | visible (reports) | visible (self) | visible (redacted snapshot) |
| `salaryMinor`, `currency`, `payFrequency`                                      | visible                    | visible  | scoped           | hidden            | hidden         | hidden                      |
| `nationalIdEnc`, `dateOfBirthEnc`, `addressEnc`                                | visible                    | visible  | scoped           | hidden            | own only       | hidden                      |
| `notesEnc`                                                                     | visible                    | visible  | scoped           | hidden            | own only       | hidden                      |
| document download URL                                                          | yes                        | yes      | scoped           | scoped            | own only       | no                          |
| audit before/after                                                             | visible (secrets redacted) | visible  | –                | –                 | –              | visible (redacted)          |

## 6. Policy evaluation rules

1. Deny if tenant mismatch — always, even for admins.
2. Deny if permission missing.
3. For `list` endpoints, scope predicate is pushed into SQL (no post-filtering that leaks counts).
4. For `findById`, out-of-scope returns 404 (not 403) to avoid existence disclosure.
5. For `changeStatus`, additional transition permission may be required (e.g. managers cannot terminate without HR approval — `[ASSUMPTION]`, confirm in P1.2 UAT).
6. Field redaction occurs on response DTOs, audit snapshots, logs and notification payloads.
7. Every decision is unit-tested in a role × scope × field table (doc 18).
