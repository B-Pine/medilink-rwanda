# Patient web app (PWA)

Phase-1 patient channel: find facilities, check insurance and cost, book or join today's queue,
track position, see visits, prescriptions, documents and receipts, manage dependents, raise disputes.

Stack: React 19 + TypeScript + Vite, installable PWA (vite-plugin-pwa), static build hosted at
`medilink.rw` ([ADR 0006](../../../docs/decisions/0006-separate-frontend-and-backend-hosting.md),
[ADR 0007](../../../docs/decisions/0007-frontend-toolchain.md)). Kinyarwanda first, large type,
low bandwidth. Public pages will be pre-rendered for search engines (decided in Sprint 1).
Workspace setup and conventions: [frontend README](../../README.md).

## Sprint 0 (what exists)

| Route                                                       | Screen                                                                                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                                         | Public landing skeleton: deep forest hero, search box placeholder (service / location / insurance), how it works, trust, "for facilities" band, emergency notice, footer |
| `/login`                                                    | Email-first login: email, then password, or "create an account with this email"                                                                                          |
| `/signup`                                                   | Sign-up: names, email, password (15+), language → consent (terms + privacy required, research optional and unticked)                                                     |
| `/home`                                                     | Patient home placeholder (guarded by `GET /api/v1/patient/auth/me/`), logout                                                                                             |
| `/verify`, `/for-facilities`, `/help`, `/privacy`, `/terms` | Placeholder public pages                                                                                                                                                 |
| `/forgot-password`, `/reset-password?uid=&token=`           | Password reset                                                                                                                                                           |
| anything else                                               | 404                                                                                                                                                                      |

Patient density: 18 px body text, controls and targets ≥ 48 px, primary actions 56 px.

PWA: `manifest.webmanifest` (name, `start_url: /`, standalone, 192/512/maskable icons, `lang: rw`)
and a Workbox service worker that precaches the app shell only. It never caches `/api/`
(excluded from the navigation fallback and an explicit `NetworkOnly` rule), is not registered
in mock mode, and `pnpm build` fails if these properties are lost (`scripts/check-pwa.mjs`).

## Run

```bash
cd frontend
pnpm --filter @medilink/patient-web dev:mock   # http://localhost:5174 with MSW mocks
pnpm --filter @medilink/patient-web dev        # against VITE_API_BASE_URL (default http://localhost:8000)
pnpm --filter @medilink/patient-web build      # dist/ + PWA check
pnpm --filter @medilink/patient-web preview    # http://localhost:4174 (service worker active)
```

## Mock accounts

| Email                       | Password             | Flow                                                   |
| --------------------------- | -------------------- | ------------------------------------------------------ |
| `patient@medilink.test`     | `MediLink-demo-2026` | Log in → home (Mukamana Jeanne, email not verified)    |
| any new email               | 15+ characters       | Sign up → consent → home (kept until the page reloads) |
| `ratelimited@medilink.test` | anything             | Always `429`                                           |

Wrong password → generic error; 5 failures → `429` with `Retry-After: 60`; signing up with
`patient@medilink.test` → validation error on the email field. Password reset link for the
mocks: `/reset-password?uid=x&token=mock-reset-token`.
