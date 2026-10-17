# Sprint 0 acceptance record: Foundations

Contract: [03 · Sprint 0 contract](../architecture/03-sprint-0-contract.md) · Releases: `backend-v0.1.0` ([#6](https://github.com/B-Pine/medilink-rwanda/pull/6)), `frontend-v0.1.0` ([#7](https://github.com/B-Pine/medilink-rwanda/pull/7))
Status: **Verified** (staging deployment and demo pending: no staging environment exists yet) · How to fill it in: [QA README](README.md) §4

Verification was independent of the authors: the orchestrator re-ran every check from a clean install, reviewed the security-critical code, and ran an end-to-end test of the real frontend against the real backend in Chrome. Requirement statuses: [traceability matrix](traceability-matrix.md).

## Backend checks

Tests are named `test_bN_*` in `backend/tests/`. Independent run: `pytest --cov`: **215 passed, 95 % coverage**; ruff and format clean; `makemigrations --check` clean; pip-audit: no known vulnerabilities; CI on GitHub green.

| # | Check (short; full text in the contract §3) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| B1 | Clean clone runs (compose, migrate, `seed_dev`, runserver) | NFR-OPS-03 | Clean export set up on Windows; CI runs the Linux path; `test_b1_*` | Orchestrator + backend agent | 2026-10-17 | PASS |
| B2 | Every contract endpoint exists, matches the schema, is in `/api/v1/schema/` | NFR-OPS-06 | `test_b02_endpoints_schema.py`; `spectacular --validate --fail-on-warn`; committed `backend/openapi/openapi.yaml` without drift (CI) | Orchestrator | 2026-10-17 | PASS |
| B3 | DRF default permission denies; test fails for a view without an explicit permission | FR-SEC-01, FR-ACC-08 | `test_b3_every_routed_drf_view_declares_permission_classes` walks the URL resolver | Orchestrator | 2026-10-17 | PASS |
| B4 | Staff and patient endpoints and cookies are separate | FR-SEC-01 | `test_b04_audience_sessions.py` (15); end-to-end: separate HttpOnly cookies coexist, patient `me` never returns the staff user, staff logout keeps the patient session | Orchestrator | 2026-10-17 | PASS |
| B5 | No authenticated staff session without confirmed MFA | FR-ACC-04, FR-SEC-06 | `test_b05_mfa.py` (16); end-to-end: password → TOTP setup → 10 recovery codes → Today | Orchestrator | 2026-10-17 | PASS |
| B6 | Argon2id; patient ≥ 15, staff ≥ 12; breached list; no composition rules | FR-SEC-06 | `test_b06_passwords.py` (12) | Orchestrator | 2026-10-17 | PASS |
| B7 | Login throttling, generic errors, password reset always `202` | FR-SEC-06 | `test_b07_throttling_enumeration.py` (11) | Orchestrator | 2026-10-17 | PASS |
| B8 | Session rotates on login, MFA success, facility switch | FR-SEC-06, FR-ACC-02 | `test_b8_rotation_on_login_mfa_and_facility_switch` | Orchestrator | 2026-10-17 | PASS |
| B9 | CORS allowlist and CSRF trusted origins from env; CSRF enforced | FR-SEC-01 | `test_b09_cors_csrf.py` (13); end-to-end: POST without token → `csrf_failed` | Orchestrator | 2026-10-17 | PASS |
| B10 | RLS helper + context; no context → zero rows; A never sees B; `WITH CHECK` blocks | FR-SEC-02 | `test_b10_rls.py` (12) as non-superuser `medilink_app`; code review of `tenancy/rls.py` and the tenant middleware | Orchestrator | 2026-10-17 | PASS |
| B11 | Audit log append-only; hash chain verified by a test and `verify_audit_chain` | FR-SEC-07 | `test_b11_audit.py` (20); `verify_audit_chain`: OK | Orchestrator | 2026-10-17 | PASS |
| B12 | Error format and codes; 404 for other-facility objects | FR-SEC-01, NFR-UX-07 | `test_b12_errors.py` (22) | Orchestrator | 2026-10-17 | PASS |
| B13 | `check --deploy` clean on prod settings; CSP configured | NFR-OPS-02 | Prod-settings `check --deploy --fail-level WARNING`: no issues; `test_b13_deploy_check.py` | Orchestrator | 2026-10-17 | PASS |
| B14 | Celery JSON-only; Channels ASGI with origin validation | NFR-OPS-03 | `test_b14_celery_channels.py` (9) | Orchestrator | 2026-10-17 | PASS |
| B15 | No personal data or secrets in logs; `.env.example` complete | NFR-OPS-05 | `test_b15_logging_env.py` (14) | Orchestrator | 2026-10-17 | PASS |
| B16 | `ci-backend.yml`: ruff, mypy, pytest with Postgres, `check --deploy`, pip-audit | NFR-OPS-02 | Green on PR #6 (lint/test/deploy check + container image build) | Orchestrator | 2026-10-17 | PASS |
| B17 | Coverage of `accounts`, `authz`, `tenancy`, `audit` ≥ 90 % | NFR-OPS-01 | 97 / 98 / 99 / 96 % | Orchestrator | 2026-10-17 | PASS |

## Frontend checks

Independent run after a clean `pnpm install --frozen-lockfile`: lint, format, typecheck clean; **138 tests pass**; `pnpm build` produces both static sites; CI on GitHub green.

| # | Check (short; full text in the contract §5) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| F1 | `pnpm install && pnpm dev` runs both apps; all flows work with `VITE_USE_MOCKS=true` | NFR-OPS-01 | `pnpm dev:mock`; Chrome walk-through: landing, staff login → MFA → facility picker → shell (light/dark) | Orchestrator | 2026-10-17 | PASS |
| F2 | Token values equal design research 02 (spot checks) | NFR-UX-03 | `packages/ui/src/styles/tokens.test.ts`; screenshots reviewed against design 02 | Orchestrator | 2026-10-17 | PASS |
| F3 | No hard-coded strings; language switch; `lang` attribute | NFR-UX-01 | Custom lint rule `medilink/no-literal-jsx-text`; `tests/i18n.test.ts`; `lang="rw"` observed in Chrome | Orchestrator | 2026-10-17 | PASS |
| F4 | Forms: labels, linked errors, focused summary, values kept, paste allowed, `autocomplete` | NFR-UX-03, NFR-UX-07 | Staff and patient form-behaviour tests | Orchestrator | 2026-10-17 | PASS |
| F5 | Keyboard, focus ring, skip link; vitest-axe without violations | NFR-UX-03 | vitest-axe: 0 violations on all key pages; keyboard tests | Orchestrator | 2026-10-17 | PASS |
| F6 | No tokens in browser storage; `dangerouslySetInnerHTML` banned; no third-party scripts; self-hosted fonts | FR-SEC-01 | `tests/security.test.ts`; end-to-end: localStorage and sessionStorage empty after sign-up | Orchestrator | 2026-10-17 | PASS |
| F7 | Patient body 18 px and targets ≥ 48 px; staff body 15 px | NFR-UX-02, NFR-UX-03 | Token tests; computed sizes in Chrome | Orchestrator | 2026-10-17 | PASS |
| F8 | Light and dark themes render; text contrast as measured | NFR-UX-03 | Contrast tests from tokens; staff shell screenshots in both themes | Orchestrator | 2026-10-17 | PASS |
| F9 | API client: credentials, CSRF header, `Accept-Language`, error parsing; unit-tested | NFR-OPS-06 | `packages/api-client/src/client.test.ts` (12) + end-to-end against the real API | Orchestrator | 2026-10-17 | PASS |
| F10 | Static builds; `VITE_API_BASE_URL` configurable at build | NFR-OPS-03 | `pnpm build` → `apps/*/dist`; base URL baked in at build | Orchestrator | 2026-10-17 | PASS |
| F11 | Icons and manifest valid; patient-web installable | NFR-NET-01 | `scripts/check-pwa.mjs` in the build ("PWA check passed"); `pwa.test.ts`. Lighthouse 12+ no longer has the installable audit | Orchestrator | 2026-10-17 | PASS |
| F12 | `ci-frontend.yml` green | NFR-OPS-02 | Green on PR #7 and on `main` | Orchestrator | 2026-10-17 | PASS |

## Integration (real frontend against the real backend, Chrome)

| # | Check | Result |
|---|---|---|
| I1 | Patient sign-up with consent lands on `/home` (201 from the API) | PASS |
| I2 | Patient home shows the patient's name; session survives a reload | PASS |
| I3 | Patient session cookie is HttpOnly on the API host; no staff cookie yet | PASS |
| I4 | No tokens in localStorage or sessionStorage | PASS |
| I5 | Staff: password → TOTP setup with a real code → 10 recovery codes shown once → Today | PASS |
| I6 | Staff and patient sessions coexist as separate cookies | PASS |
| I7 | `staff/auth/me` 200 from the staff app; `patient/auth/me` returns the patient, not the staff user | PASS |
| I8 | Staff logout ends only the staff session (staff 401, patient 200) | PASS |
| I9 | POST without a CSRF token is rejected with `csrf_failed` | PASS |

## Repository-wide checks

| # | Check | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| R1 | `security.yml` (gitleaks, Trivy filesystem and config scan) green on `main` | NFR-OPS-02 | Green on PRs #5–#7 and on `main` (`ff6963a`); `.gitleaks.toml` allowlists only two synthetic test values | Orchestrator | 2026-10-17 | PASS |
| R2 | Dependabot configured for pip, npm, GitHub Actions, Docker | NFR-OPS-02 | `.github/dependabot.yml` inspected | Orchestrator | 2026-10-17 | PASS |
| R3 | CODEOWNERS covers the security-sensitive paths of security 09 §2 | NFR-OPS-08 | `.github/CODEOWNERS` inspected | Orchestrator | 2026-10-17 | PASS |

## Definition of Done

- [x] All acceptance checks verified with evidence
- [x] Traceability matrix statuses updated
- [x] CHANGELOGs and API catalogue updated
- [ ] Deployed to staging and demoed: **no staging environment yet** (hosting provider still open, Q11)

## Notes, waivers and follow-ups

- FR-SEC-06 also covers the staff idle lock with PIN unlock (planned for S1). FR-ACC-05..07 are completed in S2 and FR-ACC-09 in S6. These stay In progress.
- NFR-OPS-07 (feature flags per facility) was not in the Sprint 0 contract and moves to S1.
- Accepted deviations (tracked as GitHub issues):
  - django-otp stores TOTP secrets unencrypted (encrypt with the key store)
  - super admins use TOTP instead of passkeys
  - duplicate-email registration reveals that an account exists (throttled; needs verify-email-first)
  - API messages are English only (rw/fr catalogues)
  - Chrome lacks `rw` date data, so dates fall back to English (needs a translated fallback formatter)
  - long Kinyarwanda labels are truncated in the landing search selects
  - all 328 rw UI strings need native-speaker review
