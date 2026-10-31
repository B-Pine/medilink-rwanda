# Sprint 5 acceptance record: Discovery, booking and calendars (S5a)

Contract: [sprint-05-booking.md](../architecture/contracts/sprint-05-booking.md) §9 · Pull requests: contract `ec01ef4`, backend and patient frontend [#80](https://github.com/B-Pine/medilink-rwanda/pull/80), reception side in the Phase 1 pull request ([plan](../superpowers/plans/2026-10-31-phase-1-repair-and-s5a-staff.md)) · Releases: none yet

Status: **Open**. S5a is implemented. S5b checks (B13–B15) are not started. The real-API checks (I2, I3) wait for staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)).

Evidence collected on 2026-10-31 (backend 514 passed on PostgreSQL; frontend 296 passed; `booking_concurrency_check` on the dev database). A verifier who did not write the code fills **Verified by**, **Date** and **Result** ([QA README](README.md) §4). Backend tests: `backend/tests/s5/test_booking.py`; frontend: `frontend/apps/staff-web/src/features/bookings/bookings.test.tsx`, `…/queue/queue.test.tsx`, `frontend/packages/ui/src/components/s5-components.test.tsx`.

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S5-B1 | Every §3 endpoint in the OpenAPI schema | Committed schema in sync on 2026-10-31; every S5a row of §3 (P1–P4, B1–B9, R1–R6) present. S5b rows (B10, B11, R7–R9) not built | | | Pending |
| S5-B2 | Authorisation matrix per role and relationship | `test_phone_booking_by_reception_and_staff_list`, `test_hold_book_idempotent_cancel_and_counters` (patient self); no full endpoint × role table test (Gaps) | | | Pending |
| S5-B3 | Cross-tenant `404`; public endpoints read only the public listing; no personal data | `test_public_search_profile_and_slots_show_only_public_data`, `test_listing_drops_facilities_that_are_not_live`; forced RLS on every `scheduling_*` facility table: `tests/test_rls_coverage.py` | | | Pending |
| S5-B4 | Slot generation rules, idempotent, booked counts untouched | `test_slot_generation_follows_templates_share_and_closures` | | | Pending |
| S5-B5 | Hold race: 20 parallel holds on 3 places | `booking_concurrency_check`: "Holds: 3 held, 17 slot_taken (of 20)", "Booking concurrency check passed." | | | Pending |
| S5-B6 | Confirm rules and idempotent confirm | `test_booking_rules_age_limits_same_day_and_expired_hold`, `test_hold_book_idempotent_cancel_and_counters` | | | Pending |
| S5-B7 | Cost estimate | `test_public_search_profile_and_slots_show_only_public_data` (fee and patient share by insurer), `test_hold_book_idempotent_cancel_and_counters` (booking cost snapshot) | | | Pending |
| S5-B8 | Cancel, late cancel, reschedule, counters | `test_hold_book_idempotent_cancel_and_counters`, `test_reschedule_supersedes_and_late_cancel` | | | Pending |
| S5-B9 | Booked check-in: idempotent, symptoms copied, grace window, ratio | `test_booked_check_in_grace_window_and_ratio`, `test_early_booked_patient_waits_for_the_window_and_late_one_is_a_walk_in` | | | Pending |
| S5-B10 | Remote join: cutoff, I'm here, pass-over | `test_remote_join_im_here_and_pass_over` | | | Pending |
| S5-B11 | No-show job, strike, reversal with reason | `test_no_show_strike_and_reversal` | | | Pending |
| S5-B12 | Events and symptoms append-only; reason encrypted; nothing clinical in `.ics` | `test_booking_history_and_symptoms_are_append_only`; `test_hold_book_idempotent_cancel_and_counters` (reason stored encrypted, `.ics` content) | | | Pending |
| S5-B13 | (S5b) Disruptions | Not started | | | Not in S5a |
| S5-B14 | (S5b) Follow-up booking and reminder | Not started | | | Not in S5a |
| S5-B15 | (S5b) Calendar feed | Not started | | | Not in S5a |
| S5-B16 | Migrations reversible; earlier suites green; `scheduling` coverage ≥ 90 % | Full suite 514 passed; coverage gate in CI. Reversibility not exercised (Gaps) | | | Pending |

## Frontend checks

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S5-F1 | All §6 screens on mocks; role gating; `409`/`422` messages | Reception: `bookings.test.tsx` (four flows), `queue.test.tsx` (Expected, booked check-in, no-show reversal). Patient: `patient-web/src/features/booking/booking.test.tsx` (search, booking flow, upcoming) | | | Pending |
| S5-F2 | Search: filters as chips, list and map, empty and error states, location consent | "lists live facilities with the patient share, and filters with chips" (axe). Empty/error states and location consent untested; the map (Leaflet) is not built (Gaps) | | | Pending |
| S5-F3 | Booking flow: one decision per screen, steps, back keeps answers, hold timer, alternatives | "one decision per screen: who, what, when, reason, review; then the booking code" (step indicator, hold countdown, review items of design 07 §3.2, axe), "back keeps the answers". "Just taken" alternatives and login return untested (Gaps) | | | Pending |
| S5-F4 | Symptom picker: keyboard, screen reader, red flag | `SymptomPicker` in `packages/ui`: "groups chips in the given order and toggles them with aria-pressed" (red-flag name, axe) | | | Pending |
| S5-F5 | My visits upcoming: cancel, reschedule, `.ics` | "lists the upcoming booking and cancels it after a confirmation"; `.ics` link checked on the booking success screen. Reschedule from My visits untested (Gaps) | | | Pending |
| S5-F6 | Reception Expected list, booked check-in, late and no-show actions, phone booking | "lists who is on site in calling order…" (Expected rows), "checks in a booked patient from the Expected list", "undoes a no-show only with a reason", "finds the patient, holds a time, records the reason and confirms", "needs a valid Rwandan number…", "opens from /bookings/new", "moves an expected booking to a new time" | | | Pending |
| S5-F7 | Text in rw, en, fr; axe on new screens; map code only on the map view | Locale parity (`tests/i18n.test.ts`); axe in the phone booking test and the SymptomPicker test. No map yet | | | Pending |

## Integration checks

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S5-I1 | Rebased; OpenAPI regenerated; shared files only in `[S5]` blocks | Registries use `[S5]` blocks (staff-web `features.ts`, `i18n/features.ts`; ui `index.ts`) | | | Pending |
| S5-I2 | Real API, two browsers: search → book → reception sees Expected → check in → called → tracker | Waits for staging (#17) | | | Open |
| S5-I3 | Load: 200 parallel holds and 2 000 searches in 10 minutes | Not run | | | Open |

## Definition of Done

- [ ] All acceptance checks verified with evidence
- [x] Traceability matrix statuses updated (FR-SCH-*, FR-QUE-02/03/06/07, FR-BIL-03, FR-AI-01 In progress)
- [ ] CHANGELOGs and API catalogue updated (changelog: Phase 1 PR)
- [ ] Deployed to staging and demoed

## Decisions recorded during the reception build

- **New time on every Expected row.** The contract asks for "Late: offer a new time". Reception also moves bookings when a patient phones, so every row offers it; late rows keep the Late badge.
- **Kinyarwanda dates.** Chrome has no Kinyarwanda calendar data, so all UI dates go through `dateFormat()` in `packages/ui` (CLDR names), not `Intl.DateTimeFormat("rw")` directly.

## Gaps and follow-ups

1. Patient-web booking tests still to add: search empty/error states and location consent (F2), hold expiry, "just taken" alternatives and login return (F3), reschedule from My visits (F5).
2. Search map (Leaflet, loaded only on the map view) is not built (F2, F7).
3. A full endpoint × role authorisation table test (B2).
4. Migration reversibility in CI (B16).
5. S5b: disruptions, follow-ups, calendar feed, reception and doctor calendars.
