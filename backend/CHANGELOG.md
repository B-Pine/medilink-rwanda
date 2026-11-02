# Changelog

All notable changes to the MediLink API (`backend/`) are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (tags `backend-vX.Y.Z`).

## [Unreleased]

<!-- Wave 1: each sprint writes ONLY under its own heading; consolidated into Added/Changed/Fixed at release. -->

### Sprint 9b · Catalogue wiring (contract sprint-09 §11)

- `medilink.notifications.wiring`: domain signals now reach patients and staff through
  `notify()`: booking confirmed, cancelled by the facility, changed, missed; called to a room;
  3 people before you; confirm you are here (pass-over); medicines ready and recorded; new
  prescription for the pharmacy; pharmacist question for the prescriber; new document ready;
  new facility application and merge request for platform admins. Texts in rw/en/fr without
  clinical words; receivers never break the change that triggered them.
- New after-commit signals: `pharmacy.signals` (`prescription_ready`, `prescription_dispensed`,
  `query_raised`), `documents.services.document_generated`, `patients.merge_requests.merge_requested`;
  S1's `dispatch()` also notifies platform admins in-app when an application is submitted (S1-I6).

### Public pages and symptom triage (contract public-pages-and-triage)

- `medilink.triage`: `POST /public/triage/` turns structured answers (symptoms, how long, age group,
  pregnancy) into an urgency, a service and a level of care. Rules version `2026.11-p1` (red flags
  first, R2-R12, a safety layer that only raises urgency) are code with one test per rule and ship
  `signed_off: false` until clinical sign-off (#93). Each answer is logged in the append-only
  `triage_log` without account, IP or device. Throttle `triage` (20/min, `THROTTLE_RATE_TRIAGE`).
- Public facility profile and search: each service carries `waiting` (people before the
  consultation) and `wait_range` (the new-arrival estimate reception sees). The profile computes
  them live; search reads the listing (refreshed every 10 minutes). Counts only, never a person.
- Search results also list the accepted `insurers` codes, so the home page shows them per facility.


### Sprint 5b · Disruptions, follow-ups and the calendar feed

- Disruptions (FR-SCH-14): staff mark a doctor, service or the whole facility unavailable for a
  period; the affected confirmed bookings and today's remote tickets are listed; per item or in
  bulk, move to another doctor or time, offer a choice or cancel. Patients keep, choose another
  time or cancel (never a late cancellation and never a strike); an unanswered offer more than a
  day ahead is accepted automatically. Slot generation opens a disruption when booked slots no
  longer fit the schedule.
- Follow-ups (FR-SCH-15): the doctor books the same doctor for a later date or, when no slot is
  free, stores a reminder.
- Calendar feed (FR-SCH-11): a private `.ics` subscription per account, dependants included; the
  32-byte token is shown once and stored as SHA-256, revocable, served `no-store`.
- Reception calendar (day and week, per doctor) and the doctor's own calendar.
- New tables `scheduling_disruption`, `scheduling_disruption_item`, `scheduling_follow_up`,
  `scheduling_calendar_feed` with forced row-level security (facility; the feed by account); a
  periodic job accepts unanswered offers after the reply window.

### Security

- pypdf 6.21.2 → 6.21.4 in the hash-pinned locks (CVE-2026-119203 to CVE-2026-119209, reported by
  `pip-audit`).

### R7 · CI gates (#90)

- `post_migrate` grant and revoke receivers (`core.db`, `masterdata.db`) skip tables that don't
  exist, so migrating an app backwards no longer fails; `scripts/check_migrations_reversible.py`
  reverses and re-applies each app's latest migration in CI (NFR-OPS-08).
- Two platform-admin querysets (`masterdata` platform lists, `onboarding` facilities list) carry the
  Semgrep review tag for `.objects.all()` in views.

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

### Remediation R1 · Security core (#83)

- Security: patient sign-up no longer reveals existing accounts (#14). `POST /patient/auth/register/`
  always answers `202` "check your email"; a new account can't sign in until the emailed link is
  confirmed with the new `POST /patient/auth/verify-email/` (single use, 3 days); an existing
  email gets an "account exists" email instead. A password reset also confirms a pending sign-up.
  **Breaking** for clients that expected `201 PatientMe` and an immediate session.
- Security: TOTP secrets are encrypted at rest (AES-256-GCM, `MFA_SECRET_KEYS`), existing devices
  migrated (accounts 0005, reversible), `manage.py rotate_mfa_secrets` for rotation; deploy check
  `medilink.E110`/`E111` (#12).
- Security: field keys can be data keys wrapped by an OpenBao/Vault Transit KEK
  (`MEDILINK_KEYSTORE=transit`, `medilink.core.keystore_transit`).
- Security: the account owner is emailed (and `auth.account.locked` audited) when a login or MFA
  lock starts.
- Security: platform MFA reset and patient merge-request views use `PlatformAdmin`, so the
  `PLATFORM_ALLOWED_NETWORKS` allowlist applies; refused requests keep path and IP in the log.
- Security: daily audit anchor (`audit.export_audit_anchor`, sink `AUDIT_ANCHOR_SINK` = log, email
  or file); migration audit 0003 revokes `UPDATE`/`DELETE`/`TRUNCATE` on the audit table from the
  runtime role; the runtime role can't write `tenancy_role`, `tenancy_permission` or
  `tenancy_role_permissions`.
- Security: uploads are always served as attachments (the `disposition` request field is kept for
  compatibility and audited); `UPLOADS_S3_REGION` is required with S3 storage (no `af-south-1`
  default, check `medilink.uploads.E004`); optional SSE-KMS with `UPLOADS_S3_SSE_KMS_KEY_ID`.
- Security: a tripped onboarding honeypot gets the normal success-shaped `201`.
- Changed: `asgi`, `wsgi`, `celery` and `manage.py` refuse to start without
  `DJANGO_SETTINGS_MODULE` (environment or `backend/.env`) instead of defaulting to dev settings;
  `SECURE_HSTS_PRELOAD` is opt-in (default off); stray S3 enum overrides removed from
  `DEFAULT_THROTTLE_RATES`; the API image and compose services are pinned by digest.

### Remediation R2 · Patients (#84)

- Security: staff reads of a facility patient record (ST5) and its health profile (ST13) need a
  care relationship (open visit, visit in the last 30 days, or registered today) or a reason
  given first with the new `POST /staff/patients/{fp_id}/access-reasons/` (ST28); otherwise
  `403 access_reason_required`. Records of staff members always need a reason. Reasons are
  audited when given and on every read (FR-SEC-03).
- Security: record claims answer every refusal after the lookup with the same generic message;
  merge undo follows the approver rule (not the requester, not escalated merges at the facility).
- Merge request bodies reject unknown fields. PA7 dependents honour `Idempotency-Key`; ST17 claim
  confirmations are idempotent.
- Every consent is checked against the current version (`422`, field named); PA23 accepts the
  `notifications` and `location` account toggles; `PATIENTS_DEPENDENT_MAX_AGE` replaces the
  literal 18.
- File numbers are trimmed and uppercased, member numbers lose all spaces; unique violations on
  facility records map to the right `409` by constraint name.
- Access history shows each action only for the actor kinds that can perform it; `can_revoke`
  in delegations matches what revoke allows.
- OpenAPI: list responses describe the `{results}` wrapper or the paginated page; `/patient/`
  operations declare only `patientSession`, staff patient operations only `staffSession`.

### Sprint 9 · Notifications

- New app `medilink.notifications` (contract sprint-09): notifications, delivery attempts,
  preferences, push subscriptions, versioned templates, announcements (facility RLS plus a
  platform-rows policy) and known devices. Permission `announcements.manage` (facility admins).
- `notify(event, recipients, context, …)` for every later sprint: event registry autodiscovered
  from `<app>/notification_events.py`; recipients (users, a patient's self/guardian/delegate
  accounts with the `dependent` template variant, facility staff by permission or role, platform
  admins); dedupe key, rate limit, channel preferences, quiet hours 21:00–06:00 (critical,
  mandatory and important-for-today bypass them); rows written in the caller's transaction,
  sockets and sends on commit; `NotifyError` for programming errors.
- Content policy: clinical denylist (rw/en/fr, accent-insensitive) and no URLs in announcements,
  checked at template sync, revision, announcement save/publish and every render.
- Adapters: in-app (socket `notification.created`), web push (pywebpush: aes128gcm, VAPID,
  allowlisted hosts re-checked before every send, no redirects, 404/410 revokes) and email
  (plain text + autoescaped HTML in the recipient's language, no attachments or tracking).
- Jobs: `send_attempt` (`SKIP LOCKED`), `dispatch_due` (quiet-hours release, retries, lost
  tasks, expiry), `unread_fallback`, `cleanup` (2 years, 30 days, 180 days); retries with
  backoff (critical 10/30/90 s, others 1/5/15 min, 4 attempts) then the critical fallback.
- Security notices: new-device login (in-app + email; not the first device), MFA enrolled,
  password changed (also revokes push subscriptions); patient logout revokes that session's
  subscriptions; MFA reset and role changed are registered for S2 to call.
- Endpoints: public web-push key; patient and staff inboxes (list, detail, unread count with
  other facilities, read, read-all), preferences, push subscriptions; facility and platform
  announcements (draft, edit, publish with fan-out by language, withdraw, 10 a day); platform
  templates (revise, activate) and delivery log and stats; staff delivery log (`audit.view`).
- WebSockets `/ws/v1/patient/notifications/` and `/ws/v1/staff/notifications/` (IDs only,
  4401, 4429 above 30 client messages a minute).
- Commands `generate_vapid_keys`, `send_test_notification`, `notifications_tick`; system checks
  `notifications.E001`–`E004`, `W001`, `E010` (deploy). Dependency: pywebpush.
- Fix: an invalid `?since=` on the delivery log answers 400 (not 500).

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
- Fixes from the S0–S5 audit (R3, #85):
  - Go-live no longer always answers `409`: `FacilityProfile` and the setup checklist expose
    `status_version`, the version go-live expects (not the profile `version`).
  - Checklist: `schedules` is done when no service is bookable; `insurers` is done when the
    application claimed no insurer.
  - Invitation accept for an existing account needs a signed-in staff session and returns
    `StaffMe`; the `{token, password}` path is gone (`401 not_authenticated` instead), so
    passwords are only checked by login (lockout, MFA, audit).
  - `POST /staff/invitations/` honours `Idempotency-Key` (same key: same invitation, one email).
  - `GET /staff/memberships/`, `/staff/invitations/` (no more silent 200 cap) and
    `/staff/schedule-templates/` are paginated (`{count, next, previous, results}`).
  - `409 conflict` on a versioned resource carries the resource as it is now in `error.current`
    (S1 onboarding, master data, S2 facility setup and staff).
  - `Idempotency-Key` must be a UUID (`400` otherwise), as architecture 02 says.
  - The membership-role join is an explicit model with `facility_id` and forced RLS (migration
    `tenancy.0006`); users still read their own roles in every facility.
  - Expired invitations are marked `expired` (new `expired_at`), not revoked, and no longer
    block a re-invite; resending one revives it.
  - Staff writes (invite, resend, accept, edit, reactivate, attest) are refused with `422` in a
    deactivated facility.
  - Celery beat hours are Kigali time (`CELERY_TIMEZONE`): invitation expiry 02:30, licence
    reminders 07:00, stale drafts 03:00, delegation invites 02:00.

### Remediation R4 · Queue and booking fixes (#86)

- A booked patient later than `slot + grace_after` checks in as a walk-in all day: the visit is
  flagged `is_late_arrival`, the check-in response and ticket rows carry `late`. A booking becomes
  `no_show` (with a strike) only after the facility has closed that day (FR-QUE-06, FR-SCH-13).
- "I'm here" (`POST /patient/visits/{id}/arrived/`) records the patient's claim only
  (`remote_arrival_claimed_at`); reception confirms with the new ticket action
  `POST /staff/tickets/{id}/confirm-arrival/` (`remote_arrival_confirmed_at`, visit `on_site`).
  Pass-over applies until then. Self check-in stays P2 (FR-QUE-07, FR-QUE-18). The ticket column
  `remote_checked_in_at` is renamed `remote_arrival_confirmed_at`.
- Pass-over warns first (event `pass_over_warning`, signal `ticket_pass_over_warning` with
  `final`) and moves the ticket `queue.pass_over_warning_minutes` (new, default 5) later.
- Manual queue places (no response, reorder, pass-over) use the new `visits_ticket.order_at` and
  the S5 calling order; `arrival_at` stays the real arrival.
- Ticket rows add `slot_starts_at`, `late`, `is_remote`, `remote_arrival_claimed_at`,
  `remote_arrival_confirmed_at` (flags `late`, `remote`, `remote_claimed`); the tracker (PT1) adds
  `is_remote` and both remote times. The board computes one calling order per queue; My queue and
  the display "next" numbers follow the calling order.
- Call next locks the doctor's duty row; partial unique index `visits_one_serving_ticket` (one
  called or in-service ticket per staff member and day).
- `next-stage` only from `in_service` and only forward.
- Signal `visits.services.on_ticket_event` sent on commit for every ticket event (sprint-04 §7).
- A booking for a patient already in today's queue joins that visit (same service, no booking
  yet), otherwise `422`.
- Optional `symptoms` at walk-in check-in and remote join (`captured_at_stage = check_in`).
- Service schedules: `ScheduleTemplate.membership` is nullable; their slots have no doctor.
- One patient-share rule (`booking.cover`: ceiling, excluded tariff codes, covered services) for
  search, profile and booking; the profile adds `insurer_share_rwf`.
- No-show strikes are a platform policy (`NO_SHOW_STRIKE_WARNING` 3, `NO_SHOW_STRIKE_LIMIT` 4,
  `NO_SHOW_STRIKE_WINDOW_DAYS` 90, `NO_SHOW_LIMIT_DAYS` 30); `limits()` returns `limited_until`.
- One open slot hold per account across facilities (`scheduling_account_holds`).
- Wait metrics run from check-in (or confirmed remote arrival) to the first `call` event.
- Revoking a display link closes its sockets.
- Every socket answers `ping` with the same flat `{"type": "pong", "sent_at"}`.

### Sprint 4 · Visits and the live queue

- New app `medilink.visits` (contract §2.1, [#73](https://github.com/B-Pine/medilink-rwanda/pull/73)):
  visits, tickets, ticket events, daily ticket counters, duty status, reorder reviews, display
  links, travel times and the transactional outbox (`core_outbox_event`, created by `visits`
  until `core` has migrations, D-8). Forced RLS on every facility table; the database rejects
  updates and deletes on the event tables.
- Rules (§2.2): idempotent check-in (also for two racing requests); emergency needs a reason and
  priority a reason code; ordering emergency → return → priority → arrival, own assigned tickets
  first only at equal rank, stepped-out patients skipped; atomic call next with
  `SELECT … FOR UPDATE SKIP LOCKED`; versioned ticket actions (`409` stale, `422` illegal);
  no-response re-insertion with a limit; transfer keeps the arrival time; reorder needs a reason
  and is listed for review; wait estimate as a range with status messages; end-of-day job and
  step-out expiry.
- Endpoints Q1–Q9 (staff board, My queue, call next, ticket actions, visit timeline, duty
  status, reorders, display links), D1 (public display: hashed token, `no-store`, never names)
  and PT1–PT3 (patient tracker, cancel, travel time).
- WebSockets for the staff queue, patient visits and the display: notify-then-fetch with IDs
  only, published after commit from the outbox.
- The patient tracker reads through a SECURITY DEFINER lookup scoped to the account's own and
  guarded profiles (D-7).
- Commands `seed_queue_dev` and `queue_concurrency_check` (DEBUG only; concurrency is proven on
  the dev database because the test suite runs in one transaction, D-9).
- Operations figures for facility admins: `GET /staff/reports/operations/` (today against the
  same day last week, 14-day trend, live load per service, 28-day arrivals heat map, attention
  counts; aggregates only, analysis 13 §1–2). `seed_queue_dev` backfills 13 days of synthetic
  visits.
- `GET /platform/overview/` adds `applications.approved` and `facilities_by_district`.

### Sprint 5a · Booking core

- Discovery (contract §3.1): `POST /public/facilities/search/` over the public read model
  `facilities_public_listing` (live facilities only, location never in URLs), facility profiles,
  a week of slots and symptoms with red flags; services carry `insurer_shares` for the patient
  share.
- Slots generated from the S2 templates minus closures, holidays, Umuganda and leave;
  5-minute holds under a row lock; `409 slot_taken` with nearby alternatives.
- Bookings: confirm rules with error codes, cost estimate, idempotent confirm, cancel and late
  cancel, reschedule, `.ics` without the reason; the reason is encrypted and symptoms are
  append-only.
- Queue: booked check-in with the grace window, booked/walk-in ratio in call next, remote join
  with cutoff, "I'm here" and pass-over.
- Reception (§3.3): staff bookings list, slots, phone booking, cancel, reschedule and no-show
  reversal with a reason (`patient_was_present`, `facility_delay`, `other`).
- No-show job with strikes; jobs and the dev seed; `booking_concurrency_check` (DEBUG only).
- `TIME_ZONE` is `Africa/Kigali` (was UTC; contract D-8).

### Sprint 6a · Consultation and history

- New app `medilink.clinical` ([contract](../docs/architecture/contracts/sprint-06-clinical.md)):
  `clinical_consultation`, `clinical_diagnosis`, `clinical_addendum`, `clinical_vitals` and
  `authz_access_reason`, all with forced facility RLS.
- Consultation per visit (C1–C7): idempotent open, draft autosave with `version` (`409` when
  stale), ICD-10 diagnoses from master data (one primary, provisional or confirmed; sensitive codes
  suggest a restricted record), sign with recent re-authentication and a SHA-256 content hash
  (late entry after 24 h, `integrity` recomputed on read), signed addenda by the author or another
  clinician, entered in error with a reason, and the unsigned records list without content.
- All consultation text, private notes and addendum bodies are field-encrypted (contract D-2).
  Database triggers lock signed records, their diagnoses and vitals, make addenda and access
  reasons append-only, and refuse every delete.
- A consultation-stage ticket cannot complete or move on while its visit has a draft
  (`pre_save` guard, D-6).
- Vitals (V1–V2) with plausible ranges; reception reads only the rows it recorded.
- Treatment-relationship rule (FR-SEC-03): an open visit today or care by the clinician in the
  last 30 days; otherwise, and always for staff-as-patient records, `403 access_reason_required`
  until a reason is given (A1, 120 minutes). Clinical reads and reasons are audited with patient
  links.
- History timeline with filters and problem summary (H1–H2); allergy, duplicate and dose alerts
  (AL1) for S7 prescribing.
- Patients read their own and dependants' signed records (PR1–PR2) through
  `clinical_patient_records(account)`: no private notes, no examination; delegates never see
  restricted records.
- New permission `clinical.unsigned_list` (doctor, facility admin), seeded by `clinical.0002`.
- Patient-scoped clinical routes live under `/staff/clinical/patients/…` because S3's
  `/staff/patients/{id}/{kind}/` matches any word (D-12). `ReasonCodeEnum` (S3 reveal) keeps
  its schema name through an `ENUM_NAME_OVERRIDES` entry in the `[S6]` block.

### Tests

- `tests/test_rls_coverage.py`: every table with `facility_id` has forced RLS with the
  `facility_isolation` policy, or is listed in `RLS_EXCEPTIONS` with the document that allows it;
  an exception that is no longer needed fails too (database design §1).

### Sprint 8 · Billing, payments and insurance

- Bills ([contract](../docs/architecture/contracts/sprint-08-billing.md)): one bill per visit,
  opened at check-in (S4 `on_ticket_event`) or on first read; the consultation from the tariff,
  procedures and other charges added by the cashier, medicines synced from the issued
  prescription (tariff code = drug code). Each line is split between insurer and patient by the
  S2 insurer rule (patient share, exclusions, service list, ceiling per visit) once the insurance
  is verified for the visit; a rejection (with a reason) means self-pay.
- Payments (cash, MTN MoMo, Airtel Money, card) with references and an optional EBM receipt
  number, partial, never above the balance, idempotent, in the cashier's open shift; gapless
  receipts (`RC-2026-000001`, prefix setting) sent to the patient through S9.
- Exemptions with reasons and a waiver approval threshold; voids and refunds through approval
  requests (step-up, decider other than the requester; a one-person clinic may self-approve,
  flagged), credit notes (`CN-`) and payouts; cash shifts with expected and counted totals per
  method, difference note and review; unpaid balances per patient at the facility; patient
  My bills. When nothing is left to pay, prescriptions waiting for payment move to the pharmacy.
- Eleven new `billing_*` tables with forced facility RLS; append-only events, verifications,
  credit notes and payouts; triggers lock payments, receipts, exemptions, bill lines and bills;
  SECURITY DEFINER `billing_patient_bills(uuid)`.

### Sprint 7a · Prescriptions and pharmacy

- New apps `medilink.pharmacy` and `medilink.documents` ([contract](../docs/architecture/contracts/sprint-07-pharmacy-documents.md)):
  prescriptions and items (catalogue drug or flagged free text, default quantity, encrypted
  instructions), issued in S6's signing transaction through the new `consultation_signed` signal
  (number `RX-{year}-{000001}` from a gapless per-facility counter, expiry from
  `documents.prescription_valid_days`, `awaiting_payment` with `billing.pay_before_dispensing`).
  Signing is refused (`422 alert_override_required`) while an allergy alert has no override.
- After issue: cancel an item or the whole prescription with a reason; change = cancel + new item
  (step-up). Pharmacy queue, identity check, dispensing per item (full, partial, generic
  substitution with the same ingredient and strength, not available), controlled-medicine
  confirmation, signed immutable dispense records, dosing labels in rw/en/fr (Kinyarwanda by
  default), queries answered by an S6 addendum, per-facility availability toggle
  (`pharmacy.availability`) and drug search with "not in stock here".
- Patient My medicines (`/patient/prescriptions/`): own and dependants' prescriptions; delegates
  don't see restricted consultations; no alert overrides or consultation text.
- Seven `pharmacy_*` tables and `documents_number_counter` with forced facility RLS; events,
  dispense records and lines append-only; triggers lock issued prescriptions and items; SECURITY
  DEFINER `pharmacy_patient_prescriptions(uuid)` and `pharmacy_expiry_facilities()`; hourly
  `pharmacy.expire_prescriptions` job. `pharmacy` and `documents` join the CI coverage gate.
- Follow-ups (#134): the pharmacy queue search `q` also matches the visit's active ticket number
  (exact, any case); prescription items carry the catalogue `generic_name` and `strength` (blank off
  catalogue) for the substitute search.


### Sprint 10 · Help center and support (part 1)

- New app `medilink.support` (contract sprint-10): help articles for patients and staff (rw/en/fr
  plain text, categories, search across languages, draft and publish with step-up and all three
  languages) and support requests (patients and staff open, reply and close; platform admins
  triage, reply and close with a reason; facility admins see their staff's requests read-only).
- No clinical data: subjects and messages are checked against the S9 clinical-terms list; at most
  5 open requests per account; `support_write` rate limit; messages are append-only.
- S9 notifications for created, followed up, answered and closed requests; audit actions with IDs
  and codes only; permission `support.view_facility`; `support_request` listed as an RLS
  exception (platform queue, sprint-10 §2.5); `support` in the CI coverage gate; dev seed.

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
