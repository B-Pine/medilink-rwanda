# Sprint 4 contract: Visits and the live queue

Status: v0.1 · 2026-10-26 · Wave 3 · Template and shared-file protocol: [contracts README](README.md) · Conventions: [API conventions](../02-api-conventions.md) · Model: [S2 contract](sprint-02-facility-setup.md)

**Sprint goal:** a patient who walks in is registered (S3), checked in and given a ticket; reception, doctors, the waiting-room display and the patient's phone all see the same queue, updated in under two seconds. Call next is atomic, every ticket change is recorded with who, when and why, and a manual reorder always needs a reason. At the end of the day the queue closes itself.

Requirements: FR-QUE-01, FR-QUE-03 (walk-ins and emergencies), FR-QUE-04, FR-QUE-05 (without the booked/walk-in ratio), FR-QUE-08..17. Analysis: [06 · Visit lifecycle and queue](../../analysis/06-visit-lifecycle-and-queue.md). Design: [04 dashboards](../../design/research/04-dashboards.md) §2, §3.1, §3.2, §3.6, §5; [07 patient app](../../design/research/07-patient-app-pages.md) §3.3. ADR: [0004 visit-centric domain model](../../decisions/0004-visit-centric-domain-model.md).

## 1. Scope

| In | Out (sprint) |
|---|---|
| Visit, ticket and ticket-event model; daily ticket numbering per service | Bookings, the Expected list with real data, grace window, booked/walk-in ratio (S5) |
| Check-in of a walk-in or emergency (idempotent) for a patient registered in S3 | Remote join and pass-over (S5; the columns exist now) |
| Ordering: emergency → return from results → priority → arrival (FIFO); doctor's own tickets and the service pool | Payment rules and bills (S8): the `payment` stage exists, nothing is charged |
| Call next (atomic), recall, no response, start, hold, return, next stage, transfer, cancel, left, step out | Clinical record during the consultation (S6) |
| Manual reorder with a reason; reorder review list for the facility admin | Pharmacy dispensing (S7): the `pharmacy` stage queue only |
| Doctor duty status (on duty, break until, emergency, off) | Notifications ("you're next", SMS) — S9 consumes S4 events |
| Wait estimate as a range + status messages; patient time-to-leave from a set travel time | QR self check-in (FR-QUE-18), travel time from location (FR-QUE-19), family grouping (FR-QUE-20) — P2 |
| Real time: staff boards, doctor queue, patient tracker, display (notify-then-fetch WebSockets) | Load test on staging (needs #17; local test only) |
| Waiting-room display links (token), no names ever | |
| End-of-day job; offline banner and action retry in staff-web (FR-QUE-16) | |

## 2. Domain model

### 2.1 Tables (app `visits`, plus one in `facilities`, `scheduling`, `core`)

Columns follow the [database design](../04-database-design.md) §S4 tables. All facility tables have `facility_id`, forced RLS and `TimeStampedModel` timestamps.

| Table | Content | Notes |
|---|---|---|
| `visits_visit` | As database design: `facility_patient_id`, `patient_id`, `service_date`, `source` (S4 writes `walk_in`, `emergency`), `booking_id NULL` unique, `status` (`remote_pending`, `on_site`, `completed`, `left_without_service`, `cancelled`), `first_service_id`, `reason_text` (encrypted, C3), `checked_in_at`, `completed_at`, `is_emergency`, `priority_class`, `priority_reason_code`, `insurance_profile_id NULL`, `check_in_key uuid NULL` | **Unique** open visit per (`facility_id`, `patient_id`, `service_date`) where `status in (remote_pending, on_site)`; unique (`facility_id`, `check_in_key`) where not null |
| `visits_ticket` | As database design (state, `priority_rank` 0 emergency · 1 return · 2 priority · 3 normal, `arrival_at` kept on transfer, `assigned_membership_id`, `service_point_id`, counters, estimate columns) + `version` | Call-next partial index; `SELECT … FOR UPDATE SKIP LOCKED`; one active ticket per visit (partial unique on `visit_id` where state not final) |
| `visits_ticket_event` | As database design | Append-only (trigger); written in the same transaction as the ticket change |
| `visits_ticket_counter` | `service_id`, `service_date`, `last_sequence` | Row lock on `select_for_update`; number = `{ticket_prefix}-{sequence:03d}` |
| `visits_duty_status` / `visits_duty_status_event` | As database design | One row per membership; history append-only |
| `visits_reorder_review` | As database design | Append-only |
| `facilities_display_link` | `label`, `service_ids uuid[]`, `token_hash bytea` unique, `created_by_id`, `revoked_at`, `last_seen_at` | Token 32 bytes `secrets.token_urlsafe`, shown once, stored as SHA-256 |
| `scheduling_travel_time` | `account_id`, `facility_id`, `minutes` 0–600 | Patient setting, no RLS (account scope) |
| `core_outbox_event` | `topic`, `facility_id NULL`, `payload jsonb` (IDs only), `published_at NULL`, `attempts` | Written in the transaction; published `on_commit`; a job republishes leftovers |

### 2.2 Rules

| Topic | Rule |
|---|---|
| Check-in | Needs an active facility record (S3) and an active, walk-in service. Same patient, same day, open visit → `200` with the existing visit and ticket (idempotent), never a second ticket. `Idempotency-Key` → `check_in_key`. Emergency: `priority_rank 0`, `is_emergency`, reason required |
| Stages | `reception` (optional, when the facility uses a reception queue) → `payment` (when `billing.pay_before_consultation`) → `consultation` → `payment` → `pharmacy` → done. S4 starts walk-ins at `consultation` unless the facility setting `queue.start_stage` says `reception`. "Next stage" closes the ticket as `moved_to_next_stage` and opens a ticket at the next stage keeping `arrival_at` of the visit's check-in |
| Ordering | Waiting tickets of a service + stage; candidates: `assigned_membership_id = me` or `NULL`; skip `step_out_until > now`. Order: `priority_rank`, then `arrival_at`, then `sequence`. The doctor's own assigned tickets come before the pool only at equal rank |
| Call next | One transaction: lock the first candidate with `FOR UPDATE SKIP LOCKED`, set `called`, `called_at`, `assigned_membership_id = me`, `service_point_id`. A doctor with a ticket already `called` or `in_service` gets `409` with that ticket |
| Versions | Every ticket action takes `version`; stale → `409` and the board refetches |
| No response | Doctor presses "No response": re-inserted `queue.no_response_places` (default 3) places back by moving `arrival_at`, `no_response_count += 1`; after `queue.no_response_limit` (default 2) → `left_without_service` |
| Hold / return | `in_service → on_hold`; return → `waiting` with `priority_rank 1` when `queue.return_priority` (default true) |
| Transfer | New ticket in another service (same stage), original `arrival_at`; old ticket `transferred` |
| Priority | Reception sets `priority_class` (`elderly`, `pregnant`, `disability`, `very_sick`) with a reason code; `priority_rank 2`. Age ≥ `queue.priority_elderly_age` is suggested, not automatic |
| Reorder | Move a waiting ticket before another waiting ticket of the same queue: needs `reason_code` (`clinical_urgency`, `staff_error`, `patient_request`, `other`) and text for `other`; logged as `reorder` event with old and new position; appears in the facility admin's review list until reviewed |
| Step out | Patient leaves up to `queue.step_out_max_minutes` (30): skipped by call next until back or expired, then waits normally |
| Duty status | `on_duty` (with service point), `break` (until), `emergency`, `off`. Call next requires `on_duty` |
| Wait estimate | `ahead × avg_service_minutes ÷ max(doctors on duty for the service, 1)`; average = today's completed consultations at this service (≥ 3), else the service `duration_minutes`; range `[0.8×, 1.25×]` rounded to 5 min, minimum "0–5"; stored on the ticket when shown (accuracy reports, S11). Status message replaces it: all doctors on break (`break_until`), emergency, none on duty |
| Time to leave | Tracker: `estimated call time − travel minutes − 10 min`, shown only when a travel time is set |
| End of day | Job every 15 min: facilities past closing time + `queue.end_of_day_minutes` (60): waiting/called/no-response/on-hold tickets → `left_without_service` (system actor), visits closed; in-service tickets left for the doctor |
| Display | Shows per selected service: now serving (number → service point name) and next 5 numbers. **Never names**, even if `queue.show_names_on_display` is on (D-4) |
| Patient view | A patient (or guardian/delegate with `history` rights) sees their own active visits only (patient RLS policy) |
| Real time | Every state change writes an outbox event; consumers receive `{"type": "<topic>", ...ids}` and refetch. Groups: `queue.f{facility}.s{service}` (boards, my queue), `visit.p{patient}` (tracker), `display.{link}` |

New settings fields (`register_settings_fields("queue", …)`): `start_stage` (`consultation`/`reception`), `no_response_places` (1–10, 3), `no_response_limit` (0–5, 2), `return_priority` (bool, true), `step_out_max_minutes` (5–120, 30), `end_of_day_minutes` (0–240, 60).

### 2.3 Audit events

`visits.check_in`, `visits.ticket.reorder`, `visits.ticket.priority`, `visits.ticket.transfer`, `visits.reorder.review`, `visits.display_link.create`, `visits.display_link.revoke`, `visits.end_of_day`. Metadata: IDs, codes and counts only. Every ticket transition is also in `visits_ticket_event` (the queue's own history).

## 3. Endpoints

All under `/api/v1`. **Ver** = `version` in the body; **Idem** = `Idempotency-Key`.

### 3.1 Staff queue (`/staff/…`)

| # | Method and path | Permission | Request → response | Notes |
|---|---|---|---|---|
| Q1 | `POST /staff/visits/check-in/` | `queue.operate` | `{facility_patient_id, service_id, source: walk_in\|emergency, priority_class?, priority_reason_code?, reason_text?, insurance_profile_id?}` → `201 {visit, ticket}` (or `200` existing) | Idem; FR-QUE-03 |
| Q2 | `GET /staff/queue/board/` | `queue.operate` or `queue.call` | `?service_id=&stage=` → `{services: [{service_id, stage, waiting: [TicketRow], called: [...], in_service: [...], counts, estimate}], duty: [DutyRow], updated_at}` | Today, active facility. `TicketRow`: id, number, state, visit_id, display name (first name + initial), age, sex, flags, arrival_at, assigned_membership_id, service_point, version |
| Q3 | `GET /staff/queue/mine/` | `queue.call` | → `{current: TicketRow\|null, waiting: [TicketRow] in calling order, duty}` | The doctor's services: on-duty service point's services, else all services they have templates for |
| Q4 | `POST /staff/queue/call-next/` | `queue.call` (consultation) · `queue.operate` (reception, payment) · `pharmacy.dispense` (pharmacy) | `{service_id, stage, service_point_id?}` → `200 TicketRow` · `204` empty · `409` already serving | FR-QUE-08 |
| Q5 | `POST /staff/tickets/{id}/{action}/` | as Q4 for `recall, no-response, start, hold, return, complete, next-stage`; `queue.operate` for `transfer, cancel, left, step-out, priority, reorder` | `{version, …}`: `next-stage {stage}`, `transfer {service_id}`, `cancel/left {reason_code}`, `step-out {minutes}`, `priority {priority_class, reason_code}` (or `null` to clear), `reorder {before_ticket_id, reason_code, reason_text?}` → `200 TicketRow` | Ver; illegal transition `422`; FR-QUE-09, 10, 17 |
| Q6 | `GET /staff/visits/{id}/` | `queue.operate` or `queue.call` | → `{visit, tickets, events}` (timeline) | |
| Q7 | `GET`, `PUT /staff/duty-status/` | `queue.call` | `PUT {state, service_point_id?, until_at?}` → `200 DutyRow` | FR-QUE-14 |
| Q8 | `GET /staff/queue/reorders/` · `POST /staff/queue/reorders/{event_id}/review/` | `facility.configure` | `?reviewed=false` → paginated reorder events with actor, reason, positions · `{comment}` → `201` | FR-QUE-10 |
| Q9 | `GET`, `POST /staff/display-links/` · `POST /staff/display-links/{id}/revoke/` | `facility.configure` | `POST {label, service_ids}` → `201 {link, token}` (token shown once) | |

### 3.2 Display (public, token) and patient

| # | Method and path | Auth | Notes |
|---|---|---|---|
| D1 | `GET /display/{token}/` | display token | `{facility_name, services: [{name, now_serving: [{number, service_point}], next: [number…]}], announcement, updated_at}`; unknown or revoked `404`; no names; `Cache-Control: no-store` |
| PT1 | `GET /patient/visits/active/` | patient session | Visits today for the account's profiles: `{visit_id, patient_display_name, facility_name, service_name, ticket: {number, state, stage, service_point}, ahead, estimate: {min, max} \| null, status_message, leave_by \| null, version}` |
| PT2 | `POST /patient/visits/{id}/cancel/` | patient session, `self`/`guardian` | Waiting only; `cancelled` event with actor = account |
| PT3 | `GET`, `PUT /patient/travel-times/{facility_id}/` | patient session | `{minutes}` 0–600 |

### 3.3 WebSockets

| Path | Auth | Joins | Messages |
|---|---|---|---|
| `/ws/v1/staff/queue/` | staff cookie, active facility, `queue.operate`/`queue.call`/`pharmacy.dispense` | `queue.f{facility}.s{service}` for every active service | `{"type":"queue.changed","service_id","stage"}`, `{"type":"duty.changed"}` |
| `/ws/v1/patient/visits/` | patient cookie | `visit.p{patient}` for the account's profiles | `{"type":"visit.changed","visit_id"}` |
| `/ws/v1/display/{token}/` | display token (origin checked) | `display.{link}` | `{"type":"display.changed","called": {"number","service_point"}?}` (the number is public on the screen) |

Sockets close on logout, membership deactivation (S2-I4) and link revocation.

## 4. Permissions

No new codes. Uses S0 grants: receptionist `queue.operate`; doctor `queue.call`, `clinical.write`; pharmacist `pharmacy.dispense`; facility admin `queue.operate` and `facility.configure`. A doctor can transfer only through reception (no `queue.operate`).

## 5. Background jobs

| Job | Schedule | What |
|---|---|---|
| `visits.end_of_day` | Every 15 min | §2.2 End of day |
| `visits.expire_step_outs` | Every minute | Step-outs past their time return to normal waiting (event `step_out_expired`) |
| `core.publish_outbox` | Every 30 s | Republishes outbox rows not published after 10 s (channel layer was down) |

## 6. Frontend

### 6.1 staff-web, feature `queue` (`src/features/queue/`)

| Route / slot | Screen | Shown to |
|---|---|---|
| `/queue` | **Reception board** (design 04 §3.1): service filter chips with waiting counts, average wait; **On site** list grouped by stage with flags (priority, emergency, step out) as icon + label chips; **Expected** column showing "Bookings arrive with Sprint 5" (S4 has no bookings); row → side panel (patient summary, ticket timeline, actions: priority, transfer, reorder with reason, step out, cancel, left); `N` new walk-in (opens S3 walk-in form in the panel, then check-in), `/` search, `Enter` check in | `queue.operate` |
| `/queue/mine` | **Doctor My queue** (design 04 §3.2): duty status control; current patient card; waiting list in calling order; **Call next** (also Space); recall, no response, start, hold, next stage, complete | `queue.call` |
| `/queue/reorders` | Reorder review table | `facility.configure` |
| `/settings/displays` | Display links: create (token shown once with copy and QR), revoke | `facility.configure` |
| `/display/:token` (public, full screen) | **Waiting-room display** (design 04 §3.6): deep forest, ticket numbers ≥ 8 % viewport height, now serving → room, next numbers, clock, chime + 1.5 s highlight on a new call (sound after one tap to allow audio), no names | public |
| Today card | "On site now" summary for `queue.operate`/`queue.call` replacing the S4 placeholder | |
| Shell | `ConnectionIndicator`: Online · Reconnecting · Offline (actions queued: n) from the socket state; queued ticket actions retried with their original `client_occurred_at` | all staff |
| Command palette | Actions "Call next" (doctors), "New walk-in" already exists | |

Real time: one socket per tab; on message, invalidate the matching TanStack queries; "Live · updated n s ago", yellow "Reconnecting" after 30 s stale (design 04 §5). Changed rows get a 1.5 s emerald-50 highlight; rows never jump under the focused row (focus kept on the same ticket).

### 6.2 patient-web, feature `tracker` (`src/features/tracker/`)

| Route / slot | Screen |
|---|---|
| `/visits/:visitId` | **Live tracker** (design 07 §3.3): facility · service; ticket number in display size; progress dots for people ahead; wait range; "Leave home by" when a travel time is set (set it inline); stage line; status message; Cancel (confirm); "You're called → Room 4" full-screen emerald state with sound and vibration until acknowledged; Wake Lock while open; offline: last known state + "Last updated 09:12" |
| Home card | Active visit card at the top of `/home` (design 07 §3.1) via the `homeCards` slot |

### 6.3 Shared packages

| Package | Deliverable |
|---|---|
| `packages/ui` | `TicketNumber` (display style, tabular, never 0/O confusion), `QueueStateBadge` (state colours + icons of design 02 §4), `ProgressDots` |
| `packages/api-client` | `features/queue.ts` (Q1–Q9, D1, PT1–PT3) with types; `realtime.ts` (socket client with backoff, notify-then-fetch helpers) |
| MSW mocks | `mocks/features/queue.ts`: Kigali Clinic today with General (G) and Pediatrics (P): 6 waiting incl. one priority and one emergency, one called, one in service; Dr Keza on duty Room 1; a display link token `MOCK_DISPLAY_TOKEN`; patient Mukamana with an active visit `G-023` |
| Translations | staff-web `queue`, patient-web `tracker` (rw, en, fr) |

## 7. Integration points

Shared files: S4 adds `[S4]` blocks next to the existing markers in the same files as S2 (settings `INSTALLED_APPS` `medilink.visits`; `config/urls.py`; `audit/actions.py`; `seed_dev.py` → `seed_queue_dev`; `core/realtime.py` routes; frontend registries; patient-web `homeCards`).

**Hooks used:** S3 `FacilityPatient`, walk-in form (`WalkInForm` export) and patient search; S2 `services`, `service points`, `effective_calendar`, settings schema, `scheduling.blocks` (which services a doctor works), `membership_deactivated` (close sockets); S1 `RecentAuthRequired` (not needed: no step-up actions in S4).

**Interfaces offered:** `visits.services.check_in(...)`, `visits.services.on_ticket_event` signal (S6 opens the consultation on `start`, S8 creates the bill on `check_in`, S9 notifies on `called` / near the front), `visits.ordering.position(ticket)`.

## 8. Dependencies

| Depends on | Status | Use |
|---|---|---|
| S2 facility setup | Merged (#63, #69) | Services, points, prefixes, hours, settings |
| S3 patients | Merged (#57, #59) | Facility records, walk-in registration |
| Channels + Redis (S0) | In place | Groups, channel layer |

## 9. Acceptance checks

### Backend

| # | Check | Source |
|---|---|---|
| S4-B1 | Every §3 endpoint in the OpenAPI schema (`--fail-on-warn`) | architecture 02 |
| S4-B2 | Authorisation matrix: each endpoint × receptionist / doctor / pharmacist / facility admin / patient / other facility | FR-SEC-01 |
| S4-B3 | Cross-tenant `404`; no context → 0 rows; patient policy shows own visits only | security 04 |
| S4-B4 | Check-in idempotent: double submit and two parallel requests → one visit, one ticket | FR-QUE-03 |
| S4-B5 | Ticket numbers per service and day without gaps under parallel check-ins | FR-QUE-01 |
| S4-B6 | Call next: 20 parallel calls by 4 doctors on 10 tickets → 10 distinct tickets, no double call | FR-QUE-08 |
| S4-B7 | Ordering fixtures: emergency, return, priority, FIFO, own assigned before pool at equal rank, step-out skipped | FR-QUE-05 |
| S4-B8 | State machine: every legal transition writes one event; illegal ones `422`; stale version `409` | FR-QUE-09 |
| S4-B9 | No response re-insertion and limit; transfer keeps arrival time | FR-QUE-09, 17 |
| S4-B10 | Reorder needs a reason; appears unreviewed; review recorded | FR-QUE-10 |
| S4-B11 | Estimate: average fallback, divisor by doctors on duty, range rounding, status messages | FR-QUE-11 |
| S4-B12 | Duty status changes call-next eligibility and estimates | FR-QUE-14 |
| S4-B13 | End-of-day closes the right tickets and visits; in-service untouched | FR-QUE-15 |
| S4-B14 | Outbox: event written in the transaction; publish on commit; rollback publishes nothing; republish job | FR-QUE-12 |
| S4-B15 | WebSocket auth per path (wrong audience, no facility, revoked display token → closed) and group membership | security 06 §8 |
| S4-B16 | Display and patient payloads never contain other patients' names; display never contains any name | FR-QUE-13 |
| S4-B17 | Ticket events and visits append-only / state rules enforced in the DB | NFR-OPS |
| S4-B18 | Migrations reversible; earlier suites green; coverage ≥ 90 % for `visits` | NFR-OPS-08 |

### Frontend

| # | Check | Source |
|---|---|---|
| S4-F1 | All §6 screens work on mocks; role gating; `409` refetch | ADR 0007 |
| S4-F2 | Reception board: filters, flags with icon + label, side panel actions, shortcuts `N`, `/` | design 04 §3.1 |
| S4-F3 | Reorder dialog requires a reason; priority needs a reason | FR-QUE-10 |
| S4-F4 | My queue: Call next button and Space; duty status; current patient actions | design 04 §3.2 |
| S4-F5 | Display: no names, large numbers, highlight + chime on a new call, reduced motion respected | design 04 §3.6 |
| S4-F6 | Tracker: dots, range, leave-by, stages, called state, cancel, offline last-known | design 07 §3.3 |
| S4-F7 | Socket: notify-then-fetch, live indicator, reconnect with backoff, stale after 30 s | design 04 §5 |
| S4-F8 | Offline: actions queued and retried; indicator shows the count | FR-QUE-16 |
| S4-F9 | Text in `queue` and `tracker` (rw, en, fr); axe clean on every new screen | NFR-UX-01, 03 |

### Integration

| # | Check | Source |
|---|---|---|
| S4-I1 | Rebased; OpenAPI regenerated; shared files only in `[S4]` blocks | contracts README |
| S4-I2 | Real API, two browsers: walk-in → check-in → doctor calls → display and tracker update < 2 s → complete | NFR-PERF-04 |
| S4-I3 | Deactivated member's socket closes (completes S2-I4) | FR-ACC-06 |
| S4-I4 | Local load test: 300 check-ins and 1 000 board reads in 10 minutes, p95 < 300 ms on the dev machine; staging run waits for #17 | NFR-PERF-01 |

## 10. Decisions and deviations from the docs

| # | Topic | Decision |
|---|---|---|
| D-1 | Booked visits, Expected list, grace window, ratio, remote join | S5 (roadmap scope note). Columns exist; the board shows an empty Expected column with a note |
| D-2 | `payment` stage | Exists as a queue stage only; bills and payment rules are S8 |
| D-3 | "Call next" timeout to `no_response` (analysis 06 §4 "e.g. 3 min") | Manual "No response" button in S4; an automatic timeout needs the S9 notification first |
| D-4 | `queue.show_names_on_display` (S2 setting) | The display never shows names (design 04 §3.6 "No names, ever"); the setting is hidden in S4 and removed in S5 |
| D-5 | `core_idempotency_key` table (database design) | Not built: check-in stores the key on the visit (`check_in_key`), as S1/S3 do (S1-D6) |
| D-6 | Display token in the URL path | The display URL is a capability for a kiosk browser; it carries no personal data, is revocable and stored hashed. Documented exception to "no secrets in URLs" for this case only |
| D-7 | Patient read policy on `visits_visit` / `visits_ticket` (database design) | The tracker finds the account's visits with the SECURITY DEFINER function `visits_patient_active(account)` (own and guarded profiles only), then reads that one facility in its RLS context and returns only the patient's own ticket and counts (people ahead, estimate). No other patient's row leaves the server |
| D-8 | `core_outbox_event` lives in the `core` app | `core` has no migrations; the table keeps its database-design name but is created by the `visits` app until `core` gets migrations |
| D-9 | S4-B4..B6 concurrency as pytest tests | The suite avoids `transaction=True` (tests/conftest.py); concurrency is proven by `manage.py queue_concurrency_check` (DEBUG only), which commits rows in a throwaway facility and runs parallel threads; output recorded in the acceptance record |
