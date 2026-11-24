# 00 — Repository Inspection

## 1. What exists today

`[REPO]` Direct inspection of `C:\Users\lenovo\Downloads\employee-management-system-main` found:

```
employee-management-system-main/                 <- current working directory (NOT a git repo)
├── package-lock.json                            <- empty lockfile (name: employee-management-system-main, packages: {})
└── employee-management-system-main/             <- the actual Git repository (clean working tree)
    ├── .git/                                    <- HEAD at acb1d52 "Expand project and web README documentation"
    ├── .gitignore                               <- node_modules, dist, .env*, editor files
    ├── README.md
    ├── docs/
    │   └── project-slides.html                  <- 12-slide presentation (frontend-focused)
    └── apps/
        └── web/                                 <- React 19 + Vite 7 frontend
            ├── .env.example, index.html, package.json, package-lock.json
            ├── tsconfig*.json, vite.config.ts
            └── src/{app,assets,components,features,lib}
```

The newly created backend workspace lives at `backend/` in the outer directory, per instruction, and currently contains only `docs/architecture/`.

## 2. Existing frontend (reusable, do not overwrite)

`[REPO]` The frontend is a working, typechecked React scaffold and is the only production-relevant code in the repository.

| Aspect                 | Finding                                                                                                                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack                  | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5, React Hook Form 7, Zod 4, Sonner.                                                                                                                                                                                                        |
| Package name           | `@employment-system/web` (not `peoplecore`) — naming mismatch with the brief.                                                                                                                                                                                                                                                |
| API client             | `apps/web/src/lib/api.ts` — base URL `http://localhost:3000/api/v1`, Bearer token from `localStorage['ems_access_token']`, throws `ApiError` using `detail` from problem-details responses. **This is directly reusable** for backend integration: keep `/api/v1`, JSON body, Bearer access token, and `detail` error field. |
| Auth                   | `apps/web/src/lib/auth.tsx` — demo-only, plaintext passwords in `localStorage` (`ems_users`, `ems_session`). Must be replaced by real auth at P0.2, but no change is made in plan mode.                                                                                                                                      |
| Route guards           | `ProtectedRoute` redirects to `/login`; aligns with real auth later.                                                                                                                                                                                                                                                         |
| Feature screens        | Employees, org/departments, org chart, approvals, tasks, calendar, leave, payroll, recruiting, onboarding, performance, reports, users/roles, audit, import/export, settings. These define the API surface the backend should ultimately expose.                                                                             |
| Employee UI model      | `{ id, name, email, department, title, status: Active\|Onboarding\|On Leave\|Terminated }`, client-side search/filter/sort/page size 10, bulk terminate. Backend must support server-side equivalents and richer status enum from `[REF]`.                                                                                   |
| Permissions used by UI | `employees.create`, `employees.read` (implied), `employees.update`, `employees.manage_status`, `departments.read/create/update`, `users.read`, `roles.read`, `audit.read`.                                                                                                                                                   |

## 3. Backend code

`[REPO]` **None.** No `apps/api`, no NestJS, no TypeScript backend config, no Prisma schema, no migrations, no seed scripts, no tests, no Docker files, no GitHub Actions workflows. No backend dependencies are installed.

## 4. Database schemas / migrations

`[REPO]` **None.** There is no `prisma/` directory, no SQL migration, and no ERD. The only database guidance is in the PDF `[REF]`: PostgreSQL 16 + Prisma, UUID/ULID ids, `tenant_id` on all tenant-owned tables, audit fields, outbox, immutability rules, and raw SQL for `citext`, triggers, check constraints, a `COALESCE` unique index on `user_roles`, and optional RLS.

## 5. Reusable components

| Item                      | Reuse decision                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/api.ts` | Keep as-is for P0.1 health-check wiring; extend with cookie credentials (`credentials: 'include'`) when refresh cookies are introduced. |
| Frontend feature routes   | Use as the API endpoint inventory cross-check (see doc 12). No rewrite.                                                                 |
| Frontend type `User`      | Extend later with `tenantId`, `scopes`, `employeeId`; backend `/me` response is designed to map cleanly.                                |
| `.gitignore`              | Extend at root for backend (`coverage/`, `*.tsbuildinfo`, `prisma/*.db`) without altering the existing file.                            |
| `.env.example`            | Existing web example already points at `http://localhost:3000/api/v1` — backend must listen on port 3000 in development.                |

## 6. Architectural inconsistencies detected

| #    | Inconsistency                                                                                                                                 | Impact                                              | Resolution (plan only)                                                                                                                                |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| I-01 | Project folder is nested one level deeper than the working directory; outer directory has an empty `package-lock.json` but no `package.json`. | npm workspaces cannot work from either root today.  | Create root `backend/package.json` with npm workspaces. Do not delete the outer lockfile without approval (D-06).                                     |
| I-02 | README says "frontend-only" with localStorage auth, while the PDF requires real auth, tenancy and RBAC.                                       | Security gap; demo auth stores plaintext passwords. | Replace auth at P0.2; until then the frontend must not be pointed at real data.                                                                       |
| I-03 | Frontend permission `employees.manage_status` vs brief/PDF-oriented `employees.change_status`.                                                | Permission checks would silently fail.              | Canonical backend permission `employees.change_status`; frontend migration is an explicit integration task (D-05).                                    |
| I-04 | Frontend employee statuses use Title Case strings; PDF defines 7 lowercase enum states.                                                       | Status mapping mismatch.                            | Backend returns lowercase enum + display label; UI adaptation task at P1.2.                                                                           |
| I-05 | PDF says API `/v1`; frontend uses `/api/v1`.                                                                                                  | Route prefix mismatch.                              | Adopt `/api/v1` `[BRIEF]`; no frontend change needed.                                                                                                 |
| I-06 | PDF says "single-tenant or multi-tenant? (assumes multi-tenant SaaS-ready, confirm)" and has duplicated sections/truncated text.              | Ambiguity.                                          | Brief confirms multi-tenant; duplicate sections treated as restatement; truncated webhook text not expanded beyond existing observability statements. |
| I-07 | PDF Core HR "owns legal entity", but the brief's minimum entity list omits it.                                                                | Missing entity would break org model.               | Include `LegalEntity` as `[REF]`-derived (D-08).                                                                                                      |
| I-08 | PDF mentions SSO/SCIM in module list and P7, but says email/password + MFA-ready first.                                                       | Scope confusion.                                    | SSO/SCIM stays P7; MFA data model only in P0.                                                                                                         |
| I-09 | `docs/project-slides.html` claims "aligned with the architecture plan" but contains no DB/security detail.                                    | Cannot be used as design source.                    | Use PDF as primary source, slides as UI scope confirmation only.                                                                                      |

## 7. Preservation statement

No existing file has been modified or deleted during planning. All deliverables are new files under `backend/docs/architecture/`. Implementation of P0.1 will add new files only; changes to `apps/web` (auth client, permission names, status labels) are explicitly scheduled for later milestones and require approval.
