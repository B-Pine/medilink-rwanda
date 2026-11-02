# Sprint 10 part 2a acceptance record: Disputes

Contract: [sprint-10b-disputes.md](../architecture/contracts/sprint-10b-disputes.md) §6 · Pull request: S10 part 2a backend · Releases: none yet

Status: **Open**. The backend is implemented with tests. The screens (S10b-F1..F3) follow in the next pull request. A verifier who did not write the code fills **Verified by**, **Date** and **Result** (QA README §4).

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S10b-B1 | Every endpoint in the schema | `spectacular --validate --fail-on-warn` clean; `openapi.yaml` regenerated | | | Pending |
| S10b-B2 | Subject ownership, derived type, snapshot without clinical text | `test_raise_attaches_the_facts_and_refuses_duplicates_and_strangers` | | | Pending |
| S10b-B3 | Limits, duplicates, flags | `test_limits_and_counter_raise`, the duplicate `409` above | | | Pending |
| S10b-B4 | Lifecycle, `409` stale, internal notes and comments hidden from patients | `test_lifecycle_thread_notes_escalation_and_final_decision`, `test_conflict_of_interest_and_one_person_facility` | | | Pending |
| S10b-B5 | Deadlines job; one-person facility to the platform | `test_deadlines_escalate_and_close`, `test_one_handler_routes_to_the_platform` | | | Pending |
| S10b-B6 | Conflict of interest | `test_conflict_of_interest_and_one_person_facility` | | | Pending |
| S10b-B7 | `no_show_reversed` reverses the strike; pending actions; statement only after a refused correction | `test_no_show_reversed_outcome_removes_the_strike` | | | Pending |
| S10b-B8 | Forced RLS, append-only, encrypted text, audit IDs only, notices | `tests/test_rls_coverage.py`; description encrypted (raise test); S9 registry checks | | | Pending |
| S10b-F1..F3 | Screens and mocks | Next pull request | | | Not started |
