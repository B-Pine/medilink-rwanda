# Changelog

All notable changes to the MediLink API (`backend/`) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (tags `backend-vX.Y.Z`).

## [Unreleased]

<!-- Wave 1: each sprint writes ONLY under its own heading; consolidated into Added/Changed/Fixed at release. -->

### Sprint 1 · Platform and onboarding

- Upload pipeline v1 (`medilink.uploads`, contract §2.4, §3.6): `uploads_file` with forced RLS
  (`facility_isolation` + `unowned_rows`); magic-byte sniffing (PDF, JPEG, PNG, HEIC/HEIF; CSV only
  for CSV purposes); size limit; UUID keys in a quarantine bucket; `scan_file` task with the
  `Scanner` interface (`ClamdScanner` over INSTREAM, `FakeScanner` for EICAR), 5 retries, then
  `failed`; images re-encoded without EXIF/XMP/GPS (40 MP limit, 3,000 px side, animations refused,
  HEIC to JPEG); PDFs refused when encrypted, scripted, with embedded files, launch actions, XFA or
  rich media, or over 100 pages; `ObjectStorage` with local (dev/test, `/api/v1/files/{token}/`)
  and S3-compatible (boto3, SSE, presigned) implementations; 5-minute signed download links with
  `nosniff`, sandbox CSP, `no-store` and CORP headers; hourly `purge_files`.
- Endpoints `POST /staff|patient/uploads/`, `GET …/{id}/`, `POST …/{id}/download-links/` with
  `Idempotency-Key` and the `upload` rate limit (60/h, `THROTTLE_RATE_UPLOAD`).
- Reusable interface for later sprints: `uploads.purposes.register(UploadPurpose(...))`,
  `services.receive/attach/download_link/soft_delete`, signal `upload_scanned`.
- Deploy checks `medilink.uploads.E001`–`E003` refuse the fake scanner, local storage and a
  non-https files origin.
- S1 audit actions registered through `extend_actions()` (`medilink.onboarding.audit_actions`).
- Master data (`medilink.masterdata`, contract §2.2, §2.6, §3.5): locations, facility types,
  service catalogue, insurers, drugs, ICD-10 codes, symptoms, public holidays and reason codes
  with rw/en/fr translations, `version` and an append-only `masterdata_change` log. Only
  `masterdata.services` writes them (pre-save guard); the runtime role has no `DELETE`/`TRUNCATE`
  (retire instead) and no `UPDATE`/`DELETE` on the change log (`post_migrate` revokes). Trigram
  indexes (`pg_trgm`) for drug and diagnosis search.
- Endpoints `/public/master-data/{kind}/` (5 kinds, localised, `Cache-Control` + `ETag`),
  `/staff/master-data/{kind}/` (9 kinds, search) and `/platform/master-data/{kind}/` (create,
  update, retire/restore, change history, CSV imports with preview and confirm; step-up on writes).
- `PlatformAdmin` permission (staff session, `is_platform_admin`, `PLATFORM_ALLOWED_NETWORKS`
  allowlist, deploy warning `medilink.W100` when empty) and `RecentAuthRequired` /
  `@requires_recent_auth()` (step-up or the login's MFA within 5 minutes, else
  `403 step_up_required`).
- Seeds: 5 provinces and 30 districts, 11 facility types, insurers, 26 services, an ICD-10 subset,
  symptoms, public holidays 2026–2027 and reason codes for every kind. Commands
  `import_locations`, `import_drugs`, `import_diagnosis_codes`, `import_symptoms` (dry run unless
  `--apply`) and the dev-only `seed_masterdata_dev` (sample sectors, cells and villages, `DEV-`
  codes).
- Dependencies: pillow, pillow-heif, pypdf, boto3.

- Staff idle lock (contract §2.5, S1-D13): sessions lock after `STAFF_SESSION_LOCK_AFTER`
  (default 900 s, check `medilink.E101` keeps it within 300–1,800 s) and end after
  `STAFF_SESSION_IDLE_TIMEOUT` (default now **4 h**, check `medilink.E102`) or 12 h. Locked
  sessions answer `401 session_locked` everywhere except lock state, lock, unlock and logout;
  their sockets are closed. `PrincipalState.LOCKED`.
- `GET|POST /staff/auth/lock/`, `POST /staff/auth/unlock/` (PIN or password; 5 failures end the
  session; 10 wrong PINs an hour disable PIN unlock and email the user; facility flag
  `security.pin_unlock`), `PUT|DELETE /staff/auth/pin/` (4–6 digits, no repeats, sequences or
  common PINs; Argon2id; setting needs step-up) and `POST /staff/auth/step-up/` (password + TOTP,
  5-minute window, 5 failures end the session).
- `StaffMe` gains `feature_flags` and `security` (`pin_set`, `lock_after_seconds`,
  `step_up_valid_until`).
- Feature flag catalogue and per-facility overrides (`onboarding_feature_flag`,
  `onboarding_facility_feature_flag`), `RequiresFeatureFlag`; onboarding tables and the
  notification email stub (`onboarding.notifications.dispatch`).

- Facility onboarding (`medilink.onboarding`, contract §2.3, §3.2, §3.5): public application
  wizard API with an emailed single-use resume link (7 days) exchanged for an HttpOnly applicant
  cookie (8 h sliding), autosave with `version`, documents through the upload pipeline (≤ 20,
  ≤ 100 MB), submit gate with dotted `fields`; super admin pipeline, review with per-document
  verdicts and item comments, notes, history and duplicate hints; approve (creates organisation,
  facility `approved`, licences, status event, signal `application_approved`) and reject, both
  with step-up and `Idempotency-Key`.
- Facility lifecycle `approved → setup → live → suspended / deactivated` with reasons, status
  events, go-live check registry (`licence.moh_operating_valid`), `is_publicly_listed()` and
  `accepts_new_bookings()`; licences with renewal (supersede) and corrections; daily 60/30-day and
  expiry reminders; stale draft reminder (83 days) and purge (90 days); per-facility and default
  feature flag administration; `GET /platform/overview/`.
- Notification email stub for application, licence, facility and security events (until S9).

### Sprint 3 · Patients and identity

- Patient identity (`medilink.patients`, contract §2): MediLink numbers (`ML-XXXX-XXXX`, Crockford
  alphabet with a Luhn mod 32 check character; backfilled for existing patients, assigned at
  sign-up); demographics, contacts and emergency contact; identifiers in `patients_identifier`
  stored only as AES-256-GCM ciphertext (bound to table, column and row), an HMAC-SHA256 blind
  index and the last four characters. Keys come from `MEDILINK_FIELD_KEYS` /
  `MEDILINK_BLIND_INDEX_KEYS`, with key ids so they can rotate (`patients_rotate_keys --data |
  --index`). Checks: `patients.W001` (derived development keys), `patients.E001` (deploy, keys
  missing), `patients.E002` (invalid keys).
- Facility records (`patients_facility_patient`, forced RLS) with file numbers. SECURITY DEFINER
  helpers `patients_known_elsewhere()` and `patients_facilities_of()` count other facilities
  without exposing them; `patients_audit_link` records which audit entries are about which
  patient, and is append-only along with `patients_merge_event`.
- Staff endpoints `/staff/patients/…`:
  - search by name, phone, ID, file number or MediLink number, with criteria in the body;
  - duplicate check (exact identifier, fuzzy name, date of birth and phone);
  - walk-in registration with care consent, and adding a patient who is already on MediLink;
  - record detail and edit, with versions;
  - identifiers, and an audited reveal with a reason;
  - insurance cards (S1 insurers; card photos through the S1 upload pipeline) and verification;
  - health profile (allergies, conditions, medicines with provenance and review);
  - desk consents and record-claim confirmation.
- Merges (`/staff/merge-requests/`, `/platform/merge-requests/`):
  - four-eyes approval with step-up; escalation for single-approver clinics;
  - execution re-points every row and records it, and undo restores the rows still at their merged value;
  - `merge.register_mover()` lets later sprints include their tables.
- Patient endpoints `/patient/…`: profiles through account links with per-link rights,
  dependents, delegation invites (one-time codes), identifiers, insurance, health items, record
  claims (emailed code or a reception ID check), consents and access history.
- Permissions `patients.view`, `patients.identifier_reveal`, `patients.insurance_verify`,
  `patients.merge_approve`; receptionists gain `patients.merge_request`. Rate limits `search`
  (60/min), `verification` (10/h), `reveal` (30/h). Jobs `expire_claims` (15 min) and
  `expire_delegation_invites` (daily); dev seed `seed_patients_dev`.
- Dependency: cryptography.

### Sprint 9 · Notifications

### Sprint 2 · Facility setup and staff

- New apps `medilink.facilities`, `medilink.scheduling`, `medilink.billing`, all with forced
  facility RLS:
  - `facilities`: profile, departments, services, service points, opening hours, calendar events,
    settings sections, branding, and an append-only configuration change log.
  - `scheduling`: doctor schedule templates and exceptions.
  - `billing`: tariff items and insurer rules with effective dates (`btree_gist` exclusion
    constraints).
- Staff:
  - `tenancy_invitation` (hashed single-use tokens, 7 days) and membership service points.
  - Licence attestation and deactivation details on memberships; `accounts_clinician_profile`.
- Endpoints under `/staff/facility/` (profile, photos, hours, calendar events, effective calendar,
  settings, branding, change log, setup checklist, go-live) and under `/staff/`:
  - catalogue: departments, services, service points;
  - schedules: templates, exceptions, overview;
  - billing setup: tariff items, insurer rules;
  - team: roles, memberships, invitations, clinician profile.
- Invitation acceptance: `/staff/auth/invitations/lookup/` and `accept/`. New accounts set a
  password and then MFA; existing accounts confirm with their password.
- Platform: `/platform/memberships/{id}/mfa-reset/`.
- Database functions:
  - `scheduling_busy_ranges()` returns the times a doctor works at other facilities, never which
    facility (FR-ONB-06).
  - `tenancy_find_invitation()` looks up an invitation before login.
- S1 hooks:
  - `application_approved` invites the proposed facility admin and moves the facility to setup.
  - `setup.checklist_complete` is registered as a go-live check.
- Settings-section registry `register_settings_fields()`, plus interfaces for S5 and S8:
  - `effective_calendar()` and `blocks()` (S5);
  - `price()` and `insurer_rule()` (S8).
- Signal `scheduling.exception_approved`.
- Jobs and commands: `expire_invitations` (daily) and dev seed `seed_setup_dev`.

### Sprint 10 · Help center and support (part 1)

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
