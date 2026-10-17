# ADR 0007 — Frontend toolchain

Status: Accepted for Sprint 0 (2026-10-17) · Revisit after the pilot.

## Context
[ADR 0003](0003-stack-django-react-postgresql.md) chose React + TypeScript + Vite and left the UI library to the design phase. The design research ([design/research](../design/research/README.md)) defines tokens, components and accessibility rules. Two apps (staff, patient) must share components and the API client, and be built and hosted as static sites ([ADR 0006](0006-separate-frontend-and-backend-hosting.md)).

## Decision
| Concern | Choice |
|---|---|
| Workspace | **pnpm workspaces** in `frontend/` (`apps/*`, `packages/*`) |
| Language | TypeScript, `strict: true` |
| Framework / build | **React 19** + **Vite** (latest stable) |
| Routing | React Router (latest major, library/data mode) |
| Server state | TanStack Query |
| Forms / validation | react-hook-form + zod |
| Styling | **Tailwind CSS v4** driven by CSS-variable **design tokens** (colours, type, spacing, radius from design research 02–03), light and dark themes |
| Accessible primitives | Radix UI primitives, wrapped by our own components in `packages/ui` |
| Icons | Phosphor (`@phosphor-icons/react`) |
| i18n | i18next + react-i18next, ICU plurals; `rw` (default), `en`, `fr` |
| API client | `packages/api-client`: typed fetch wrapper (credentials, CSRF, error parsing); types generated with `openapi-typescript` from the backend schema |
| Mocks | **MSW** (Mock Service Worker) implementing the sprint contract, so the frontend can be built before the endpoint exists |
| PWA | vite-plugin-pwa (patient-web only) |
| Public page pre-rendering | Build-time pre-rendering of public routes (decided in Sprint 1, when the public pages land) |
| Tests | Vitest + Testing Library (unit/component), axe checks (vitest-axe), Playwright (end-to-end) |
| Lint / format | ESLint (typescript-eslint, react, react-hooks, jsx-a11y; `react/no-danger` = error), Prettier |
| Fonts | Figtree + Inter, **self-hosted** (`@fontsource`), no runtime Google Fonts |

ADR 0003 mentioned React 18; React 19 is the current stable major and is adopted here.

## Consequences
- One component library (`packages/ui`) enforces the design system across both apps.
- MSW mocks must stay in sync with the OpenAPI contract. The CI type generation step reveals drift.
