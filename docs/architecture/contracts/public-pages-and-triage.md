# Contract: public pages and rules-based symptom triage

Status: v0.1 · Agreed before code ([contracts README](README.md)) · Conventions: [API conventions](../02-api-conventions.md) · Decision record: product decisions of 2026-11-01 (public pages rebuilt; AI = rules triage now, ML in shadow later; public queue shows counts and a wait range)

**Goal:** a person who opens MediLink without an account can find care near them that takes their insurance, see how busy each place is, book a named doctor or join today's queue, and, when they don't know what is wrong, answer a few questions and be pointed to the right kind of care. Every page says plainly what MediLink is, and how to get help in an emergency.

Reserved names: backend app `medilink.triage`; patient-web feature `public`; api-client module `triage`; translation namespace `public`.

## 1. Scope

### 1.1 In scope

- **Backend**
  - Public facility profile (P2) and search (P1) carry the **live waiting count** and a **wait range** per service, aggregates only (never ticket numbers or names).
  - `POST /public/triage/` (P5): rules-based triage from structured answers (symptoms, how long, age group, pregnancy) to an urgency, a service and a level of care. Rules are versioned data; every answer is logged without personal data (FR-AI-07).
- **Frontend (patient-web, public)**
  - Home: location-aware "care near you" (distance, open now, your insurer, your share, waiting now, next slot), search, "Not sure where to go?" entry, how it works, for facilities, emergency notice.
  - Facility page: live queue per service, doctors with "Book this doctor", services and your price, hours, directions.
  - Symptom checker `/check-symptoms`: emergency check first, then a few questions, then the suggestion and places nearby.
  - Information pages: About `/about`, Emergency `/emergency`, Privacy `/privacy`, Terms `/terms`. Privacy, Terms and the About facts are drafts marked "[To confirm]" until reviewed (no invented facts).

### 1.2 Deferred

| Item | When | Now instead |
|---|---|---|
| ML model (DDXPlus-trained, Rwanda-adjusted) | P3, shadow mode, doctors only (analysis 11 §8) | Rules only |
| Adaptive questioning, Kinyarwanda free text | P4 | Fixed questions, symptom list in three languages |
| Clinical sign-off of the rules | Before the pilot, #93 | Rules ship marked `signed_off: false`; the page says the advice is guidance |
| Map tiles | When a tile provider in Rwanda is chosen (data residency) | Distance, district and a "Directions" link |
| Verify a document | S7 documents part | Placeholder page keeps its route |

### 1.3 Requirements

FR-SCH-01, FR-SCH-02, FR-SCH-03 (public pages), FR-QUE-11 (wait as a range), FR-AI-01 (symptom list), FR-AI-04/05/06/07 (rules engine, routing, safety layer, prediction log; P2 items brought forward as rules only, no ML), design 06 H1-H10, analysis 11 §4-§6, analysis 12 §8 (privacy notice).

## 2. API

### 2.1 P1 search and P2 profile: live queue fields

Added to each service in `GET /public/facilities/{slug}/` and to each result of `POST /public/facilities/search/`:

| Field | Type | Meaning |
|---|---|---|
| `waiting` | integer or null | People waiting for this service now (all stages before the consultation). Null when the facility does not publish its queue (not live, or the service has no queue today). |
| `wait_range` | `{min, max}` minutes or null | Estimated wait for someone who joins now, the same estimate reception sees for a new arrival (S4 §2.4). Null when unknown. |

Both come from the public listing that already holds `queue_load` and are refreshed with it. No ticket numbers, names or per-person data, ever.

Each P1 result also carries `insurers`: the codes of the insurers the facility accepts for that service, sorted. The home page shows them on each nearby facility without a second call.

### 2.2 P5 `POST /public/triage/`

Request:

```json
{
  "symptoms": ["fever", "cough"],
  "duration": "days",
  "age_group": "adult",
  "pregnant": false
}
```

| Field | Values |
|---|---|
| `symptoms` | 1-8 codes from the master-data symptom list (P4); unknown codes give 400 |
| `duration` | `today` · `days` (2-6 days) · `week` (a week or more) |
| `age_group` | `infant` (under 1) · `child` (1-12) · `teen` (13-17) · `adult` (18-64) · `older` (65+) |
| `pregnant` | boolean, only read when `age_group` is `teen` or `adult` |

Response `200`:

```json
{
  "urgency": "today",
  "service_code": "general_consultation",
  "level_of_care": "primary",
  "red_flags": [],
  "reasons": ["fever"],
  "rules_version": "2026.11-p1",
  "signed_off": false
}
```

| Field | Values |
|---|---|
| `urgency` | `emergency` (go now / call 912) · `today` (see a clinician today) · `soon` (book within a few days) · `self_care` (care at home, with when to come in) |
| `service_code` | a service-catalogue code to search with |
| `level_of_care` | `primary` (health centre or clinic) · `secondary` (district hospital) · `tertiary` (referral hospital), as the search filter (S5 P1) |
| `red_flags` | symptom codes that triggered the emergency rule |
| `reasons` | rule keys the page turns into one plain sentence ("Fever needs a malaria test the same day.") |

No account, no personal data. Throttle: 20 per minute per IP (`triage`). `Cache-Control: no-store`.

### 2.3 Rules (`medilink.triage.rules`, version `2026.11-p1`)

Evaluated in this order; the first matching rule decides, then the safety layer may raise the urgency.

| # | When | Urgency | Service | Level |
|---|---|---|---|---|
| R1 | any red-flag symptom (master data `is_red_flag`: chest pain, shortness of breath, bleeding) | emergency | `emergency_care` | secondary |
| R2 | pregnant and (abdominal pain, or headache with dizziness, or vomiting) | today | `antenatal_care` | primary |
| R3 | infant and (fever, diarrhoea or vomiting) | today | `paediatric_consultation` | primary |
| R4 | fever (any age) | today | child/infant: `paediatric_consultation`, else `general_consultation` | primary |
| R5 | diarrhoea and vomiting together | today | as R4 | primary |
| R6 | cough for a week or more | today | `general_consultation` (TB screening) | primary |
| R7 | toothache | soon | `dental_care` | primary |
| R8 | eye pain | soon | `eye_care` | primary |
| R9 | rash | soon | child/infant: `paediatric_consultation`, else `dermatology` | primary |
| R10 | painful urination | soon | `general_consultation` | primary |
| R11 | only sore throat or only back pain, adult, not a week or more | self_care | `general_consultation` | primary |
| R12 | anything else | soon | child/infant: `paediatric_consultation`, else `general_consultation` | primary |

**Safety layer** (analysis 11 §4.4): an infant or a person 65+ never gets `self_care` (raised to `soon`); any `soon` with duration `week` for an infant is raised to `today`; when rules disagree, the more urgent answer wins.

### 2.4 Prediction log (`triage_log`)

One row per answer: `symptoms`, `duration`, `age_group`, `pregnant`, `urgency`, `service_code`, `rules_version`, `created_at`. No account, IP or device. Class C1 (de-identified), append-only, retention 2 years then aggregated (analysis 11 §5 monitoring).

## 3. Pages and behaviour

| Route | Leads with | Notes |
|---|---|---|
| `/` | "Care near you": asks for location in a friendly card; without it, district search | Never stores the location; POST search only (S5 P1) |
| `/search` | Results list, filters as chips | Each card: distance, open now, your insurer accepted, your share, waiting now, next slot |
| `/facilities/:slug` | Name, verified, open now, Join today's queue / Book | Live queue per service (count and range), doctors with "Book this doctor" (pre-selects the doctor), services and your price, hours, directions link |
| `/check-symptoms` | Emergency check first (red flags, call 912) | Then symptoms, how long, who it is for; result with urgency, service, plain reason, "guidance, not a diagnosis", and places nearby for that service |
| `/about` | What MediLink is, who it serves, how facilities are verified, data stays in Rwanda | Organisation facts marked "[To confirm]" |
| `/emergency` | Call 912, danger signs, nearest emergency departments | Always reachable from every page footer |
| `/privacy`, `/terms` | Plain-language summary, then the full text | Drafts marked "[To confirm]" for legal review (#94) |

## 4. Acceptance checks

| ID | Check |
|---|---|
| PT-B1 | Profile and search return `waiting` and `wait_range` per service; no field identifies a person |
| PT-B2 | Each rule R1-R12 has a test with its example; the safety layer has tests for infant, 65+ and week-long cases |
| PT-B3 | Unknown symptom codes, more than 8 symptoms and missing fields give 400; the endpoint is throttled |
| PT-B4 | Every triage answer writes one log row with no personal data |
| PT-F1 | Home shows care near you after location is allowed, and district search when it is not |
| PT-F2 | The facility page shows the live queue per service and a Book button per doctor that opens booking with that doctor |
| PT-F3 | The symptom checker shows the emergency check first; a red flag shows "Call 912" and nothing to book |
| PT-F4 | Every public page has one h1, works at 360 px, in three languages, and links to Emergency |
| PT-F5 | About, Privacy and Terms mark unconfirmed facts "[To confirm]" |
