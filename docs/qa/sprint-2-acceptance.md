# Sprint 2 acceptance record: Facility setup and staff

Contract: [sprint-02-facility-setup.md](../architecture/contracts/sprint-02-facility-setup.md) §9 · Pull requests: backend [#63](https://github.com/B-Pine/medilink-rwanda/pull/63), frontend [#69](https://github.com/B-Pine/medilink-rwanda/pull/69) (both merged) · Issue [#61](https://github.com/B-Pine/medilink-rwanda/issues/61)

Status: **Open**. Backend and frontend are implemented and merged. The real-API integration checks (I2–I4) need Mailpit and a second person, and wait for staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)).

Evidence below was collected by the author. Per QA README §4, a verifier who did not write the code fills **Verified by**, **Date** and **Result**. Backend tests live in `backend/tests/s2/`; frontend tests in `frontend/apps/staff-web/src/features/setup/setup.test.tsx` and `frontend/packages/ui/src/components/design-pass.test.tsx`.

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S2-B1 | Every endpoint exists and is in the schema | `spectacular --fail-on-warn` in CI; committed `openapi/openapi.yaml` without drift | | | Pending |
| S2-B2 | Authorisation matrix per role | `test_staff_endpoints_need_staff_manage`, `test_profile_read_by_members_and_edited_by_admin`, `test_settings_schema_and_step_up`; default-deny test over every view. A full endpoint × role table test is not written | | | Gap |
| S2-B3 | Cross-tenant `404`; no context → 0 rows | `test_other_facility_and_no_context` | | | Pending |
| S2-B4 | Change log one row per field, append-only, no personal data | `test_change_log_is_append_only`, profile and settings tests | | | Pending |
| S2-B5 | `409` on stale `version` | profile, settings, services, templates, tariffs and memberships tests | | | Pending |
| S2-B6 | Opening hours rules | `test_hours_rules_and_effective_calendar`, `test_service_hours_and_retire_with_templates` | | | Pending |
| S2-B7 | Effective calendar: holiday, override, closure, Umuganda modes | `test_umuganda_modes`, `test_umuganda_cut_and_special_day`, `test_calendar_events_edit_delete_and_holiday` | | | Pending |
| S2-B8 | Templates: overlap, warnings, unattested refused | `test_templates_attestation_overlap_and_warnings` | | | Pending |
| S2-B9 | Other-facility busy ranges show times only | `test_cross_facility_busy_ranges_reveal_times_only` | | | Pending |
| S2-B10 | Leave requests, approval, signal | `test_leave_requests`, `test_extra_session_blocks_and_cancel` | | | Pending |
| S2-B11 | Tariff and insurer versions, no overlap, `?on=` | `test_tariff_versions`, `test_insurer_rules`, `test_insurer_rule_versions_and_tariff_correction` | | | Pending |
| S2-B12 | Settings schema, defaults, billing step-up, extension | `test_settings_schema_and_step_up`, `test_settings_billing_needs_step_up`, `test_register_settings_fields` | | | Pending |
| S2-B13 | Invitation token rules, resend, rate limit | `test_invite_new_account_and_accept`, `test_resend_invalidates_and_revoke` | | | Pending |
| S2-B14 | Accept: new account → MFA setup; existing account | `test_invite_new_account_and_accept`, `test_existing_account_accepts_with_password` | | | Pending |
| S2-B15 | Deactivation; last admin | `test_roles_last_admin_and_deactivation`. Socket closing waits for S4 realtime | | | Pending |
| S2-B16 | MFA reset (facility and platform) | `test_mfa_reset_and_attestation`, `test_platform_mfa_reset_and_invitation_job` | | | Pending |
| S2-B17 | Checklist and go-live | `test_checklist_and_go_live`, `test_full_setup_then_go_live` | | | Pending |
| S2-B18 | Approval hook invites the admin, facility to `setup`, once | `test_approval_hook_invites_admin_and_starts_setup`; S1 `test_applications.py` updated | | | Pending |
| S2-B19 | Audit events with IDs and codes only | audit metadata guard (rejects keys such as `code`, hence `tariff_code`); assertions in the tests above | | | Pending |
| S2-B20 | Migrations reversible; suites green; coverage ≥ 90 % | 473 backend tests green; CI coverage gate includes `facilities`, `scheduling`, `billing`; `test_seed_setup_dev` | | | Pending |

## Frontend checks

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S2-F1 | Every §6 screen works on mocks; permissions, versions, step-up, errors | `setup.test.tsx` (13 tests); 409 notice in profile, rules and hours forms | | | Pending |
| S2-F2 | Checklist: icon + label, links, go-live refusal lists items | "lists every step with icon + label…" | | | Pending |
| S2-F3 | `WeekGrid` keyboard and table alternative; names include day and time | "draws sessions to scale…", ui `WeekGrid` test with axe | | | Pending |
| S2-F4 | Hours editor: copy, break validation, per-service tab, preview | "copies Monday to weekdays…" | | | Pending |
| S2-F5 | Other-facility warnings as time ranges; unattested links to staff | "warns when a new session overlaps…", "draws sessions…" | | | Pending |
| S2-F6 | Tariffs and insurer rules with `MoneyField` and % | "changes a price from a date…", "shows insurer rules…" | | | Pending |
| S2-F7 | Staff: invite, resend, revoke; step-up; reason; last admin | "invites, deactivates with a reason…" | | | Pending |
| S2-F8 | Invitation page, both paths; generic invalid message | "new account: name + password, then MFA setup", "a bad link shows one generic message". The existing-account path is covered by the mock and the page, not a test | | | Pending |
| S2-F9 | Settings forms from schemas; 409; billing step-up | "builds each section from its schema and saves" | | | Pending |
| S2-F10 | Doctor: own week and leave; no admin screens | "doctor sees only their schedule and can request leave" | | | Pending |
| S2-F11 | Text in `setup` rw/en/fr; parity; `i18n-review.md` | i18n parity test; `i18n-review.md` regenerated. Kinyarwanda needs native review | | | Pending |
| S2-F12 | axe clean on new pages and components | axe in the setup flow tests and the ui component tests | | | Pending |

## Integration checks

| # | Check | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S2-I1 | Rebased, OpenAPI regenerated, suites green, shared files only in `[S2]` blocks | #63 and #69 CI green; the design pass (#65) added `FeatureRoutes.todayCards` and `commands` outside markers as core shell changes | | | Pending |
| S2-I2 | Approval → invitation email → admin accepts → checklist → go live | Not run: needs Mailpit flow end to end | | | Waiting (#17) |
| S2-I3 | Existing doctor of another facility → other-facility warnings without names | Not run on the real API | | | Waiting (#17) |
| S2-I4 | Deactivated member loses the facility; socket closes | Socket part needs S4 realtime | | | Waiting (S4) |
| S2-I5 | api-client types match the schema; mock and API agree | Types written from the generated schema (2026-10-26); browser check against the real API (checklist, schedules) | | | Pending |
