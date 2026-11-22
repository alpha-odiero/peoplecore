# PeopleCore — Employment Management System

PeopleCore is a frontend for an employment/HR management platform. It provides an admin workspace covering Core HR, onboarding, time & leave, payroll, performance, reporting, and workforce operations.

> **Current status:** frontend-only. Authentication and employee data are demo implementations backed by `localStorage`, and most feature screens are UI scaffolds ready to be connected to a backend API.

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
│       ├── public assets     # (served through Vite)
│       └── src/
│           ├── app/          # Route definitions (App.tsx)
│           ├── assets/       # Images, including PeopleCore.png logo
│           ├── components/
│           │   ├── auth/     # ProtectedRoute
│           │   ├── layout/   # AppLayout (sidebar, header, command palette)
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

### Install and run

```bash
cd apps/web
npm install
npm run dev
```

Open <http://localhost:5173>. The dev server port is configured in `apps/web/vite.config.ts`.

If you are at the repository root, use `cd apps/web` first — `package.json` lives in that directory, not at the root.

### Environment variables

Copy `.env.example` to `.env` in `apps/web` to point the API client at your backend:

```bash
cd apps/web
cp .env.example .env
```

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | Base URL used by `src/lib/api.ts` |

### Scripts

Run these from `apps/web`:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Typecheck with `tsc -b` and create a production build in `dist/` |
| `npm run typecheck` | Run the TypeScript project check only |
| `npm run preview` | Serve the production build locally |

## Authentication and access control

- `/login` and `/register` are public; all other routes sit behind `ProtectedRoute` and redirect to `/login` when signed out.
- The demo auth provider in `src/lib/auth.tsx` stores accounts, the session, and permissions in `localStorage`. New accounts are created locally through the registration screen — there are no seeded credentials.
- Registered users receive the `Tenant Admin` role and a default permission set (employee, department, user, role, and audit read/manage permissions).
- `useAuth().hasPermission(...)` controls visibility of permission-gated navigation items and actions (for example, creating an employee).

Relevant local storage keys: `ems_users`, `ems_session`, `ems_access_token`, `ems_theme`.

## Features and routes

The sidebar groups the following screens:

| Area | Routes |
| --- | --- |
| Overview | `/` (Dashboard), `/activity`, `/reports` |
| Core HR | `/employees`, `/employees/:id`, `/org/departments`, `/org/chart` |
| Workflows | `/approvals`, `/tasks`, `/calendar`, `/leave`, `/payroll` |
| Talent | `/recruiting`, `/onboarding`, `/performance` |
| Administration | `/admin/users-roles`, `/admin/audit`, `/admin/import-export`, `/settings` |

The app shell also includes:

- Responsive sidebar with mobile drawer
- Light/dark theme toggle persisted in local storage
- Command palette (Ctrl/Cmd + K) for quick navigation
- Notification popover and toast feedback

## Backend integration notes

`src/lib/api.ts` exposes a typed `apiClient` with `get`, `post`, `patch`, and `delete` helpers. Requests include a JSON content type and, when present, an `Authorization: Bearer` token from `ems_access_token`. Failed requests throw `ApiError` with the HTTP status and parsed response body.

To connect a screen:

1. Call `apiClient` from a React Query hook or component.
2. Replace the local demo state/mock data in the relevant `src/features/*` page.
3. Map backend roles/permissions into the `User` type in `src/lib/auth.tsx` if you replace the demo auth flow.

## Roadmap

- Replace demo localStorage auth with real API-backed sessions and token refresh
- Wire feature pages to backend endpoints and real data
- Add tenant/location context and location-based access rules
- Expand onboarding, leave, payroll, and performance workflows
- Add automated tests and CI

## Troubleshooting

- **`npm error enoent ... package.json`** — you are in the wrong folder; run commands from `apps/web`.
- **Port 5173 already in use** — stop the other process or change `server.port` in `apps/web/vite.config.ts`.
- **Styles look wrong** — ensure `npm install` completed and `src/index.css` is imported in `src/main.tsx`.
