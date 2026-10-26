# Sprint contracts

Status: v0.1 · Process: [roadmap README](../../roadmap/README.md) · Conventions: [API conventions](../02-api-conventions.md)

A sprint contract is the agreement a sprint is built and verified against: scope, data model, endpoints and schemas, permissions, screens, and **acceptance checks**. It is written and merged **before** any code. Backend and frontend builders work from it in parallel; the frontend uses MSW mocks of the contract until the backend lands.

## Contracts

| Sprint | Contract | Wave | Status |
|---|---|---|---|
| S0 · Foundations | [03 · Sprint 0 contract](../03-sprint-0-contract.md) | 0 | Verified (`backend-v0.1.0`, `frontend-v0.1.0`) |
| S1 · Platform and onboarding | [sprint-01-platform-onboarding.md](sprint-01-platform-onboarding.md) | 1 | Implemented: backend #47, frontend #49 + #55, integration I1–I3 #56 ([acceptance](../../qa/sprint-1-acceptance.md)); I4 waits for staging (#17) |
| S3 · Patients and identity | [sprint-03-patients.md](sprint-03-patients.md) | 1 | Implemented: backend with Part B #57, frontend #59 ([acceptance](../../qa/sprint-3-acceptance.md)); staging checks wait for #17 |
| S2 · Facility setup and staff | [sprint-02-facility-setup.md](sprint-02-facility-setup.md) | 2 | Implemented: backend #63, frontend #69 ([acceptance](../../qa/sprint-2-acceptance.md)); real-API checks wait for #17 |
| S4 · Visits and the live queue | [sprint-04-queue.md](sprint-04-queue.md) | 3 | Implemented: backend #73, frontend #74 |
| S9 · Notification engine | [sprint-09-notifications.md](sprint-09-notifications.md) | 1 | Contracted; not started (#33) |

Acceptance checks are named per sprint: `S1-B1`, `S1-F1`, `S3-B1`, `S9-F4`, and so on (B = backend, F = frontend, I = integration).

## Contract template

Each contract has these sections:

1. Goal, in scope, out of scope, requirement IDs
2. Domain model: tables and fields (aligned with [database design](../04-database-design.md)), state machines, row-level security, data classes, audit events
3. Endpoints: method, path, audience, permission code, request/response schemas, errors, idempotency, rate-limit class; WebSocket messages if any
4. Permissions: new codes and which roles get them ([permission matrix](../../analysis/02-users-roles-and-permissions.md) §3)
5. Background jobs
6. Frontend: routes and screens per app, `packages/ui` components, MSW handlers, translation namespace, design references
7. Integration points: which marked blocks in shared files the sprint uses (see the protocol below)
8. Dependencies on other sprints of the same wave, and the stub used until they merge
9. Acceptance checks: backend, frontend, integration; each traced to requirement, security or design IDs

## Shared-file protocol (parallel sprints)

Several sprints are built at the same time in separate branches. To keep them mergeable, every sprint builds **in its own modules**, and shared files have **marked blocks**: a sprint adds lines **only between its own markers** and never edits anything else in the file.

```
# [S1]        ← Python / YAML            // [S1]        ← TypeScript
# [/S1]                                   // [/S1]
```

### Own modules (no conflicts possible)

| Layer | Where a sprint's code lives |
|---|---|
| Backend | Its own Django app(s) under `backend/medilink/<app>/` with their own models, migrations, views, serializers, `urls.py`, `permissions.py`, `tasks.py`; tests in `backend/tests/<app>/` |
| staff-web / patient-web | `src/features/<feature>/` (pages, components, hooks, `routes.tsx`, `locales/{rw,en,fr}.json`) |
| api-client | `src/features/<feature>.ts` (paths, types, `create<Feature>Api(client)`); mocks in `src/mocks/features/<feature>.ts` |
| packages/ui | One file per new component in `src/components/` |

### Shared files and their blocks

| File | What the sprint adds between its markers |
|---|---|
| `backend/config/settings/base.py` (`INSTALLED_APPS`) | One line per new app |
| `backend/config/urls.py` (`api_v1`) | One `path("<audience>/<area>/", include(...))` line per app |
| `backend/medilink/authz/catalogue.py` | `from medilink.<app> import permissions as _sN` + `extend(_sN.PERMISSIONS, _sN.ROLE_GRANTS)` (`extend()` refuses duplicate codes, unknown roles and unknown permissions). Seed the same codes with a data migration in the sprint's own app; `tests/test_roles_seed.py` checks the catalogue and the database agree. |
| `backend/CHANGELOG.md`, `frontend/CHANGELOG.md` | Bullets under the sprint's own heading in `[Unreleased]` |
| `frontend/apps/staff-web/src/app/features.ts` | Import + entry of the feature's `FeatureRoutes` (`shell` routes replace the nav placeholder for that path; `public` routes are top level) |
| `frontend/apps/patient-web/src/app/features.ts` | Import + entry (`public` or `patient` routes) |
| `frontend/apps/staff-web/src/layout/navigation.ts` (`NAV_ITEMS`) | New nav entries, with `labelKey` pointing into the feature's namespace (no edits to the base locale files) |
| `frontend/apps/*/src/i18n/features.ts` | Imports + one entry `<feature>: { rw, en, fr }`; strings are then `t("<feature>.…")`. `withFeatureResources()` refuses a name that collides with existing top-level keys. |
| `frontend/packages/api-client/src/index.ts` | `export * from "./features/<feature>";` |
| `frontend/packages/api-client/src/endpoints.ts` (`createMediLinkApi`) | `<feature>: create<Feature>Api(client),` |
| `frontend/packages/api-client/src/mocks/features.ts` | Import + factory of the feature's mock handlers. Factories receive a `MockContext` (CSRF check, staff/patient session, error envelope, latency) so feature mocks enforce the same rules as Sprint 0. |
| `frontend/packages/ui/src/index.ts` | Export lines for new components |
| `backend/medilink/audit/actions.py` | `from medilink.<app> import audit_actions as _sN` + `extend_actions(_sN.ACTIONS)` (`extend_actions()` refuses malformed or already-registered names; `record()` refuses unknown actions) |
| `backend/config/settings/base.py` (`DEFAULT_THROTTLE_RATES`) | The sprint's throttle scopes (or keep rates on the sprint's own throttle classes) |
| `backend/medilink/core/realtime.py` | Consumer imports in `[SN imports]`, WebSocket `path(...)` lines in `[SN]` |
| `backend/medilink/core/management/commands/seed_dev.py` (`DEV_SEED_COMMANDS`) | The name of the sprint's own dev seed command (it must refuse to run without `DEBUG`) |
| `backend/.env.example` | The sprint's environment variables, documented |
| `backend/requirements/base.in` | New dependencies (justified in the PR); the `*.txt` lock files are **regenerated after rebasing**, never hand-merged |
| Registry files (`features.ts`, `i18n/features.ts`, `mocks/features.ts`, `endpoints.ts`, `navigation.ts`) | Imports go between `// [SN imports]` markers at the top; entries go in the `[SN]` block inside the array or object |
| `frontend/apps/patient-web/pwa.config.ts` (`importScripts`) | Extra service-worker scripts (e.g. web push) |
| Shell slots | A feature module may also provide `headerItems` and `shellOverlays` (staff-web) or `headerItems` and `homeCards` (patient-web) in its `FeatureRoutes` entry, so no shell file is edited |
| Permission codes (frontend) | Augment `PermissionCodes` by declaration merging in the feature's api-client module (`declare module "../types" { interface PermissionCodes { "patients.view": true } }`); add mock grants with `extendMockRoleGrants()` in the feature's mock file. Mock grants mirror the backend `ROLE_GRANTS`. |

### Never

- Edit another sprint's block, or anything outside your own blocks in a shared file.
- Edit Sprint 0 migrations, or the base locale files (`src/i18n/locales/*.json`): use the feature namespace.
- Hand-merge `backend/openapi/openapi.yaml`: regenerate it after rebasing (`manage.py spectacular --validate --fail-on-warn --file openapi/openapi.yaml` with test settings).
- Rename or move shared code without a separate, agreed pull request.

### Wave 1 ownership of Sprint 0 files

Some features hook into the Sprint 0 core and cannot stay inside blocks. In Wave 1 these files are **owned by S1** (lock screen, PIN, step-up, feature flags); S3 and S9 builders must not edit them:

- backend: `accounts/models.py` (+ its migration), `accounts/sessions.py`, `accounts/principal.py`, `accounts/services.py`, `accounts/serializers.py`, `authz/permissions.py`, the session settings in `config/settings/base.py`, `tests/test_b04_audience_sessions.py`, `docker-compose.yml`
- staff-web: `layout/AppShell.tsx` (outside the slots), `auth/RequireStaff.tsx`, `app/services.tsx`, `layout/UserMenu.tsx`
- api-client: `types.ts` (S0 types), `mocks/handlers.ts`, `mocks/data.ts` (outside `extendMockRoleGrants`)
- patient-web: `app/routes.tsx` (S1 removes the Sprint 0 `/for-facilities` placeholder so its feature route can take the path)

Staff-web `/platform/...` routes are split by feature: S1 owns `/platform/applications`, `/platform/facilities`, `/platform/master-data`, `/platform/flags`; S3 owns `/platform/merge-requests`; S9 owns `/platform/announcements`. **No catch-all `/platform/*` route.**

### Wave 1 names (reserved)

Translation namespace names must not collide with existing top-level keys. Taken in staff-web: `app, brand, common, errors, facility, forgot, login, mfaSetup, mfaVerify, notFound, placeholder, reset, shell, today, validation`. Taken in patient-web: `app, common, emergency, errors, footer, forgot, home, info, landing, login, nav, notFound, reset, signup, validation`.

| Sprint | Backend apps | staff-web features | patient-web features | api-client modules |
|---|---|---|---|---|
| S1 | `medilink.masterdata`, `medilink.onboarding`, `medilink.uploads` | `platform` (super admin console: applications, facilities, master data), `lock` (idle lock, PIN, step-up) | `facilityApplication` (public wizard) | `masterdata`, `onboarding`, `uploads`, `security` |
| S3 | extends `medilink.patients` (new models and migrations inside it) | `patients` (search, walk-in registration, merges) | `profile` (family, insurance, health profile, privacy) | `patients`, `profile` |
| S9 | `medilink.notifications` | `notifications` (bell, inbox, preferences, announcements) | `notifications` (bell, inbox, preferences, push opt-in) | `notifications` |

### Merging a wave

The orchestrator merges a wave's sprints one at a time. For each one: rebase on `main`, regenerate the OpenAPI schema, run the full backend and frontend suites, verify the acceptance checks, open the pull request, wait for green CI, then squash-merge. Integration checks that span sprints of the wave (for example S3 insurance card photos using S1 uploads) run after both have merged.
