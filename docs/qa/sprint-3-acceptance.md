# Sprint 3 acceptance record: Patients and identity

Contract: [sprint-03-patients.md](../architecture/contracts/sprint-03-patients.md) §9 · Pull requests: backend [#57](https://github.com/B-Pine/medilink-rwanda/pull/57) (merged, Part A and Part B) · Releases: none yet
Status: **Open**. Backend (#57) and frontend ([#59](https://github.com/B-Pine/medilink-rwanda/pull/59)) are implemented; there is no staging yet ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)) · How to fill it in: [QA README](README.md) §4

Evidence below was collected by the author. Per QA README §4, a verifier who did not write the code fills **Verified by**, **Date** and **Result**. Tests live in `backend/tests/patients/`. On `main` after #57: 433 backend tests pass, `medilink/patients` coverage is 91 %, ruff and mypy are clean, and `spectacular --validate --fail-on-warn` is clean (CI green).

## Backend checks

| # | Check (short; full text in the contract §9) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| S3-B1 | Every endpoint exists, matches §3, is in the schema | Contract, architecture 02 | `test_b02_endpoints_schema.py`; committed `openapi/openapi.yaml` without drift (CI); [catalogue](../api/catalogue.md#s3--patients-and-identity) rows Implemented | | | Pending |
| S3-B2 | Authorisation matrix: every staff endpoint × role; every patient endpoint × link | FR-SEC-01, analysis 02 | **Partial.** Role and link cases in `test_staff_api.py` (reception, doctor, pharmacist, other facility), `test_patient_api.py` (self, guardian, delegate, unlinked), `test_merges.py` (requester, approver, platform). A complete endpoint × role table test is not written yet | | | Gap |
| S3-B3 | `extend()` registered; seed reversible; receptionist holds `merge_request` | FR-ACC-03 | `tests/test_roles_seed.py`; migration round trip on seeded data (below) | | | Pending |
| S3-B4 | Cross-tenant `404`; external match only on exact identifier; no context → 0 rows | FR-SEC-01 | `test_other_facility_sees_external_match_only_and_adds_existing`, `test_contract_checks.py::test_b4_no_context_sees_no_facility_records` | | | Pending |
| S3-B5 | Ciphertext only; AAD binding; tampered tag fails; rotation | FR-SEC-10, security 05 | `test_walk_in_creates_patient_record_consent_and_audit` (no digits in the row or audit), `test_ciphertext_bound_to_row`, `test_b5_changed_tag_fails`, `test_rotate_keys_data_and_index` | | | Pending |
| S3-B6 | `E001` without keys in deploy; `W001` only with DEBUG; bad key refused | Security 05 §5 | `test_checks.py`, `test_keystore_validation`, `tests/test_b13_deploy_check.py` | | | Pending |
| S3-B7 | Identifier rules, uniqueness `409`, superseded kept, masking | FR-PAT-07 | `test_normalisers`, `test_identifier_used_by_another_patient`, `test_identifiers_patient_side`, `test_identifiers_and_reveal`. Masking is asserted per response; no serializer snapshot test | | | Pending |
| S3-B8 | MediLink number format, check character, lookup, backfill | FR-PAT-07 | `test_medilink_number_check_character`, `test_backfill_numbers`, `test_signup_patient_gets_medilink_number`, search by number in `test_search_by_name_phone_id_file_and_number` | | | Pending |
| S3-B9 | Minimal walk-in in one transaction; idempotency; p95 targets | FR-PAT-04, NFR-UX-04 | `test_walk_in_*`, `test_estimated_age`, `test_walk_in_idempotent`. **p95 not measured yet** (needs staging or a load test) | | | Gap (performance) |
| S3-B10 | Duplicate fixtures and `409` without confirmation | FR-PAT-05 | `test_strong_duplicate_needs_confirmation`, `test_duplicate_check_branches` | | | Pending |
| S3-B11 | Search modes, auto-detection, ≤ 20, survivor, no values in audit, `429` | FR-PAT-09 | `test_search_by_name_phone_id_file_and_number`, `test_search_edge_cases`, merge test (file number finds survivor), `test_b11_search_rate_limit` | | | Pending |
| S3-B12 | Reveal: permission, reason, `no-store`, rate limit, audit | FR-SEC-10 | `test_identifiers_and_reveal` | | | Pending |
| S3-B13 | Facility merge: scope, conflicts, four-eyes (API and DB), step-up, moved rows, undo | FR-PAT-05 | `test_merges.py`, `test_b13_database_refuses_self_approval` | | | Pending |
| S3-B14 | Cross-facility merge: staff refused; platform re-points at two facilities | FR-PAT-05 | `test_cross_facility_scope` (staff refused), `test_single_owner_clinic_escalates_to_platform`. **Platform approval across two facilities not tested yet** | | | Gap |
| S3-B15 | Claim by code and at reception; generic no-match | FR-PAT-06 | `test_claim_by_email_code`, `test_claim_by_reception_and_failed_codes`, `test_claim_code_limits_and_expiry` | | | Pending |
| S3-B16 | Dependents and delegation rules | FR-PAT-03 | `test_dependents_rules`, `test_delegation_invite_accept_rights_and_revoke`, `test_guardian_co_invite_revoke_and_leave`, `test_profile_limit_and_research_consent` | | | Pending |
| S3-B17 | Insurance lifecycle | FR-BIL-01 | `test_insurance_flow`, `test_insurance_and_health_patient_side`, card photo tests in `test_more_paths.py` | | | Pending |
| S3-B18 | Health profile provenance and role gating | FR-PAT-08 | `test_health_profile_permissions`, `test_search_edge_cases` (pharmacist allergies only) | | | Pending |
| S3-B19 | Consents append-only; latest wins; withdrawal of terms refused | FR-SEC-04, 05 | `test_consents`, `test_staff_consent`, `test_profile_limit_and_research_consent` | | | Pending |
| S3-B20 | Access history; one audit link per event; audit chain valid | FR-PAT-14, FR-SEC-08 | `test_access_history_sees_staff_reads`, delegation test, `test_b20_one_audit_link_per_patient_event_and_chain_valid` | | | Pending |
| S3-B21 | `is_staff_member` set for linked accounts that are members | Security 04 §3 | `test_b21_staff_member_flag` (registration and add-existing; refreshed after merges and undo) | | | Pending |
| S3-B22 | Migrations reversible on seeded data; S0 tests pass; coverage ≥ 90 %; dev seed refuses without DEBUG | NFR-OPS-08 | 2026-10-23 on the seeded dev DB: `migrate patients 0001` then `migrate` (fixed in this PR: rollback of 0002 and the post-migrate grant); full suite green; coverage 91 %; `test_seed_patients_dev_needs_debug_and_seed` | | | Pending |

## Frontend checks

Built in #59 (evidence: `frontend/packages/api-client/src/mocks/s3.test.ts`, `packages/ui/src/components/s3-components.test.tsx`, `apps/staff-web/src/features/patients/patients.test.tsx`, `apps/patient-web/src/features/profile/profile.test.tsx`, vitest-axe on new pages and components). S3-F1 to S3-F16 are **Pending** independent verification; F16 camera capture was tested only through its file fallback.

## Integration checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S3-I1 | Rebased, schema regenerated, suites green, shared files only in `[S3]` blocks | #57 CI green. Outside the blocks: the CI coverage list and deploy-check keys, and one `.gitleaks.toml` allowlist entry (listed in the PR) | Pending |
| S3-I2 – I4 | Staging walk-through (staff, patient, claims) | Needs the frontend and staging | Not started |
| S3-I5, I6 | api-client types and anchors | Needs the frontend | Not started |
| S3-I7 – I9 | Part B (insurer FK, card photos, step-up) | Backend done in #57 (`test_insurance_flow`, card photo tests, step-up in `test_merges.py`); UI part waits for the frontend | Pending |

## Definition of Done

- [ ] All acceptance checks verified with evidence
- [x] Traceability matrix statuses updated (S3 requirements stay **In progress** until the frontend and staging exist)
- [x] CHANGELOG and API catalogue updated
- [ ] Deployed to staging and demoed

## Notes, waivers and follow-ups

- Gaps to close with the S3 frontend: B2 full matrix test, B9 performance measurement, B14 two-facility platform approval test.
- Deviations from the contract are recorded in its §10 (D-16 to D-20).
