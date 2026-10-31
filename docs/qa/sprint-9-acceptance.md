# Sprint 9 acceptance record: Notification engine

Contract: [sprint-09-notifications.md](../architecture/contracts/sprint-09-notifications.md) §9 · Pull request: S9 (backend first; the frontend follows in the same sprint) · Releases: none yet

Status: **Open**. The backend is implemented with tests. The frontend (S9-F1..F12) is in progress. Real web push on devices (S9-I2) and the staging checks wait for staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)).

Evidence collected on 2026-10-31 by running `pytest tests/notifications` (55 tests) and the full backend suite on PostgreSQL. Per [QA README](README.md) §4, a verifier who did not write the code fills **Verified by**, **Date** and **Result**. Tests: `backend/tests/notifications/test_core.py`, `test_api.py`, `test_events_sockets.py`, `test_more_paths.py`.

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S9-B1 | Every §3.3 endpoint in the schema | `spectacular --validate --fail-on-warn` clean; `openapi/openapi.yaml` regenerated; `test_every_endpoint_is_routed` | | | Pending |
| S9-B2 | Authorisation matrix; own data only; facility scoping; RLS | `test_inboxes_are_own_and_audience_scoped`, `test_staff_inbox_shows_active_facility_and_counts_others`, `test_facility_announcement_lifecycle` (other facility 404, RLS as app role), `test_delivery_log_and_stats` (403 without `audit.view`, other facility empty), platform 403 for facility admins | | | Pending |
| S9-B3 | `notify()` contract and rollback | `test_contract_errors_and_rollback` | | | Pending |
| S9-B4 | Recipients: guardians, delegates, revoked links, muted, variant; staff by permission and role | `test_guardians_get_dependent_variant_and_can_mute`, `test_dependent_notification_uses_dependent_variant`, `test_facility_staff_by_permission_and_role` | | | Pending |
| S9-B5 | Dedupe and rate limit | `test_dedupe_and_rate_limit` | | | Pending |
| S9-B6 | Quiet hours: held and released; critical, for-today and mandatory bypass | `test_quiet_hours` (4 cases, frozen clock in Africa/Kigali) | | | Pending |
| S9-B7 | Preferences: skipped, in-app always, mandatory, 409, locked critical 422, defaults v0 | `test_preference_off_is_skipped_but_in_app_stays`, `test_patient_preferences_defaults_version_and_rules`, `test_staff_preferences`, security events ignore preferences (`mandatory`) | | | Pending |
| S9-B8 | Retries then fallback; 410 revokes; unread fallback once; routine never | `test_retries_then_critical_fallback`, `test_push_gone_revokes_without_retry`, `test_unread_important_for_today_falls_back_once`, `test_web_push_failures` | | | Pending |
| S9-B9 | Delivery log with every attempt; staff, platform, stats; audit when filtered | `test_delivery_log_and_stats` | | | Pending |
| S9-B10 | Push allowlist rejects arbitrary hosts; host re-checked at send; no redirects | `test_push_allowlist_rejects` (7 URLs), `test_push_subscribe_take_over_limit_and_remove` (4 default hosts), `test_endpoint_host_rules`, `test_web_push_is_encrypted_signed_and_has_only_the_payload_fields` (changed host refused), `test_web_push_failures` (redirect not followed) | | | Pending |
| S9-B11 | Encrypted and VAPID-signed; payload fields; Urgency/TTL; deploy check | `test_web_push_is_encrypted_signed_and_has_only_the_payload_fields`, `test_deploy_check_needs_keys_and_a_sane_allowlist`, `test_public_key_reports_push_state` | | | Pending |
| S9-B12 | No clinical words in any template; revise and announcements refuse them; render-time hit fails | `test_every_registered_template_is_clean`, `test_templates_revise_activate` (HIV, VIH, SIDA, diagnosis, `$diagnosis`), `test_facility_announcement_lifecycle` (clinical word, URL), `test_render_time_content_policy`, `test_content_policy` | | | Pending |
| S9-B13 | Revise and activate; stale 409; sync never overwrites; checks E001–E004 | `test_templates_revise_activate`, `test_registry_checks_catch_broken_events` | | | Pending |
| S9-B14 | Email in the recipient's language, text + escaped HTML, right link, no attachments | `test_email_is_localised_text_and_escaped_html`, `test_in_app_and_email_on_commit`, `test_email_failures` | | | Pending |
| S9-B15 | Security notices: new device once, first login silent, MFA, password reset revokes push, logout revokes session push, role/MFA reset via notify, login survives failures | `test_new_device_login_notifies_once`, `test_mfa_enrolment_and_password_reset`, `test_patient_logout_revokes_that_sessions_subscriptions`, `test_role_changed_and_mfa_reset_via_notify`, `test_login_succeeds_when_notification_processing_fails` | | | Pending |
| S9-B16 | Sockets: origin, 4401, own audience, other tabs get read, 4429 | `test_notification_socket_auth_relay_and_rate_limit`. Logout closing the socket uses the S0 session group (covered by `test_b14_*`) | | | Pending |
| S9-B17 | Announcements: draft, publish, fan-out, withdraw, 409, 422, 429, platform reach and admin email | `test_facility_announcement_lifecycle`, `test_daily_publish_limit`, `test_platform_announcement_reaches_members_and_admin_email`, `test_platform_selected_facilities_and_templates` | | | Pending |
| S9-B18 | JSON ID arguments, time limits, no double send, cleanup counts | `test_cleanup_and_double_send_guard`; tasks in `tasks.py` take string IDs and set `time_limit` | | | Pending |
| S9-B19 | Audit IDs only; permission seeded; coverage ≥ 90 %; ruff clean | `medilink/notifications` coverage 93 %; added to the CI coverage gate; ruff clean; `test_roles_seed` | | | Pending |

## Frontend checks

S9-F1..F12: in progress (separate commit in the S9 pull request).

## Integration checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S9-I1 | Real API round-trip; new-device login live within 2 s | Covered at the backend by `test_notification_socket_auth_relay_and_rate_limit`; the browser check waits for the frontend | Open |
| S9-I2 | Real web push on Chrome and Firefox | Needs staging and devices (#17) | Open |
| S9-I3 | Platform composer with S1's facility list | Backend accepts `selected_facilities`; the composer comes with the frontend | Open |
| S9-I4 | Mailpit shows the new-device email in rw, en, fr | `test_email_is_localised_text_and_escaped_html` (rw); Mailpit check by hand | Open |
| S9-I5 | Only S9 modules and `[S9]` blocks; OpenAPI and lock files regenerated | Shared files changed only inside `[S9]` blocks; lock files regenerated (adds pywebpush and its dependencies; certifi 2026.10.23) | Pending |

## Decisions

See the contract §10 (S9-D1 … S9-D9).
