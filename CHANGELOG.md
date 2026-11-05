# Changelog

All notable changes to the MediLink Rwanda **documentation and repository** are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This root changelog covers documentation and repository-wide changes (CI, tooling, policies). The two deployables keep their own changelogs and tags ([ADR 0006](docs/decisions/0006-separate-frontend-and-backend-hosting.md)): `backend/CHANGELOG.md` (`backend-vX.Y.Z`) and `frontend/CHANGELOG.md` (`frontend-vX.Y.Z`). Root versions are reference points for the documentation set and are not tagged. How to write entries: [git workflow and releases](docs/development/git-workflow-and-releases.md) §5.

## [Unreleased]

### Added

- Upgrade 17 (`docs/upgrade/17-email-and-google-signin.md`): branded emails in rw/en/fr through Gmail and Sign in with Google for patients, with setup steps; security 03 §1a, the API catalogue and FR-PAT-02 updated.

- W9 (#208): API catalogue rows for the national aggregate report and its CSV export; traceability FR-RPT-05 updated.

- W7 (#206): API catalogue rows for the care schedule and the patient's planned dates; sprint-09 contract event table gains the W7 events; traceability FR-SCH-15, FR-SCH-16, FR-CLN-11 and FR-NOT-07 updated.

- `docs/upgrade/`: the system upgrade specification (product direction U-01…U-12, design system, public site, patient app, staff workspaces, new roles, symptom checker and AI, patients without a phone, audit method, implementation plan).

- Upgrade 12 (`docs/upgrade/12-patient-dashboard.md`): the signed-in patient dashboard under `/dashboard`, its shell, pages, surfaces, safety rules and open backend items; traceability rows FR-PAT-03, FR-SCH-08 and FR-QUE-11 updated.

### Changed

- Upgrade 11: the product owner's public website brief (`docs/upgrade/11-public-website.md`) supersedes 03 for routes, navigation, home, footer and palette; 02 and 03 point to it.
- U-01: no prices in discovery or booking. Sprint 5 contract D-14; FR-BIL-03 and FR-SCH-02 reworded in analysis 05 and 08; the public pages contract and the traceability matrix follow.

### Changed

- Backend CI: mypy is blocking; the coverage gate requires ≥ 95 % for `authz` and ≥ 90 % for `core` and every other app, and reports all apps before failing.
- R1 (#83): docker-compose services and the CI service containers pinned by digest; Dependabot watches `docker-compose.yml`. Security 05 documents the Transit keystore and TOTP keys, security 06 the frontend `style-src` exception and HSTS preload opt-in.
- Per-user agent and MCP configs (`.cursor/`, `.gemini/`, `.codex/`, `.agents/`) and `docker-compose.override.yml` are no longer tracked; `docker-compose.override.example.yml` documents the optional Postgres port override. `CLAUDE.md` and `AGENTS.md` point at the GitHub issue workflow.

### Added

- ADR 0008: public patient-web pages are pre-rendered at build time with a Vite plugin (built in R8, #91). Issues for deferred items: magic-link login (#92), clinical sign-off of the red-flag list (#93), legal go-live items (#94) (#88).
- CI and security gates from the testing strategy and security 09 §3 (#90): Semgrep (`p/django`, `p/python`, `p/owasp-top-ten` and MediLink rules in `.semgrep/medilink.yml`), osv-scanner over the Python and npm lockfiles (fixable CVSS ≥ 7.0), hadolint (`.hadolint.yaml`), Trivy scan of the built API image, CycloneDX SBOMs attached to each `security` run, cosign signing of the SBOMs on `main` once `COSIGN_PRIVATE_KEY` is set, a `migrations` job that reverses and re-applies each app's latest migration, and a Conventional Commit check on pull request titles (`pr-title.yml`). The raw SQL rule only reports until #103, the image scan until #106.
- Acceptance records for Sprint 1 (`docs/qa/sprint-1-acceptance.md`, 40 checks) and Sprint 3 (`docs/qa/sprint-3-acceptance.md`, backend evidence and gaps).

- `scripts/github-setup.sh`: labels `area:patients`, `area:security`, `area:ops`, `area:i18n`, `type:decision`, `wave:1` and `sprint:S1`..`sprint:S11`; milestones are skipped when they already exist, so the script can be re-run.
- Wave 1 sprint contracts: S1 platform and onboarding (65 endpoints, 40 acceptance checks), S3 patients and identity (58 endpoints, 47 checks, Part B after S1), S9 notification engine (37 endpoints + 2 WebSocket routes, 36 checks); reconciled with each other and with the merged anchors. API conventions gain `401 session_locked`; security 03 records the 15-minute lock with a 4-hour session idle limit. Traceability: 34 Wave 1 requirements In progress.
- Second round of integration anchors: audit action registry (`extend_actions()`), throttle, env, dependency, WebSocket route and dev-seed blocks; import marker blocks in frontend registries; shell slots (`headerItems`, `shellOverlays`, `homeCards`); PWA `importScripts` block; extensible frontend permission codes with all 31 Sprint 0 codes; mock role grants mirroring the backend seed (`extendMockRoleGrants()`); Wave 1 ownership rules for Sprint 0 files and `/platform` routes.
- Parallel delivery in waves: wave plan in the roadmap, sprint contracts index and the shared-file protocol (`docs/architecture/contracts/README.md`); integration anchors (marked blocks and feature registries) in backend settings, URLs and permission catalogue, and in the frontend router, navigation, translations, API client, mocks and UI kit.
- Sprint 0 acceptance record filled in with evidence: backend B1–B17, frontend F1–F12, integration I1–I9 (real frontend against the real API in Chrome), repository R1–R3.
- `.gitleaks.toml`: default rules plus two narrow allowlists for synthetic test values (backend log-redaction test, frontend mock passphrase).
- API catalogue v0.1 (`docs/api/`): planned phase-1 endpoints for every module, by sprint (S0–S11) and audience, with permissions, requirement IDs and notes; Sprint 0 endpoints marked Contracted. The generated OpenAPI schema stays the source of truth for implemented endpoints.
- Database design v0.1 (`docs/architecture/04-database-design.md`): phase-1 tables per module with key columns, keys, indexes, row-level security, data classes C0–C4, mutability and retention classes, and ER diagrams.
- Development guides (`docs/development/`): getting started, coding standards, testing strategy, git workflow and releases, translations, environments and deployment.
- Quality assurance (`docs/qa/`): requirements traceability matrix covering all 220 `FR-*`/`NFR-*` IDs, the acceptance evidence process, and the Sprint 0 acceptance record.
- Operations runbook index (`docs/operations/`) for alerts, incident playbooks and continuity.
- Scripts `scripts/check-traceability.py` and `scripts/check-docs-links.py`.
- Repository hygiene: `.github/CODEOWNERS`, Dependabot configuration (pip, npm, GitHub Actions, Docker; weekly, minor and patch grouped), `security.yml` workflow (gitleaks, Trivy filesystem and configuration scans), issue template configuration (no blank issues; vulnerabilities go to `SECURITY.md`), proprietary `LICENSE`.
- This root changelog.

### Changed

- Doc contradictions from the S0–S5 audit resolved (#88). Product decisions of 2026-10-31 written into analysis 05/06 and the S5 contract (D-9..D-12): a late booked patient checks in as a walk-in and a no-show is only marked at closing time; remote "I'm here" is a notice that reception confirms; strike thresholds are platform settings; the P1 red-flag list is a deviation awaiting clinical sign-off. API conventions now describe the built idempotency (key on the created row), WebSocket URLs and flat message format, and the 409/422 split; the database design uses the built table and column names (sessions, memberships, audit log without `patient_id`, facility profile, service points, schedules, tariffs, councils); S4 D-10 records per-facility socket groups; delegate booking rights in the S3 matrix; S9 named "Notification engine (core)" across the roadmap, plus the build order after remediation; ADR 0003 versions, ADR 0004 and 0005 accepted; age, checklist and subscription-grace wording in analysis 02/03; ML phase in the ml README; dated corrections in the Sprint 0 and design v2 QA records.
- S3 contract (R2, #84): §2.2 clinical access and number normalisation rules, PA7/PA23/ST17/ST25 rules, new ST28 access reasons, deviations D-22 to D-25; API catalogue and the FR-SEC-03 traceability row updated.
- Docs aligned with what is merged: the API catalogue S1 and S3 rows are rewritten from the contracts and marked Implemented (#47, #57); S1-built facility status actions are marked in S2; the contract index, the S1 and S3 contract headers and the docs README show the real status; the database design §5.5 describes the S3 schema as built (table names, functions, owner read policy, append-only triggers); S3 contract §10 records deviations D-16 to D-20; the backend README covers the S1/S3 apps, patient keys and sprint seeders.
- Getting started reconciled with the shipped code (Python 3.14, hash-pinned install, `pnpm dev:mock`, Swagger UI, uvicorn for WebSockets); links to the backend and frontend READMEs and changelogs.
- Traceability matrix: 16 Sprint 0 requirements Verified, summary gains a Verified column; NFR-UX-03 title says WCAG 2.2; NFR-OPS-07 (feature flags) moved to S1.
- API catalogue: the 16 Sprint 0 endpoints are Implemented (`backend-v0.1.0`).
- `scripts/check-traceability.py` accepts statuses annotated with sprint and version, as the QA README describes.
- `docs/README.md`, `docs/architecture/README.md`, root `README.md` and `CONTRIBUTING.md` link the new documentation; CONTRIBUTING states the changelog rule; the pull request template asks for changelog, API catalogue and traceability updates.

### Fixed

- Documentation brought in line with the Sprint 0 code and the Wave 1 contracts:
  - API README §4 lists the 31 permission codes Sprint 0 actually seeded, plus the codes contracted by S3 and S9; the catalogue uses the seeded names (`patient.register`, `records.import`) and drops † from seeded codes
  - API catalogue: S1, S3 and S9 marked Contracted; PIN unlock and feature flags moved out of "Not yet scheduled"
  - row-level security setting named `app.user_id` (as in the code) in the database design and security 04; `app.audience` marked as the open proposal D2
  - database design notes the S1 table names (`onboarding_*`, `uploads_file`), `core_idempotency_key` moved to S4, `core_feature_flag` replaced, D1 decided
  - status lines in `README.md` and `docs/README.md` say Sprint 0 is done and Wave 1 is next
  - S10 explained as two parts (Wave 2 and Wave 6) in the roadmaps
  - bug report template lists phase-1 channels; CODEOWNERS notes that `/infra/` is for future infrastructure code
- Documentation inconsistencies found during review:
  - permission matrix: the receptionist requests merges and raises counter disputes, and the facility admin approves merges
  - NFR-UX-03 now says WCAG 2.2 AA
  - security docs now use the audience cookie names, `/api/v1` prefixes, API-only `ALLOWED_HOSTS` and the master data write rule
  - ADR 0003 has a version update note
  - roadmap sprint placement: break-glass in S6, PIN lock in S1, the Expected list and remote join in S5

## [0.5.0] - 2026-10-17

Architecture, contracts and roadmaps; backend and frontend separated ([#4](https://github.com/B-Pine/medilink-rwanda/pull/4)).

### Added

- Architecture v0.1: system architecture (components, repository layout, backend technology, local development, environments), API conventions, and the Sprint 0 contract with backend checks B1–B17 and frontend checks F1–F12.
- Roadmaps v0.1: contract-first sprint process, Definition of Done, backend and frontend sprint plans S0–S11 for M1, and M2–M4 summaries.
- ADR 0006: frontend and backend developed, versioned and hosted separately (audience-scoped session cookies, CORS allowlist, CSRF token endpoint, WebSocket origin checks).
- ADR 0007: frontend toolchain (pnpm, React 19, Vite, Tailwind v4 tokens, Radix, TanStack Query, MSW, i18next, Vitest, Playwright).
- `.gitattributes` normalising line endings to LF.

### Changed

- Repository layout: `services/api/` moved to `backend/`, `apps/` moved to `frontend/apps/`; README, ADR 0003, analysis 11 and 16, and security 02 and 09 updated for the new layout.
- Commit scopes and GitHub labels: `api` replaced by `backend` and `frontend`; scopes `ui` and `brand` added.

## [0.4.0] - 2026-10-17

Brand assets ([#3](https://github.com/B-Pine/medilink-rwanda/pull/3)).

### Added

- `brand/` structure with naming rules, the generation prompts, and the first generated logo concepts and app icons (source PNGs).

### Changed

- `.gitignore`: raw brand video exports stay out of git.

## [0.3.0] - 2026-10-17

Security analysis and implementation guide v0.1 ([#2](https://github.com/B-Pine/medilink-rwanda/pull/2)).

### Added

- Security documentation v0.1 (`docs/security/`): threat model (STRIDE, LINDDUN, abuse cases), security architecture and data residency, identity and sessions (NIST 800-63B-4), authorisation and PostgreSQL row-level security, data protection and cryptography, application and API security (OWASP Top 10:2025, API Top 10:2023), infrastructure, logging and detection, secure development lifecycle, incident response with the 48-hour breach clock, people and process, compliance mapping, AI security, go-live checklist and sources.
- Security section in the pull request template.

### Changed

- `SECURITY.md` and analysis 12 link the security documentation.
- ADR 0003: version note recommending Django 6.x for built-in CSP.
- Design research 06: hero video allowed on wide screens with a poster fallback.

## [0.2.0] - 2026-10-17

UI/UX design research v0.1 ([#1](https://github.com/B-Pine/medilink-rwanda/pull/1)).

### Added

- Design research v0.1 (`docs/design/research/`): design direction, emerald colour system with measured contrast, typography, icons and layout, dashboards, authentication, homepage and public pages, patient app pages, tables, documents, accessibility and localisation, sources.

## [0.1.0] - 2026-10-17

System analysis v0.2, stack and channel decisions.

### Added

- System analysis v0.2 (`docs/analysis/` 00–17 and glossary), replacing the 21 requirements of v0.1 with module documents and requirement IDs per phase; `docs/requirements.md` as the index.
- ADRs 0001–0005: monorepo and stack, web first with paid channels later, Django + React + PostgreSQL, visit-centric domain model, ML symptom checker inside clinician-signed safety rules.
- Repository basics: README, CONTRIBUTING, SECURITY, issue and pull request templates, `.editorconfig`, `.gitignore`, app and ML placeholders, and `scripts/github-setup.sh` (labels and milestones M1–M4).

[Unreleased]: https://github.com/B-Pine/medilink-rwanda/compare/2e2b93c...main
[0.5.0]: https://github.com/B-Pine/medilink-rwanda/commit/2e2b93c
[0.4.0]: https://github.com/B-Pine/medilink-rwanda/commit/098e6d7
[0.3.0]: https://github.com/B-Pine/medilink-rwanda/commit/4be2be1
[0.2.0]: https://github.com/B-Pine/medilink-rwanda/commit/d7a859c
[0.1.0]: https://github.com/B-Pine/medilink-rwanda/commit/201c34e
