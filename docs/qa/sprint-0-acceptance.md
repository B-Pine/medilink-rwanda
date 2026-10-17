# Sprint 0 acceptance record: Foundations

Contract: [03 · Sprint 0 contract](../architecture/03-sprint-0-contract.md) · Releases: `backend-v0.1.0`, `frontend-v0.1.0` (planned)
Status: **Open** · How to fill it in: [QA README](README.md) §4

Sprint 0 requirements (backend roadmap): FR-ACC-01..09, FR-SEC-01/02/04/05/06/07, NFR-OPS-01..08; the contract also cites FR-PAT-02 and NFR-UX-01. Their status is **In progress** in the [traceability matrix](traceability-matrix.md).

## Backend checks

| # | Check (short; full text in the contract §3) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| B1 | Clean clone runs on Windows and Linux (compose, migrate, `seed_dev`, runserver) | NFR-OPS-03 | | | | Pending |
| B2 | Every contract endpoint exists, matches the schema, is in `/api/v1/schema/` | NFR-OPS-06 | | | | Pending |
| B3 | DRF default permission denies; test fails for a view without an explicit permission | FR-SEC-01, FR-ACC-08 | | | | Pending |
| B4 | Staff and patient endpoints and cookies are separate | FR-SEC-01 | | | | Pending |
| B5 | No authenticated staff session without confirmed MFA | FR-ACC-04, FR-SEC-06 | | | | Pending |
| B6 | Argon2id; patient ≥ 15, staff ≥ 12; breached list; no composition rules | FR-SEC-06 | | | | Pending |
| B7 | Login throttling, generic errors, password reset always `202` | FR-SEC-06 | | | | Pending |
| B8 | Session rotates on login, MFA success, facility switch | FR-SEC-06, FR-ACC-02 | | | | Pending |
| B9 | CORS allowlist and CSRF trusted origins from env; CSRF enforced | FR-SEC-01 | | | | Pending |
| B10 | RLS helper + context; no context → zero rows; A never sees B; `WITH CHECK` blocks | FR-SEC-02 | | | | Pending |
| B11 | Audit log append-only; hash chain verified by a test and `verify_audit_chain` | FR-SEC-07 | | | | Pending |
| B12 | Error format and codes; 404 for other-facility objects | FR-SEC-01, NFR-UX-07 | | | | Pending |
| B13 | `check --deploy` clean on prod settings; CSP configured | NFR-OPS-02 | | | | Pending |
| B14 | Celery JSON-only; Channels ASGI with origin validation | NFR-OPS-03 | | | | Pending |
| B15 | No personal data or secrets in logs; `.env.example` complete | NFR-OPS-05 | | | | Pending |
| B16 | `ci-backend.yml`: ruff, mypy, pytest with Postgres, `check --deploy`, pip-audit | NFR-OPS-02 | | | | Pending |
| B17 | Coverage of `accounts`, `authz`, `tenancy`, `audit` ≥ 90 % | NFR-OPS-01 | | | | Pending |

## Frontend checks

| # | Check (short; full text in the contract §5) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| F1 | `pnpm install && pnpm dev` runs both apps; all flows work with `VITE_USE_MOCKS=true` | NFR-OPS-01 | | | | Pending |
| F2 | Token values equal design research 02 (spot checks) | NFR-UX-03 | | | | Pending |
| F3 | No hard-coded strings; language switch; `lang` attribute | NFR-UX-01 | | | | Pending |
| F4 | Forms: labels, linked errors, focused summary, values kept, paste allowed, `autocomplete` | NFR-UX-03, NFR-UX-07 | | | | Pending |
| F5 | Keyboard, focus ring, skip link; vitest-axe without violations | NFR-UX-03 | | | | Pending |
| F6 | No tokens in browser storage; `dangerouslySetInnerHTML` banned; no third-party scripts; self-hosted fonts | FR-SEC-01 | | | | Pending |
| F7 | Patient body 18 px and targets ≥ 48 px; staff body 15 px | NFR-UX-02, NFR-UX-03 | | | | Pending |
| F8 | Light and dark themes render; text contrast as measured | NFR-UX-03 | | | | Pending |
| F9 | API client: credentials, CSRF header, `Accept-Language`, error parsing; unit-tested | NFR-OPS-06 | | | | Pending |
| F10 | Static builds; `VITE_API_BASE_URL` configurable at build | NFR-OPS-03 | | | | Pending |
| F11 | Icons and manifest valid; patient-web installable | NFR-NET-01 | | | | Pending |
| F12 | `ci-frontend.yml` green | NFR-OPS-02 | | | | Pending |

## Repository-wide checks (this documentation pull request)

| # | Check | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| R1 | `security.yml` (gitleaks, Trivy filesystem and config scan) green on `main` | NFR-OPS-02 | | | | Pending |
| R2 | Dependabot configured for pip, npm, GitHub Actions, Docker | NFR-OPS-02 | | | | Pending |
| R3 | CODEOWNERS covers the security-sensitive paths of security 09 §2 | NFR-OPS-08 | | | | Pending |

## Definition of Done

- [ ] All acceptance checks verified with evidence
- [ ] Traceability matrix statuses updated
- [ ] CHANGELOGs and API catalogue updated
- [ ] Deployed to staging and demoed

## Notes, waivers and follow-ups

- FR-SEC-06 also covers the staff idle lock with PIN unlock, which the Sprint 0 contract doesn't include; FR-ACC-05..07 and FR-ACC-09 are completed in S2 and S6. These requirements stay In progress after Sprint 0.
