# Sprint 4 acceptance record: Visits and the live queue

Contract: [sprint-04-queue.md](../architecture/contracts/sprint-04-queue.md) §9 · Pull requests: contract [#72](https://github.com/B-Pine/medilink-rwanda/pull/72), backend [#73](https://github.com/B-Pine/medilink-rwanda/pull/73), frontend [#74](https://github.com/B-Pine/medilink-rwanda/pull/74) · Releases: none yet (unreleased since `backend-v0.1.0`, `frontend-v0.1.0`)

Status: **Open**. Backend and frontend are implemented and merged. The real-API checks (I2–I4) wait for staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)). Several frontend behaviours exist in code but have no automated test yet (see Gaps).

Evidence below was collected on 2026-10-31 by running the suites (backend 514 passed on PostgreSQL; frontend 296 passed) and the dev-database concurrency command. Per [QA README](README.md) §4, a verifier who did not write the code fills **Verified by**, **Date** and **Result**. Backend tests: `backend/tests/s4/`; frontend tests: `frontend/apps/staff-web/src/features/queue/queue.test.tsx` and `frontend/apps/patient-web/src/features/tracker/tracker.test.tsx`.

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S4-B1 | Every §3 endpoint in the OpenAPI schema | `spectacular --fail-on-warn` in CI; committed `openapi/openapi.yaml` regenerated without drift on 2026-10-31; every Q/D/PT row of §3 present | | | Pending |
| S4-B2 | Authorisation matrix per role | `test_permissions_matrix` | | | Pending |
| S4-B3 | Cross-tenant `404`; no context → 0 rows; patient sees own visits only | `test_illegal_transition_and_cross_tenant`, `test_patient_tracker_cancel_and_travel_time`; forced RLS on every `visits_*` table: `tests/test_rls_coverage.py` | | | Pending |
| S4-B4 | Check-in idempotent, also for two parallel requests | `test_check_in_issues_numbered_ticket_and_is_idempotent`; `queue_concurrency_check`: "PASS one ticket for 4 parallel check-ins of one patient" | | | Pending |
| S4-B5 | Ticket numbers without gaps under parallel check-ins | `queue_concurrency_check`: "PASS numbers 1..11 without gaps" | | | Pending |
| S4-B6 | Parallel call next: no double call | `queue_concurrency_check`: "PASS 11 tickets served, none twice" (4 doctors; the contract's 20 calls on 10 tickets is exceeded in tickets, not in callers) | | | Pending |
| S4-B7 | Ordering: emergency, return, priority, FIFO, own assigned first at equal rank, step-out skipped | `test_ordering_priority_return_and_step_out`, `test_emergency_needs_reason_and_goes_first` | | | Pending |
| S4-B8 | State machine: one event per legal transition; illegal `422`; stale `409` | `test_call_next_start_complete_and_doctor_rules`, `test_illegal_transition_and_cross_tenant`, `test_action_branches_and_visit_timeline` | | | Pending |
| S4-B9 | No-response re-insertion and limit; transfer keeps arrival time | `test_no_response_reinsert_then_left`, `test_transfer_keeps_arrival_and_next_stage` | | | Pending |
| S4-B10 | Reorder needs a reason; review recorded | `test_reorder_needs_reason_and_is_reviewed` | | | Pending |
| S4-B11 | Estimate: fallback, divisor by doctors on duty, range, status messages | `test_estimate_range_and_status_messages`, `test_display_link_validation_and_estimate_when_doctor_busy` | | | Pending |
| S4-B12 | Duty status changes eligibility and estimates | `test_duty_status_reads_and_validates`, `test_call_next_start_complete_and_doctor_rules` | | | Pending |
| S4-B13 | End of day closes the right tickets; in-service untouched | `test_end_of_day_closes_waiting_not_in_service`, `test_jobs_close_day_expire_step_outs_and_republish` | | | Pending |
| S4-B14 | Outbox: written in the transaction, published on commit, rollback publishes nothing, republish job | `test_rolled_back_change_publishes_nothing`, `test_jobs_close_day_expire_step_outs_and_republish`, `test_publish_survives_a_broken_channel_layer` | | | Pending |
| S4-B15 | WebSocket auth per path and group membership | `test_staff_socket_gets_queue_changes_and_rejects_patients`, `test_display_socket_needs_a_valid_token` | | | Pending |
| S4-B16 | Display and patient payloads never contain other patients' names | `test_display_link_shows_numbers_never_names`, `test_patient_tracker_cancel_and_travel_time` | | | Pending |
| S4-B17 | Ticket events and visits append-only / state rules in the DB | `test_ticket_events_are_append_only` | | | Pending |
| S4-B18 | Migrations reversible; earlier suites green; coverage ≥ 90 % for `visits` | Full suite 514 passed (2026-10-31); `visits` coverage 94 % in #73 and in the CI gate. Reversibility not exercised by a test (see Gaps) | | | Pending |

## Frontend checks

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S4-F1 | All §6 screens work on mocks; role gating; `409` refetch | `queue.test.tsx` (board, My queue, displays, reports), "pharmacists don't get the queue board", "receptionists don't see the operations dashboard" | | | Pending |
| S4-F2 | Board: filters, flags with icon + label, side panel actions, shortcuts `N`, `/` | "lists who is on site in calling order with flags, and is accessible", "checks in an existing patient with N and shows the ticket". The `/` shortcut has no test (Gaps) | | | Pending |
| S4-F3 | Reorder and priority need a reason | "moves a ticket up only with a reason, and records it in the timeline" | | | Pending |
| S4-F4 | My queue: Call next (button and Space), duty status, current patient actions | "calls next with Space, starts and completes", "cannot call while on a break" | | | Pending |
| S4-F5 | Display: no names, large numbers, highlight and chime, reduced motion | "the display shows numbers and rooms, never names", "an unknown display link says so". Chime and reduced motion are in `DisplayPage.tsx` without a test (Gaps) | | | Pending |
| S4-F6 | Tracker: dots, range, leave-by, stages, called state, cancel, offline last-known | `tracker.test.tsx`: "home shows today's ticket; the tracker shows place, wait and stages", "travel time gives a leave-home time; cancel needs a confirmation". Wake lock and offline handling in `TrackerPage.tsx` without a test | | | Pending |
| S4-F7 | Socket: notify-then-fetch, live indicator, reconnect with backoff, stale after 30 s | Implemented in `live.ts` and `LiveIndicator.tsx`; no automated test (Gaps) | | | Gap |
| S4-F8 | Offline: actions queued and retried; indicator shows the count | Implemented in `shared.tsx` (retry queue, FR-QUE-16); no automated test (Gaps) | | | Gap |
| S4-F9 | Text in rw, en, fr; axe clean | Locale key parity (`tests/i18n.test.ts`); axe in the board test | | | Pending |

## Integration checks

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S4-I1 | Rebased; OpenAPI regenerated; shared files only in `[S4]` blocks | #73 and #74 merged; markers present in the registry files | | | Pending |
| S4-I2 | Real API, two browsers, updates < 2 s | Waits for staging (#17) | | | Open |
| S4-I3 | Deactivated member's socket closes | Code path: `facilities/staff.py` calls `close_sockets(user_id=…)` on commit; `close_sockets` itself is tested in `test_b14_celery_channels.py`. No end-to-end test of the deactivation path (Gaps) | | | Open |
| S4-I4 | Load test: 300 check-ins and 1 000 board reads in 10 minutes, p95 < 300 ms | Not run yet; staging run waits for #17 | | | Open |

## Definition of Done

- [ ] All acceptance checks verified with evidence
- [x] Traceability matrix statuses updated (FR-QUE-* In progress until staging)
- [ ] CHANGELOGs and API catalogue updated (changelog: Phase 1 PR; catalogue S4 rows still show the pre-contract plan, the contract wins)
- [ ] Deployed to staging and demoed

## Gaps and follow-ups

1. Frontend tests to add: live indicator and stale state (F7), offline retry queue (F8), display chime and reduced motion (F5), the `/` search shortcut (F2).
2. A test that deactivating a member closes their sockets end to end (I3).
3. Migration reversibility (B18) is not exercised; add a CI step that migrates the S4 apps backwards and forwards.
4. I2 and I4 need staging (#17).
