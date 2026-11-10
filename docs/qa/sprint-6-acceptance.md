# Sprint 6 acceptance record: Clinical record and history (S6a)

Contract: [sprint-06-clinical.md](../architecture/contracts/sprint-06-clinical.md) §9 · Pull requests: contract and S6a backend on the S6 branch (not yet opened) · Releases: none yet

Status: **Open**. The S6a backend is implemented. The S6a frontend (F1–F6) is implemented with tests. The S6b checks (B18–B21, F7) are not started. The real-API checks (I2, I3) wait for the frontend and staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)).

Evidence collected on 2026-11-01 on PostgreSQL 16, suite run as the runtime role. Backend tests: `backend/tests/s6/test_clinical.py`, `backend/tests/s6/test_access_matrix.py`. A verifier who did not write the code fills **Verified by**, **Date** and **Result** ([QA README](README.md) §4).

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S6-B1 | Every S6a endpoint in the OpenAPI schema | `test_every_s6a_endpoint_is_in_the_schema`; `spectacular --validate --fail-on-warn` clean; `backend/openapi/openapi.yaml` regenerated (15 paths added, no existing path or component changed) | | | Pending |
| S6-B2 | Authorisation matrix per role | `test_authorisation_matrix`: 15 endpoint rows × doctor, receptionist, pharmacist, facility admin, anonymous, patient session; staff session on `/patient/records/` refused | | | Pending |
| S6-B3 | Cross-facility `404`; forced RLS; no context → 0 rows | `test_other_facility_ids_are_not_found_and_rls_fails_closed`; `tests/test_rls_coverage.py` covers the five new tables | | | Pending |
| S6-B4 | Draft autosave rules | `test_open_is_idempotent_per_author_and_autosave_versions`, `test_sensitive_diagnosis_suggests_restricted` | | | Pending |
| S6-B5 | Sign: step-up, primary diagnosis, hash, late entry, integrity | `test_sign_needs_step_up_and_primary_and_stores_hash`, `test_late_entry_after_24_hours` | | | Pending |
| S6-B6 | Lock in the service and the database | `test_signed_record_is_locked_by_service_and_trigger` | | | Pending |
| S6-B7 | Addenda | `test_addenda_by_author_and_other_doctor` | | | Pending |
| S6-B8 | Entered in error | `test_entered_in_error_by_author_only_and_hidden`, `test_draft_can_be_entered_in_error`, `test_entered_in_error_record_disappears_for_the_patient` | | | Pending |
| S6-B9 | Completion guard and unsigned list | `test_visit_cannot_complete_with_a_draft`, `test_visit_without_consultation_still_completes`, `test_completed_visit_gets_a_late_consultation`, `test_cancelled_visit_refuses_consultation_and_vitals` | | | Pending |
| S6-B10 | Vitals | `test_vitals_ranges_ownership_and_entered_in_error` | | | Pending |
| S6-B11 | Alerts | `test_allergy_duplicate_and_dose_alerts` | | | Pending |
| S6-B12 | Treatment relationship and reason for access | `test_reason_required_without_relationship_and_for_staff_members`, `test_access_reason_expires_and_is_audited`, `test_staff_member_patient_always_needs_a_reason`, `test_recent_care_counts_as_relationship` | | | Pending |
| S6-B13 | History timeline and problem summary | `test_history_timeline_filters_and_problem_summary` | | | Pending |
| S6-B14 | Private notes never in a patient-facing serializer | `test_no_patient_facing_schema_has_private_notes` (every `/api/v1/patient/` operation in the schema, references followed), `test_patient_serializers_have_no_private_fields`, `test_patient_reads_own_records_without_private_notes` (plaintext absent from every patient response) | | | Pending |
| S6-B15 | Patient read by relationship | `test_patient_reads_own_records_without_private_notes`, `test_guardian_delegate_and_other_accounts` | | | Pending |
| S6-B16 | Text stored encrypted | `test_sign_needs_step_up_and_primary_and_stores_hash`, `test_addenda_by_author_and_other_doctor` | | | Pending |
| S6-B17 | Migrations reversible; suites green; coverage ≥ 90 % | `migrate clinical zero` and back on the dev database; `makemigrations --check` clean; full suite and coverage in the Evidence log below | | | Pending |
| S6-B18 | (S6b) Results inbox | `test_outside_result_goes_to_the_uploading_doctor_and_is_reviewed`, `test_result_uploaded_by_reception_goes_to_the_last_doctor` (assignment, review, per-doctor inbox, lock trigger) | | | Pending |
| S6-B19 | (S6b) Legacy import | `test_upload_map_preview_confirm_and_rollback` (mapping, errors, duplicates, nothing saved before confirm, step-up, national ID kept out of the preview), `test_rollback_refused_with_a_visit_or_after_the_window`, `test_bad_files_permissions_and_isolation`, `test_parse_helpers_and_purge` | | | Pending |
| S6-B20 | (S6b) Scans and back-entry | `test_scan_rules_timeline_and_audited_download`, `test_history_back_entry_labelled_historical`, `test_back_entry_can_cite_its_scan`, `test_blood_group_and_pregnancy_flag` (health attributes) | | | Pending |
| S6-B21 | (S6b) Break-glass | `test_break_glass_open_read_review` (super admin only, step-up, reason, read-only read, own-session refused, review by another, lock trigger, access history), `test_break_glass_window_expires_and_reminder` | | | Pending |

## Frontend checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S6-F1 | All S6a screens on mocks; role gating; 409 refetch; step-up on sign | `clinical.test.tsx`: the doctor's flows end to end on the MSW mocks; reception gets not found for `/clinical/unsigned`. Sign goes through the shared `withStepUp` (dialog and retry covered by `lock.test.tsx`). The 409 reload with the conflict note is in the autosave code but has no test yet | Pending |
| S6-F2 | One scroll with anchors; autosave status; permanent allergy banner; private notes marked | "one scroll with anchors, autosave status, permanent allergy banner, private notes marked" (axe clean); `s6-components.test.tsx` (AllergyBanner, AutosaveStatus, SectionAnchors) | Pending |
| S6-F3 | ICD-10 type-ahead; primary/secondary; provisional/confirmed; sensitive suggests restricted | "ICD-10 type-ahead in plain language; primary and certainty; sign and lock" | Pending |
| S6-F4 | History drawer with filters and problem summary | "the history drawer opens beside the record with filters and the problem summary" (axe clean) | Pending |
| S6-F5 | Reason-for-access blocks the record until a reason is given | "a patient not in care is blocked until a reason is given" | Pending |
| S6-F6 | `clinical` text in rw/en/fr; dates through `dateFormat()`; axe clean | `tests/i18n.test.ts` parity and review list; axe in the staff and patient tests. Patient records (PR1, PR2): `records.test.tsx`, never private notes or examination | Pending |
| S6-F7 | (S6b) Import wizard: upload, suggested columns, row check (problems, likely duplicates), import the ready rows (step-up), undo within the window | `apps/staff-web/src/features/imports/imports.test.tsx` (mocks, axe) | Pass (mocks) |

## Integration checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S6-I1 | Shared files only in `[S6]` blocks; OpenAPI regenerated | `[S6]` blocks in `config/settings/base.py` (`INSTALLED_APPS`, `ENUM_NAME_OVERRIDES`), `config/urls.py`, `authz/catalogue.py`, `audit/actions.py`; CI coverage loop. Rebase on `main` pending | Pending |
| S6-I2 | Real API end to end | Waits for the frontend | Not started |
| S6-I3 | History of 200 visits < 2 s | Not measured | Not started |

## Evidence log

- 2026-11-01: full backend suite 541 passed (27 in `tests/s6`); `medilink/clinical` coverage 98 %; `ruff check` and `ruff format --check` clean; `makemigrations --check --dry-run` clean; `migrate clinical zero` then `migrate` clean on the dev database.

## Gaps

- Clinical reads are linked to the patient (`patients_audit_link`) but not shown in the patient's access history until S3's `ACCESS_HISTORY` set includes the `clinical.*.viewed` actions (contract D-7).
- S6-I3 (performance) has no measurement yet.
