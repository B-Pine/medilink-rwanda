# ADR 0009 — Frontend apps on one Vercel project (services)

Status: Proposed (2026-11-04) · Amends [ADR 0006](0006-separate-frontend-and-backend-hosting.md) (frontend hosting only)

## Context

ADR 0006 hosts `patient-web` on `medilink.rw` and `staff-web` on `staff.medilink.rw`, all on hosts in Rwanda. The team wants to deploy the two static frontend apps on Vercel as a single project with [services](https://vercel.com/docs/services), including in production. The Django API, WebSockets, Celery workers, the database and file storage stay on their own hosts.

## Decision

- **One Vercel project** with root directory `frontend/` and `frontend/vercel.json`. It has two services:

  | Service | Root | Public path | Build |
  |---|---|---|---|
  | `patient-web` | `apps/patient-web` | `/` (catch-all, last) | `pnpm run build` (pre-render and PWA checks included) |
  | `staff-web` | `apps/staff-web` | `/staff` and `/staff/*` | `vite build --base /staff/ --outDir dist/staff` |

- **Path prefix.** Vercel passes the original path to a service (`/staff/today` stays `/staff/today`). So `staff-web` is built with the base `/staff/` into `dist/staff/`, and its router basename and the display link follow `import.meta.env.BASE_URL`. Local development, CI and e2e still build `staff-web` at `/`.
- **No bindings.** Both services are static and call only the API, which is not a Vercel service. They read its URL at build time from `VITE_API_BASE_URL`.
- **Patient PWA.** The patient service worker (scope `/`) excludes `/staff` from its navigation fallback, so it never serves the patient shell for a staff page.
- **Headers** are set per service:
  - `frame-ancestors 'none'`, `nosniff` and a referrer policy.
  - Immutable caching for hashed `/assets/`.
  - `noindex` on staff.

## Consequences

- **One origin for both apps.** Patient and staff apps share the origin, so they share `localStorage`: today the theme and language preferences. A script injected into one app could reach the other's storage. Auth cookies stay on the API host (ADR 0006), so sessions are not shared.
- **Backend settings per environment:**
  - `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` and `WS_ALLOWED_ORIGINS` list the single Vercel origin.
  - `PATIENT_APP_URL=https://<host>`.
  - `STAFF_APP_URL=https://<host>/staff`. Email links append paths to it.
- **Data residency.** Vercel serves the static apps from its global network, not from Rwanda. The bundles contain no personal data, and all personal data stays behind the API in Rwanda. This narrows ADR 0006's "all hosts in Rwanda" to "all hosts that hold or process personal data in Rwanda". The data protection officer should confirm this before production.
- **Build environment.** Vercel sets `VITE_API_BASE_URL` (both services) and `VITE_PATIENT_WEB_URL` (staff, the public origin). Corepack provides pnpm 12 from `packageManager`, with `ENABLE_EXPERIMENTAL_COREPACK=1` in the Vercel project.
