# Sprint 10 (part 1) acceptance record: Help center and support requests

Contract: [sprint-10-help-support.md](../architecture/contracts/sprint-10-help-support.md) §9 · Pull requests: S10 part 1 backend; the frontend follows · Releases: none yet

Status: **Open**. The backend is implemented with tests. The frontend (S10-F1..F9) is implemented with tests. The real-API checks (S10-I1..I3) wait for staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)).

Evidence collected on 2026-11-01 by running the full backend suite on PostgreSQL (699 passed; `medilink/support` in the CI coverage gate at ≥ 90 %). Tests: `backend/tests/support/test_api.py`. Per [QA README](README.md) §4, a verifier who did not write the code fills **Verified by**, **Date** and **Result**.

## Backend checks

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S10-B1 | Every §3.2 endpoint in the schema | `spectacular --validate --fail-on-warn` clean; `openapi/openapi.yaml` regenerated | | | Pending |
| S10-B2 | Authorisation matrix; own requests only; facility admin read-only, own facility only; platform refuses others | `test_requests_are_own_only`, `test_staff_requests_and_facility_view`, `test_platform_endpoints_refuse_others`, `test_public_and_staff_articles_by_audience` | | | Pending |
| S10-B3 | Published articles of the caller's audience only; search in every language, title first; `q` length | `test_public_and_staff_articles_by_audience`, `test_article_search_and_filters` | | | Pending |
| S10-B4 | Article rules: slug, language keys, lengths, 409, missing language 422, step-up 403, publish twice 409 | `test_platform_article_lifecycle`, `test_article_validation`, `test_publish_needs_recent_step_up` | | | Pending |
| S10-B5 | Request state machine, close reasons, triage rules, stale version | `test_patient_request_lifecycle`, `test_platform_queue_triage_and_close` | | | Pending |
| S10-B6 | No clinical data: denylisted terms refused, nothing stored, not echoed | `test_clinical_words_and_text_rules` | | | Pending |
| S10-B7 | Five open requests at most; throttle; control characters | `test_open_request_limit_and_throttle`, `test_clinical_words_and_text_rules` | | | Pending |
| S10-B8 | Notifications to platform admins and the requester's own audience; rollback notifies no one | `test_patient_request_lifecycle`, `test_platform_queue_triage_and_close`, `test_rolled_back_action_notifies_no_one` | | | Pending |
| S10-B9 | Requester views hide support names, priority, assignee and client details | `test_patient_request_lifecycle`, `test_platform_queue_triage_and_close` | | | Pending |
| S10-B10 | Audit with IDs only; permission seeded; RLS exception; migrations reverse; coverage ≥ 90 %; messages append-only | `test_permission_seeded_and_registered`, `test_messages_are_append_only`, `tests/test_rls_coverage.py`, `scripts/check_migrations_reversible.py`, `test_seed_support_dev` | | | Pending |

## Frontend checks

Evidence: `pnpm test` (vitest + vitest-axe) on 2026-11-01: `frontend/apps/patient-web/src/features/help/help.test.tsx`, `frontend/apps/staff-web/src/features/help/help.test.tsx`, `frontend/packages/api-client/src/mocks/s10.test.ts`.

| # | Check (short; full text in the contract §9) | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|
| S10-F1 | Patient Help tab: emergency first, search, categories, fallback note, Contact support, My requests | "emergency first, search, category filter, Contact support and My requests"; "falls back to another language with a note"; `app/shell.test.tsx` | | | Pending |
| S10-F2 | Article as text (no HTML) | "renders paragraphs and lists as text, and a not-found card" (no `a` or `script` in the article) | | | Pending |
| S10-F3 | New request: topic cards; health redirect sends nothing; inline server errors; success opens the request | "health questions go to the facility and send nothing"; "shows server field errors inline, then sends and opens the request" | | | Pending |
| S10-F4 | Request list and thread: badges, reply, close with confirm, closed banner | "lists my requests with status badges"; "thread shows MediLink support, replies, closes with confirm and offers a new request" | | | Pending |
| S10-F5 | Staff Help and support: tabs, facility tab by permission, admin notice, read-only colleague view | "guides by search and topic; my requests; no facility tab without the permission"; "new request shows the facility admin notice…"; "a facility admin reads a colleague's request without replying" | | | Pending |
| S10-F6 | Platform queue with filters; triage (409 reload), reply, close with reason | "lists active requests high first, filters, and triages with assign to me"; "replies and closes with a reason"; not found for facility staff. The 409 reload message is in the code (`help.triage.stale`) without a UI test; the mock 409 is covered in `s10.test.ts` | | | Pending |
| S10-F7 | Article editor: language tabs, counters, missing languages, preview, save, publish with step-up, unpublish | "shows missing languages, previews, saves and publishes"; "creates a draft and moves to its page; server field errors inline". Publish runs through `withStepUp` (dialog covered by `lock.test.tsx`) | | | Pending |
| S10-F8 | MSW mocks for every endpoint | `mocks/s10.test.ts` (10 tests) | | | Pending |
| S10-F9 | `help` namespace parity, dates via `dateFormat()`, axe clean | `tests/i18n.test.ts` parity and review list; axe in both apps' help tests | | | Pending |

## Integration checks

| # | Check | Evidence | Result |
|---|---|---|---|
| S10-I1..I3 | Real-API round trips on staging | Need staging (#17) and the frontend | Open |
| S10-I4 | Only `medilink.support` and `[S10]` blocks changed; OpenAPI regenerated; suites green; catalogue and database design §5.13 updated | Shared files changed inside `[S10]` blocks; catalogue S10 rows and database design §5.13 updated in this pull request | Pending |

## Decisions

See the contract §10 (S10-D1 … S10-D6).
