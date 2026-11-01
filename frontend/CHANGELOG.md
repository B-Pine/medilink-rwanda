# Changelog

All notable changes to the MediLink frontend (`frontend/`) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are tagged
`frontend-vX.Y.Z` ([ADR 0006](../docs/decisions/0006-separate-frontend-and-backend-hosting.md)).

## [Unreleased]

<!-- Wave 1: each sprint writes ONLY under its own heading; consolidated into Added/Changed/Fixed at release. -->

### Remediation R1 · Security core (#83)

- patient-web: sign-up shows "check your email" for every request (no account enumeration) and the
  new `/verify-email` page confirms the emailed link and signs in. api-client:
  `patientAuth.register` returns `{detail}` (`202`), new `patientAuth.verifyEmail`; mocks follow
  (`MOCK_VERIFY_TOKEN`).
- CSP: `style-src` keeps `'unsafe-inline'` (Radix scroll lock and pdf.js inject `<style>` at
  runtime; a static-host meta CSP can't carry a nonce), documented in `@medilink/config`.

### Sprint 1 · Platform and onboarding

- api-client: `masterData`, `onboarding`, `security` and `uploads` modules (XHR uploads with
  progress, fetch fallback); `StaffMe.feature_flags` and `security`; `session_locked` error code;
  a `headers` request option for `Idempotency-Key`. MSW mocks for every S1 endpoint (uploads clean
  after two polls, `eicar` infected, 10 MB limit, mock PIN `4826`, `mock-resume-token`).
- ui: DataTable (server sorting and pagination, `aria-sort`, filter chips, densities remembered,
  states, card list under 640 px), SidePanel, Dialog and ConfirmDialog, Tabs, SwitchField,
  TextareaField, Stepper, FileUpload, DocumentViewer (images and lazily loaded pdf.js) and Timeline.
- staff-web `lock`: idle lock after `lock_after_seconds` with a 60 s warning, lock screen (PIN or
  password, attempts left, switch user, cross-tab sync, shown alone on reload), step-up dialog
  that retries the action once, `/account/security` (PIN), Lock and Security in the user menu.
- patient-web `facilityApplication`: `/for-facilities`, start form, five-step wizard with
  autosave, location cascade, document uploads with scan status, reviewer feedback, "continue
  later", resume links and the submitted page.
- staff-web `platform`: overview, applications pipeline and review (documents, verdicts, notes,
  history, request changes, approve, reject), facilities (status actions with reasons, licences,
  history, feature flags), master data (tables, rw/en/fr editor, retire and restore, history, CSV
  import preview and confirm) and feature flags. Navigation entries for platform admins only.
- Dependencies: Radix dialog, tabs and switch; `@tanstack/react-table` 8; `pdfjs-dist` 6.

### Sprint 3 · Patients and identity

- api-client: `createPatientsApi` (staff ST1–ST27, platform PL1–PL5) and `createProfileApi`
  (patient PA1–PA26) with the contract types, `hasPermission()`, and the S3 permission codes added
  to `PermissionCodes`. MSW mocks share a synthetic store: 26+ patients, the duplicate pair, a
  staff member as patient, an open reception claim, and a mock account with a child and a
  delegated parent.
- ui: `PersonSearch` (type detection, listbox keyboard navigation, `/` shortcut), `MaskedValue`
  (re-masks after 30 s and on unmount), `ProfileSwitcher`, `CameraCapture` (file fallback),
  `PhoneField` with `toE164()` and `formatPhone()`.
- staff-web `patients`:
  - `/patients`: search, results, and the external match with add-existing.
  - `/patients/register`: walk-in form with live duplicate suggestions and the MediLink number on
    success. The form is exported for S4.
  - `/patients/:fpId`: details, identifiers with reveal-with-reason, insurance verify/reject, the
    health profile by role, consents and claim confirmation, report duplicate.
  - `/patients/merge-requests` and `/platform/merge-requests`: comparison panel, step-up on
    approve and undo.
- patient-web `profile`:
  - `/profile` hub: completion checklist and next step.
  - Profile pages: details, identity documents, insurance, health, access history.
  - `/family`: dependents, one-time sharing codes, accept, revoke.
  - `/privacy/settings`: consents.
  - `/claim`: claim wizard.
  - `ProfileSwitcher` in the header; "My profile" and "Family" links on home.
- Translations: `patients` and `profile` namespaces in rw/en/fr (Kinyarwanda flagged for native
  review).
- R2 fixes ([#84](https://github.com/B-Pine/medilink-rwanda/issues/84)):
  - patient-web access history loads older entries page by page ("Show older entries", PA24).
  - The claim wizard polls the claim (PA20) every 10 s while it waits for reception, shows the
    confirmation, and offers a fresh start when a claim fails or expires.
  - Mocks follow the real API: strict request bodies (`Unknown field.`) and a required `version`
    on PA3; consent kind, version and scope rules (PA22/PA23) and the latest care consent
    decides; shortened holder names and `can_revoke` as `revoke()` allows; dependents replay on
    `Idempotency-Key`, record their consent, check age and the 10-profile limit; the 5th wrong
    claim code and expired claims have their own messages; walk-in care consent carries the
    `patient_id`; reception confirmation moves the claimant's `self` link.

### Sprint 9 · Notifications

- api-client `notifications`: inboxes, preferences, push subscriptions, announcements, templates
  and delivery log, with MSW mocks for every contract §3.3 endpoint (CSRF, sessions, permission,
  error envelopes, push allowlist, 409) and `notification.created` / `notification.read` on both
  sockets.
- staff-web `notifications`: header bell (count with 99+, latest 10, Mark all as read, other
  facilities' count, live across tabs, 60 s polling while the socket is down); inbox with
  All/Unread; settings (sound off by default with a test sound, digest, version conflicts keep
  the input); facility announcement composer (audiences, dates, priority, rw/en/fr with counters
  and a missing-language warning, preview, draft, publish and withdraw with confirmation) behind
  `announcements.manage`; platform announcements for super admins.
- patient-web `notifications`: header bell, inbox with 18 px cards and the "About <name>" chip
  for dependents, detail page that marks read; settings (language, channels per level with
  in-app always on, quiet hours 21:00–06:00, dependents, locked critical level, browsers);
  `PushOptIn` (asks only on a button press, reason first; denied, unsupported and
  iOS-not-installed states; re-syncs on start; Turn off unsubscribes) and the push-off banner on
  Home and the inbox (Not now hides it for 7 days); `public/push-sw.js` push and click handlers
  (critical notifications stay on screen; clicks open only same-origin `/notifications` paths;
  no requests, no caching).
- ui: `CountBadge`, `Switch` and `useWakeLock`.
- A new announcement shows "Draft saved" or "Published" only on its own page, after the move
  from `/new`, so nothing is clicked on the page being replaced.

### Sprint 2 · Facility setup and staff

- Fixes from the S0–S5 audit (R3, #85): go-live sends the checklist's `status_version`; the
  invitation page accepts an existing account only when signed in (`acceptInvitation(token)` →
  `StaffMe`, new accounts use `acceptNewAccount`); staff, invitation and template lists read
  every page of the now paginated API; the MSW mocks paginate, check the go-live version and
  replay invitation `Idempotency-Key`s.
- api-client `setup` ([#69](https://github.com/B-Pine/medilink-rwanda/pull/69)): profile,
  catalogue, schedules, billing setup, team and invitation endpoints with MSW mocks.
- ui: `WeekGrid` (sessions to scale, leave hatched, list view alternative), `TimeRangeField`,
  `MoneyField` and `formatRwf`.
- staff-web `setup`: `/setup` checklist with go-live behind step-up; `/settings` (profile,
  services and rooms, hours with closures and a 4-week preview, rules generated from the section
  schema, change history); doctor schedules with licence and cross-facility warnings, leave
  approval and `/schedule/mine`; tariffs and insurer rules; staff invitations, roles, licence
  attestation, MFA reset and deactivation; `/profile/clinician`; `/invite/:token`.
- Today dashboard (design 04 §3) with feature cards (`FeatureRoutes.todayCards`); landing
  sections (tracker showcase, records, trust points, FAQ).

### Sprint 4 · Visits and the live queue

- staff-web `queue` ([#74](https://github.com/B-Pine/medilink-rwanda/pull/74)): reception board
  `/queue` (service chips, Now serving, On site in calling order with flags, side panel actions
  with reasons, `N` check-in with the S3 walk-in form); doctor's My queue (duty status, Call next
  on Space, current patient actions); queue reviews; display links with a QR code; waiting-room
  display `/display/:token` (numbers and rooms, never names; highlight and chime; reduced
  motion); one socket per tab with notify-then-fetch, live badge and an offline action queue
  (FR-QUE-16); Today "On site now" card.
- patient-web `tracker`: `/visits/:id` live tracker (ticket, progress dots, wait range, leave-by
  time, stages, full-screen call with sound and vibration, wake lock, last known state offline)
  and a home card.
- ui: `TicketNumber`, `QueueStateBadge`, `QueueFlagChip`, `ProgressDots`.

### Sprint 5a · Booking

- patient-web `booking` ([#80](https://github.com/B-Pine/medilink-rwanda/pull/80)): facility
  search with filters and the patient share by insurer, facility pages, the one-decision-per-screen
  booking flow (who, what, when with hold timer and alternatives, reason, review) or joining
  today's queue, upcoming visits with cancel and `.ics`; the landing search opens the results.
- staff-web: the board's Expected list shows today's bookings with symptoms, booked check-in,
  Late badges and a New time action; Missed today lists no-shows with a reasoned undo; phone
  booking (`bookings` feature: side panel from the board, `/bookings/new` and the command
  palette; find or register the patient, 7-day slot grid with doctor filter, hold countdown,
  symptoms, contact phone, booking code).
- ui: shared `SymptomPicker` (red-flag chips named for screen readers); `PatientPicker` shared by
  check-in and phone booking.
- api-client: booking module and mocks; `staff.reschedule()`, `NO_SHOW_REVERSAL_REASONS`; mocks
  honour the slots `date` and enforce the reversal rules.

### Sprint 5b · Disruptions, follow-ups and the calendar feed

- staff-web `bookings`: reception calendar (week and day, doctor filter; doctors see their own),
  disruption wizard (who or what, period and reason, affected bookings, one action for all or per
  booking, patient answers) and the follow-up action on My queue.
- patient-web `booking`: the "Your booking has changed" offer on My visits (keep the new time,
  choose another time, cancel; auto-accept deadline explained) and the private calendar feed
  card (link shown once, `webcal:` link, turn off to revoke).
- api-client booking module and mocks for disruptions, offers, follow-ups and the feed.

### Design v2

- patient-web app shell (design 07 §2): one header with profile switcher, language and account
  menu; Home / Find care / My visits / Help as a bottom bar on phones; offline banner; Home,
  Find care, My visits, Help and Settings (text size Normal / Large / Extra large, theme).
- Chart kit in ui (`Sparkline`, `StatTile`, `TrendChart`, `HeatMap`, `LoadMeter`, each with a
  screen-reader table); "Operations today" on Today and a `/reports` page for facility admins.
- Platform overview with the applications pipeline and facilities by district; hero
  illustration on the public home.

### Fixed

- Kinyarwanda day and month names in every browser: Chrome has no Kinyarwanda calendar data and
  showed English names; all UI dates now go through `dateFormat()` in `@medilink/ui/i18n`.
- Tests: React 19 builds `new FormData(form)` on submit; the test setup's Node FormData now
  accepts a form (removes an unhandled error that failed the suite).

### Sprint 10 · Help center and support (part 1)

## [0.1.0] - 2026-10-17

Sprint 0 (Foundations), built against MSW mocks of the
[Sprint 0 contract](../docs/architecture/03-sprint-0-contract.md). Requires API `/api/v1` 0.1.0.

### Added

- pnpm workspace (`apps/*`, `packages/*`) with shared TypeScript (strict), ESLint and Prettier
  configuration; scripts `dev`, `dev:mock`, `build`, `build:mock`, `test`, `lint`, `typecheck`,
  `format`, `icons`, `i18n:review`, `generate-types`.
- `@medilink/ui`: design tokens from design research 02 (light and dark, system preference plus
  `data-theme` override), staff and patient density, Tailwind CSS v4 theme on the tokens,
  self-hosted Figtree and Inter, focus ring and reduced-motion base styles, and the components
  Button, Field, TextField, PasswordField, CheckboxField, SelectField, ErrorSummary, Alert, Badge,
  Card, Spinner, Skeleton, Logo, LanguageSwitcher, ThemeToggle, VisuallyHidden, SkipLink, Menu
  and an Imigongo-inspired pattern.
- i18n with i18next: Kinyarwanda (default), English and French; `<html lang>` follows the
  language; Kinyarwanda drafts listed for native-speaker review in `i18n-review.md`.
- `@medilink/api-client`: typed fetch client (credentials, CSRF bootstrap and refresh,
  `Accept-Language`, typed `ApiError`, 401 hook), typed functions for every Sprint 0 endpoint,
  `generate-types` stub for openapi-typescript.
- MSW handlers for the Sprint 0 contract, including the MFA flows and error cases, with
  documented mock accounts.
- Staff web: split-screen login, MFA setup (QR, manual key, recovery codes) and verify (code or
  recovery code), facility picker, app shell (sidebar by permissions, facility switcher,
  connection indicator, user menu with theme, language and logout), Today placeholder, section
  placeholders, password reset, 404, session route guard.
- Patient web: public landing skeleton, email-first login, sign-up with consent step, patient
  home placeholder, logout, password reset, placeholder public pages, 404, installable PWA that
  never caches `/api/`.
- Favicons, PWA icons and web logos generated from `brand/logo/source/` by `scripts/generate-icons.mjs`.
- Tests: Vitest + Testing Library + vitest-axe (flows against the mocks, accessibility on key
  pages, token values and contrast, i18n parity, security guards, lint rule).
- CI workflow `.github/workflows/ci-frontend.yml` (install, lint, format, typecheck, test, build).

### Security

- No tokens in browser storage; `dangerouslySetInnerHTML` and `innerHTML` banned by lint; no
  third-party scripts, fonts or CDNs; CSP meta tag in builds; mocks excluded from production
  builds; service worker never caches API responses; caches cleared on patient logout.

[Unreleased]: https://github.com/B-Pine/medilink-rwanda/compare/frontend-v0.1.0...HEAD
[0.1.0]: https://github.com/B-Pine/medilink-rwanda/releases/tag/frontend-v0.1.0
