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

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:3000/api/v1` | Base URL used by `src/lib/api.ts` |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Typecheck (`tsc -b`) and build to `dist/` |
| `npm run typecheck` | Run the TypeScript project check |
| `npm run preview` | Serve the production build |

## Source layout

```text
src/
├── app/App.tsx               # Route table
├── assets/                   # Images (PeopleCore.png logo)
├── components/
│   ├── auth/ProtectedRoute.tsx
│   ├── layout/AppLayout.tsx  # Sidebar, header, command palette, theme toggle
│   └── ui/                   # Reusable Button, Input, Modal, PageHeader, StatCard
├── features/                 # Feature screens, one folder per area
├── lib/
│   ├── api.ts                # Fetch wrapper and apiClient
│   └── auth.tsx              # Demo auth context and permission helper
├── index.css                 # Tailwind theme tokens and global styles
└── main.tsx                  # Providers (QueryClient, AuthProvider, Router, Toaster)
```

The `@` alias points to `src/` (see `vite.config.ts` and `tsconfig.app.json`).

## Routes

Public: `/login`, `/register`. Everything else requires authentication and renders inside `AppLayout`.

- Overview: `/`, `/activity`, `/reports`
- Core HR: `/employees`, `/employees/:id`, `/org/departments`, `/org/chart`
- Workflows: `/approvals`, `/tasks`, `/calendar`, `/leave`, `/payroll`
- Talent: `/recruiting`, `/onboarding`, `/performance`
- Administration: `/admin/users-roles`, `/admin/audit`, `/admin/import-export`, `/settings`

Unknown routes redirect to `/`.

## Auth and data

Authentication is a demo implementation in `src/lib/auth.tsx`: accounts and sessions live in `localStorage` (`ems_users`, `ems_session`). Register a local account at `/register` to sign in. `hasPermission()` gates navigation entries and actions; newly registered users get the `Tenant Admin` role with a default permission list.

Most feature pages currently use local state/mock data. `src/lib/api.ts` provides `apiClient` (GET/POST/PATCH/DELETE) with bearer-token injection and an `ApiError` type, ready for backend integration.

## UI notes

- Sidebar collapses to a drawer on small screens.
- Light/dark theme is persisted under `ems_theme`.
- Ctrl/Cmd + K opens the page search palette.

## Troubleshooting

- Run commands from this directory; there is no root `package.json`.
- If port 5173 is busy, change `server.port` in `vite.config.ts`.
