# Sprint 1 acceptance record: Platform and onboarding

Contract: [sprint-01-platform-onboarding.md](../architecture/contracts/sprint-01-platform-onboarding.md) §9 · Pull requests: backend [#47](https://github.com/B-Pine/medilink-rwanda/pull/47), frontend [#49](https://github.com/B-Pine/medilink-rwanda/pull/49) and [#55](https://github.com/B-Pine/medilink-rwanda/pull/55), integration [#56](https://github.com/B-Pine/medilink-rwanda/pull/56) (all merged) · Releases: none yet
Status: **Open**. Implemented and merged; independent verification and staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)) still to do · How to fill it in: [QA README](README.md) §4

Evidence below points to where each check is covered; the full check text is in the contract. A verifier who did not write the code fills **Verified by**, **Date** and **Result** (QA README §4).

## Backend checks

| # | Check (short) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| S1-B1 | Every §3 endpoint exists with these schemas and is in `/api/v1/schema/` (except `/files/`); `spectacular --validate --fail-on-warn` passes | architecture 02 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B2 | Authorisation matrix (§4): platform endpoints → anonymous `401`, patient `401`, each facility role `403`, platform admin outside the allowlist `403`, platform … | security 04 §5 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B3 | Application state machine: a test over every (status, action) pair allows only §2.3; each transition writes an event with actor and reason; edits outside … | FR-ONB-01, FR-ONB-02 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B4 | Applicant access: cookie flags as in §3.2; resume link emailed, stored hashed, single use, 7-day expiry; resuming replaces the session token; `resume-links` … | FR-ONB-01; API README §6 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B5 | Gates: missing items as dotted `fields`; unscanned uploads `422`; request-changes needs an item; reject needs a reason code; approve creates organisation, … | FR-ONB-01, 02, 08 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B6 | Facility status machine: only §2.3 transitions; reasons required; go-live `422` lists failing checks without a valid MoH licence and passes with one; a check … | FR-ONB-03, FR-ONB-07 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B7 | Licence job with a frozen clock: exactly one 60-day and one 30-day reminder per licence over repeated runs; expiry flagged the next day; renewal supersedes … | FR-ONB-08 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B8 | Upload controls (§2.4): PDF, JPEG, PNG, HEIC accepted by content; SVG, HTML, ZIP, DOCX and HTML renamed `.pdf` refused; > 10 MB refused; UUID key in … | FR-DOC-03; security 06 §4 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B9 | Interfaces: tests use `FakeScanner` and local storage; `ClamdScanner` tested against a fake socket; `S3CompatibleStorage` with botocore's Stubber; `check … | security 06 §4 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B10 | Signed links valid for 5 minutes; expired or tampered → `404`; §2.4 headers present; each issuance audited | FR-DOC-05 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B11 | Reusable interface: a test-only purpose works end to end on `/staff/uploads/` and `/patient/uploads/` (upload, poll, attach, `can_read`, link); unknown … | §3.6 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B12 | Master data: create, update, retire, restore bump `version` and write a change row and an audit entry in one transaction; `DELETE` → `405` and the app role … | FR-ONB-10; S1-D7 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B13 | Seeds and imports: 5 provinces and 30 districts (NISR codes), sectors, cells and villages of Kimironko and Nyarugenge sectors, 11 facility types equal to … | FR-ONB-10 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B14 | Idle lock: locked (not ended) after `LOCK_AFTER`; every staff and platform endpoint → `401 session_locked` except lock state, unlock, logout; ended at the … | FR-SEC-06; security 03 §5 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B15 | PIN: format and simple-PIN rules; Argon2id; setting needs step-up; PIN or password unlock restores the same session for the same user; 5 failures end it; 10 … | FR-SEC-06; security 03 §5 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B16 | Step-up: password + TOTP opens a 5-minute window bound to the session; the login's MFA counts for 5 minutes; otherwise `403 step_up_required` on every action … | FR-SEC-06; security 03 §4 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B17 | Feature flags: catalogue seeded by data migration; overrides per facility; `StaffMe.feature_flags` for the active facility (defaults without one); … | NFR-OPS-07 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B18 | Every §2.7 event is written without personal data; `UPDATE`/`DELETE` refused for the app role on the append-only tables; `uploads_file` RLS forced (context A … | security 04 §4, 05 §6 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B19 | Each §8 notification event sends one email (locmem in tests) through `dispatch()`, with no clinical data | FR-ONB-02 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |
| S1-B20 | Tests in `backend/tests/{masterdata,onboarding,uploads,accounts}/`; coverage ≥ 90 % for the new apps and the new `accounts`/`authz` modules; ruff, mypy, … | security 09 | #47: `backend/tests/{onboarding,masterdata,uploads,accounts}/`; CI green | | | Pending |

## Frontend checks

| # | Check (short) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| S1-F1 | `/for-facilities` follows design 06 §4 and leads to the start form | design 06 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F2 | Wizard: five steps with Stepper; debounced autosave with visible status, `409` handled with a reload notice, retry when offline; resume token exchanged and … | FR-ONB-01; design 05 §3 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F3 | Location pickers cascade from master data; "Use my location" refuses points outside Rwanda | design 10 §3 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F4 | FileUpload: drag and drop, browse, phone camera, progress, scan status with icon and label, per-file server errors, keyboard operable | FR-DOC-03 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F5 | Submit: summary with edit links; server `fields` mapped to steps with a focused ErrorSummary; agreements required | design 05, 10 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F6 | Console overview and pipeline (tabs, chips, server sorting and pagination); DataTable v1 meets design 08 (semantics, `aria-sort`, densities, visible row … | design 04 §3.5, 08 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F7 | Review screen: DocumentViewer (image and PDF, zoom, rotate, pages, download); per-document verdicts; notes Timeline; request-changes, approve and reject … | FR-ONB-02 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F8 | Facilities list and detail: status actions with reasons, history, licences (add, renew, correct), flag switches | FR-ONB-03, 08; NFR-OPS-07 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F9 | Master data: kinds, tables with search and filters, side-panel editor with rw/en/fr, change history, import preview and confirm | FR-ONB-10 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F10 | Lock: warning 60 s before; content hidden at once with unsaved state kept; PIN and password unlock; switch user; manual lock; cross-tab sync; a reload while … | FR-SEC-06; design 04 §2, 05 §3; security 06 §6 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F11 | Step-up: `403 step_up_required` opens the dialog and retries once with the same `Idempotency-Key`; PIN settings work | FR-SEC-06 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F12 | MSW mocks cover every §3 endpoint through `MockContext`; all S1 flows run with `VITE_USE_MOCKS=true` | ADR 0007 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F13 | Namespaces complete in rw/en/fr (parity test); vitest-axe clean on wizard steps, review, facilities, master data and lock screens; both themes; patient-web … | NFR-UX-01, 03; design 10 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |
| S1-F14 | No token in browser storage; signed links fetched on demand and never cached; pdf.js without eval; CI green | security 06 §6 | #49, #55: vitest + vitest-axe in `frontend/apps/staff-web`, `patient-web`, `packages/ui`; CI green | | | Pending |

## Integration checks

| # | Check (short) | Requirements | Evidence | Verified by | Date | Result |
|---|---|---|---|---|---|---|
| S1-I1 | Against the real API: start → resume email → wizard → uploads scanned → submit → request changes → resubmit → approve → facility `approved` → start setup → … | FR-ONB-01..03 | #56: `scripts/s1-integration.sh` against the real API (local, 2026-10-23) | | | Pending |
| S1-I2 | Types generated from the merged OpenAPI schema match the api-client modules; one mock response per endpoint matches the real one | architecture 02 §7 | #56: generated types compared with the api-client modules | | | Pending |
| S1-I3 | Lock with `STAFF_SESSION_LOCK_AFTER=300`: idle → `session_locked` → lock screen → PIN unlock; five wrong PINs → login | FR-SEC-06 | #56: lock with `STAFF_SESSION_LOCK_AFTER=300` against the real API | | | Pending |
| S1-I4 | Staging: ClamAV detects EICAR; S3-compatible storage; DocumentViewer loads a PDF from the files origin (CORS, CORP and CSP sandbox right); an expired link … | security 06 §4 | Needs staging (#17) | | | Blocked |
| S1-I5 | After S3 merges: the `insurance_card` purpose works from patient-web and reception; EXIF stripped; S3's `can_read` enforced | §3.6 | Backend: S3 registers `insurance_card` (#57, card photo tests in `backend/tests/patients/test_more_paths.py`); UI waits for the S3 frontend | | | Pending |
| S1-I6 | After S9 merges: `dispatch()` goes through S9; applicant emails and licence reminders still arrive | §8 | S9 not started (#33) | | | Not started |

## Definition of Done

- [ ] All acceptance checks verified with evidence
- [x] Traceability matrix statuses updated (S1 requirements stay **In progress** until staging exists, QA README §3)
- [x] CHANGELOGs and API catalogue updated
- [ ] Deployed to staging and demoed

## Notes, waivers and follow-ups

- Official NISR sector, cell and village codes: #48 (dev data uses `DEV-` codes).
- `document-templates` master data is not built in S1 (planned with S7).
