# 03 · Public site

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md) · Host: `medilink.rw` (patient-web)

> **Superseded in part by [11 · Public website](11-public-website.md) (2026-11-02).** Routes, navigation, home structure, footer and palette follow 11; the data rules here (no prices, live counts only, location never stored, pre-rendered public data) still apply. See 11 §12 for the list of changes.

Everything on this page works **without an account**. A signed-in patient sees the same pages with a personal layer on top ([04](04-patient-app.md)).

## 1. Site map

| Route | Page | Pre-rendered |
|---|---|---|
| `/` | Home: search, live list and map | Yes (shell and static parts) |
| `/care` | Find care: full list and map with filters | No |
| `/care/:district/:service` | Landing page per district and service (search engines) | Yes |
| `/facilities/:slug` | Facility page | Yes (public data only) |
| `/facilities/:slug/doctors/:id` | Doctor page | Yes (public data only) |
| `/book/:slug` | Join the queue or book | No |
| `/check-symptoms` | Symptom checker | No |
| `/verify`, `/verify/:code`, `/shared/:token` | Document verification and shared documents | No |
| `/for-facilities` and `/for-facilities/apply/…` | Facility page and application wizard | Yes (landing) |
| `/emergency`, `/about`, `/privacy`, `/terms` | Information | Yes |
| `/sign-in` | One sign-in page for login and sign-up | No |

**Every page has:** a header (logo, Find care, Check symptoms, For facilities, language, Sign in), an **Emergency · 912** link visible without scrolling, and a footer (About, Privacy, Terms, Help, Verify a document, languages, contact). Pre-rendered pages hold public data only; live waits, counts and free times load after the page starts ([ADR 0008](../decisions/0008-prerender-public-pages.md)).

## 2. Home `/`

```
┌ Emergency · 912 ───────────────────────────── Kinyarwanda ▾   Sign in ┐
│ What are you feeling?                                                  │
│ [ e.g. child has fever, dentist, pregnancy check             ] [Search]│
│ Sick today · Child · Pregnancy · Teeth · Eyes · Chronic care · Not sure│
│ [Gasabo ▾] [Insurance ▾] [Open now] [Type ▾]          ⌖ Near me       │
├ List │ Map ──────────────────────────────────────────── 48 facilities ─┤
│ Kimironko HC   Health centre  1.2 km  Open  6 waiting ~25 min          │
│                Mutuelle · RAMA                        [Join]  [View]   │
│ Remera Clinic  Clinic         2.8 km  Open  Next time 10:30            │
│                RAMA · MMI                             [Book]  [View]   │
│ … (map beside the list on desktop)                                     │
├────────────────────────────────────────────────────────────────────────┤
│ Emergency 24h   CHUK 3.1 km [Call] [Directions] · Kibagabaga 4.0 km …  │
├────────────────────────────────────────────────────────────────────────┤
│ By service   Children · Pregnancy · Teeth · Eyes · Women · Chronic ·   │
│              Vaccination · General                                     │
├────────────────────────────────────────────────────────────────────────┤
│ Recent places (on this device)   Kimironko HC · 6 waiting              │
├────────────────────────────────────────────────────────────────────────┤
│ Alerts for your turn   Install the app · Turn on alerts                │
├────────────────────────────────────────────────────────────────────────┤
│ Verify a document [ code ] [Scan QR]     For facilities  [Register]    │
└────────────────────────────────────────────────────────────────────────┘
```

| Element | Rule |
|---|---|
| Search | One field that accepts a symptom in the patient's words or a service name; chips below for people who don't type. A symptom goes to the symptom checker result; a service filters the list. |
| District | Default: the last district used on this device, otherwise Kigali. The list appears immediately; location is never required. |
| Near me | Asks for location only when tapped. The position stays in the browser: distance is computed on the device and the position is sent only inside a POST body when a search needs it, never in a URL, never stored. |
| Insurance | The chosen insurer filters "accepts" and is remembered on the device. |
| List rows | `FacilityRow`: name, type, distance, open status, live waiting count and wait range (or next free time for appointment-only services), accepted insurers, one action (Join or Book) and View. No prices. |
| Map | Pins shaped by type and coloured by wait (low, medium, high); "you" as a blue dot after Near me; a selected pin opens a compact card (name, distance, wait, insurers, View). Tiles load only when the map is shown. On phones, List \| Map is a toggle and the map shows a bottom sheet. |
| Distance | Straight-line distance by default. "Directions" opens Google Maps or OpenStreetMap with the facility coordinates. Road distance inside MediLink needs a routing server and is out of P1. |
| Emergency 24h | The nearest emergency departments, always shown, each with Call and Directions. |
| Sort | Default "soonest seen" (wait or next free time, then distance); also nearest and A–Z. |
| Sections | Search + list/map, emergency, by service, recent places, alerts, verify and for facilities. Nothing else. |

## 3. Find care `/care`

The same list and map at full width with all filters in a panel (a bottom sheet on phones):

| Filter | Values |
|---|---|
| Service | From the service catalogue |
| Insurance | Mutuelle, RAMA, MMI, private insurers |
| Open now / open today | From the facility calendar |
| Type | Health post, health centre, hospital, clinic, polyclinic, dental, eye, diagnostic |
| Level of care | Primary, district, referral (with the Mutuelle transfer hint) |
| Distance | 2, 5, 10, 25 km (after Near me) |
| Availability | Walk-in today, remote join open, free time today |
| Doctor language and gender | For doctor-led services |

Active filters show as removable chips with "Clear all" and the result count. No results: one line with the reason and the nearest health centre offering the service.

## 4. Facility page `/facilities/:slug`

```
Kimironko Health Center ✓   Health centre · Gasabo · 1.2 km
Open · 07:30–17:00                                [Directions] [Call]

Today
General       6 waiting   ~25 min        [Join]
Pediatrics    2 waiting   ~10 min        [Join]
Dental        Appointment                [Book]

Insurance   Mutuelle · RAMA · MMI
Bring       Insurance card · ID · Transfer letter (Mutuelle, hospitals)

Services   Doctors   Insurance   Hours   Location   About
```

| Tab | Content |
|---|---|
| Services | Grouped by department; each service: name, who it is for in a few words ("Children 0–14"), walk-in or appointment, Join or Book |
| Doctors | `DoctorCard` per doctor at this facility; filter by service, language, gender |
| Insurance | Accepted insurers per service; whether a transfer letter is required |
| Hours | The week, upcoming closures and holidays (next 30 days), Umuganda behaviour |
| Location | Small map, address, landmark, directions, phone |
| About | Photos, description (one short paragraph written by the facility), access (wheelchair, parking), on-site pharmacy and laboratory, verified badge with the verification date |

Rules: the "Today" panel is the focus; the Mutuelle transfer hint informs and never blocks; no prices; suspended facilities are hidden; a facility with stale queue data (no update for 30 minutes during opening hours) shows "Live wait unavailable" instead of a wrong number.

## 5. Doctor page `/facilities/:slug/doctors/:id`

```
Dr Uwimana Keza          General practitioner · RMDC verified
Treats      Adults · Fever · Hypertension · Diabetes follow-up
Languages   Kinyarwanda · English · French
Here        Mon–Fri 08:00–12:00

Mon 14  ▓▓▓▓░ 2 free    Tue 15  ▓▓▓▓▓ Full    Wed 16  ▓▓░░░ 6 free
[08:30] [09:15] [10:45] [11:30]                              [Book]
```

| Rule | Detail |
|---|---|
| Content source | Entered by the facility admin, approved by the doctor: title, specialty, "Treats" tags (from a controlled list), languages, optional photo |
| Availability | Seven days with fill and free count; tapping a day shows free times. Never names, never how many patients per time. |
| Scope | Only this facility's schedule. A doctor at two facilities appears on both pages, each with its own days. Linking them needs the doctor's consent (out of P1). |
| Verification | Council and licence verified by the facility's attestation; shown as "RMDC verified" or "NCNM verified" |
| Book | Opens the booking flow with this doctor selected |

## 6. Join or book `/book/:slug`

One decision per screen, step indicator, back keeps answers.

| Step | Screen |
|---|---|
| 1 | **Today or a time**: Join today's queue · Pick a time (only the options the service allows) |
| 2 | **Who for**: Me · a dependent · someone else (adds a dependent) |
| 3 | **When** (time only): day strip, morning and afternoon time chips, the doctor if chosen; hold timer "Held 4:59" |
| 4 | **What you feel**: free text + chips; a red flag stops the flow and shows Emergency · 912 |
| 5 | **Before your visit** (if the service has an intake form): short questions, insurance card photo, consent |
| 6 | **Review**: facility, service, doctor, time or "today's queue", insurance and "Bring" line, cancellation rule |
| 7 | **Sign in** only if not signed in: one field (phone or email), code or link, then back to step 6 |
| 8 | **Done**: ticket or booking card, "Leave by" when known, add to calendar, turn on alerts, directions |

An "Earlier time" switch on the done screen asks to be told if an earlier time opens (proposed, part of FR-SCH-17).

## 7. Symptom checker `/check-symptoms`

See [07](07-symptom-checker-and-ai.md) for the safety rules. Screens:

1. **Danger signs first**: "Any of these now?" with pictures and words; yes → Call 912 and the nearest emergency departments.
2. **What you feel**: free text and chips.
3. **One to three short questions**: who (age group), pregnancy when relevant, how long.
4. **Result**: urgency in plain words, the kind of care and level, one-line reason, then the live list of nearby places for that service with Join or Book. One line: "Guidance, not a diagnosis."

## 8. Verification `/verify`

A code field and Scan QR (camera). Result: one large status card (valid, cancelled, superseded, dispensed) with type, date, facility and author. Details only after the patient's date of birth. Designed for a pharmacist at a counter: large type, fast, no sign-in.

## 9. For facilities `/for-facilities`

One sentence, a short loop of the reception board, value per role (reception, doctor, pharmacy, admin), how joining works (apply, verification, setup, live), Register. The application wizard keeps its five steps with autosave and a resume link.

## 10. Emergency, About, Privacy, Terms

- **Emergency:** a large Call 912 button, danger signs as pictures with words, the nearest emergency departments with directions.
- **About, Privacy, Terms:** a short plain-language summary first, then the full text; unconfirmed facts keep a visible "To confirm" tag until legal review.

## 11. Sign-in `/sign-in`

One field: email now, phone from P3. The system decides between sign-in and sign-up. Default is passwordless (an emailed link or code); a password is optional; passkeys later. First sign-in asks for names, then one consent screen (care and privacy required; research separate and unticked). There is no separate sign-up page.

## 12. Proposed API changes

| Change | Endpoint |
|---|---|
| Remove `fee_rwf`, `patient_share_rwf`, `insurer_share_rwf` from public responses; keep `insurers` and `requires_referral` | P1 search, P2 profile, P3 slots, B3 booking (S5) |
| Add coordinates, type, `has_emergency_24h`, `photos`, `access`, `on_site` to listing rows | P1, P2 |
| New: public doctor profile with seven-day availability | `GET /public/facilities/{slug}/doctors/{id}/` |
| New: intake form for a service | `GET /public/facilities/{slug}/services/{code}/intake/` and answers on B3 |
| New: earlier-time alert | `POST /patient/bookings/{id}/earlier-alert/` |

Each change goes through a contract amendment first ([10](10-implementation-plan.md)).
