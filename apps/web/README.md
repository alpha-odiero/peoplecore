# PeopleCore Web Admin

React + Vite + TypeScript frontend for the PeopleCore employment management system.

## Stack

- React 19 + TypeScript
- Vite 7 (dev server configured on port 5173)
- Tailwind CSS 4 via `@tailwindcss/vite`
- React Router 7
- TanStack React Query 5
- React Hook Form, Zod, and `@hookform/resolvers`
- Sonner for toasts

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

Copy `.env.example` to `.env` to override the API base URL:

```bash
cp .env.example .env
```

| Variable            | Default                        | Description                       |
| ------------------- | ------------------------------ | --------------------------------- |
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | Base URL used by `src/lib/api.ts` |

The backend lives at `../../../backend` and must be running for the app to load real data.

## Scripts

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start the development server              |
| `npm run build`     | Typecheck (`tsc -b`) and build to `dist/` |
| `npm run typecheck` | Run the TypeScript project check          |
| `npm run preview`   | Serve the production build                |

`npm run typecheck` and `npm run build` pass; the build emits only dependency-comment and chunk-size warnings.

## Source layout

```text
src/
├── app/App.tsx               # Route table
├── assets/                   # Images (PeopleCore.png logo)
├── components/
│   ├── auth/ProtectedRoute.tsx
│   ├── layout/AppLayout.tsx  # Sidebar, header, command palette, notification bell
│   └── ui/                   # Reusable Button, Input, Modal, PageHeader, StatCard
├── features/                 # API-backed feature screens
├── lib/
│   ├── api.ts                # Typed API client and domain clients
│   └── auth.tsx              # API-backed auth context and permission helper
├── index.css                 # Tailwind theme tokens and global styles
└── main.tsx                  # Providers (QueryClient, AuthProvider, Router, Toaster)
```

The `@` alias points to `src/` (see `vite.config.ts` and `tsconfig.app.json`).

## Routes

Public: `/login`, `/register`. Everything else requires authentication and renders inside `AppLayout`.

- Overview: `/`, `/activity`, `/reports`
- Core HR: `/employees`, `/employees/:id`, `/org/departments`, `/org/chart`
- Workflows: `/approvals`, `/tasks`, `/calendar`, `/leave`, `/attendance`, `/payroll`
- Talent: `/recruiting`, `/onboarding`, `/performance`
- Administration: `/admin/users-roles`, `/admin/audit`, `/admin/import-export`, `/settings`

Unknown routes redirect to `/`.

## Auth and data

Authentication is API-backed in `src/lib/auth.tsx` through `authApi.login()`, `authApi.register()`, `authApi.me()`, and `authApi.logout()`.

Cached local storage keys are `ems_access_token`, `ems_tenant_slug`, and `ems_auth_session`. Stale sessions are cleared when `authApi.me()` fails. `hasPermission()` gates navigation entries and actions.

`src/lib/api.ts` provides typed domain clients for all integrated features. Requests include bearer-token injection, tenant headers, 15-second timeout/cancellation, and refresh-token retry.

Known gaps: the org chart uses department data until a hierarchy API exists, and reports derive from existing APIs until a dedicated aggregate endpoint exists.

## UI notes

- Sidebar collapses to a drawer on small screens.
- Light/dark theme is persisted under `ems_theme`.
- Ctrl/Cmd + K opens the page search palette.
- Header notification bell reads from the notifications API.

## Troubleshooting

- Run commands from this directory; there is no root `package.json`.
- If port 5173 is busy, change `server.port` in `vite.config.ts`.
- If API requests fail immediately, check `VITE_API_BASE_URL` and confirm the backend is running.
