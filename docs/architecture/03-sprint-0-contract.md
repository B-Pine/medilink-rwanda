# 03 · Sprint 0 contract: Foundations

Status: v0.1 · The agreement between backend and frontend for Sprint 0. Roadmaps: [backend](../roadmap/backend.md) · [frontend](../roadmap/frontend.md)

**Sprint goal:** a running skeleton of both deployables with secure staff and patient login, roles, facility scoping, an audit log and translations. All later features plug into it.

## 1. Domain foundation (backend)

| Model | Key fields | Notes |
|---|---|---|
| `User` (custom, `accounts`) | `id` UUID, `email` (unique, case-insensitive), `full_name`, `preferred_language` (`rw`/`en`/`fr`, default `rw`), `is_platform_admin`, `is_active`, `email_verified_at`, `last_login`, timestamps | Email login, no username. Argon2id. |
| `Organization` (`tenancy`) | `id`, `name`, timestamps | Owner of facilities |
| `Facility` (`tenancy`) | `id`, `organization`, `name`, `slug` (unique), `facility_type` (enum from analysis 03), `ownership`, `status` (`draft`/`submitted`/`under_review`/`changes_requested`/`approved`/`setup`/`live`/`suspended`/`deactivated`/`rejected`), timestamps | Sprint 0 creates them by seed/admin only |
| `Role` (`tenancy`) | `code` (`facility_admin`, `receptionist`, `doctor`, `pharmacist`), `name` | Seeded by data migration. Super admin is the `is_platform_admin` flag, not a facility role. |
| `Permission` + role grants | `code` (e.g. `facility.configure`, `staff.manage`, `queue.operate`, `clinical.write`, `clinical.sign`, `pharmacy.dispense`, `billing.record_payment`, `billing.approve`, `reports.view`, `audit.view`) | From the permission matrix ([analysis 02](../analysis/02-users-roles-and-permissions.md) §3), seeded by data migration |
| `FacilityMembership` | `user`, `facility`, `roles` (M2M), `is_active`, `deactivated_at` | One user, many facilities |
| `Patient` (`patients`, minimal) | `id`, `full_name`, `date_of_birth` (nullable), `sex` (nullable) | Sprint 0: only the "self" patient created at sign-up |
| `PatientLink` | `account` (User), `patient`, `relationship` (`self`/`guardian`/`delegate`), `revoked_at` | |
| `ConsentRecord` | `user`, `kind` (`terms`, `privacy`, `care`, `research`), `version`, `granted` (bool), `granted_at`, `channel` | FR-SEC-04/05 |
| `AuditEntry` (`audit`) | `id`, `occurred_at`, `actor` (nullable for system), `actor_role`, `facility` (nullable), `action`, `object_type`, `object_id`, `reason`, `ip`, `user_agent`, `request_id`, `metadata` (JSON, no personal data), `prev_hash`, `hash` | Append-only; hash chain ([security 05](../security/05-data-protection-and-cryptography.md) §6) |
| TOTP device + recovery codes | django-otp devices; recovery codes stored **hashed** | |

**Row-level security in Sprint 0:**
- the RLS helper (migration operation that `ENABLE` + `FORCE`s RLS and creates the facility-isolation policy with `WITH CHECK`, using `NULLIF(current_setting('app.facility_id', true), '')`)
- per-request context setting (`set_config(..., true)` inside the request transaction)
- a test proving isolation on a facility-owned table

Sprint 0 applies it to `FacilityMembership` and one demo facility-owned table, e.g. `FacilityNote`, or the first table that needs it ([security 04](../security/04-authorization-and-tenant-isolation.md) §4).

## 2. Endpoints

All responses follow [02 · API conventions](02-api-conventions.md). Schemas:

```jsonc
// StaffMe
{
  "id": "uuid", "email": "a@b.rw", "full_name": "Uwase Aline",
  "preferred_language": "rw", "is_platform_admin": false, "mfa_enabled": true,
  "memberships": [
    { "facility": { "id": "uuid", "name": "Kigali Clinic", "slug": "kigali-clinic", "facility_type": "private_clinic" },
      "roles": ["receptionist"] }
  ],
  "active_facility_id": "uuid" | null,
  "permissions": ["queue.operate", "billing.record_payment"]   // for the active facility
}
// PatientMe
{
  "id": "uuid", "email": "p@x.rw", "full_name": "Mukamana Jeanne", "preferred_language": "rw",
  "email_verified": false,
  "profiles": [ { "patient_id": "uuid", "display_name": "Mukamana Jeanne", "relationship": "self" } ]
}
// LoginResult (staff)
{ "status": "authenticated" | "mfa_required" | "mfa_setup_required", "user": StaffMe | null }
```

| Method & path | Body | Success | Errors | Notes / requirement |
|---|---|---|---|---|
| `GET /api/v1/health/` | — | `200 {"status":"ok","version":"0.1.0"}` | — | Public |
| `GET /api/v1/csrf/` | — | `200 {"csrf_token":"…"}` + CSRF cookie | — | Needed because frontends run on other hosts ([ADR 0006](../decisions/0006-separate-frontend-and-backend-hosting.md)) |
| `POST /api/v1/staff/auth/login/` | `{email, password}` | `200 LoginResult` | `400`, `401 not_authenticated` (generic), `429` | Staff = has an active membership or is platform admin. Rotates the session. FR-ACC-04 |
| `POST /api/v1/staff/auth/mfa/setup/` | — | `200 {"otpauth_uri":"otpauth://…","secret":"BASE32"}` | `401` | Only in `mfa_setup_required` state |
| `POST /api/v1/staff/auth/mfa/confirm/` | `{code}` | `200 {"status":"authenticated","user":StaffMe,"recovery_codes":["xxxx-xxxx", … 10]}` | `400 validation_error` | Codes shown once, stored hashed |
| `POST /api/v1/staff/auth/mfa/verify/` | `{code}` or `{recovery_code}` | `200 LoginResult(authenticated)` | `400`, `429` | Rotates the session |
| `POST /api/v1/staff/auth/logout/` | — | `204` | — | Deletes the staff session only |
| `GET /api/v1/staff/auth/me/` | — | `200 StaffMe` | `401 not_authenticated` / `401 mfa_required` | |
| `POST /api/v1/staff/auth/active-facility/` | `{facility_id}` | `200 StaffMe` | `404` if not a member | Rotates the session; audit-logged |
| `POST /api/v1/patient/auth/register/` | `{full_name, email, password, preferred_language, accepted_terms_version, accepted_privacy_version, research_consent}` | `201 PatientMe` (logged in) | `400` | Creates User + self Patient + PatientLink + ConsentRecords. Password ≥ 15 (no MFA). FR-PAT-02, FR-SEC-04/05 |
| `POST /api/v1/patient/auth/login/` | `{email, password}` | `200 PatientMe` | `401` (generic), `429` | |
| `POST /api/v1/patient/auth/logout/` | — | `204` | — | Deletes the patient session only |
| `GET /api/v1/patient/auth/me/` | — | `200 PatientMe` | `401` | |
| `POST /api/v1/auth/password-reset/` | `{email}` | `202` (always, even if unknown) | `429` | Email via Mailpit in dev |
| `POST /api/v1/auth/password-reset/confirm/` | `{uid, token, new_password}` | `204` | `400` | Revokes all sessions of that user |
| `GET /api/v1/schema/` | — | OpenAPI 3 | — | Non-production |

**Audit events in Sprint 0:**
- `auth.login.success` / `auth.login.failure`
- `auth.mfa.enrolled` / `auth.mfa.success` / `auth.mfa.failure`
- `auth.logout`
- `auth.password_reset.requested` / `auth.password_reset.completed`
- `staff.facility.switched`
- `patient.registered`

## 3. Backend acceptance checks (verified before merge)

| # | Check | Source |
|---|---|---|
| B1 | `docker compose up -d` + `migrate` + `seed_dev` + `runserver` work from a clean clone on Windows and Linux, following the README | architecture 01 §4 |
| B2 | Every endpoint above exists, matches the schema, and appears in `/api/v1/schema/` | this doc |
| B3 | Global DRF default permission **denies**; a test fails if any view lacks an explicit permission class | security 04 §2 |
| B4 | Staff cannot use patient endpoints and vice versa; separate session cookies `__Host-ml_staff` / `__Host-ml_patient` (dev may drop the `__Host-` prefix on plain http) | ADR 0006, security 03 §5 |
| B5 | Staff login without MFA confirmed never yields an authenticated staff session | security 03 §1 |
| B6 | Passwords: Argon2id; patient min 15, staff min 12; breached/common list; no composition rules | security 03 §2 |
| B7 | Login throttling and generic errors (no account enumeration); password reset always `202` | security 03 §6 |
| B8 | Session rotates on login, MFA success, facility switch | security 03 §5 |
| B9 | CORS allowlist from env, credentials allowed, no wildcard; `CSRF_TRUSTED_ORIGINS` from env; CSRF enforced on unsafe methods | ADR 0006 |
| B10 | RLS helper + context middleware; test: as the app role, no context → zero rows; context A never sees B; `WITH CHECK` blocks cross-facility insert | security 04 §4 |
| B11 | Audit log append-only (DB-level `REVOKE UPDATE, DELETE` for the app role, or trigger), hash chain verified by a test and a `verify_audit_chain` command | security 05 §6 |
| B12 | Error format and codes as in API conventions §4, including 404 for other-facility objects | architecture 02 |
| B13 | `manage.py check --deploy` on prod settings: no warnings; CSP configured (Django 6 `SECURE_CSP`) | security 06 §2 |
| B14 | Celery app configured JSON-only; Channels ASGI app with origin validation (a placeholder authenticated consumer is enough) | security 06 §8 |
| B15 | No personal data or secrets in logs; `.env.example` complete; no secrets committed | security 05, 08 |
| B16 | CI workflow `ci-backend.yml`: ruff, mypy (non-blocking allowed in S0), pytest with Postgres, `check --deploy`, pip-audit | security 09 |
| B17 | Test coverage of `accounts`, `authz`, `tenancy`, `audit` ≥ 90% | security 09 |

## 4. Frontend scope (Sprint 0)

| Area | Deliverable |
|---|---|
| Workspace | pnpm workspace, shared tsconfig/eslint/prettier, scripts: `dev`, `build`, `test`, `lint`, `typecheck` |
| `packages/ui` | Design tokens as CSS variables (light + dark) **exactly** from design research 02 (emerald-700 primary, slate neutrals, measured status colours, `#7C8A9D` input border, slate-600 muted text); Tailwind v4 theme mapped to tokens; fonts Figtree + Inter self-hosted; components: Button (primary/secondary/ghost/danger, loading), TextField + PasswordField (show/hide) + Field (label, hint, error with `aria-describedby`), ErrorSummary (focus on submit failure), Alert, Badge (icon + label), Card, Spinner/Skeleton, Logo, LanguageSwitcher, ThemeToggle, VisuallyHidden, SkipLink |
| `packages/api-client` | fetch wrapper: base URL from env, `credentials: "include"`, CSRF bootstrap via `/api/v1/csrf/`, `X-CSRFToken`, `Accept-Language`, error parsing into a typed `ApiError` (code, message, fields, requestId), 401 handling hook; typed functions for every Sprint 0 endpoint |
| Mocks | MSW handlers implementing §2 exactly (incl. MFA flow and error cases); `VITE_USE_MOCKS=true` |
| i18n | i18next with `rw` (default), `en`, `fr`; all UI text in resource files; Kinyarwanda strings marked for native-speaker review (no raw machine translation shipped as final) |
| staff-web | Login (split screen, deep forest brand panel) → MFA setup (QR + manual key + recovery codes to print) / MFA verify (single input, paste/autofill OK, recovery-code option) → facility picker (multi-facility) → app shell (sidebar by role, facility switcher, connection indicator placeholder, user menu with logout, theme, language) → "Today" placeholder page; 404 page; route guard by session |
| patient-web | Public landing page skeleton per design research 06 (hero with deep forest overlay + poster image, search box placeholder, how-it-works, emergency notice, footer); email-first login and sign-up with consent step (terms + privacy required, research optional unticked); patient home placeholder; logout; PWA manifest + icons |
| Brand | Icon set generated from `brand/logo/source/` into each app's `public/` (favicon 16/32/48 + .ico, apple-touch 180, PWA 192/512, maskable 512); logo components use the brand PNGs until SVGs exist |
| CI | `ci-frontend.yml`: install, lint, typecheck, unit tests, build both apps |

## 5. Frontend acceptance checks (verified before merge)

| # | Check | Source |
|---|---|---|
| F1 | `pnpm install && pnpm dev` runs both apps; with `VITE_USE_MOCKS=true` all flows work without a backend | ADR 0007 |
| F2 | Token values equal design research 02 (spot-check primary `#047857`, hover `#065F46`, muted `#475569`, input border `#7C8A9D`, dark bg `#0B1411`, dark primary `#34D399` with text `#022C22`) | design 02 |
| F3 | No hard-coded user-facing strings (lint rule or test); language switch works; `lang` attribute updates | design 10, NFR-UX-01 |
| F4 | Forms: visible labels, inline errors linked by `aria-describedby`, focused error summary on submit, values kept after errors, paste allowed in password and code fields, correct `autocomplete` | design 05, 10 |
| F5 | Keyboard: everything reachable, visible focus ring (emerald, offset), skip link; vitest-axe on key pages without violations | design 10 |
| F6 | No tokens in localStorage/sessionStorage; `dangerouslySetInnerHTML` banned by lint; no third-party scripts; fonts self-hosted | security 06 §6 |
| F7 | Patient pages: body text 18 px, targets ≥ 48 px; staff body 15 px | design 03 |
| F8 | Light and dark themes both render; contrast of text tokens as measured | design 02 |
| F9 | API client sends credentials, CSRF header, Accept-Language; parses error format; unit-tested | architecture 02 |
| F10 | Builds produce static output (`dist/`) deployable on a static host; `VITE_API_BASE_URL` configurable at build | ADR 0006 |
| F11 | Icons and manifest present and valid; Lighthouse PWA installable check for patient-web | design 07 |
| F12 | CI workflow green | security 09 |
