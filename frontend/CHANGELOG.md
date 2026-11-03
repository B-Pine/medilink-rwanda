# Changelog

All notable changes to the MediLink frontend (`frontend/`) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are tagged
`frontend-vX.Y.Z` ([ADR 0006](../docs/decisions/0006-separate-frontend-and-backend-hosting.md)).

## [Unreleased]

<!-- Wave 1: each sprint writes ONLY under its own heading; consolidated into Added/Changed/Fixed at release. -->

### Super admin pages show what MediLink holds (2026-11-03)

- Added: **Register a facility** (`/platform/applications/new`) replaces the three-field dialog:
  facility, identifiers, province-to-village picker, map pin, applicant, facility admin and
  insurers. `/platform/applications/:id/edit` completes a draft; the review page has **Edit
  details** and adds documents for the facility while editable.
- Changed: the applications table shows type, district, the proposed admin and progress; the
  facilities table shows the FOSA ID, ownership, place, who is in charge and staff, with type,
  ownership, licence and "without a FOSA ID" filters and **Export CSV**; the facility page shows
  identity, contact and place, the people in charge and staff by profession.
- Changed: users show phone, profession and licence; master data Locations shows level and parent
  with a level filter.
- Fixed: badges break between words only, never inside one (they split as "Liv e" in tables).

### Clinician profile: full professional details (2026-11-03)

- Changed: **My clinician profile** (`/profile/clinician`) holds profession, specialty (list), sex,
  the licence end date and scan (camera or file, virus-checked), qualifications and a photo.
- Changed: the team panel shows the licence check: details, state, the scan to open, and Attest
  or **Cannot confirm** with a reason (the clinician is emailed); attesting is offered only with a
  scan and a valid end date. A new **Work at this facility** block sets department and employment.
- Added: `PROFESSIONS`, `SPECIALTY_CODES`, `EMPLOYMENT_TYPES` and the full clinician types in the
  API client, with the mocks.

### Public site · Facilities as products (#180)

- Changed: facility cards are product cards (tinted cover with the facility's monogram, type and
  24-hour emergency badges, insurer chips, the whole card clickable, one action row with a map
  icon button). The facility profile opens with its photo gallery under the name.
- Added: public site motion and surface tokens (`--ml-motion-*`, `--ml-ease-*`, `--ml-glass-*`,
  `--ml-hero-mesh`, `--ml-band-mesh`) and utilities (`.ml-glass`, `.ml-nav-indicator`, `.ml-lift`,
  `.ml-float`, `.ml-hero-seq`, `.ml-band`); all off with reduced motion or data saver.
- Changed: frosted public header; nav links with hover pills and an active underline that glides
  between pages (view transition); compact EN / RW / FR select. Navbar pages open on a branded
  header band (mesh and Imigongo pattern). Landing: mesh hero, staged entrance, drifting live
  cards, a raised search, a divided trust strip, cards and tiles that lift on hover.
- Changed: calmer public footer (one compact "Call 912" block instead of the red card, secondary
  link colour, compact language select). Landing search: the field has its own row, so the
  placeholder and the place are no longer cut off.
- Changed: the floating assistant button folds to its icon once the page scrolls.
- Changed: a firmer, less generic public look. Smaller corners (site-scoped `--radius-xl/2xl/3xl`),
  hairline borders instead of glowing shadows, no tinted glow, flat hero and page headers (an
  editorial heading with a rule), no floating UI cards over the hero photos, and facility cards
  with a plain header row (type icon, type, emergency) instead of an illustrated cover.
- Changed: public pages use more of wide screens (container 1200 → 1408 px, header, footer and
  Find Care aligned to it); Find Care keeps one card per row until 1792 px so actions never clip.
- Removed: the landing page's "Live waiting times at verified facilities" tag and the trust strip
  (verified facilities, districts, languages, free) under the hero.
- Changed: a cleaner sign-in side panel: no pattern or glow, the three benefits as plain lines
  between hairlines instead of icon tiles, and a narrower panel so the form leads.
- Changed: the landing hero shows a flat SVG illustration (a health centre on terraced hills with
  an Imigongo frieze, a tree and people waiting) in theme colours instead of the generated photo
  collage.
- Fixed: home service tiles no longer show "0 facilities".
- Fixed: sign-in, sign-up and password screens use the public site's palette (the button green
  matches the site), the logo no longer squashes on phones, and the top bar fits 360 px (the
  theme switch moves to wider screens; the theme follows the system on phones).

### Upgrade U2 · Cashier role (upgrade 06 §4)

- Added: Cashier in the staff invite roles; Cash desk on Today (shift, bills to pay, partly
  paid, payments and amount collected this shift, next bills to pay). The cashier sees Payments,
  not the queue or approvals.

### Upgrade U2 · Emergency department flag

- Added: "24-hour emergency department" switch in Settings › Facility profile.
- Changed: /emergency lists declared emergency departments first with a "24-hour emergency"
  badge, then other hospitals; the facility page shows the badge and an open-day-and-night note.

### Upgrade U2 · Service descriptions in master data

- Added: platform admins write a public description per service in Master data (optional, in
  each language); the public service page shows it before the built-in text.

### Upgrade U2 · Public Contact page inbox (upgrade 11 §13)

- Fixed: the public Contact form now reaches the MediLink team (it posted to an endpoint that did
  not exist); the visitor sees a reference, and the server's own field errors inline.
- Added: Website messages (`/platform/contact-messages`) for platform admins: new / handled /
  all, search, reply by email or call, mark handled with a note.

### Upgrade U2 · Public facility page ↔ facility admin

- Added: the public facility page shows the admin's photos (first one large, each opens full
  size), email and website.
- Changed: Settings › Facility profile shows real photo thumbnails (the first marked as cover),
  the level of care, and a "View public page" link once live (`VITE_PATIENT_WEB_URL`).

### Facility onboarding: map pin, government identifiers, photos (2026-11-03)

- Added: `@medilink/ui/map-picker` (`LocationPicker`): tap or drag one pin on a Leaflet map.
- Changed: the application wizard's location step requires the map pin: use my location, tap the
  map at the entrance, or type latitude and longitude (checked to be inside Rwanda).
- Added: the facility step asks for the MoH facility code (FOSA ID) and the 9-digit TIN
  (optional); the documents step takes up to 6 facility photos; the review step lists them.
- Changed: the super admin's application review shows every field: level of care, government
  identifiers, map pin (opens OpenStreetMap), applicant phone, language, agreements and NCSA;
  type and ownership as words. The facility page shows and edits the identifiers (step-up).
- Fixed: the location coordinates text used `lng` as an i18next value, which i18next reads as
  the language and fails on.

### Upgrade U2 · Pharmacist (upgrade 05 §4)

- Added: Pharmacy counter on Today (numbers and the next prescriptions to give), Dispensing
  history (`/pharmacy/history`: today, 7 or 30 days, only mine, search) and Verify a prescription
  from another facility (`/pharmacy/verify`: code, then the medicines with the date of birth).

### Upgrade U2 · Reception (upgrade 05 §2)

- Added: Reception Today (desk bar, flow, today's numbers, check-in by code, arrivals to confirm,
  next arrivals); check-in by booking code on Today and the board.
- Changed: the board shows the patient's words and Danger sign / Not paid / Insurance to verify /
  No phone chips, "Raise to emergency" with a reason, "I'm here" claims above Expected, and intake
  done or missing on each expected booking.
- Added: insurance card photos (front and back) with verify or reject on the patient record,
  and "Check insurance" from the board; `?tab=` opens a record tab.
- Added: contact person for a patient without a phone (FR-PAT-18) on the record; printed ticket
  slip (`/queue/visits/:visitId/slip`) and appointment card (`/bookings/card/:code`), 80 mm,
  from check-in, the ticket panel and phone booking (upgrade 08 §3).

### Facility onboarding: staff contact details (2026-11-03)

- Added: staff-web **My details** (`/account`, from the user menu): my name, work phone and
  language (also switches the app language).
- Changed: the invite dialog takes optional names and work phone; the invitation list shows the
  name; the member panel shows email and phone as links. The invitation accept page prefills
  the name the inviter gave (for a new facility, the application's proposed admin).
- Added: `api.staffAuth.updateMe()`, `phone` on `StaffMe` and `StaffMembership`, `full_name` and
  `phone` on `Invitation`, `suggested_name` on `InvitationLookup`, and the matching mocks.

### AI symptom assistant, test phase (issue #159)

- Added: `/assistant`, a chat where the person describes symptoms in their own words. It asks
  yes/no follow-ups (Yes · No · I am not sure buttons), then may name a possible cause, says how
  soon to see a doctor, and lists facilities for the suggested service; red flags show the 912
  card. A test-phase and privacy notice comes first (do not type a name or ID); Kinyarwanda is
  marked experimental. Linked from Check symptoms.
- Added: `api.triage.assistant()` with `AssistantTurn` types, the `assistant_unavailable` error
  code and a scripted MSW mock.
- Added: a floating "AI assistant" button on every public page and in the patient dashboard
  (above the phone tab bar). It opens the same chat in a side panel, full screen on phones; the
  conversation carries across pages and continues on `/assistant`, where the button is hidden.
  Following a facility from the answer closes the panel; in the dashboard it opens the in-app
  page.

### Upgrade U2 · Doctor tools (upgrade 05 §3)

- Added: Pharmacy questions `/clinical/questions`: questions on my prescriptions, answered in
  one step (a signed note on the record).
- Added: Follow-ups `/clinical/follow-ups`: missed, today, next 14 days and came back.
- Added: My activity `/clinical/activity` and Templates `/clinical/templates` under a new
  "My practice" menu section; in the consultation, "Use a template" fills empty sections, adds
  provisional diagnoses and the usual medicines, and "Save as template" keeps the current note.
- Added: My doctor profile in the user menu: licence plus a public bio in rw/en/fr, languages
  and visibility; public doctor pages show specialty, bio and languages.

### Upgrade U12 · Patient dashboard (upgrade 12)

- Changed: every signed-in patient page moves under `/dashboard` (`app/paths.ts`); the old
  addresses (`/home`, `/visits`, `/records`, `/medicines`, `/documents`, `/family`, `/profile`,
  `/privacy/settings`, `/claim`, `/notifications`, `/support`, `/settings`, `/book`) redirect with
  the rest of the path and the query. Sign-in and email verification land on `/dashboard`.
- Changed: new patient shell: fixed sidebar from 1024 px (collapsible, remembered), icon rail on
  tablets, compact header with a five-tab bar and a More drawer on phones; top bar with
  breadcrumb, profile switcher, search, notification menu, language and account menu; toasts.
- Added: global search (Ctrl/Cmd + K or `/`) over pages, own appointments and documents, public
  facilities and doctors; the bell opens the five latest notifications with "Mark all as read".
- Added: overview with the active journey (live ticket, next appointment or welcome), quick
  actions, upcoming appointments, recent activity, reminders from real booking and queue data,
  family and the emergency notice.
- Added: My appointments (Upcoming, Past, Cancelled) and appointment detail with reschedule
  (held time with countdown, confirmed by the server) and cancel; My queue with ticket cards.
- Changed: records, medications, documents, family, settings and help use the shared dashboard
  surfaces (`features/dashboard/kit.tsx`); records gain search; documents gain a type switch;
  family members get a "whose profile" banner; settings is sectioned.
- Changed: Find care and facility pages render inside the shell at `/dashboard/find-care`,
  `/dashboard/facilities` and `/dashboard/facilities/:slug` (`InDashboardContext`).
- Removed: the home-page feature slots (`homeTop`, `homeMain`, `homeCards`) and their cards.
- Changed (redesign 2026-11-02): the patient sidebar and top bar follow the staff shell (identity
  card, Care / Account sections, icon-tile items with an accent bar, Help and collapse at the
  foot; centred search, theme switch, alerts, account menu with the language).
- Changed: the signed-in app uses a calmer type scale (`data-surface="app"` in `tokens.css`: body
  16 px, targets 44 px); public pages keep patient density.
- Changed: overview rebuilt from real data only: the journey beside "Needs your attention", four
  counts at a glance, upcoming appointments, recent visits, latest measurements (as recorded,
  never judged), current medicines and family (`WidgetCard`, `StatCard`). Recent activity and the
  quick-action tiles are gone (the bell and the sidebar cover them).
- Changed: Find care in the dashboard has one search card with quick filters; `FacilityRow`
  columns follow the list's width (container query); the facility page has a Today strip and a
  location card; the booking flow has a labelled stepper and a "Your booking" summary.
- Changed: public header (segmented nav, live emergency pill, theme switch; How it works moved to
  the footer), footer (call-to-action card, tap-to-call 912, all site links) and the sign-in shell
  (split screen with the brand panel).
- Added: `ThemeSwitch` (`@medilink/ui`, `outline` / `ghost`) and `LanguageSwitcher` `pill`.

### Upgrade U2 · Doctor workspace (upgrade 05 §3)

- Added: Doctor Today: my day in numbers, the patient in the room with Open record, and what
  waits for me (overdue records, pharmacy questions, results, records to sign, follow-ups).
- Added: Results inbox `/clinical/results`: outside results assigned to me, opened through a
  5-minute link, marked reviewed with a comment.
- Changed: My queue opens the record directly and can finish and call next in one step; the
  consultation opens with why the patient came, uses icon section cards, a glass action bar,
  diagnosis chips and a "signed, back to my queue" callout; vitals are tiles with red, named
  flags; patient history shows a four-card summary, paper records and scans, and a card
  timeline; unsigned records are a table.

### Upgrade U2 · Facility admin command centre (upgrade 05 §5)

- Changed: the facility admin's Today is a command centre: four live KPIs (patients, median
  wait, no-show rate, collected today), queue load by service, needs your attention (licence,
  approvals, cash shifts, queue moves, unsigned records, disputes, two-step sign-in, invitations;
  urgent first), bookings today, money today and the team on duty.
- Added: Approvals has a Cash shifts tab (`/approvals?tab=shifts`): expected against counted per
  method, the gap, the cashier's note, and accept with step-up (a note is needed when the drawer
  does not balance). `api.billing.shifts()` and `api.billing.reviewShift()` with mocks.
- Changed: Staff shows coverage bars for attestation and two-step sign-in, a warning when active
  members lack a second factor, and a Last active column. `StatTile` takes a `caption`.

### Upgrade U2 · Public website (upgrade 11)

- Added: every public route of the brief: `/find-care`, `/facilities`, `/facilities/:slug`,
  `/doctors`, `/doctors/:slug`, `/services`, `/services/:slug`, `/how-it-works`, `/emergency`,
  `/help`, `/about`, `/contact`, `/privacy`, `/terms`, `/accessibility` (new `site` feature with
  locales in rw, en and fr; Kinyarwanda and French are drafts for native review). `/care` and
  `/search` redirect to `/find-care`.
- Changed: home follows the brief (hero with a custom SVG illustration, search, facilities near
  you with list and map, emergency access, how it works, sign-in band, final call). Navbar: Home ·
  Find Care · Facilities · Doctors · Services · How It Works with a sliding indicator, Emergency,
  language, Sign In and a Find Care button; 80 px; a slide-down menu under 1024 px that locks the
  page. Footer: deep forest with Explore, Information and Legal columns.
- Changed: facility profile with a Today panel (hours, live wait, queue and booking, insurers,
  hospital note), tabs (Overview, Services, Doctors, Insurance, Hours & Location with a map) and
  What to bring; the primary action follows real availability.
- Changed: light palette from the brief (forest `#123D2B`, emerald `#168451`, link `#11744A`,
  text `#17231D`, page `#F7F9F7`, light green `#EDF5EF`); token tests updated.
- Added: shared public kit (`PageContainer`, `PageHeader`, `Breadcrumbs`, `SearchBar`,
  `LocationSelector`, `FacilityStatus`, `WaitingTime`, `InsuranceList`, `LinkRow`, `Faq`,
  `EmptyState` with an illustration, `LoadingRows`, `ErrorState`), the `help.public.contact` API
  call with a development mock, and pre-rendering of how-it-works, about, privacy, terms and
  accessibility. Pre-rendered facility snapshots no longer carry live waits.
- Known gaps (upgrade 11 §13): doctors come from facility profiles (no directory endpoint yet);
  the emergency filter and list show hospitals; `POST /public/contact/` is not on the API yet.

### Upgrade U2 · Soft public look

- Changed: public pages use `.ml-soft`: wide, diffuse shadows tinted toward the brand green (a
  dark-theme variant too) and a faint emerald light at the top of the page. Cards and the list
  are 24 px round, the hero is a forest gradient with a pill search bar, filters and the main
  buttons are pills, hairlines are lighter and sections have more space. `Button` gains `pill`.

### Upgrade U2 · Header and page transitions

- Changed: the public header is sticky (64 px) and lifts with a shadow once the page scrolls
  (scroll-driven animation where supported). A pill slides between Find care, Check symptoms and
  For facilities under the pointer or focus and rests on the current page. Emergency · 912 is a red
  pill; Sign in is a primary pill. On phones the links open in a panel (Escape and navigation
  close it).
- Added: page changes from header, footer and list links cross-fade with view transitions while
  the header stays still (no animation where unsupported or with reduced motion); a thin emerald
  bar shows while the next page loads.

### Upgrade U2 · Sign-in and sign-up shell

- Changed: log in, sign up, check email, forgot and reset password and email verification use one
  `AuthLayout`: a full-height deep-forest band (Imigongo pattern, soft emerald light), a centred
  card that rises in with the MediLink mark and a centred title, a two-bar step indicator on sign-up,
  and "Continue without an account" under the card. Top bar: logo, Emergency · 912, language. Form
  logic, validation, error summaries and consent are unchanged.

### Upgrade U2 · Public pages polish and motion (upgrade 02 §2–6)

- Changed: the home hero is a deep-forest band (Imigongo at 6 %) holding the search, chips and
  filters, with a "Right now" ticket stub of live facts (places open, people waiting, shortest
  wait) and a heartbeat line; numbers show dashes until the data arrives. Filters are compact
  pills; service tiles, alerts, verify and for-facilities blocks share one card style.
- Changed: the footer has three link groups (Care, MediLink, Trust), one emergency line, the
  language switch and copyright, on a hairline instead of the boxed notice.
- Added: motion tokens (`ease-out-quint`, `animate-enter`, `animate-rise`, `animate-fade`) and
  `.ml-stagger`; dialogs and the map card rise in; list rows ease on hover and show the selected
  place with an emerald edge; a changed live wait glows once; the list dims while new results load.
  All of it is off with reduced motion or data saver.

### Upgrade U2 · Find care `/care` (upgrade 03 §3)

- Added: `/care` with the same list and map at full width and every filter in a panel (a dialog
  on phones): service, insurance, district, type, level of care (Mutuelle transfer hint), open
  now, free time today, join remotely, distance after Near me. Active filters are removable chips
  with "Clear all" and the count; choices live in the URL, never the location. No results: one
  line, the nearest place offering the service, and Clear all.
- Changed: `/search` and `/find-care` redirect to `/care`; links, the header and the patient menu
  point there. The "how to get care" explainer page (with a "Coming soon" card) and the old search
  cards are removed. The list and map are one shared module (`features/booking/Places.tsx`) used
  by Home and Find care.

### Upgrade U2 · Home with list and map (U-04, upgrade 03 §1–2)

- Changed: `/` leads with "What are you feeling?" (symptom words go to the checker, service words
  filter), chips, district · insurance · type · open now · Near me, then the live list
  (`FacilityRow`) with a map (`@medilink/ui/map`, Leaflet, lazy) beside it on desktop and a
  List | Map toggle on phones; sort soonest seen · nearest · A–Z. Then Emergency 24h, By service,
  Recent places, alerts (install, turn on alerts), Verify a document and For facilities. The hero,
  how-it-works, trust, tracker, records and FAQ sections are removed.
- Changed: public header is Find care · Check symptoms · For facilities · language · Sign in, with
  "Emergency · 912" always visible.
- Added: `VITE_MAP_TILES_URL` (tile origin added to `img-src`; provider is open decision OD-3,
  OpenStreetMap default for development only). District and insurer choice and recent places are
  remembered on the device through the UI preferences store.

### Upgrade U2 · No prices in discovery or booking (U-01, contract sprint-05 D-14)

- Changed: search results, facility services, the booking flow and booking cards no longer show a
  fee or patient share; the review keeps the "insurer not accepted" warning. API types and mocks
  follow the contract; the unused `rwf` helper and price strings are removed.

### Remediation R8 · UI kit, charts, pre-rendering and Playwright (#91)

- ui: violet queue tokens (`#6D28D9` on `#F5F3FF`; priority solid, 7.10:1) and `Badge`
  `variant` (`tint`, `outline`, `solid`): on hold violet tint, priority violet solid, no response
  and left red outline, completed slate (design 02 §4). Badges wrap in narrow containers.
- ui: sequential emerald ramp per design 02 §6 (4 steps, light and dark); charts draw up to six
  series, have a keyboard readout (arrow keys, Home, End, Escape), a visible "Show table" toggle
  and caption-size axis text; `LoadMeter` shows a gauge icon. New `CHART_SERIES`,
  `SEQUENTIAL_STEPS`, `badgeToneClassName` exports.
- ui: `DataTable` search input id from `useId`, column `meta.align` / `meta.label`, 16 px cell
  padding (design 08). Staff sidebar collapses to 4rem (`--spacing-sidebar-collapsed`).
- staff-web: the live indicator turns yellow ("Reconnecting") once data is older than 30 s, also
  with the socket open (pongs and successful queue fetches count as fresh); only the header badge
  announces, and only state changes.
- patient-web: `/`, `/for-facilities` and `/facilities/<slug>` are pre-rendered at build time with
  `vite-prerender-plugin` 0.5.14 ([ADR 0008](../docs/decisions/0008-prerender-public-pages.md)).
  Static pages hydrate; facility snapshots hold no fees, queue load or next times. The service
  worker falls back to `app-shell.html`. `scripts/check-prerender.mjs` runs after every build
  (pages present, public data only, no email or national ID).
- Playwright (`@playwright/test` 1.64.1): `pnpm e2e` runs the S4 walk-in journey (check-in, call,
  complete) and the pre-rendered pages' checks against the mock builds; new `e2e` CI job.
- HeroIllustration uses brand tokens; a workspace test forbids raw hex colours in components.

### Sprint 7b · Documents (frontend, #123)

- staff-web consultation: a Letters and requests section (referral letter, lab request, sick note)
  signed with the consultation, or at once after it; the visit's documents with Download.
- staff-web patient record: a Documents tab; clinicians download, reception and the pharmacy print.
- patient-web `/documents` and a Home card: my documents with Download, a ZIP of all of them, the
  verification code, and share links shown once that can be stopped.
- patient-web public `/verify` (replaces the placeholder) and `/verify/:code`: genuine or not, then
  the content after the patient's date of birth; `/shared/:token` opens a shared document.

### Sprint 7a · Pharmacy (frontend, #123)

- staff-web consultation: a Prescription section (anchor) to add medicines from the catalogue with
  "Not in stock here", dose, how often, route, days and the calculated quantity; S6 alerts sit on
  the item and an allergy needs a reason before Sign. After signing, items are read-only with
  Change (cancel + new item, step-up) and Cancel with a reason.
- staff-web `/pharmacy`: the queue in three tabs (Ready, Partly given, Questions) with search by
  name, prescription number or ticket and flags; `/pharmacy/prescriptions/:id` confirms who is at the counter
  first, then an outcome per item (give all, part, a same-ingredient substitute with a reason, not
  available), the controlled-medicine confirmation and one signature; a question to the doctor;
  `/pharmacy/prescriptions/:id/labels` prints 62 mm dosing labels (Kinyarwanda by default);
  `/pharmacy/availability` switches stock on and off.
- Follow-ups (#134): the doctor answers a pharmacist's question on the consultation's Prescription
  section with a new or an existing addendum (PQ3); a substitute can cover part of what is left;
  substitutes are looked up by the item's generic name and strength.
- patient-web `/medicines` and a Home card: active and past prescriptions with plain-language
  states ("Ready at the pharmacy", "Partly given: 10 of 21", "Not available here: buy outside
  before …") and the prescription code to show at any pharmacy.
- api-client `pharmacy` module and MSW mocks for §3.1–3.2 (409, 422, step-up, issue on sign);
  `pharmacy` and `medicines` namespaces in rw/en/fr.

### Public pages and symptom checker (contract public-pages-and-triage, #131)

- Home: "Care near you" asks for the location in a card (or a district), then shows the six nearest
  verified facilities with open status, the live queue (people waiting and the wait range) and the
  insurers they accept. The location stays in memory and goes in the POST body only. The hero links
  to the symptom checker.
- Facility page: "Queue right now" per service (counts and a wait range, never a person) and a
  "Book" button per doctor that opens the booking flow with that doctor chosen ("Any doctor" undoes
  it).
- `/check-symptoms`: danger signs first (straight to 912 and the emergency page), then who it is
  for, what they feel and how long; the answer is an urgency, the kind of care and a search for
  places nearby. It says the rules are not yet signed off and that it is guidance, not a diagnosis.
- New `/about` and `/emergency`; `/privacy` and `/terms` are rewritten as plain drafts. Facts not yet
  confirmed (operator, address, contacts, retention) show a visible "To confirm" tag. The footer
  links About, Check symptoms and Emergency.
- api-client: `triage` feature and mock (the backend rules ported), `waiting`, `wait_range` and
  `insurers` on search results.

### Redesign · Patient app (#129)

- patient-web: on phones the four destinations are a real bottom tab bar (the header's backdrop
  blur had pinned the "fixed" bar under the header); tablets and up keep them in the header. The
  header stays one row on phones (language moves to Settings; the profile switcher drops its badge).
- Home: the live ticket leads as a deep-forest card (notched ticket, people ahead, wait, "leave home
  by" in the attention tint); the alerts prompt moves below; find care is a search field on the
  forest card with "Not sure? Describe your symptoms" beside it; account shortcuts are one list.
- Tracker: the large notched ticket; the page no longer shows "Home" twice at the top.

### Redesign · Facility admin and card polish (#127)

- staff-web Today (facility admin): the patient-flow strip and a plain-language callout of the slow
  step ("Waiting for a doctor is the slow step right now. 8 people, up to 31 min.") above the
  figures; "Needs your attention" items are tinted rows.
- Every card in staff-web and patient-web lifts with `shadow-card` instead of a hard border, and
  coloured side-bar accents are gone: `Alert`, the leave card, platform overview tiles and the
  emergency notices use tinted surfaces.
- Fixed: the operations card showed the raw key `queue.ops.liveSummary` (the plural needed
  `count`); the platform menu says "Facility applications" like the page.
- Test: "moves an expected booking" no longer depends on the weekday.

### Redesign · Doctor (#124)

- staff-web My queue: the patient in the room is the focal card (large ticket stub, name, state,
  actions behind a quiet divider); the duty switch is a segmented control with a coloured dot for
  the current state and the room picker beside it; with nobody in the room, Call next sits on the
  deep-forest band and names who is next; Up next uses ticket stubs (emergency red, next ochre).

### Redesign · Front desk (#121)

- staff-web queue board: a check-in bar on the deep-forest band (find a patient `/`, check in `N`,
  book by phone), the live patient-flow strip (expected, waiting, with a doctor, payment, pharmacy;
  the slowest stage over 15 minutes is highlighted), a segmented service filter, ticket stubs
  tinted by state (emergency red, next up ochre, remote not yet seen grey), skeleton loading, and
  softer Expected, remote-joiner and missed lists with compact actions.
- staff-web Today: a quiet greeting with role chips, the most-used actions as one row of pills
  (utilities like the inbox stay in their own places), and the patient flow as the focal card.
- ui: `Button` presses (scale 0.97), a softer secondary style and a new `sm` size.
- A full reload no longer flashes every queue row as "changed".

### Redesign · Foundation (#119)

- Design system: neutrals lean toward the forest green (re-measured, WCAG AA in both themes); new
  ochre `attention-*` tokens for "your turn" and work waiting for someone; cards lift with
  `shadow-card` instead of a border. Recorded in `.interface-design/system.md`.
- ui: `TicketNumber` gains the notched `stub` variant with `brand`, `attention`, `danger` and
  `neutral` tones; new `FlowStrip` (patient flow by stage, bottleneck highlighted).
- staff-web: the sidebar sits on the page colour and groups daily work, "Manage", the MediLink
  platform and help; only permitted sections with a built page appear (no placeholder dead ends,
  also in the command palette and Today shortcuts). `/platform/facilities` is labelled
  "Facilities" (it was "Facility applications", a duplicate).
- staff-web: a platform admin without a facility starts on the platform overview; one `homePath`
  rule serves login, the facility picker and `/`.
- staff-web: a facility page outside the person's role says "You don't have access to this page"
  instead of "Page not found"; platform pages stay hidden from facility staff (S1 §6.1).
- Mocks: one cast for Kigali Clinic (Dr Uwimana Keza, Dr Niyonsenga Paul) across booking, setup
  and queue; "open now" follows the mock opening hours instead of always being true.

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
- S0–S5 audit, R5 ([#87](https://github.com/B-Pine/medilink-rwanda/issues/87)), following the
  2026-10-31 decisions (S5 D-10):
  - Remote joiners: the tracker shows "I'm here", which only tells reception the patient says
    they arrived, and a pass-over warning near the front. The board lists remote joiners not yet
    confirmed (those who tapped "I'm here" first) with Confirm arrival, also in the ticket panel.
  - A booked patient checked in after the grace window is queued as a walk-in: the board says so
    and offers a new time. Ticket rows show the booked slot time, "Late: walk-in" and remote
    status.
  - Booking flow: the step, person and service are in the URL, so browser Back and refresh keep
    the place; symptoms and the reason never go in the URL.
  - Board: `/` opens the check-in search, shortcuts are ignored while a dialog is open, and
    changed rows highlight briefly (design 04 §5).
  - Tracker: one AudioContext per call alert, closed when it ends.
  - ui: shared `formatTime`, `formatDate`, `formatMoney`, `kigaliDate`, `kigaliHour` (24-hour,
    Africa/Kigali) replace ad-hoc formatters.
  - api-client, matching R4 ([#102](https://github.com/B-Pine/medilink-rwanda/pull/102)): field
    names `is_remote`, `remote_arrival_claimed_at`, `remote_arrival_confirmed_at`,
    `slot_starts_at`, `late`; flags `late`, `remote`, `remote_claimed`;
    `queue.confirmArrival(ticket)` (ticket action `confirm-arrival` with `version`);
    `booking.arrived(visitId, version)`; optional `symptoms` at check-in and remote join; the
    booking review uses the server's `insurer_share_rwf`. Mocks: remote join, "I'm here", confirm arrival,
    `calendar.ics`, Idempotency-Key replay for bookings, reschedule checks in the backend's
    order, and a delegate gets `403` on remote join and "I'm here".

### Sprint 10 · Help center and support (part 1)

- api-client `help`: articles (public, staff, platform), support requests (patient, staff,
  platform triage, replies and closing), `pickText()` (UI language, then rw → en → fr) and
  `articleBlocks()` (plain text to paragraphs and lists); MSW mocks for every contract §3.2
  endpoint (sessions, CSRF, `support.view_facility`, the open limit, clinical words, the state
  machine, 409 and step-up on publish).
- patient-web: the Help tab's `[S10]` block replaces the static questions with searchable articles
  (category chips, fallback-language note) and a "Still need help?" card; article pages render
  text only, never HTML; Contact support with topic cards where "My health or treatment" sends
  nothing and points to the facility; My requests and the thread (reply, close, open a new one).
- staff-web: Help and support (Guides, My requests, Facility requests with
  `support.view_facility`, read-only colleague view, the "facility admin can see this" notice);
  the platform support queue (status tabs, filters, search) and request page (details, triage
  with assign to me, reply, close with a reason); the help article editor (rw/en/fr tabs with
  counters, missing languages, preview, save, publish with step-up, unpublish).

### Sprint 5b · Disruptions, follow-ups and the calendar feed

- staff-web `bookings`: reception calendar (week and day, doctor filter; doctors see their own),
  disruption wizard (who or what, period and reason, affected bookings, one action for all or per
  booking, patient answers) and the follow-up action on My queue.
- patient-web `booking`: the "Your booking has changed" offer on My visits (keep the new time,
  choose another time, cancel; auto-accept deadline explained) and the private calendar feed
  card (link shown once, `webcal:` link, turn off to revoke).
- api-client booking module and mocks for disruptions, offers, follow-ups and the feed.

### Sprint 6a · Clinical record

- staff-web `clinical`: consultation page on one scroll with section anchors, an always-visible
  autosave status (409 reloads with a conflict note), a permanent allergy banner, private notes
  marked "Never shown to the patient", ICD-10 type-ahead in plain language with primary and
  certainty (a sensitive code suggests a restricted record), sign and lock behind step-up,
  addenda and entered-in-error; vitals panel with plausible ranges; history drawer and page with
  filters and the problem summary; reason-for-access prompt; Unsigned records list; nav and
  command palette entries by permission.
- patient-web `records`: my and my dependants' signed records in plain language, a Home card,
  never private notes or examination.
- api-client `clinical` module and MSW mocks; ui `AllergyBanner`, `AutosaveStatus`,
  `SectionAnchors`.

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
