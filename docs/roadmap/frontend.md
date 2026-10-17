# Frontend roadmap (`frontend/`, deployed as static sites)

Status: v0.1 · Process and Definition of Done: [roadmap README](README.md) · Toolchain: [ADR 0007](../decisions/0007-frontend-toolchain.md) · Design: [design research](../design/research/README.md)

## Principles

1. **One design system** (`packages/ui`) for both apps, built from the measured tokens ([design 02](../design/research/02-color-system.md)). No ad-hoc colours.
2. **Contract-first with mocks:** every screen is built against MSW mocks of the sprint contract, then integrated with the real API.
3. **Accessibility and Kinyarwanda first** are acceptance criteria, not polish: keyboard, labels, contrast, both themes, text expansion.
4. **Fast on weak networks:** code-splitting per route, small bundles, skeletons that match the final layout, optimistic updates for queue actions.
5. **Security in the browser:** no tokens in storage, no `dangerouslySetInnerHTML`, no third-party scripts, minimal offline cache, caches cleared on logout ([security 06](../security/06-application-and-api-security.md) §6).

## Apps

| App | Users | Host |
|---|---|---|
| `apps/staff-web` | Super admin, facility admin, receptionist, doctor, pharmacist; waiting-room display route | `staff.medilink.rw` |
| `apps/patient-web` | Public visitors (pre-rendered pages) and patients/caregivers (PWA) | `medilink.rw` |

## M1 · Web MVP

### S0 · Foundations
- **Build:**
  - pnpm workspace; `packages/ui` (tokens, Tailwind v4 theme, fonts, base components); `packages/api-client` (credentials, CSRF, errors); MSW mocks; i18n (rw/en/fr)
  - **staff-web:** login → MFA setup/verify → facility picker → app shell (sidebar by role, facility switcher, connection indicator, user menu, theme, language) → Today placeholder
  - **patient-web:** landing skeleton (hero, search placeholder, how-it-works, emergency notice), email-first login/sign-up with consent, home placeholder, PWA manifest and icons
  - CI
- **Design:** [05 auth](../design/research/05-authentication.md), [06 homepage](../design/research/06-homepage-and-public-pages.md), [04 shell](../design/research/04-dashboards.md) §2
- **Contract:** [Sprint 0](../architecture/03-sprint-0-contract.md) (checks F1–F12)

### S1 · Platform and onboarding
- **Build:**
  - **public:** "For facilities" page and the facility application wizard (5 steps, autosave, uploads with progress, resume link)
  - **staff-web super admin:** applications pipeline, review screen (document viewer, notes, approve / request changes / reject), facilities list, master data screens
  - components: DataTable v1 (sorting, filters as chips, pagination, density, row side panel), FileUpload, Stepper, DocumentViewer
- **Design:** [08 tables](../design/research/08-tables.md)

### S2 · Facility setup and staff
- **Build (staff-web, facility admin):**
  - setup checklist; profile, services and service points, hours and calendar, schedule builder (week template + exceptions, conflict warnings), tariffs, insurer rules, queue rules
  - staff list and invites; invite acceptance flow (password, MFA, licence)
  - settings change history
- **Components:** Calendar/Week grid (with non-drag alternative), TimeRange inputs, Switch, Tabs, Dialog

### S3 · Patients
- **Build:**
  - **staff-web reception:** quick walk-in registration in the side panel (< 60 s), duplicate suggestions, patient search (name / phone / ID / file number), insurance card capture (camera + upload)
  - **patient-web:** profile switcher, family/dependents, insurance cards, health profile, privacy (access history, consents)
- **Components:** PersonSearch, CameraCapture, MaskedValue (reveal + audit), ProfileSwitcher

### S4 · Queue (signature screens)
- **staff-web:**
  - **Today board** (Expected | On site, filters by service, flags, keyboard shortcuts, side panel)
  - **Doctor My queue** (Call next on Space, statuses)
  - **Display route** (kiosk, deep forest, large tickets, chime, no names)
  - real-time via WebSocket (notify-then-fetch) with a live indicator and reconnect
- **patient-web:** **Live tracker** (ticket, position dots, wait range, time to leave, stages, "You're called" full-screen with sound/vibration, wake lock, offline last-known state)
- **Design:** [04 dashboards](../design/research/04-dashboards.md) §3, [07 patient app](../design/research/07-patient-app-pages.md) §3.3
- **Tests:** e2e "walk-in → called → completed"; real-time update latency check (NFR-PERF-04)

### S5 · Discovery, booking and calendars
- **patient-web:**
  - search results (list + map with Leaflet/OpenStreetMap), facility profile pages (pre-rendered), referral pathway hint
  - booking flow (one decision per screen, slot hold timer), remote join
  - My calendar with `.ics`; cancellation/reschedule; no-show strike notices
- **staff-web:** reception calendar (day/week), phone booking, disruption wizard (bulk rebook)
- **Build decision:** pre-rendering tool for public routes

### S6 · Clinical record
- **staff-web doctor:**
  - consultation page (one scroll with section anchors, autosave status, allergy banner, ICD-10 type-ahead, vitals, private notes clearly marked)
  - sign with PIN/password; addenda; history timeline drawer; results inbox; reason-for-access prompt
- **staff-web admin:** legacy import (CSV mapping, validation preview, duplicates, rollback), scan attachment
- **patient-web:** My visits timeline, visit detail (plain-language diagnosis, instructions)

### S7 · Pharmacy and documents
- **staff-web:** prescription builder (drug search, frequency presets, stock marker, alerts); pharmacist queue and dispense screen
- **patient-web:** My medicines (dosing pictograms), documents list, download/share, full-screen QR
- **public:** document verification page
- **Print:** print styles for documents and tickets (A4/A5, 80 mm)

### S8 · Billing
- **staff-web reception/cashier:**
  - payments desk (bills awaiting payment, lines, insurer/patient split, record payment with references, receipt print)
  - void/refund requests; shift open/close and cash-up
- **staff-web admin:** approvals inbox
- **patient-web:** receipts, unpaid balances, estimated costs during booking

### S9 · Notifications
- **Both apps:** notification inbox, bell with count, preferences, quiet hours
- **patient-web:** web push opt-in at the right moment, push-off banner
- **staff-web:** sounds for queue events (optional), announcements composer (facility), platform announcements (super admin)

### S10 · Disputes, help and reports
- **patient-web:** "Report a problem" wizard from any item, dispute timeline, help center, ratings (P2-ready)
- **staff-web:**
  - dispute handling (thread, internal notes, evidence view of the audit trail, outcome actions)
  - **reports:** KPI tiles, charts with the validated palette, table views, exports
  - audit log viewer; weekly unusual-access report
- **Design:** dataviz rules in [design 04](../design/research/04-dashboards.md) §4

### S11 · Hardening and pilot readiness
- Accessibility audit (axe + manual, NVDA/TalkBack) and fixes
- Text-size settings and Kinyarwanda copy review with native speakers
- Offline/PWA polish; performance budgets (3G first load < 3 s)
- Usability tests with reception staff and elderly patients; fixes
- Training mode / demo data banner for staff onboarding

## M2–M4 (summary)

| Milestone | Frontend scope |
|---|---|
| M2 · Pilot & growth | Referrals UI, sharing consent and one-time codes, waitlist, care plans, ratings, claims export screens, subscription billing UI, stock screens, symptom-checker (rules) flow |
| M3 · Mobile & SMS | `apps/patient-mobile` (React Native/Expo) reusing `packages/api-client` and design tokens; phone-number login; mobile money payment UI |
| M4 · Reach & intelligence | ML triage UI (after validation), Ministry analytics dashboards, advanced reports |
