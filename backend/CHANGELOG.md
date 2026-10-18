# Changelog

All notable changes to the MediLink API (`backend/`) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (tags `backend-vX.Y.Z`).

## [Unreleased]

<!-- Wave 1: each sprint writes ONLY under its own heading; consolidated into Added/Changed/Fixed at release. -->

### Sprint 1 · Platform and onboarding

### Sprint 3 · Patients and identity

### Sprint 9 · Notifications

### Added

- `DEV_SKIP_STAFF_MFA` (development only): staff log in without the second factor for local
  testing. Requires `DEBUG`; system check `medilink.E003` refuses it otherwise and the deploy check
  `medilink.E004` always refuses it. Logins record `mfa_method: dev_skip` in the audit log.

## [0.1.0] - 2026-10-17

Sprint 0 (Foundations), see [docs/architecture/03-sprint-0-contract.md](../docs/architecture/03-sprint-0-contract.md).

### Added

- Django 6.1 project with settings per environment (dev, test, prod) from environment variables,
  DRF with JSON-only rendering and parsing, drf-spectacular OpenAPI schema (non-production) with a
  committed copy in `openapi/openapi.yaml`.
- Custom `User` (UUIDv7, case-insensitive email login, Argon2id), `Organization`, `Facility`,
  `Role`, `Permission`, `FacilityMembership`, `Patient`, `PatientLink`, `ConsentRecord`,
  `AuditEntry`, TOTP devices (django-otp) and hashed MFA recovery codes.
- Roles and permissions seeded by data migration from the permission matrix (FR-ACC-01/03).
- Audience-scoped server-side sessions: separate staff and patient cookies (`__Host-ml_staff`,
  `__Host-ml_patient` in production), idle and absolute timeouts per audience, rotation on login,
  MFA success and facility switch.
- Staff sign-in with mandatory TOTP (setup, confirm with 10 single-use recovery codes, verify),
  active-facility switching, logout and `me` (FR-ACC-02/04, FR-SEC-06).
- Patient registration (account, self profile, link, terms/privacy/research consents), login,
  logout and `me` (FR-PAT-02, FR-SEC-04/05).
- Password reset (always `202`, single-use 30-minute link by email, all sessions revoked,
  notification email).
- Password policy: 15 characters for password-only accounts, 12 with MFA, common/breached/context
  blocklists, user-attribute similarity, no composition rules.
- Login protection: per-IP throttles, per-account progressive delay and 15-minute lock, MFA
  attempt lock, generic errors without account enumeration.
- Authorisation: global deny-by-default DRF permission, explicit permission classes per view,
  policy layer (`authorize`, scoped querysets, other-facility objects are `404`).
- PostgreSQL row-level security: reusable `EnableFacilityRLS` / `CreatePolicy` migration
  operations, per-request tenant context (`set_config(..., true)` in the request transaction),
  separate owner and runtime roles (FR-SEC-01/02).
- Append-only audit log with SHA-256 hash chain, DB trigger and revoked privileges,
  `verify_audit_chain` command and the Sprint 0 auth events (FR-SEC-07).
- Error envelope `{error: {code, message, fields, request_id}}` for every error, `X-Request-ID`
  on every response, structured logs with personal-data scrubbing.
- Security settings: CSP via Django's built-in `SECURE_CSP`, HSTS, secure cookies, COOP,
  Permissions-Policy, CORS allowlist with credentials, CSRF enforced on all unsafe API requests
  (token from `GET /api/v1/csrf/`, cookie `__Host-ml_csrf` in production); `check --deploy`
  passes on production settings.
- Channels ASGI app with origin validation and an authenticated placeholder consumer
  (`/ws/v1/staff/ping/`); sockets close on logout and password reset.
- Celery app (JSON only, no result backend, time limits); email tasks take IDs only.
- `seed_dev` command (DEBUG only), docker compose (PostgreSQL 17, Redis 7, Mailpit), database
  role init script, multi-stage non-root Dockerfile, hash-pinned requirements (pip-tools).
- CI workflow `ci-backend.yml`: ruff, mypy (non-blocking), pytest on PostgreSQL as the app role
  with a 90% coverage gate for accounts/authz/tenancy/audit, OpenAPI drift check, deploy check,
  pip-audit, image build.

[Unreleased]: https://github.com/B-Pine/medilink-rwanda/compare/backend-v0.1.0...HEAD
[0.1.0]: https://github.com/B-Pine/medilink-rwanda/releases/tag/backend-v0.1.0
