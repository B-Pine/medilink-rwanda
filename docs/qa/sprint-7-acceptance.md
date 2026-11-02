# Sprint 7 acceptance record: Pharmacy and documents (S7a)

Contract: [sprint-07-pharmacy-documents.md](../architecture/contracts/sprint-07-pharmacy-documents.md) §9 · Pull requests: contract and S7a backend on the S7 branch · Releases: none yet

Status: **Open**. The S7a backend is implemented. The S7a frontend (F1–F6), the S7b checks (B15–B22, F7) and the real-API checks (I1, I2) are not started.

Evidence collected on 2026-11-01 on PostgreSQL 16, suite run as the runtime role. Backend tests: `backend/tests/s7/test_pharmacy.py`, `backend/tests/s7/test_access_and_patient.py`. A verifier who did not write the code fills **Verified by**, **Date** and **Result** ([QA README](README.md) §4).

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S7-B1 | Every §3.1–3.2 endpoint in the schema | `test_every_s7a_endpoint_is_in_the_schema`; `spectacular --validate --fail-on-warn` clean; `backend/openapi/openapi.yaml` regenerated (16 paths added, no existing path or component removed) | | | Pending |
| S7-B2 | Authorisation: author drafts, pharmacist own facility, patient own and dependants', no content for reception | `test_only_the_author_drafts_and_other_roles_are_refused`, `test_queue_rows_flags_filters_and_facility_isolation` (other facility `404`, doctor without relationship `403 access_reason_required`), `test_delegates_do_not_see_restricted_and_strangers_see_nothing`, `test_staff_cannot_use_patient_endpoints` | | | Pending |
| S7-B3 | Items: catalogue or free text, default quantity, `409` stale, locked after issue | `test_items_default_quantity_free_text_and_versions`, `test_issue_numbers_expiry_and_payment_first` (service `422` and database trigger) | | | Pending |
| S7-B4 | Alerts on save; sign refused without an allergy override; overrides stored | `test_allergy_override_blocks_signing_until_given` | | | Pending |
| S7-B5 | Issue on sign in the same transaction; numbers; expiry; payment first; empty removed; rollback | `test_issue_numbers_expiry_and_payment_first`, `test_empty_prescription_is_removed_on_sign`, `test_number_counter_has_no_gaps_and_validates`, `test_number_counter_guards`, `test_allergy_override_blocks_signing_until_given` (consultation stays draft) | | | Pending |
| S7-B6 | After issue: cancel, change (step-up), prescription cancel, refused when dispensed | `test_cancel_and_change_after_issue`, `test_cancelling_the_last_item_cancels_the_prescription_and_dispensed_items_stay`, `test_cancel_of_a_draft_item_is_refused`, `test_last_item_cancelled_moves_the_prescription` | | | Pending |
| S7-B7 | Queue rows of the active facility with flags | `test_queue_rows_flags_filters_and_facility_isolation`, `test_awaiting_payment_is_not_dispensable` | | | Pending |
| S7-B8 | Dispense rules; never more than prescribed; signed and immutable | `test_dispense_partial_then_full_and_records_are_immutable`, `test_substitution_not_available_and_controlled`, `test_only_not_available_items_left`. Parallel calls: the prescription row lock and `version` serialise them and the `pharmacy_item_not_over_dispensed` check backs it; no threaded test yet | | | Pending |
| S7-B9 | Query raised, answered by addendum, closed; one open | `test_query_raised_answered_by_addendum_and_closed`, `test_query_on_a_cancelled_prescription_is_refused` | | | Pending |
| S7-B10 | Availability audited; `available_here` in search | `test_availability_toggle_and_drug_search` | | | Pending |
| S7-B11 | Dosing labels, Kinyarwanda by default | `test_substitution_not_available_and_controlled` (labels `rw` by default, `en` on request) | | | Pending |
| S7-B12 | My medicines: statuses, no overrides or notes, delegates and restricted | `test_patient_reads_own_prescriptions`, `test_delegates_do_not_see_restricted_and_strangers_see_nothing`, `test_patient_schemas_carry_no_overrides_or_consultation_text` | | | Pending |
| S7-B13 | Expiry job; `mark_covered` | `test_expiry_job`, `test_issue_numbers_expiry_and_payment_first` | | | Pending |
| S7-B14 | Forced RLS; append-only; audit IDs only; migrations reverse; coverage ≥ 90 % | `test_every_pharmacy_table_has_forced_rls`, `tests/test_rls_coverage.py`, the append-only and lock assertions above, `test_audit_entries_carry_ids_only`; `migrate pharmacy zero` / `documents zero` and back; coverage on the full suite: `pharmacy` 97 %, `documents` 100 % | | | Pending |
| S7-B15..B22 | (S7b) documents | Not started | | | Not in S7a |

## Frontend checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S7-F1 | Prescription builder in the consultation: search with "Not in stock here", alerts inline, allergy reason before Sign, read-only after signing with Cancel and Change | `pharmacy.test.tsx` "an allergy alert needs a reason before signing; signing issues the prescription" | Pass (mocks) |
| S7-F2 | Pharmacy queue with tabs and search; nav item only with `pharmacy.dispense` | `pharmacy.test.tsx` "tabs, search by ticket, flags…" (axe clean); `flows.test.tsx` reception gets "No access" on `/pharmacy` | Pass (mocks) |
| S7-F3 | Dispense: identity first, outcome per item, same-ingredient substitute, controlled confirmation, server errors inline, `409` reload | `pharmacy.test.tsx` "identity first, a same-ingredient substitute…", "a controlled medicine needs the extra confirmation…" | Pass (mocks); `409` reload by code review |
| S7-F4 | Availability switches; dosing label print view | `pharmacy.test.tsx` "availability switches…", labels in Kinyarwanda after dispensing | Pass (mocks) |
| S7-F5 | Patient My medicines and detail, plain-language statuses | `medicines.test.tsx` (home card, list, detail, past; axe clean) | Pass (mocks) |
| S7-F6 | MSW mocks for every S7a endpoint; `pharmacy` and `medicines` in rw/en/fr; dates through `dateFormat()` | `mocks/features/pharmacy.ts`; i18n parity test; `i18n-review.md` regenerated | Pass |
| S7-F7 | (S7b) documents | Not started | Not in S7a |

## Integration checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S7-I1 | Staging walk-through | Waits for the frontend and staging | Pending |
| S7-I2 | Only S7 files and `[S7]` blocks changed | S7a touches `pharmacy`, `documents`, the S6 signal (`clinical/signals.py`, one block in `clinical/services.py` `sign()`), `[S7]` blocks in settings, URLs, permission catalogue, audit actions and the CI coverage loop, the OpenAPI schema and docs | Pending |

## Evidence log

| Date | What | Result |
|---|---|---|
| 2026-11-01 | `ruff check`, `ruff format --check`, `mypy .`, `makemigrations --check`, `spectacular --validate --fail-on-warn` | Clean |
| 2026-11-01 | `pytest tests/s7 tests/s6` with coverage | 55 passed |
| 2026-11-01 | Full backend suite with coverage, per-app gate | 765 passed; `pharmacy` 97 %, `documents` 100 %, every other app at or above its floor |
