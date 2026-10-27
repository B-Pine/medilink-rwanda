# Sprint 5 contract: Discovery, booking, remote join and calendars

Status: v0.1 · 2026-10-27 · Wave 4 · Template and shared-file protocol: [contracts README](README.md) · Conventions: [API conventions](../02-api-conventions.md) · Model: [S4 contract](sprint-04-queue.md)

**Sprint goal:** anyone can find a facility that offers the service they need and accepts their insurance, see their share of the cost and the next free time, and book it or join today's queue from their phone. That works with no account until the booking step. The booked patient appears in reception's Expected list and joins the live queue at check-in, in the right order. A booking that is never checked in becomes a no-show, and staff can reverse it with a reason. When a doctor is absent, staff move the affected bookings in one go, and the patients choose to accept or rebook.

Requirements: FR-SCH-01..15, FR-QUE-02, FR-QUE-03 (booked check-in), FR-QUE-05 (booked/walk-in ratio), FR-QUE-06, FR-QUE-07, FR-BIL-03 (estimate), FR-AI-01 (structured reason for visit, stage 0).
Analysis: [05 · Discovery, scheduling and booking](../../analysis/05-discovery-scheduling-and-booking.md), [06 · Visit lifecycle and queue](../../analysis/06-visit-lifecycle-and-queue.md) §3-4.
Database: [database design](../04-database-design.md) §5.6, §3.4.
Design: [06 homepage and public pages](../../design/research/06-homepage-and-public-pages.md) §2-4; [07 patient app](../../design/research/07-patient-app-pages.md) §3.2, §3.4; [04 dashboards](../../design/research/04-dashboards.md) §3.1 (Expected list).

## 1. Scope

The sprint ships in two pull requests. **S5a** is the booking core. **S5b** adds disruptions, follow-ups and the calendar feed. Both follow this contract.

| In | Out (sprint) |
|---|---|
| **S5a:** public discovery search (service, location, insurance, open now, level of care, availability), facility profiles, referral hint | Ratings (P2) |
| **S5a:** slot generation from S2 templates, with capacity, bookable share and walk-in reserve; atomic 5-minute hold | Waitlist with timed offers (P2) |
| **S5a:** booking, reschedule and cancel by the patient (self or dependant) and by reception (phone booking) | Recurring plans: ANC, refills, immunisation (P2) |
| **S5a:** structured reason for visit (symptom picker), cost estimate with patient share | AI triage of the symptoms (P2; S5 only stores them) |
| **S5a:** Expected list, booked check-in with grace window, booked/walk-in ratio in call next | Deposits and payment at booking (P3) |
| **S5a:** remote queue join for today with cutoff; pass-over job | Push, SMS and email sending (S9 consumes the S5 signals) |
| **S5a:** no-show job, strikes, reversal with reason, booking limits | Medicine schedule in the calendar (P2) |
| **S5a:** patient "My visits" upcoming list with booking detail and `.ics` download | Pre-rendering of public routes for search engines (decided in S5b; the API is ready) |
| **S5b:** disruption flow with bulk rebooking and patient response | |
| **S5b:** follow-up booking from a visit (the doctor's action; S6 moves it into the consultation screen) | |
| **S5b:** private calendar subscription feed (`.ics` link) | |
| **S5b:** reception calendar (day and week) and doctor calendar with bookings | |

## 2. Domain model

### 2.1 Tables (app `scheduling`, plus `facilities_public_listing` and `visits_reason_symptom`)

Columns follow the [database design](../04-database-design.md) §5.6 key columns. Facility tables have `facility_id`, forced RLS and `TimeStampedModel` timestamps.

| Table | PR | Notes |
|---|---|---|
| `scheduling_slot` | S5a | Unique (`facility_id`, `service_id`, `membership_id`, `starts_at`) `NULLS NOT DISTINCT`. CHECK `booked_count + held_count <= bookable_capacity`. Partial index on open slots |
| `scheduling_slot_hold` | S5a | 5 minutes. Released by confirm, by expiry (job) or by the patient |
| `scheduling_booking` | S5a | As database design, plus `version`. Unique (`facility_id`, `booking_code`). Unique (`patient_id`, `service_id`, `service_date`) where `status = 'confirmed'`. `reason_text` encrypted (C3) |
| `scheduling_booking_event` | S5a | Append-only (trigger), written in the same transaction |
| `scheduling_no_show_strike` | S5a | Reversal fields; counted across facilities only through `scheduling_strike_count` |
| `visits_reason_symptom` | S5a | Append-only. `booking_id` or `visit_id` is set. Code and label snapshot of the S1 `Symptom` master data |
| `facilities_public_listing` | S5a | Public read model (C0 only, **live** facilities only, no RLS). One row per facility and service (§2.3) |
| `scheduling_disruption`, `scheduling_disruption_item` | S5b | As database design |
| `scheduling_follow_up` | S5b | `consultation_id` stays empty until S6 |
| `scheduling_calendar_feed` | S5b | Token 32 bytes, shown once, stored as SHA-256 (as S4 display links) |

### 2.2 Rules

| Topic | Rule |
|---|---|
| Slot generation | For each active template block and day in the booking window (`booking.horizon_days`), minus closures, holidays, Umuganda (S2 `effective_calendar`) and approved leave (S2 exceptions): one slot per `slot_minutes`, `capacity` from the block, `bookable_capacity = floor(capacity × bookable_share_pct / 100)`. Service schedules (no doctor) give slots with `membership_id NULL`. The job is idempotent: it upserts open slots, closes slots that no longer fit and never touches `booked_count`. Booked slots that no longer fit open a disruption (S5b; S5a lists them on the reception board as "needs rebooking") |
| Lead time and window | Bookable from `now + booking.lead_time_hours` to `today + booking.horizon_days`. The service must be bookable (S2 `is_bookable`) and the facility live |
| Hold | `POST hold` locks the slot row (`SELECT … FOR UPDATE`) and checks `booked_count + held_count < bookable_capacity`, then `held_count += 1` and expires in 5 minutes. One open hold per account (a new hold releases the previous one). Two people racing for the last place: one gets the hold, the other gets `409 slot_taken` with up to 3 nearby open slots |
| Confirm | Needs an unexpired hold by the same account (or staff member), then turns the hold into a booking in one transaction: `held_count −1`, `booked_count +1`. Checks: patient is `self` or `guardian` for the account (S3 link rights); service age and sex rule (S1 catalogue); not more than `booking.max_active` (3) future confirmed bookings across all facilities (`scheduling_active_booking_count`); one confirmed booking per patient, service and day; strike limit (below). `Idempotency-Key` is stored on the hold, so a double submit returns the same booking |
| Booking code | 6 characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, unique per facility |
| Reason for visit | 1–5 symptoms from the master list (required), plus optional text ≤ 500 characters (encrypted). Saved as `visits_reason_symptom` rows (`captured_at_stage = booking`) and copied to the visit at check-in |
| Cost estimate | Fee = the S2 tariff of the service on the slot date. Patient share = fee × the insurer rule's `patient_share_bp` / 10 000 for the chosen insurance profile, or the full fee with no insurance. Both are stored on the booking as a snapshot. When the facility doesn't accept the insurer, the booking warns and shows the full fee, and still allows booking |
| Referral hint | Mutuelle insurance with a facility whose level of care is above primary → the `referral_hint` flag in search results, the profile and the review step. It informs and never blocks |
| Cancel | Patient: until `booking.cancel_until_hours` before the slot → `cancelled`, later → `late_cancelled` (recorded, no strike). Reception: any time, with a reason code. Either way, `booked_count −1` |
| Reschedule | One transaction: confirm the new hold, then the old booking → `superseded` with `rescheduled_to_id`. Counts as one active booking |
| Check-in (booked) | S4 check-in (Q1) accepts `booking_id`. It finds or creates the facility record (S3 link), creates the visit (`source` `online_booking` or `phone_booking`, `booking_id`), moves the booking to `checked_in` and copies the symptoms. Ticket: `slot_starts_at` = slot time, and assigned to the booked doctor when there is one. Idempotent as in S4 |
| Grace window | `queue.grace_before_minutes` (30) and `queue.grace_after_minutes` (15). Early: the ticket waits but is not eligible before `slot − grace_before`. Late beyond `slot + grace_after`: check-in still works, but the ticket counts as a walk-in (ordered by arrival), and reception sees "Late: offer a new time" |
| Ordering (extends S4) | After emergency, return and priority: booked tickets in their window and walk-ins/remote joiners are interleaved by `queue.booked_ratio` (`"1:2"` = one booked, then two walk-ins, as long as both are waiting). Booked tickets order by `slot_starts_at`, the others by `arrival_at`. The interleave counter is derived from today's last calls at the service (no stored state) |
| Remote join | Today only, when the service has `allows_remote_join` (S2) and before `booking.remote_join_cutoff` (new, default `11:00`). It creates a visit `remote_pending` and a ticket `is_remote`, waiting, `arrival_at = join time`. "I'm here" from the tracker, or check-in by reception, sets `remote_checked_in_at` → normal waiting |
| Pass-over | Job every minute: a remote ticket not checked in that comes within `queue.pass_over_places` (5) of the front is moved back by that many places (`arrival_at` shifted, event `pass_over`). After `queue.pass_over_limit` (2) moves it becomes `left_without_service`. S9 warns the patient before each step (signal `ticket_pass_over_warning`) |
| No-show | Job every 5 minutes: a confirmed booking past `slot + grace_after` with no check-in becomes `no_show`, plus a strike. Reception can reverse it with a reason (`patient_was_present`, `facility_delay`, `other` with text). That reverses the strike too. Rebooking caused by the facility never creates a strike |
| Strikes | `booking.no_show_strikes` (S2, default 3) in 90 days → a warning at booking. One more → at most 1 active booking for 30 days. Counted across facilities by `scheduling_strike_count(patient, since)` |
| Disruption (S5b) | Staff mark who or what (doctor, service or whole facility), from, to and reason. The system lists the affected confirmed bookings and today's remote tickets. Staff pick, per item or for all: move to another doctor (same slot time, same service), move to the next open slot, or cancel. The patient gets an offer (`pending_change`): accept, choose another time, or cancel. Auto-accept after `booking.disruption_reply_hours` (24) when the slot is more than a day away; otherwise it stays pending and reception calls. Never a strike or a late cancellation |
| Follow-up (S5b) | From a visit, `queue.call` sets "follow-up in N days or weeks": `mode=booking` creates a booking at the first open slot on or after the date (same service, same doctor when possible), `mode=reminder` stores a due date (S9 reminds) |
| Calendar | `.ics` for one booking (S5a). Private feed of the account's and dependants' confirmed bookings (S5b): token in the path, revocable, `Cache-Control: private, no-store`. Event text: facility, service, time and booking code. **No diagnosis and no reason for visit** |
| Real time | Booking changes write an outbox event `booking.changed` to the group `queue.f{facility}.s{service}`, so the Expected list updates live. Patients get `visit.changed` as in S4 |

New settings fields:

- `register_settings_fields("booking", …)`: `max_active` (1–10, 3), `remote_join_cutoff` (time, `11:00`), `disruption_reply_hours` (1–72, 24).
- `register_settings_fields("queue", …)`: `grace_before_minutes` (0–120, 30), `grace_after_minutes` (0–60, 15), `booked_ratio` (choice `1:1`, `1:2`, `2:1`, `1:3`; `1:2`), `pass_over_places` (1–20, 5), `pass_over_limit` (0–5, 2).
- `queue.show_names_on_display` is removed (S4 D-4).

### 2.3 Public read model

`facilities_public_listing` has one row per live facility and active service. It holds only C0 data:

- facility slug, name, type, ownership, level of care, district, sector, latitude, longitude
- service code and name in three languages, bookable, remote join allowed
- fee in RWF, accepted insurer codes, open hours this week
- next open slot (time only), queue load (`low`/`medium`/`high`, computed as in the S4 dashboard), `updated_at`

It is rebuilt for one facility when that facility's services, tariffs, insurer rules, hours, calendar or status change (signals), and every 10 minutes for next slot and queue load. Search reads only this table, never a facility table. Profiles add the facility's public C0 configuration (description, photos, doctors' names, specialties and days) through public serializers in that facility's RLS context, resolved from the slug of a live facility.

### 2.4 Audit events

`scheduling.booking.create`, `scheduling.booking.cancel`, `scheduling.booking.reschedule`, `scheduling.booking.no_show_reverse`, `scheduling.disruption.create`, `scheduling.disruption.resolve`, `scheduling.calendar_feed.create`, `scheduling.calendar_feed.revoke`. Metadata holds IDs, codes and counts only. Every booking transition is also in `scheduling_booking_event`.

## 3. Endpoints

All under `/api/v1`. **Ver** = `version` in the body; **Idem** = `Idempotency-Key`.

### 3.1 Public (no account)

| # | Method and path | Request → response | Notes |
|---|---|---|---|
| P1 | `POST /public/facilities/search/` | `{service_code?, district_code?, sector_code?, near?: {lat, lng}, insurer_code?, open_now?, level_of_care?, available_today?, page?}` → `{results: [{slug, name, type, level_of_care, district, distance_km?, open_now, accepts_insurance: yes\|no\|unknown, fee_rwf, patient_share_rwf?, next_slot_at?, queue_load?, referral_hint, lat, lng}], count}` | **POST** so that location is never in a URL or an access log; coordinates are not stored. FR-SCH-01 |
| P2 | `GET /public/facilities/{slug}/` | → `{facility, services: [{code, name, fee_rwf, insurers, bookable, remote_join}], hours, closures (next 30 days), doctors: [{name, specialty, days}], queue_load}` | Live facilities only, else `404`. `Cache-Control: public, max-age=60`. FR-SCH-02, 03 |
| P3 | `GET /public/facilities/{slug}/slots/` | `?service_code=&date=&doctor=` → `{days: [{date, slots: [{id, starts_at, doctor?, open_places}]}]}` (7 days from `date`) | Counts only, never other patients |
| P4 | `GET /public/symptoms/` | → master data symptoms (code, label in 3 languages, body area, `red_flag`) | Red-flag symptoms show the emergency notice |

### 3.2 Patient (`/patient/…`, patient session)

| # | Method and path | Request → response | Notes |
|---|---|---|---|
| B1 | `POST /patient/slots/{id}/hold/` | → `201 {hold_id, expires_at}` · `409 slot_taken {alternatives}` | One open hold per account |
| B2 | `DELETE /patient/holds/{id}/` | → `204` | |
| B3 | `POST /patient/bookings/` | `{hold_id, patient_id, insurance_profile_id?, symptoms: [{code, duration_days?, severity?}], reason_text?}` → `201 Booking` | Idem. Errors: `422` with `code` (`age_rule`, `sex_rule`, `limit_active`, `limit_strikes`, `same_day_service`, `hold_expired`) |
| B4 | `GET /patient/bookings/` | `?when=upcoming\|past` → paginated `Booking` for the account's profiles | Through `scheduling_patient_bookings(account)` (D-1) |
| B5 | `GET /patient/bookings/{id}/` · `GET …/calendar.ics` | → `Booking` with cost snapshot and cancellation rule · `text/calendar` | |
| B6 | `POST /patient/bookings/{id}/cancel/` | `{version}` → `200 Booking` | `cancelled` or `late_cancelled` |
| B7 | `POST /patient/bookings/{id}/reschedule/` | `{version, hold_id}` → `200 Booking` (new) | |
| B8 | `POST /patient/visits/remote-join/` | `{facility_slug, service_code, patient_id}` → `201` PT1 row | Idem. FR-SCH-09, FR-QUE-07 |
| B9 | `POST /patient/visits/{id}/arrived/` | `{version}` → PT1 row | "I'm here" for a remote ticket |
| B10 | `POST /patient/bookings/{id}/respond/` (S5b) | `{response: accept\|cancel}` or `{hold_id}` for another time | Disruption offer |
| B11 | `GET`, `POST`, `DELETE /patient/calendar-feed/` (S5b) | `POST` → `{url}` shown once | `GET /calendar/{token}.ics` is public with the token |

`Booking`: `id, booking_code, status, patient {id, display_name}, facility {slug, name}, service {code, name}, doctor?, starts_at, service_point?, cost {fee_rwf, patient_share_rwf, insurer_code?, insurer_accepted}, symptoms, can_cancel_until, pending_change?, version`.

### 3.3 Staff (`/staff/…`)

| # | Method and path | Permission | Request → response | Notes |
|---|---|---|---|---|
| R1 | `GET /staff/bookings/` | `queue.operate` or `schedule.view` | `?date=&service_id=&doctor=&status=` → paginated `StaffBooking` (name, age, sex, slot, doctor, status, flags, symptoms) | Expected list = `?date=today&status=confirmed` |
| R2 | `GET /staff/slots/` | `queue.operate` | `?service_id=&date=&doctor=` → slots with open places | Phone booking |
| R3 | `POST /staff/slots/{id}/hold/` · `POST /staff/bookings/` | `queue.operate` | as B1 · as B3 with `facility_patient_id` and `contact_phone?` instead of `patient_id` | `source=phone`, Idem |
| R4 | `POST /staff/bookings/{id}/cancel/` · `…/reschedule/` | `queue.operate` | `{version, reason_code}` · `{version, hold_id}` | |
| R5 | `POST /staff/bookings/{id}/reverse-no-show/` | `queue.operate` | `{version, reason_code, reason_text?}` | Strike reversed |
| R6 | `POST /staff/visits/check-in/` (S4 Q1, extended) | `queue.operate` | adds `booking_id` | Grace window, `late` flag in the response |
| R7 | `GET`, `POST /staff/disruptions/` · `POST …/{id}/apply/` (S5b) | `schedule.manage` | `{kind, membership_id?, service_id?, starts_at, ends_at, reason}` → `{disruption, items}` · `{items: [{id, action}] \| all: action}` | FR-SCH-14 |
| R8 | `POST /staff/visits/{id}/follow-up/` (S5b) | `queue.call` | `{in_days, mode}` → `FollowUp` (+ `Booking`) | FR-SCH-15 |
| R9 | `GET /staff/calendar/` (S5b) | `schedule.view` | `?from=&to=&view=day\|week&service_id=&doctor=` → blocks with bookings | FR-SCH-12 |

### 3.4 Cross-facility functions (SECURITY DEFINER)

| Function | Returns |
|---|---|
| `scheduling_active_booking_count(patient_id)` | integer |
| `scheduling_strike_count(patient_id, since)` | integer (not reversed) |
| `scheduling_patient_bookings(account_id, upcoming boolean)` | `(booking_id, facility_id)` for the account's `self` and `guardian` profiles |
| `scheduling_find_feed(token_hash)` | `account_id` (S5b) |

## 4. Permissions

There are no new permission codes. S5 uses the S0 grants:

| Role | Can |
|---|---|
| Receptionist (`queue.operate`, `schedule.view`) | Bookings, phone booking, no-show reversal |
| Doctor (`queue.call`, `schedule.view`) | Own calendar, follow-up |
| Facility admin (`schedule.manage`) | Disruptions |

Patients act only for profiles where they are `self` or `guardian`. A `delegate` link can see bookings and cannot change them (S3 link rights).

## 5. Background jobs

| Job | Schedule | What |
|---|---|---|
| `scheduling.generate_slots` | Nightly 01:00, and on template, exception or calendar change (one facility) | §2.2 Slot generation |
| `scheduling.expire_holds` | Every minute | Release expired holds (`held_count −1`) |
| `scheduling.mark_no_shows` | Every 5 min | §2.2 No-show |
| `visits.pass_over` | Every minute | §2.2 Pass-over |
| `facilities.refresh_public_listing` | Every 10 min, and on change (one facility) | §2.3 |
| `scheduling.purge_slots` | Daily | Past slots after 90 days, released holds after 1 day (R-TMP) |
| `scheduling.disruption_auto_accept` (S5b) | Every 15 min | §2.2 Disruption |

## 6. Frontend

### 6.1 patient-web

| Route | Screen | Design |
|---|---|---|
| `/` (public home) | The hero search posts to `/search` (service, where, insurance; "Use my location" asks for permission and never stores the position). Nearby facilities section when location is allowed | 06 §3 H1-H2 |
| `/search` | Results: list and map (Leaflet + OpenStreetMap, lazy-loaded) on desktop, list first with a map toggle on phones. Cards show distance, open/closed, "Accepts Mutuelle ✓", fee and your share, next slot and queue load (icon + label). Filters are removable chips. Empty and error states | 06 §4 |
| `/facilities/:slug` | Profile: header (name, verified badge, type, open now), action bar [Book] [Join today's queue], services with fees and insurers, doctors and days, hours and closures, map and directions link, referral hint | 06 §4 |
| `/book/:slug` | Booking flow, one decision per screen: 1 Who → 2 What (services, "Not sure? Describe symptoms" opens the symptom picker) → 3 When (day strip, time chips by morning and afternoon, or "Join today's queue") → 4 Reason (symptom chips + optional text; red flag shows the emergency notice) → 5 Review (facility, time, insurance, your share, cancellation rule) → Success (booking code, add to calendar, directions). "Step 3 of 5", back keeps answers (draft in memory), visible hold timer "We're holding this time for 4:32". Login is asked at step 1 when there is no session and returns to the same step | 07 §3.2 |
| `/visits` | My visits: today's tickets (S4), **upcoming bookings** (cards with code, time and actions: cancel, reschedule, add to calendar), then history (S6) | 07 §3.4 |
| `/visits/booking/:id` | Booking detail; disruption offer banner with Accept / Choose another time / Cancel (S5b) | |
| Tracker (S4) | "I'm here" for remote tickets; pass-over warning banner | 07 §3.3 |
| `/settings` | Calendar subscription link (S5b) | 07 §3.5 |

Find care (design v2) becomes the search entry: service and place, with "Visit today" kept as help text.

### 6.2 staff-web

| Route | Screen | Shown to |
|---|---|---|
| `/queue` | **Expected** column fills with today's bookings (slot time, name, doctor, flags, symptoms); Check in from the row; late arrivals marked "Late: offer a new time"; no-shows listed with "Reverse" | `queue.operate` |
| `/bookings/new` (side panel from the board and the command palette) | Phone booking: find or register the patient (S3), service, doctor, slot grid, reason, contact phone, confirm | `queue.operate` |
| `/calendar` (S5b) | Reception day and week view per service and doctor with bookings; doctor's own week | `schedule.view` |
| `/disruptions` (S5b) | Wizard: who/what and when → affected list → action per item or for all → apply; then patient responses | `schedule.manage` |
| My queue (S4) | Booked tickets show the slot time; follow-up action on the current visit (S5b) | `queue.call` |
| Today | Operations card: no-show rate tile becomes measured (analysis 13 §1) | `reports.view` |

### 6.3 Shared packages

| Package | Deliverable |
|---|---|
| `packages/ui` | `DayStrip`, `TimeChips` (grouped by morning and afternoon, 48 px targets), `HoldTimer` (live region every minute, not every second), `SymptomPicker` (chips by body area, search, red-flag notice), `CostSummary`, `FacilityCard`, `LoadBadge` |
| `packages/api-client` | `features/booking.ts` (P1-P4, B1-B11, R1-R9) with types |
| MSW mocks | `mocks/features/booking.ts`: 6 facilities across Gasabo, Kicukiro, Nyarugenge and Musanze (levels of care and insurers vary), slots for 14 days with some full, a slot that is "just taken" on hold, one upcoming booking for Mukamana, one disruption offer |
| Translations | patient-web `booking`, `discovery`; staff-web `bookings` (rw, en, fr) |

## 7. Integration points

Shared files: S5 adds `[S5]` blocks next to the existing markers:

- `audit/actions.py`, `config/urls.py`, the Celery beat schedule, `seed_dev.py` (`seed_booking_dev`)
- the frontend registries, patient-web routes, staff-web `todayCards`

**Hooks used:**

- **S2:** templates, exceptions, `effective_calendar`, tariffs, insurer rules, settings schema, `is_bookable`, `allows_remote_join`
- **S3:** patient links and rights, facility records, quick register, insurance profiles
- **S4:** check-in, ordering, outbox, tracker
- **S1:** symptoms, services catalogue, insurers, locations

**Interfaces offered:**

- Signals `booking_confirmed`, `booking_cancelled`, `booking_changed_by_facility`, `ticket_pass_over_warning`, `no_show_recorded`. S9 sends the messages.
- `scheduling.services.book(...)`, used by S6 follow-ups and the consultation screen.

## 8. Dependencies

| Depends on | Status |
|---|---|
| S2 facility setup, S3 patients, S4 queue | Merged |
| Leaflet 1.9 + OpenStreetMap tiles | New frontend dependency, loaded only on the map view. Tile use follows the OSM tile policy; a self-hosted tile server is decided before pilot (operations) |

## 9. Acceptance checks

### Backend

| # | Check | Source |
|---|---|---|
| S5-B1 | Every §3 endpoint in the OpenAPI schema (`--fail-on-warn`) | architecture 02 |
| S5-B2 | Authorisation matrix: each endpoint × patient (self, guardian, delegate) / receptionist / doctor / facility admin / other facility / anonymous | FR-SEC-01 |
| S5-B3 | Cross-tenant `404`; search and profiles read only the public listing and live facilities; no personal data in public payloads | security 04 |
| S5-B4 | Slot generation: template, share, closures, holidays, Umuganda, leave; idempotent; never changes booked counts | FR-SCH-07 |
| S5-B5 | Hold race: 20 parallel holds on a slot with 3 places → 3 holds, 17 `409` with alternatives (`booking_concurrency_check`, as S4 D-9) | analysis 05 §7 |
| S5-B6 | Confirm rules: expired hold, age and sex rules, max active across facilities, same service same day, strike limit, idempotent confirm | FR-SCH-08 |
| S5-B7 | Cost estimate: tariff on the slot date, insurer share, unaccepted insurer, no insurance | FR-BIL-03 |
| S5-B8 | Cancel and late cancel, reschedule supersedes, counters stay right | FR-SCH-08 |
| S5-B9 | Booked check-in: idempotent, symptoms copied, grace window (early, in, late), ratio interleave in call next | FR-QUE-03, 05, 06 |
| S5-B10 | Remote join: cutoff, I'm here, pass-over steps and limit | FR-SCH-09, FR-QUE-07 |
| S5-B11 | No-show job, strike, reversal with reason, facility rebooking never strikes | FR-SCH-13 |
| S5-B12 | Booking events and symptoms append-only; reason text encrypted; no reason or diagnosis in `.ics` | NFR-SEC |
| S5-B13 | (S5b) Disruption: affected list, actions, patient responses, auto-accept | FR-SCH-14 |
| S5-B14 | (S5b) Follow-up booking and reminder | FR-SCH-15 |
| S5-B15 | (S5b) Calendar feed: token hashed, revocable, dependants included, no-store | FR-SCH-11 |
| S5-B16 | Migrations reversible; earlier suites green; coverage ≥ 90 % for `scheduling` | NFR-OPS-08 |

### Frontend

| # | Check | Source |
|---|---|---|
| S5-F1 | All §6 screens work on mocks; role gating; `409`/`422` handled with the right message | ADR 0007 |
| S5-F2 | Search: filters as chips, list and map, empty and error states, location only after consent and never sent in a URL | design 06 §4, H2 |
| S5-F3 | Booking flow: one decision per screen, step indicator, back keeps answers, hold timer, "just taken" alternatives, login returns to the step | design 07 §3.2 |
| S5-F4 | Symptom picker: keyboard and screen reader, red flag shows the emergency notice | FR-AI-01, design 06 H7 |
| S5-F5 | My visits upcoming: cancel (with rule), reschedule, `.ics` | design 07 §3.4 |
| S5-F6 | Reception Expected list, booked check-in, late and no-show actions, phone booking | design 04 §3.1 |
| S5-F7 | Text in all new namespaces (rw, en, fr); axe clean on every new screen; 3G budget: map code loads only on the map view | NFR-UX-01, 03; design 06 H4 |

### Integration

| # | Check | Source |
|---|---|---|
| S5-I1 | Rebased; OpenAPI regenerated; shared files only in `[S5]` blocks | contracts README |
| S5-I2 | Real API, two browsers: search → book → reception sees Expected live → check in → called in ratio order → tracker | NFR-PERF-04 |
| S5-I3 | Local load: 200 parallel holds and 2 000 searches in 10 minutes, p95 < 300 ms on the dev machine | NFR-PERF-01 |

## 10. Decisions and deviations from the docs

| # | Topic | Decision |
|---|---|---|
| D-1 | `app.audience` (database design §3.2, open decision D2) and patient write policies | Not introduced. As in S4 D-7: patient endpoints check the account's link rights in the service layer, then act inside `rls_context(facility_id=<the slot's facility>)`. Cross-facility facts come from the narrow SECURITY DEFINER functions in §3.4, which return only counts or IDs. The patient therefore never gets a database role that can read other patients' rows |
| D-2 | Search request method | `POST` with a JSON body instead of `GET` with query parameters, so the patient's location never reaches URLs, browser history or access logs (security 06). Results are not cached by intermediaries; the listing table keeps search fast |
| D-3 | Pre-rendering public routes (roadmap S5 "build decision") | The API (P2) and stable slugs ship in S5a. The pre-rendering tool is chosen in S5b with an ADR; until then profiles render client-side |
| D-4 | Follow-up from the consultation (FR-SCH-15) | S6 builds the consultation screen; S5b offers the action on the visit (doctor's My queue), and S6 moves it |
| D-5 | Notifications for confirmations, reminders and pass-over warnings | Signals only; S9 sends. S5 shows the confirmation in the app and offers the `.ics` file |
| D-6 | Calendar feed token in the URL path | Same reasoning as S4 D-6: a capability URL for a calendar app. It carries no personal data, is revocable and stored hashed, and the feed has no diagnosis or reason for visit |
| D-7 | Booked/walk-in ratio state | Derived from today's call events at the service, not stored, so it survives restarts and needs no extra table |
