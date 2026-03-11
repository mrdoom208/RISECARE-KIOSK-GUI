# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── risecare-kiosk/     # RISECARE Health Kiosk React frontend
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## RISECARE Health Kiosk

Touch-friendly React/TypeScript GUI for a Raspberry Pi-based health kiosk. Designed for large screens with large touch targets.

**Features:**
- Welcome screen with "Start Measurement" and "View History" buttons
- Patient registration (name, age, gender)
- Vital signs dashboard with interactive cards for all major vitals
- Results summary with color-coded health status (normal/warning/critical)
- Measurement history with session details

**Vital Signs Measured:**
- Blood Pressure (systolic/diastolic mmHg)
- Heart Rate (bpm)
- SpO2 Oxygen Saturation (%)
- Body Temperature (°C)
- Weight (kg) + Height (cm) → auto-calculated BMI
- Blood Glucose (mmol/L)

**Routes:**
- `/` — Welcome screen
- `/register` — Patient registration
- `/session/:id` — Vital signs dashboard
- `/session/:id/results` — Results summary
- `/history` — Session history

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/risecare-kiosk` (`@workspace/risecare-kiosk`)

React + Vite kiosk frontend. Served at `/`.

- Entry: `src/main.tsx`
- App router: `src/App.tsx` (wouter routing)
- Pages: `src/pages/` (Home, Register, Dashboard, Results, History)
- Components: `src/components/` (KioskHeader, VitalCard, KeypadDialog)
- Utils: `src/lib/vitals-utils.ts` (threshold checks, BMI calc, status helpers)

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `health.ts`, `sessions.ts`, `vitals.ts`
- Depends on: `@workspace/db`, `@workspace/api-zod`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- `src/schema/sessions.ts` — `sessionsTable`, `vitalReadingsTable`

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and Orval config. Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas: `CreateSessionBody`, `SaveVitalsBody`, `GetSessionParams`, `SaveVitalsParams`, etc.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks: `useListSessions`, `useCreateSession`, `useGetSession`, `useSaveVitals`, `useGetLatestVitals`.
