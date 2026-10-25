# Sprint 2 contract: Facility setup and staff

Status: v0.1 · 2026-10-25 · Wave 2 (in parallel with S10 part 1) · Template and shared-file protocol: [contracts README](README.md) · Conventions: [API conventions](../02-api-conventions.md) · Model: [S3 contract](sprint-03-patients.md)

**Sprint goal:** after approval (S1), a facility admin turns an empty facility into one that can go live. They describe the facility; set up departments, services and service points; set opening hours, closures and doctors' weekly schedules; set prices and the insurers they accept; choose queue, booking and billing rules; invite their staff. A checklist shows what is missing, and going live is refused until it is complete. Every configuration change is logged.

## 1. Scope

| In scope | Requirements |
|---|---|
| Facility profile (description, contacts, address, coordinates, photos), departments, services, service points and which services each point serves | FR-ONB-04 |
| Opening hours (whole facility and per service), calendar events (closures, holiday overrides, special days), Umuganda behaviour, effective calendar for a date range | FR-ONB-04, FR-SCH-05 |
| Doctor weekly schedule templates and exceptions (leave, training, extra sessions); doctors request their own leave; conflict warnings across facilities that reveal only time ranges | FR-SCH-06, FR-ONB-06 |
| Tariff items with effective dates; insurer acceptance rules with effective dates | FR-BIL-05, FR-BIL-02 |
| Facility settings: queue, booking, billing, documents, notifications (versioned, validated sections); document branding (letterhead, logo, stamp, footer) | FR-ONB-04 |
| Configuration change log (who changed what, old and new value) | FR-ONB-04 |
| Staff: list, invite by email with roles and service points, resend, revoke; accept (new account: password then MFA; existing account: new membership); edit roles and service points; deactivate (access ends at the next request, sockets closed); reset a member's second factor | FR-ACC-05, FR-ACC-06, FR-ONB-05, FR-ACC-04 |
| Clinician profile (council, licence number, specialty) and the admin's licence attestation | FR-ACC-07 |
| Setup checklist; facility admin go-live (with step-up), registered as an S1 go-live check | FR-ONB-03 |
| S1 hook: on `application_approved`, invite the proposed facility admin and move the facility to `setup` | FR-ONB-05 |

**Out of scope:**
- Bookable slots, slot holds and the disruption flow (S5: they read this sprint's templates, exceptions and calendar).
- Queue engine, tickets and display links (S4: reads queue settings and service points).
- Bills and payments (S8: reads the tariff and insurer rules).
- The public facility listing and map discovery (S5).
- Document templates (S7: reads the branding).
- Full facility data export (FR-ONB-09, S11).
- Suspension, reactivation and deactivation: built in S1. S2 only respects them; for example, S1 already blocks configuration of a deactivated facility.
- Subscriptions (P2).

## 2. Domain model

### 2.1 Tables

All facility-owned tables have `facility_id` and forced RLS (`EnableFacilityRLS`). Every row carries `created_at`/`updated_at`. Data classes follow the [database design](../04-database-design.md) §5.4 and §5.6.

**`medilink.facilities`** (new app):

| Table | Key columns |
|---|---|
| `facilities_profile` | `facility_id` PK+FK, `version`, `description_i18n jsonb`, `phone`, `email`, `website NULL`, `address`, `village_code NULL` → master data, `latitude NULL`, `longitude NULL`, `photo_file_ids uuid[]` (≤ 6, upload purpose `facility_photo`), `level_of_care NULL` |
| `facilities_department` | `name_i18n jsonb` (rw, en, fr), `sort_order`, `is_active` |
| `facilities_service` | `version`, `department_id`, `catalogue_item_code NULL` (S1 master data), `name_i18n`, `duration_minutes` (5–240), `is_bookable`, `allows_walk_in`, `allows_remote_join`, `ticket_prefix varchar(3)`, `min_age_months NULL`, `max_age_months NULL`, `sex_restriction NULL`, `is_active`. Unique (`facility_id`, `ticket_prefix`) where active |
| `facilities_service_point` | `name`, `kind` (`room`, `desk`, `window`, `lab`, `other`), `is_active` |
| `facilities_service_point_service` | `service_point_id`, `service_id`; unique pair |
| `facilities_opening_hours` | `service_id NULL` (null = whole facility), `weekday` 0–6 (Monday = 0), `opens_at`, `closes_at`, `break_starts_at NULL`, `break_ends_at NULL`; unique (`facility_id`, `service_id`, `weekday`) `NULLS NOT DISTINCT`; CHECK opens < closes and the break inside |
| `facilities_calendar_event` | `kind` (`closure`, `holiday_override`, `special_day`), `service_id NULL`, `starts_at`, `ends_at`, `is_open` (holiday override or special day open), `opens_at NULL`, `closes_at NULL`, `reason`, `deleted_at NULL` |
| `facilities_settings` | `facility_id` PK+FK, `version`, `queue jsonb`, `booking jsonb`, `billing jsonb`, `documents jsonb`, `notifications jsonb`, `umuganda` (`closed`, `open_after`, `open`), `schema_version` |
| `facilities_branding` | `facility_id` PK+FK, `version`, `letterhead_file_id NULL`, `logo_file_id NULL`, `stamp_file_id NULL`, `footer_text` (upload purpose `facility_branding`) |
| `facilities_config_change` | `entity`, `entity_id`, `field`, `old_value jsonb`, `new_value jsonb`, `actor_id`, `changed_at`. Append-only (trigger, as `patients_merge_event`) |

**`medilink.scheduling`** (new app; S5 adds slots and bookings):

| Table | Key columns |
|---|---|
| `scheduling_schedule_template` | `version`, `membership_id` (the doctor at this facility), `service_id`, `service_point_id NULL`, `weekday`, `starts_at`, `ends_at`, `slot_minutes`, `capacity` (patients per slot, ≥ 1), `bookable_share_pct` (0–100; the rest is kept for walk-ins), `valid_from`, `valid_to NULL`, `ended_at NULL` |
| `scheduling_schedule_exception` | `membership_id`, `kind` (`leave`, `training`, `extra_session`), `starts_at`, `ends_at`, `service_id NULL` (extra sessions), `status` (`requested`, `approved`, `rejected`, `cancelled`), `requested_by_id`, `decided_by_id NULL`, `reason`, `decision_note NULL` |

**`medilink.billing`** (new app; S8 adds bills):

| Table | Key columns |
|---|---|
| `billing_tariff_item` | `code` (facility-unique among current items), `name_i18n`, `kind` (`service`, `procedure`, `medicine`, `other`), `service_id NULL`, `amount_rwf` (integer ≥ 0), `valid_from`, `valid_to NULL`, `created_by_id`. Exclusion constraint: no overlapping validity per (`facility_id`, `code`) |
| `billing_insurer_rule` | `insurer_code` (S1 master data), `applies_to_all_services`, `service_ids uuid[]`, `patient_share_bp` (0–10 000 basis points), `requires_referral`, `excluded_tariff_codes text[]`, `ceiling_per_visit_rwf NULL`, `valid_from`, `valid_to NULL`. Exclusion constraint per (`facility_id`, `insurer_code`) |

**S0 apps (Wave 2 runs only S2 and S10 part 1, so S2 may add migrations here; D-1):**

| Table | Key columns |
|---|---|
| `tenancy_invitation` | `facility_id`, `email` (lower-case), `invited_by_id`, `role_codes text[]`, `service_point_ids uuid[]`, `token_hash bytea` unique (SHA-256), `expires_at` (7 days), `accepted_at NULL`, `accepted_user_id NULL`, `revoked_at NULL`, `source` (`staff`, `application_approval`). Forced RLS; looked up before login through the SECURITY DEFINER function `tenancy_find_invitation(token_hash)` |
| `tenancy_membership_service_point` | `membership_id`, `service_point_id`; unique pair; RLS through the membership's facility |
| `tenancy_facilitymembership` (S0, extended) | `licence_attested_at NULL`, `licence_attested_by_id NULL`, `deactivated_by_id NULL`, `deactivation_reason NULL` |
| `accounts_clinician_profile` | `user_id` PK+FK, `council` (`rmdc`, `ncnm`, `npc`, `other`), `licence_number`, `specialty NULL`; unique (`council`, `licence_number`). Platform-wide (no RLS); a facility sees it only for its members |

### 2.2 Rules

| Item | Rule |
|---|---|
| Change log | Every create, update, retire or delete of a configuration row writes one `facilities_config_change` row per changed field (old and new values, JSON). Personal data never goes in: for staff, the log records role codes and service points, not emails. Audit entries carry IDs and counts only |
| Versions | `PATCH` and `PUT` take `version`; a mismatch → `409 conflict` with the current resource |
| Retire, don't delete | Departments, services, service points: `is_active = false`; still referenced by history. Calendar events: soft delete, past events can't be deleted |
| Opening hours | `PUT` replaces the week for one scope (facility or one service); per-service hours must lie inside facility hours (`422`, lists the days) |
| Umuganda | The last Saturday of each month (08:00–11:00). `closed`: closed all morning; `open_after`: opens at 11:30; `open`: no change. Computed, not stored as events |
| Effective calendar | `GET …/calendar/?from=&to=` (≤ 92 days) returns per day: open ranges per scope after hours, public holidays (S1 master data), overrides, closures and Umuganda. S5 uses the same service function |
| Schedule templates | Blocks lie inside the service's opening hours (warning, not error, when outside: `warnings[]`); `slot_minutes` divides the block; a doctor's blocks don't overlap within the facility (`422`). Edits affect future, unbooked time only (S5 enforces the booked part) |
| Cross-facility conflicts (FR-ONB-06) | Saving a template or approving an extra session calls the SECURITY DEFINER function `scheduling_busy_ranges(user_id, weekday_or_date_range, exclude_facility_id)`. It returns only time ranges where the same person works elsewhere, never the facility. The response lists them as `warnings` (`kind: "other_facility"`); the save still succeeds |
| Leave | Doctors (`leave.request`) create `leave` exceptions for themselves → `requested`; `schedule.manage` approves or rejects (reason). Exceptions created by `schedule.manage` start `approved`. Approved future leave emits `scheduling.exception_approved` (signal; S5 starts the disruption flow) |
| Tariff | Prices change from a date: `PATCH` with `valid_from ≥ today` closes the current row (`valid_to = valid_from − 1`) and creates a new one; existing bills never change (S8 snapshots). Amounts are integers in RWF (`*_rwf`) |
| Insurer rules | One current rule per insurer; same versioning as tariffs; `insurer_code` must be an active S1 insurer; `excluded_tariff_codes` must exist |
| Settings sections | Each section is validated by a versioned schema in `medilink.facilities.settings_schema`. Later sprints add fields through `register_settings_fields(section, schema)`. Defaults are applied on read. Billing section changes need step-up |
| Invitations | Staff invite by email with ≥ 1 role and optional service points. One pending invitation per (facility, email): inviting again → `409`. Token = 32 random bytes, emailed on commit, SHA-256 stored, 7 days, single use. Accept: (a) an account with that email exists → after signing in (staff audience) a membership is added, or the existing one reactivated with the invited roles; (b) no account → set name and password (staff password rules), then the S0 MFA setup. Invitation emails go through S1's `dispatch()` stub (S9 later) |
| Role edits | `PATCH` memberships (step-up): roles and service points; at least one active facility admin must remain (`422`); the member's sessions keep working with new permissions at the next request |
| Deactivation (FR-ACC-06) | `is_active = false`, `deactivated_at`; the member's sessions lose this facility at the next request (S0 principal resolution) and their WebSockets are closed (`close_sockets(user_id=…)`); the last facility admin can't be deactivated (`422`); audited with a reason |
| MFA reset (FR-ACC-04) | Facility admin (`staff.manage`, step-up) resets a member's TOTP: devices deleted, sessions of that user ended, email sent; the member sets MFA up at next login. Platform admins can reset a facility admin's MFA (`/platform/memberships/{id}/mfa-reset/`) |
| Licence attestation (FR-ACC-07) | A doctor must have a clinician profile and an attestation by `staff.manage` before they can be given schedule templates (`422`); S6 reuses the attestation for signing |
| Setup checklist | Computed items (each `{code, done, count, link}`): `profile` (phone, address, coordinates), `departments`, `services` (≥ 1 active), `service_points` (≥ 1, each active service served by one), `opening_hours` (facility week set), `staff` (≥ 1 clinician attested), `schedules` (every bookable service has a template), `tariff` (every active service has a current price), `insurers` (a rule for every insurer claimed in the application, or an explicit "no insurers" in billing settings), `licence` (S1 check) |
| Go-live | Facility admin `POST /staff/facility/go-live/` (step-up): runs S1's `change_facility_status(…, "go_live")`, which runs all go-live checks; S2 registers `setup.checklist_complete`. The platform's S1 go-live runs the same checks |
| Approval hook | On `application_approved` (on commit): create an invitation (`source = application_approval`, role `facility_admin`) for the application's proposed admin, email it, and run `change_facility_status(…, "start_setup")` as the approving platform admin. Idempotent on the application ID |
| Status | Configuration endpoints refuse `deactivated` facilities (`422`); `suspended` facilities can still be configured |

### 2.3 Audit events

All through S0 `audit.record()`; registered with `extend_actions()` in an `[S2]` block. Metadata: IDs, codes and counts only.

| Action | When |
|---|---|
| `facilities.profile.updated`, `facilities.settings.updated` (metadata: section), `facilities.branding.updated` | Configuration writes (field names in metadata) |
| `facilities.service.created` / `.updated` / `.retired`, same for `department`, `service_point` | Catalogue of the facility |
| `facilities.hours.replaced`, `facilities.calendar_event.created` / `.updated` / `.deleted` | Hours and calendar |
| `scheduling.template.saved` / `.ended`, `scheduling.exception.requested` / `.approved` / `.rejected` / `.cancelled` | Schedules |
| `billing.tariff.changed`, `billing.insurer_rule.changed` | Prices and rules (codes and dates) |
| `staff.invitation.created` / `.resent` / `.revoked` / `.accepted`, `staff.membership.updated` / `.deactivated` / `.licence_attested`, `staff.mfa.reset` | Staff |
| `facilities.go_live.requested` | Facility admin go-live (success and refusal) |

## 3. Endpoints

All under `/api/v1`. Staff endpoints act in the active facility. **Ver** = `version` in the body; **Step-up** = S1 `RecentAuthRequired`; **Idem** = `Idempotency-Key`. Lists are paginated (`?page=`) unless marked "all".

### 3.1 Facility (`/staff/facility/…`)

| # | Method and path | Permission | Request → response | Notes |
|---|---|---|---|---|
| F1 | `GET /staff/facility/` | any member | → `FacilityProfile` (`id, name, slug, status, facility_type, description_i18n, phone, email, website, address, village_code, latitude, longitude, photos[], level_of_care, version`) | FR-ONB-04 |
| F2 | `PATCH /staff/facility/` | `facility.configure` | profile fields + `version` → `200` | Ver; change log; name and type stay platform-managed |
| F3 | `POST /staff/facility/photos/` | `facility.configure` | multipart `file` → `201 FacilityProfile` | S1 pipeline, purpose `facility_photo`; ≤ 6 |
| F4 | `DELETE /staff/facility/photos/{upload_id}/` | `facility.configure` | → `204` | |
| F5 | `GET`, `PUT /staff/facility/opening-hours/` | read: any member · write: `facility.configure` | `?service_id=` · `PUT {service_id, version, days: [{weekday, opens_at, closes_at, break_starts_at, break_ends_at}]}` → `200 {service_id, days, version}` | Ver; §2.2 rules |
| F6 | `GET`, `POST /staff/facility/calendar-events/` | read: any member · write: `schedule.manage` or `facility.configure` | `?from=&to=` · event fields → `201` | |
| F7 | `PATCH`, `DELETE /staff/facility/calendar-events/{id}/` | as F6 write | → `200` / `204` | Past events can't change (`422`) |
| F8 | `GET /staff/facility/calendar/` | any member | `?from=&to=&service_id=` → `{days: [{date, open: [{starts, ends}], closed_reason, holiday_name}]}` | ≤ 92 days |
| F9 | `GET`, `PATCH /staff/facility/settings/` | read: any member · write: `facility.configure` | `PATCH {version, section, values}` → full settings | Ver; Step-up for `billing`; unknown fields `400` |
| F10 | `GET`, `PUT /staff/facility/branding/` | read: any member · write: `facility.configure` | `PUT {version, letterhead_upload_id, logo_upload_id, stamp_upload_id, footer_text}` | purpose `facility_branding` |
| F11 | `GET /staff/facility/config-changes/` | `facility.configure` | `?entity=&page=` → paginated changes (`entity, entity_id, field, old_value, new_value, actor_name, changed_at`) | |
| F12 | `GET /staff/facility/setup-checklist/` | `facility.configure` | → `{items: [{code, done, count, link}], complete, status}` | |
| F13 | `POST /staff/facility/go-live/` | `facility.configure` | `{version}` → `200 FacilityProfile` | Step-up; Idem; `422` with failing checks in `fields` |

### 3.2 Catalogue (`/staff/…`)

| # | Method and path | Permission | Notes |
|---|---|---|---|
| C1 | `GET`, `POST /staff/departments/` | read: any member · write: `facility.configure` | All (≤ 50); names rw/en/fr required |
| C2 | `PATCH /staff/departments/{id}/` | `facility.configure` | `is_active: false` retires (refused while it has active services) |
| C3 | `GET`, `POST /staff/services/` | read: any member · write: `facility.configure` | All; `ticket_prefix` unique among active (`409`, `fields.ticket_prefix`) |
| C4 | `PATCH /staff/services/{id}/` | `facility.configure` | Ver; retiring ends its templates (warning lists them) |
| C5 | `GET`, `POST /staff/service-points/` | read: any member · write: `facility.configure` | `{name, kind, service_ids}` |
| C6 | `PATCH /staff/service-points/{id}/` | `facility.configure` | |

### 3.3 Schedules (`/staff/…`)

| # | Method and path | Permission | Notes |
|---|---|---|---|
| S1 | `GET /staff/schedule-templates/` | `schedule.manage` or `schedule.view`; doctors see their own | `?membership_id=&service_id=` |
| S2 | `POST /staff/schedule-templates/` | `schedule.manage` | → `201 {template, warnings}`; doctor attested (§2.2) |
| S3 | `PATCH`, `DELETE /staff/schedule-templates/{id}/` | `schedule.manage` | Ver; `DELETE` ends it (`ended_at`, `valid_to = today`) |
| S4 | `GET /staff/schedule-exceptions/` | as S1 | `?status=&membership_id=&from=&to=` |
| S5 | `POST /staff/schedule-exceptions/` | `schedule.manage` (anyone) or `leave.request` (own `leave` only) | → `201 {exception, warnings}` |
| S6 | `POST /staff/schedule-exceptions/{id}/approve/`, `/reject/`, `/cancel/` | approve/reject: `schedule.manage` · cancel: requester or `schedule.manage` | Reject needs `decision_note` |
| S7 | `GET /staff/schedule-overview/` | as S1 | `?from=&to=` (≤ 31 days) → per member: blocks and exceptions (week grid data) |

### 3.4 Billing setup (`/staff/…`)

| # | Method and path | Permission | Notes |
|---|---|---|---|
| B1 | `GET`, `POST /staff/tariff-items/` | read: `facility.configure` or `billing.record_payment` · write: `facility.configure` | `?on=YYYY-MM-DD` (default today) returns the items valid that day; Step-up on POST |
| B2 | `PATCH /staff/tariff-items/{id}/` | `facility.configure` | `{version, amount_rwf, valid_from, name_i18n}` → `200 {previous, current}`; Step-up |
| B3 | `GET /staff/tariff-items/{code}/history/` | `facility.configure` | All versions |
| B4 | `GET`, `POST /staff/insurer-rules/` | read: `facility.configure` or `billing.record_payment` · write: `facility.configure` | Step-up on POST |
| B5 | `PATCH /staff/insurer-rules/{id}/` | `facility.configure` | As B2 |

### 3.5 Staff (`/staff/…`) and invitation acceptance

| # | Method and path | Permission | Notes |
|---|---|---|---|
| T1 | `GET /staff/roles/` | any member | All roles with permission codes |
| T2 | `GET /staff/memberships/` | `staff.manage` | `?status=active|deactivated&role=&q=` → `{id, user_id, full_name, email, roles, service_points, is_active, mfa_enabled, clinician: {council, licence_number, attested_at} \| null, joined_at}` |
| T3 | `GET`, `PATCH /staff/memberships/{id}/` | `staff.manage` | `PATCH {version, role_codes, service_point_ids}`; Step-up; last-admin rule |
| T4 | `POST /staff/memberships/{id}/deactivate/` | `staff.manage` | `{reason}` → `200`; Step-up; closes sockets |
| T5 | `POST /staff/memberships/{id}/reactivate/` | `staff.manage` | Step-up |
| T6 | `POST /staff/memberships/{id}/attest-licence/` | `staff.manage` | → `200`; needs a clinician profile |
| T7 | `POST /staff/memberships/{id}/mfa-reset/` | `staff.manage` | Step-up; not on yourself (`422`) |
| T8 | `GET`, `POST /staff/invitations/` | `staff.manage` | `POST {email, role_codes, service_point_ids}` → `201`; Step-up; Idem; RL `invitation` (30/hour per facility) |
| T9 | `POST /staff/invitations/{id}/resend/`, `/revoke/` | `staff.manage` | Resend issues a new token and invalidates the old one |
| T10 | `GET`, `PATCH /staff/clinician-profile/` | the signed-in staff user | Own council, licence number, specialty; changing it clears attestations (re-attest) |
| P1 | `POST /staff/auth/invitations/lookup/` | public (token in body) | `{token}` → `{facility_name, invited_by, role_codes, email_masked, account_exists, expires_at}`; generic `400` when invalid; RL `auth` |
| P2 | `POST /staff/auth/invitations/accept/` | token in body; existing account: signed-in staff session with that email | New account: `{token, full_name, password}` → `200 LoginResult` (`mfa_setup_required`). Existing: `{token}` → `200 StaffMe` with the new membership |
| PL1 | `POST /platform/memberships/{id}/mfa-reset/` | platform admin | Step-up; facility admins only |

**Common errors:** as S0/S1. `403 permission_denied`, `403 step_up_required`, `404 not_found` (another facility), `409 conflict`, `422 business_rule_violation` with `fields` where a field is to blame.

## 4. Permissions

No new codes: S0 seeded everything S2 needs (`facility.configure`, `staff.manage`, `schedule.manage`, `schedule.view`, `leave.request`, `billing.record_payment`). Seeded grants used:

| Code | Facility admin | Receptionist | Doctor | Pharmacist |
|---|---|---|---|---|
| `facility.configure`, `staff.manage`, `schedule.manage` | ✓ | — | — | — |
| `schedule.view` | ✓ | ✓ | — | — |
| `leave.request` | — | — | ✓ | — |
| `billing.record_payment` (read tariffs and rules) | ✓ | ✓ | — | — |

Doctors read their own templates and exceptions through ownership (membership = theirs), not a permission.

## 5. Background jobs

| Job | Schedule | What |
|---|---|---|
| `tenancy.expire_invitations` | Daily 02:30 | Marks expired pending invitations (tokens are useless after `expires_at` anyway) |
| (signal) `onboarding.application_approved` | On commit | Approval hook, §2.2 |

## 6. Frontend

### 6.1 staff-web, feature `setup` (`src/features/setup/`)

Replaces the S0 nav placeholders `staff` and `settings`.

| Route | Screen | Shown to |
|---|---|---|
| `/setup` | Setup checklist: one row per item with status icon and label, count and "Set up" link; go-live button (step-up) enabled when complete, failing checks listed on refusal. A card on `/today` (shell `homeCards` is patient-only, so S2 adds a `setupBanner` shell overlay, shown until live) | `facility.configure` |
| `/settings` | Settings home with section links | `facility.configure` |
| `/settings/profile` | Profile form, photos (S1 `FileUpload`), coordinates ("use my location", Rwanda bounds) | `facility.configure` |
| `/settings/services` | Tabs: departments · services · service points; side-panel editors; retire with consequences | `facility.configure` |
| `/settings/hours` | Week editor (`TimeRangeField` per day, copy to weekdays), per-service tab; calendar events list with add/edit; effective-calendar preview for 4 weeks | `facility.configure`; events also `schedule.manage` |
| `/settings/schedules` | `WeekGrid` per doctor: blocks drawn on the grid, keyboard alternative (a table with add/edit buttons); warnings for other-facility busy ranges; exceptions list with approve/reject | `schedule.manage`, read for `schedule.view` |
| `/schedule/mine` | A doctor's own week and leave: request leave, cancel own request | `leave.request` |
| `/settings/tariffs` | Price list (DataTable) with "change price from a date" and history | `facility.configure` |
| `/settings/insurers` | Rules per insurer: services, patient share (%), referral, exclusions, ceiling, from date | `facility.configure` |
| `/settings/rules` | Sections queue · booking · billing · documents · notifications · branding; switches and number fields generated from the section schema | `facility.configure` |
| `/settings/history` | Change log table with entity filter | `facility.configure` |
| `/staff` | Members (DataTable: name, roles, service points, MFA, licence, status); invite dialog; member side panel (roles, points, attest licence, MFA reset, deactivate with reason) | `staff.manage` |
| `/profile/clinician` | Own clinician profile | doctors (any staff) |
| `/invite/:token` (public) | Invitation: facility and inviter shown; new account → name + password → MFA setup; existing account → sign in (with return path) → accept | public |

### 6.2 Shared packages

| Package | Deliverable |
|---|---|
| `packages/ui` | `WeekGrid` (7 columns × time rows; blocks as buttons; a table alternative with the same actions, design 10), `TimeRangeField` (two time inputs with validation), `MoneyField` (RWF, integer, grouped display). Switch, Tabs, Dialog and SidePanel already exist |
| `packages/api-client` | `features/setup.ts` (`createSetupApi`: F1–F13, C1–C6, S1–S7, B1–B5, T1–T10, P1–P2, PL1) with types |
| MSW mocks | `mocks/features/setup.ts`: Kigali Clinic in `setup` with a partly complete checklist, departments, services, service points, hours, two doctors (one attested), templates, a pending leave request, tariffs, an insurer rule, a pending invitation (`MOCK_INVITATION_TOKEN`), and an invitation for an existing account |
| Translations | staff-web namespace `setup` (rw, en, fr); Kinyarwanda flagged in `i18n-review.md` |

## 7. Integration points

**Marked blocks:** Wave 2 adds `[S2]` and `[S10]` blocks next to the Wave 1 blocks in every shared file (anchor commit A1, the first commit of the S2 build). S2 then writes only inside `[S2]`.

| File | `[S2]` content |
|---|---|
| `backend/config/settings/base.py` | `medilink.facilities`, `medilink.scheduling`, `medilink.billing` in `INSTALLED_APPS`; `ENUM_NAME_OVERRIDES` entries |
| `backend/config/urls.py` | Includes for `staff/facility/`, `staff/` (catalogue, schedules, billing, staff), `staff/auth/invitations/`, `platform/memberships/` |
| `backend/medilink/audit/actions.py` | `extend_actions(_s2.ACTIONS)` |
| `backend/medilink/core/management/commands/seed_dev.py` | `seed_setup_dev` (configures the second demo facility only, so the first stays a "setup" example) |
| `backend/.env.example`, `requirements/base.in` | Throttle override `THROTTLE_RATE_INVITATION`; no new dependency expected |
| `frontend/apps/staff-web/src/app/features.ts`, `i18n/features.ts`, `layout/navigation.ts` | `setup` routes, namespace, nav entries (`setup`, `mySchedule`); core `staff` and `settings` items keep their keys, the routes replace the placeholders |
| `frontend/packages/api-client/src/index.ts`, `endpoints.ts`, `mocks/features.ts` | `setup` module and mock factory |
| `frontend/packages/ui/src/index.ts` | Three component exports |

**S1 hooks used:** `onboarding.services.application_approved`, `change_facility_status()`, `golive.register()`, upload purposes (`register`), `dispatch()` for emails, `RecentAuthRequired`, `StepUp` dialog.

**Interfaces for later sprints** (`services.py` of each app):
- `facilities.services.effective_calendar(facility, from, to, service=None)`.
- `scheduling.services.blocks(facility, from, to)` → template and approved-exception blocks (S5 slot generation).
- `billing.services.price(facility, code_or_service, on)` and `insurer_rule(facility, insurer_code, service, on)` (S8).
- `facilities.settings_schema.register_settings_fields(section, schema)`.

## 8. Dependencies

| Depends on | Status | Use |
|---|---|---|
| S0 (tenancy, accounts, audit, MFA setup) | merged | memberships, roles, principal, MFA flow |
| S1 (master data, uploads, onboarding, step-up, go-live registry) | merged | insurers, catalogue items, public holidays, villages; uploads; approval hook; step-up |
| S3 | merged | none directly |
| S10 part 1 (same wave) | contract not written | none; separate `[S10]` blocks |

## 9. Acceptance checks

### Backend

| # | Check | Source |
|---|---|---|
| S2-B1 | Every §3 endpoint exists, matches the schemas and is in the OpenAPI schema (`--fail-on-warn`) | architecture 02 |
| S2-B2 | Authorisation matrix: each endpoint × facility admin / receptionist / doctor / pharmacist / platform admin without facility / patient; doctors see only their own schedule rows | analysis 02 §3 |
| S2-B3 | Cross-tenant: every `{id}` of another facility → `404`; with no facility context the app role sees 0 rows in every new facility table (forced RLS) | security 04 |
| S2-B4 | Change log: each write produces one row per changed field with old/new values; the table rejects UPDATE/DELETE; no emails or personal data in values | FR-ONB-04 |
| S2-B5 | Versioning (`409`) on every PATCH/PUT that takes `version` | API conventions |
| S2-B6 | Opening hours: replace week; per-service hours inside facility hours; break inside the day | FR-SCH-05 |
| S2-B7 | Effective calendar over a month with a public holiday, an override, a closure and Umuganda in each mode | FR-SCH-05 |
| S2-B8 | Templates: no overlap per doctor; warnings outside hours; unattested doctor refused; edits end/replace correctly | FR-SCH-06, FR-ACC-07 |
| S2-B9 | Cross-facility busy ranges: a doctor at two facilities gets `other_facility` warnings with time ranges only; the response never contains the other facility's ID or name (asserted on the JSON) | FR-ONB-06 |
| S2-B10 | Leave: doctor requests own leave only; approval by `schedule.manage`; approved future leave emits `scheduling.exception_approved` | FR-SCH-06 |
| S2-B11 | Tariff and insurer rules: change from a date closes the previous version; no overlapping validity (DB constraint); `?on=` returns the right version; unknown insurer `400` | FR-BIL-05, FR-BIL-02 |
| S2-B12 | Settings: unknown fields `400`; defaults on read; billing section needs step-up; `register_settings_fields` extends a section | FR-ONB-04 |
| S2-B13 | Invitations: token hashed, single use, 7 days, resend invalidates the old token; duplicate pending `409`; rate limit | FR-ACC-05 |
| S2-B14 | Accept: new account → password rules → `mfa_setup_required`; existing account → membership added (or reactivated) after sign-in with the same email; a signed-in user with another email → `403` | FR-ONB-05, FR-ACC-05 |
| S2-B15 | Deactivation: the member's next request has no facility (`403`/facility picker), sockets closed; last facility admin can't be deactivated or lose the role | FR-ACC-06 |
| S2-B16 | MFA reset: devices deleted, sessions ended, member must set up MFA; not on yourself; platform reset for facility admins only | FR-ACC-04 |
| S2-B17 | Checklist items computed correctly from fixtures; facility admin go-live refused with failing items listed, succeeds when complete (step-up, idempotent); platform go-live runs the same check | FR-ONB-03 |
| S2-B18 | Approval hook: approving an application (S1) invites the proposed admin and moves the facility to `setup`, once | FR-ONB-05 |
| S2-B19 | Audit events of §2.3 written with IDs and codes only | security 07 |
| S2-B20 | Migrations reversible on seeded data; S0, S1, S3 suites green; coverage ≥ 90 % for `facilities`, `scheduling`, `billing` and the new tenancy/accounts code; `seed_setup_dev` refuses without DEBUG | NFR-OPS-08 |

### Frontend

| # | Check | Source |
|---|---|---|
| S2-F1 | With `VITE_USE_MOCKS=true` every §6 screen works; mock tests prove permissions, versions, step-up and the §3 errors | ADR 0007 |
| S2-F2 | Checklist: status icon + label (not colour alone), links to each section, go-live refusal lists items | design 04, FR-ONB-03 |
| S2-F3 | `WeekGrid`: blocks operable by keyboard; the table alternative offers the same actions; screen-reader names include day and time | design 10, NFR-UX-03 |
| S2-F4 | Hours editor: copy to weekdays, break validation, per-service tab, effective-calendar preview | FR-SCH-05 |
| S2-F5 | Schedules: other-facility warnings shown as time ranges; unattested doctor message links to the staff page | FR-ONB-06, FR-ACC-07 |
| S2-F6 | Tariffs and insurer rules: change from a date, history, amounts with `MoneyField`, patient share in % | FR-BIL-05, FR-BIL-02 |
| S2-F7 | Staff: invite, resend, revoke; role edit and deactivation need step-up and a reason; last-admin errors shown | FR-ACC-05, 06 |
| S2-F8 | Invitation page: both paths (new account → MFA setup; existing → sign in → accept); invalid or expired token shows one generic message | FR-ACC-05 |
| S2-F9 | Settings forms from section schemas; `409` reload notice; billing step-up | FR-ONB-04 |
| S2-F10 | Doctor: `/schedule/mine` shows own week, request and cancel leave; no admin screens visible | FR-SCH-06 |
| S2-F11 | All text in `setup` (rw/en/fr), parity test and `i18n-review.md` green | NFR-UX-01 |
| S2-F12 | vitest-axe clean on every new page and the three components | NFR-UX-03 |

### Integration

| # | Check | Source |
|---|---|---|
| S2-I1 | Rebased on `main`, OpenAPI regenerated, both suites green; shared files differ only inside `[S2]` blocks (plus the anchor commit) | contracts README |
| S2-I2 | Real API: platform approves an application → invitation email (Mailpit) → new facility admin accepts, sets MFA → completes the checklist → go-live | FR-ONB-03, 05 |
| S2-I3 | Real API: invite an existing doctor of another facility → accepts → schedule shows other-facility warnings without names | FR-ONB-06 |
| S2-I4 | Real API: deactivate a signed-in member → their next action loses the facility; their socket closes | FR-ACC-06 |
| S2-I5 | api-client types match the generated schema; mock and API answer the same examples | architecture 02 §7 |

## 10. Decisions and deviations from the docs

| # | Conflict | Decision |
|---|---|---|
| D-1 | `tenancy_invitation`, membership service points and `accounts_clinician_profile` live in S0 apps; Wave 1 forbade edits to S0 files | Wave 2 runs only S2 and S10 part 1, which doesn't touch tenancy or accounts, so S2 adds migrations there. S10 part 1 must not edit them |
| D-2 | Catalogue paths `/staff/facility/opening-hours/`, `/calendar-events/`, `/departments/` etc. | Kept, except calendar events move under `/staff/facility/` (F6) to sit with hours and the effective calendar (F8, new) |
| D-3 | Catalogue `POST /staff/facility/go-live/` vs S1's platform go-live | Both exist and run the same S1 checks; S2 adds `setup.checklist_complete` |
| D-4 | Database design `facilities_calendar_event.kind` includes `umuganda` | Umuganda is a facility setting, computed per month, not stored rows |
| D-5 | `facilities_display_link` and `facilities_public_listing` in §5.4 | Deferred to S4 (display) and S5 (listing) |
| D-6 | Catalogue: suspend/reactivate/deactivate under S2 | Built in S1 (#47); S2 only respects the status |
| D-7 | Database design `facilities_service.catalogue_item_id` FK | `catalogue_item_code` (S1 master data uses codes as stable keys, like S3 insurers) |
| D-8 | `scheduling_schedule_template` belongs to S5 in the roadmap tables | S2 builds templates and exceptions (FR-SCH-06 is S2); S5 adds slots |
| D-9 | FR-ACC-04 MFA reset not in the S2 requirements line | Added (catalogue lists it under S2; needed when a member loses their phone) |
| D-10 | Facility setup card on `/today` | staff-web has no `homeCards` slot; S2 uses a `shellOverlays` banner until the facility is live |
