# PeopleCore — Employment Management System

PeopleCore is the React admin workspace for the employment/HR platform. It is integrated with the NestJS API in `../../../backend` and covers Core HR, onboarding, time and leave, payroll, performance, reporting, workforce operations, and administration.

## Current status

The frontend is API-backed. Authentication, employee data, dashboards, approvals, leave, attendance, payroll, recruiting, performance, reports, activity, tasks, calendar, onboarding, org chart, and notifications call `/api/v1` through the typed client in `src/lib/api.ts`.

Frontend verification: `npm run typecheck` and `npm run build` pass. The production build emits only dependency-comment and chunk-size warnings.

## Tech stack

- React 19 + TypeScript
- Vite 7 (dev server and production bundling)
- Tailwind CSS 4 (via `@tailwindcss/vite`)
- React Router 7 (routing and route guards)
- TanStack React Query 5 (async state, configured globally in `src/main.tsx`)
- React Hook Form + Zod (form handling and validation)
- Sonner (toast notifications)
- Lucide-style inline SVG icons (no icon package required)

## Repository structure

```text
.
├── apps/
│   └── web/                  # React admin frontend
│       ├── public assets     # served through Vite
│       └── src/
│           ├── app/          # Route definitions (App.tsx)
│           ├── assets/       # Images, including PeopleCore.png logo
│           ├── components/
│           │   ├── auth/     # ProtectedRoute
│           │   ├── layout/   # AppLayout (sidebar, header, command palette, notification bell)
│           │   └── ui/       # Button, Input, Modal, PageHeader, StatCard
│           ├── features/     # One folder per product area
│           ├── lib/          # auth context and API client
│           ├── index.css     # Tailwind theme and global styles
│           └── main.tsx      # App bootstrap and providers
├── docs/                     # Project slides and documentation
└── README.md
```

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+ (Vite 7 requirement)
- npm
- A running PEOPLECORE backend from `../../backend`

### Install and run

```bash
cd apps/web
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server port is configured in `apps/web/vite.config.ts`.

If you are at this README's directory, use `cd apps/web` first — `package.json` lives in that directory, not at the repository root.

### Environment variables

Copy `.env.example` to `.env` in `apps/web` to point the API client at your backend:

```bash
cd apps/web
cp .env.example .env
```

| Variable            | Default                        | Description                       |
| ------------------- | ------------------------------ | --------------------------------- |
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | Base URL used by `src/lib/api.ts` |

Production builds without `VITE_API_BASE_URL` use `https://peoplecore-duam.onrender.com/api/v1`.

### Scripts

Run these from `apps/web`:

| Command             | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Start the Vite development server                                |
| `npm run build`     | Typecheck with `tsc -b` and create a production build in `dist/` |
| `npm run typecheck` | Run the TypeScript project check only                            |
| `npm run preview`   | Serve the production build locally                               |

## Authentication and access control

- `/login` and `/register` are public; all other routes sit behind `ProtectedRoute` and redirect to `/login` when signed out.
- `src/lib/auth.tsx` calls `authApi.login()`, `authApi.register()`, `authApi.me()`, and `authApi.logout()`.
- The access token, tenant slug, and session user are cached in `localStorage` under `ems_access_token`, `ems_tenant_slug`, and `ems_auth_session`.
- On app load, `authApi.me()` refreshes the current user and clears stale sessions on failure.
- `useAuth().hasPermission(...)` controls permission-gated navigation and actions. Frontend aliases map legacy permission names to backend names.

## Features and routes

The sidebar groups the following screens:

| Area           | Routes                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| Overview       | `/` (Dashboard), `/activity`, `/reports`                                  |
| Core HR        | `/employees`, `/employees/:id`, `/org/departments`, `/org/chart`          |
| Workflows      | `/approvals`, `/tasks`, `/calendar`, `/leave`, `/attendance`, `/payroll`  |
| Talent         | `/recruiting`, `/onboarding`, `/performance`                              |
| Administration | `/admin/users-roles`, `/admin/audit`, `/admin/import-export`, `/settings` |

The app shell also includes:

- Responsive sidebar with mobile drawer
- Light/dark theme toggle persisted in local storage
- Command palette (Ctrl/Cmd + K) for quick navigation
- API-backed notification popover with unread count and mark-all-read
- Sonner toast feedback

## Backend integration notes

`src/lib/api.ts` exposes a typed `apiClient` with `get`, `post`, `patch`, and `delete` helpers. Requests include a JSON content type, tenant header, and, when present, an `Authorization: Bearer` token from `ems_access_token`.

The client provides:

- 15-second request timeout with `AbortController`
- caller-signal propagation
- token refresh retry for expired access tokens
- typed `ApiError` with HTTP status and parsed response body
- domain clients for auth, employees, departments, dashboard, audit, approvals, notifications, leave, attendance, payroll, recruiting, performance, and onboarding

Known frontend gaps:

- Org chart uses the department API; a true hierarchy endpoint is not implemented yet.
- Reports derive values from existing APIs; a dedicated reporting aggregate endpoint is not implemented yet.

## Troubleshooting

- **`npm error enoent ... package.json`** — you are in the wrong folder; run commands from `apps/web`.
- **Port 5173 already in use** — stop the other process or change `server.port` in `apps/web/vite.config.ts`.
- **Styles look wrong** — ensure `npm install` completed and `src/index.css` is imported in `src/main.tsx`.
- **`401` after starting the backend** — rerun backend seed and confirm the app sends the tenant configured by the backend environment.
