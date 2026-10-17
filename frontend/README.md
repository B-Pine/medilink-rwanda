# MediLink frontend

The two web apps of MediLink Rwanda and their shared packages, as a pnpm workspace. Both apps are
static sites hosted separately from the API ([ADR 0006](../docs/decisions/0006-separate-frontend-and-backend-hosting.md));
toolchain in [ADR 0007](../docs/decisions/0007-frontend-toolchain.md); Sprint 0 scope and checks in
[architecture 03](../docs/architecture/03-sprint-0-contract.md).

| Path                  | Package                 | What it is                                                                                                  |
| --------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/staff-web`      | `@medilink/staff-web`   | Staff workspaces (login + MFA, facility picker, app shell). Port 5173. [README](apps/staff-web/README.md)   |
| `apps/patient-web`    | `@medilink/patient-web` | Public pages + patient PWA (landing, login, sign-up, home). Port 5174. [README](apps/patient-web/README.md) |
| `packages/ui`         | `@medilink/ui`          | Design tokens, Tailwind v4 theme, fonts, accessible components, i18n setup                                  |
| `packages/api-client` | `@medilink/api-client`  | Typed fetch client for `/api/v1` + MSW mocks of the sprint contract                                         |
| `packages/config`     | `@medilink/config`      | Shared tsconfig, ESLint (incl. the no-hard-coded-text rule), Prettier, Vite helpers                         |
| `apps/patient-mobile` | —                       | Phase 3 (React Native), not started                                                                         |

## Requirements

- Node.js **24**
- pnpm **12.9** (`corepack enable` picks the version from `package.json` → `packageManager`)

pnpm 12 defaults are kept on purpose: a minimum release age for new package versions and
dependency build scripts denied (`allowBuilds` in `pnpm-workspace.yaml`).

## Quick start

```bash
cd frontend
pnpm install

# Both apps against the MSW mocks (no backend needed)
pnpm dev:mock
#   staff-web   http://localhost:5173  (log in as doctor@medilink.test, see "Mock accounts")
#   patient-web http://localhost:5174

# Both apps against a running backend (default http://localhost:8000)
pnpm dev
```

`VITE_USE_MOCKS=true pnpm dev` (PowerShell: `$env:VITE_USE_MOCKS="true"; pnpm dev`) is the same as
`pnpm dev:mock`. Each app has a `.env.example`; copy it to `.env.local` to change the defaults.

## Scripts (run in `frontend/`)

| Script                              | Does                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev` / `pnpm dev:mock`        | Both apps in dev mode (real API / MSW mocks)                                                 |
| `pnpm build` / `pnpm build:mock`    | Static builds in `apps/*/dist` (patient-web also runs the PWA check)                         |
| `pnpm preview`                      | Serve the builds (staff 4173, patient 4174)                                                  |
| `pnpm test`                         | All Vitest projects: unit, component, flows against the mocks, axe, guard tests              |
| `pnpm lint`                         | ESLint (type-aware, React, hooks, jsx-a11y strict, security bans, no hard-coded JSX text)    |
| `pnpm typecheck`                    | `tsc --noEmit` for the root and every package                                                |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                     |
| `pnpm icons`                        | Regenerate favicons, PWA icons and logos from `../brand/logo/source/`                        |
| `pnpm i18n:review`                  | Regenerate `i18n-review.md` (Kinyarwanda strings for native-speaker review)                  |
| `pnpm generate-types`               | openapi-typescript from `${VITE_API_BASE_URL}/api/v1/schema/` (stub until the schema exists) |

Filter to one app with `pnpm --filter @medilink/staff-web dev` (or `build`, `test` via `pnpm test --project staff-web`).

## Environment (build time)

| Variable            | Default                 | Meaning                                                                                          |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | `http://localhost:8000` | API origin, no trailing slash. Baked into the static build; also added to the CSP `connect-src`. |
| `VITE_USE_MOCKS`    | `false`                 | `true` starts the MSW service worker with the contract mocks. `--mode mock` forces it on.        |

Production builds without mocks contain no MSW code and no `mockServiceWorker.js`.

## Mock accounts (MSW, `VITE_USE_MOCKS=true`)

Every account uses the password **`MediLink-demo-2026`**. Authenticator code: **`123456`**.
Recovery code (enrolled staff, once per account per page load): **`k7q2-m9xd`**.

| Email                       | App     | What happens                                                                                                               |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `new.staff@medilink.test`   | staff   | MFA not set up → `mfa_setup_required` → QR + key → code `123456` → 10 recovery codes → Today (Kigali Clinic, receptionist) |
| `reception@medilink.test`   | staff   | `mfa_required` → Today directly (one facility: Kigali Clinic, receptionist)                                                |
| `doctor@medilink.test`      | staff   | `mfa_required` → facility picker (3 facilities; facility admin + doctor at Remera Health Center)                           |
| `pharmacist@medilink.test`  | staff   | `mfa_required` → Today (Kigali Clinic, pharmacist)                                                                         |
| `admin@medilink.test`       | staff   | Platform admin without memberships → Today + "Facility applications"                                                       |
| `patient@medilink.test`     | patient | Existing patient (Mukamana Jeanne). Signing up with this email gives a validation error                                    |
| any new email               | patient | Sign-up works (password ≥ 15 characters); the new account lives until the page reloads                                     |
| `ratelimited@medilink.test` | both    | Always `429 rate_limited` with `Retry-After: 60`                                                                           |

Error cases: a wrong password or unknown email returns the generic `401 not_authenticated`;
5 failures for the same email (or 5 wrong MFA codes) return `429`; invalid input returns
`400 validation_error` with `fields`. The mocks enforce CSRF (`403 csrf_failed` without a valid
`X-CSRFToken`) and rotate the token on login, MFA, facility switch and logout, like Django.
Password reset: any email returns `202`; the reset link `/reset-password?uid=x&token=mock-reset-token` works.

Mock sessions are kept in dev-only cookies (`ml_mock_staff`, `ml_mock_patient`, no tokens) so a
reload keeps you logged in; enrolments and new sign-ups are in memory and reset on reload.

## How things are built

- **Design system:** colours, type, spacing and radius are CSS variables in
  `packages/ui/src/styles/tokens.css`, exactly from [design 02](../docs/design/research/02-color-system.md)
  and [design 03](../docs/design/research/03-typography-icons-layout.md). Tailwind's default palette
  is removed; utilities like `bg-primary`, `text-fg-muted`, `border-border-input`, `min-h-target`
  map to tokens. Dark theme: system preference, overridden by `<html data-theme="light|dark">`.
  Density: `<html data-density="patient">` (18 px body, 48 px targets) or staff (15 px, 40 px).
- **Fonts:** Figtree + Inter variable fonts from `@fontsource-variable`, Latin + Latin Extended only, bundled.
- **i18n:** i18next, Kinyarwanda default, English, French. Strings live in
  `apps/*/src/i18n/locales/*.json` and `packages/ui/src/i18n/locales/*.json` (namespace `ui`).
  ESLint rejects hard-coded JSX text; tests check key parity. All Kinyarwanda strings are drafts:
  see [`i18n-review.md`](i18n-review.md).
- **Forms:** react-hook-form + zod. Client messages are i18n keys; API field errors
  (`validation_error.fields`) are shown inline as sent (localised by `Accept-Language`).
  Errors: visible labels, inline messages linked with `aria-describedby`, a focused error summary
  that links to the fields, values kept.
- **API client:** `createApiClient` + `createMediLinkApi` (`packages/api-client`). See
  "Backend integration" below.
- **Security in the browser:** no tokens in storage (only `medilink.theme` / `medilink.language`
  in localStorage), `dangerouslySetInnerHTML` banned, no third-party scripts or CDNs, CSP `<meta>`
  in builds, MSW never in production builds, the PWA never caches `/api/`, user caches cleared on logout.
- **Brand assets:** `pnpm icons` rebuilds `apps/*/public/` icons and `public/brand/` logos from the
  brand sources (sharp + png-to-ico). Outputs are committed (~121 KB per app).

## Tests

`pnpm test` runs 13 test files in 5 Vitest projects (`api-client`, `ui`, `staff-web`,
`patient-web`, `workspace`). Flows run the real app with a memory router against the MSW
handlers (Node). Accessibility: vitest-axe on login, MFA setup/verify, facility picker, shell,
404, landing, login and sign-up (both steps), patient home. Colour contrast cannot be computed in
jsdom, so `packages/ui/src/styles/tokens.test.ts` computes it from the token values in both themes.

## Deployment (static hosts)

`pnpm build` writes `apps/staff-web/dist` and `apps/patient-web/dist`. On the host:

- serve `index.html` for unknown paths (SPA fallback); do not rewrite `/assets/*`
- cache `assets/*` for a year (hashed names); `index.html`, `sw.js`, `manifest.webmanifest`: no-cache
- send the CSP from the `<meta>` tag as a header too, plus `frame-ancestors 'none'`,
  `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- `VITE_API_BASE_URL` is fixed per build (one build per environment)

## Backend integration (what the frontend expects)

- **Origins:** API at `VITE_API_BASE_URL` (e.g. `https://api.medilink.rw`); apps on other origins
  (dev: `http://localhost:5173`, `http://localhost:5174`).
- **Every request:** `fetch(..., { credentials: "include", mode: "cors" })`, `Accept: application/json`,
  `Accept-Language: rw|en|fr`; JSON bodies with `Content-Type: application/json`.
- **CORS:** `Access-Control-Allow-Origin` = the exact app origin (no `*`),
  `Access-Control-Allow-Credentials: true`, allowed request headers `Content-Type`, `X-CSRFToken`,
  `Accept-Language`, methods `GET, POST, PUT, PATCH, DELETE, OPTIONS`; expose `Retry-After` and
  `X-Request-ID` (`Access-Control-Expose-Headers`) so the client can read them.
- **CSRF:** the client calls `GET /api/v1/csrf/` (credentials included) before the first unsafe
  request and expects `200 {"csrf_token": "..."}` plus the CSRF cookie on the API host. It sends
  the token as `X-CSRFToken` on POST/PUT/PATCH/DELETE. It drops the token after login, MFA
  confirm/verify, facility switch, logout, patient register/login and password-reset confirm (Django
  rotates it on login), and retries once on `403 {"error":{"code":"csrf_failed"}}`.
  `CSRF_TRUSTED_ORIGINS` must list the app origins.
- **Cookies:** session cookies stay on the API host (`__Host-ml_staff`, `__Host-ml_patient`;
  dev over http may drop `__Host-`). With API and apps on sibling hosts of one site
  (`*.medilink.rw`), `SameSite=Lax` works. In dev, `localhost:5173` → `localhost:8000` is
  same-site, so it works too; using `127.0.0.1` for one and `localhost` for the other does not.
- **Errors:** always `{"error": {"code", "message", "fields"?, "request_id"?}}` with the HTTP
  status of architecture 02 §4. The UI relies on `validation_error` + `fields` keys matching the
  request field names, `not_authenticated` / `mfa_required` on 401, `rate_limited` + `Retry-After`.
- **Staff login flow:** `POST /staff/auth/login/` → `{status, user: null}` for
  `mfa_required` / `mfa_setup_required`; `mfa/setup/` → `{otpauth_uri, secret}`;
  `mfa/confirm/` → `{status: "authenticated", user, recovery_codes[10]}`;
  `mfa/verify/` with `{code}` or `{recovery_code}`; `me` → `StaffMe` or 401.
  Assumption: with exactly one membership the backend sets `active_facility_id` at login; if it is
  `null` the app calls `POST /staff/auth/active-facility/` itself. Several memberships → picker.
- **Patient:** `register` → `201 PatientMe` and the user is logged in; `accepted_terms_version` and
  `accepted_privacy_version` are sent as `"2026-10"` (see `apps/patient-web/src/forms/validation.ts`).

## Related docs

[CHANGELOG](CHANGELOG.md) · [i18n review](i18n-review.md) · [frontend roadmap](../docs/roadmap/frontend.md) ·
[design research](../docs/design/research/README.md) · [security 06 §6](../docs/security/06-application-and-api-security.md)
