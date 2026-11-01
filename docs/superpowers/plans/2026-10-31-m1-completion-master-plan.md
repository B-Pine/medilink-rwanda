# M1 Web MVP Completion: Master Plan

> **For agentic workers:** this is a programme plan. Each phase gets its own detailed plan (bite-sized tasks with code) before work starts, written with the `anthropic-skills:writing-plans` skill. Phase 1 already has one: [2026-10-31-phase-1-repair-and-s5a-staff.md](2026-10-31-phase-1-repair-and-s5a-staff.md). Execute detailed plans with `anthropic-skills:subagent-driven-development` (recommended) or `anthropic-skills:executing-plans`. Steps use `- [ ]` checkboxes.

**Goal:** take MediLink Rwanda from today's state (S0–S5a merged, partly unverified) to the M1 Web MVP described in [docs/roadmap](../../roadmap/README.md), with every sprint verified against its contract and the docs telling the truth at each step.

**Architecture:** unchanged ([ADR 0003](../../decisions/0003-stack-django-react-postgresql.md), [ADR 0004](../../decisions/0004-visit-centric-domain-model.md), [ADR 0006](../../decisions/0006-separate-frontend-and-backend-hosting.md)). Django 6 + DRF + PostgreSQL RLS + Channels/Celery behind `api.medilink.rw`; two React 19 apps (`staff-web`, `patient-web`) against the generated `api-client`; contract-first sprints with MSW mocks.

**Tech stack:** Python 3.12+, Django 6.1, PostgreSQL 17, Redis 7; React 19, TypeScript, Vite, Tailwind v4, Radix, TanStack Query, MSW, Vitest, Playwright.

---

## 1. Where we are (audit of 2026-10-31)

| Area | Fact |
|---|---|
| Built | S0, S1, S2, S3, S4 (backend + frontend), S5a backend, S5a patient frontend, operations dashboard |
| Partly built | S5a staff frontend: the API and mocks exist, but no screen uses them. The Expected list is a hard-coded empty placeholder (`BoardPage.tsx:178`); there is no phone booking, booked check-in or no-show reversal |
| Not started | S5b, S6, S7, S8, S9, S10 (both parts), S11 |
| Broken on `main` | 2 frontend tests: `patient-web/src/app/flows.test.tsx:26` (expects the old "Search opens soon" text) and `tests/i18n.test.ts` (`i18n-review.md` not regenerated) |
| Security drift | `audit_auditentry` has no RLS, while database design §758 says SELECT is facility-scoped. `core_outbox_event`, `onboarding_facility_feature_flag` and `onboarding_facility_status_event` have `facility_id`, no RLS, and no documented exception. `tests/test_b10_rls.py` checks only 2 tables |
| Records drift | No S4/S5 acceptance records; the traceability matrix says S2/S4/S5 "Not started" and S9 "In progress"; the changelogs have nothing for S4/S5/design v2; the catalogue says S2/S4/S5 "Planned"; the README status says "Wave 1 next" |
| Infrastructure | No staging (#17), no deploy workflow; 0 of 44 go-live checklist items; 2,070 Kinyarwanda strings unreviewed |
| Healthy | 512 backend tests pass; OpenAPI in sync; ruff clean; frontend typecheck and lint clean; contract endpoints S0–S4 complete; permission grants match the docs; concurrency checks pass |

## 2. Decisions the product owner must make (blocking where marked)

| # | Decision | Blocks | Recommendation |
|---|---|---|---|
| D1 | Staging host in Rwanda (provider, domains, who holds credentials) | Phase 2 onward ("Implemented" needs staging, QA README §3) | Pick the same provider planned for production so migrations are rehearsed on the real platform |
| D2 | Audit log: add facility RLS (as the database design says) or correct the doc | Phase 6 (audit viewer) | Add RLS: `SELECT` scoped to the facility context, `INSERT` always allowed, platform and patient reads through SECURITY DEFINER views |
| D3 | The 3 undocumented non-RLS tables | Phase 1 Task 3 (documented as exceptions now, revisited in Phase 6) | Keep without RLS (system/platform data, IDs only) and record the reason in database design |
| D4 | Native Kinyarwanda reviewer(s) and their schedule | Phase 7 exit | Start reviews per sprint from Phase 2, not all at the end |
| D5 | Pilot facility (1–2) and pen-test vendor | Phase 7 | Book the pen test for the start of Phase 7 |

## 3. Phases (one wave at a time; parallel tracks inside a phase)

The order follows the dependency table in [roadmap README](../../roadmap/README.md#waves-sprints-built-in-parallel), corrected for what was built out of order: notifications (S9) and help (S10 part 1) were skipped, so they come next, before more clinical modules.

| Phase | Scope | Tracks in parallel | Exit gate |
|---|---|---|---|
| **1 · Repair and finish S5a** | Green `main`; RLS coverage test; staff Expected list + booked check-in + no-show reversal; phone booking; docs made truthful; S4/S5 acceptance records | 1 backend+docs builder, 1 frontend builder | All suites green; the Expected list shows real bookings; matrix and catalogue match the code |
| **2 · Staging, S9 notifications, S5b** | Staging environment and deploy workflows (D1); S9 engine from its existing [contract](../../architecture/contracts/sprint-09-notifications.md); S5b disruptions, follow-ups, calendar feed, reception/doctor calendars | infra · S9 · S5b | S1–S5 integration checks (I*) run on staging; S9 contract acceptance checks evidenced |
| **3 · S10 part 1** | Help center content and support requests (FR-DSP-11); contract first | 1 track | Contract checks evidenced; patient "Help" and staff support screens live |
| **4 · S6 clinical record** | Consultation, signing, addenda, history timeline, results inbox, legacy import, break-glass (FR-ACC-09) | backend · frontend | S6 contract checks evidenced; "private notes never in patient serializers" proven by test |
| **5 · S7 pharmacy/documents + S8 billing** | S7: prescriptions, dispensing, PDF documents with QR verification; S8: bills, payments, receipts, approvals, cash-up | S7 track and S8 track in separate worktrees | Money invariants tested; document verification page public and rate-limited |
| **6 · S10 part 2 + S9 wiring + audit RLS** | Disputes, reports, exports, audit viewer, unusual-access report; every module emits notification events; audit RLS (D2) | backend · frontend | All FR-NOT-07 catalogue events fire; audit viewer reads only its facility |
| **7 · S11 hardening and pilot** | 3× peak load test, pen-test fixes, backup/PITR restore test, monitoring and alerts, retention jobs, facility data export, a11y audit, Kinyarwanda review, training mode, go-live checklist | several | [Go-live checklist](../../security/14-go-live-security-checklist.md) complete; P1 exit criteria met |

## 4. The loop every sprint follows (with the skill or tool for each step)

| Step | What | Skill / MCP / tool |
|---|---|---|
| 0 | Open a GitHub issue for the sprint, link the contract | GitHub MCP (`issue_write`, `list_issues` to avoid duplicates) |
| 1 | **Contract:** endpoints, schemas, errors, acceptance checks (`SN-B*`, `SN-F*`, `SN-I*`), decisions | `backend-design:design` (6-step workflow), `backend-design:data-modeling-discipline`, `backend-design:auth-and-authorization`, `backend-design:idempotency-and-side-effects` (S8 payments, S9 delivery, S7 dispensing), `backend-design:error-handling-as-design` |
| 1a | Review the contract's schema and migrations before code | `backend-design:schema-reviewer` agent, `backend-design:review-migration`, `backend-design:migration-safety` |
| 1b | Threat review of new surfaces (uploads, public endpoints, sockets) | `backend-design:security-discipline`, `backend-design:incident-thinker` agent |
| 2 | **Detailed plan** (bite-sized, TDD) | `anthropic-skills:writing-plans` |
| 3 | **Parallel build**, one branch per track | `anthropic-skills:using-git-worktrees`, `anthropic-skills:subagent-driven-development` or `anthropic-skills:dispatching-parallel-agents`, `anthropic-skills:test-driven-development` |
| 3a | Backend quality as you go | `backend-design:query-discipline`, `backend-design:hunt-n-plus-one` (lists, reports), `backend-design:testing-with-discernment` |
| 3b | Frontend quality as you go | `design:accessibility-review`, `design:ux-copy` (plain language, rw/en/fr), `dataviz` (S10 reports), `design:design-critique` against [design research](../../design/research/README.md) |
| 3c | Debugging | `anthropic-skills:systematic-debugging` |
| 4 | **Verification:** every acceptance check gets evidence in `docs/qa/sprint-N-acceptance.md` | `anthropic-skills:verification-before-completion`; `run` skill (launch the app, screenshot each F-check); Playwright (pre-installed) for e2e; UI Verify MCP for visual diffs once a project is set up |
| 5 | **Review** before merge | `code-review` skill (`high`), `security-review` skill, `backend-design:security-reviewer` agent |
| 6 | **PR** as draft, CI watched | GitHub MCP (`create_pull_request`, `get_check_runs`), `subscribe_pr_activity` |
| 7 | **Integration** on staging (mocks off) | `run` skill against staging; `engineering:deploy-checklist` |
| 8 | **Release:** changelog, tag, matrix update | `anthropic-skills:finishing-a-development-branch`; GitHub MCP for the release |
| 9 | Demo and status | `product-management:stakeholder-update` or `operations:status-report` |

## 5. Per-phase skill emphasis

| Phase | Extra skills / tools |
|---|---|
| 1 | `anthropic-skills:test-driven-development`, `code-review` |
| 2 | `engineering:deploy-checklist`, `operations:runbook` (staging runbook), `backend-design:observability-by-default`; `backend-design:idempotency-and-side-effects` for delivery retries; web push needs a VAPID key pair (environment secret) |
| 3 | `design:ux-copy`, `customer-support:kb-article` (help center articles) |
| 4 | `backend-design:auth-and-authorization` (treatment relationship, break-glass), `backend-design:data-modeling-discipline` (signed records, content hash) |
| 5 | `anthropic-skills:pdf` and `pdf-viewer:open` to check generated documents; `backend-design:idempotency-and-side-effects` (payments, gapless receipts); `finance:reconciliation` as a reference for cash-up rules |
| 6 | `dataviz`, `dataink:dashboard-design`, `dataink:table-design`; `backend-design:query-discipline` for report queries; `legal:compliance-check` (Rwanda data protection law, data subject rights, exports) |
| 7 | `claude-security:claude-security` (full scan and patches, costly, so run once before the pen test); `backend-design:performance-and-scaling`; `operations:risk-assessment`; `engineering:incident-response` and `operations:runbook` (incident and restore runbooks); `design:accessibility-review` for the full a11y audit; optional `42crunch-api-security-testing` for an OpenAPI security audit (needs a 42Crunch account) |

MCP servers that **cannot** be used now: Datadog needs authorisation (and the docs choose Wazuh, so it is not needed); the Figma plugin server failed to connect (use the `Figma` connector only if designs move to Figma). Google Calendar can hold sprint demo dates if wanted.

## 6. Rules that apply to every phase

- The contract wins over the catalogue; if code deviates, record a decision (`D-n`) in the contract in the same PR.
- Never mark a requirement **Implemented** before it runs on staging (QA README §3); until then **In progress**.
- Every new facility table gets `EnableFacilityRLS` or an entry in `RLS_EXCEPTIONS` (Phase 1 Task 3) with a doc reference.
- Every user-facing string goes into rw/en/fr locale files; run `pnpm i18n:review` before pushing.
- Each sprint writes only under its own heading in `CHANGELOG.md` files.
- No skipped or quarantined tests to get CI green.

## 7. Next action

Execute [Phase 1](2026-10-31-phase-1-repair-and-s5a-staff.md). When Phase 1 is merged, write the Phase 2 detailed plans (staging, S9, S5b) with `anthropic-skills:writing-plans`, after D1 is decided.
