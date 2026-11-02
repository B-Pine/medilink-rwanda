# 10 · Implementation plan

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md)

## 1. Phases

| Phase | Name | Scope | Exit gate |
|---|---|---|---|
| U0 | Docs and audit | This folder; first audit report in [audit/](audit/) | Report reviewed by the product owner; S1 findings filed as issues |
| U1 | **Clean** | Fix built but off-standard work: copy (short labels), design-system violations, accessibility failures, stale docs, untidy or duplicated code, S1/S2 security findings | No open S1; S2 design and copy findings closed; suites green |
| U2 | Discovery and public site | U-01 no prices; U-04 home with list and map; U-05 facility page tabs and "Bring"; U-06 doctor pages; find care filters; emergency 24h row | [03](03-public-site.md) screens match; API changes in the S5 contract; pre-render checks pass |
| U3 | Patient app | U-07 personal layer on the public site; profile switcher; Home states; Health tab; intake forms; earlier-time alert; vaccination and antenatal reminders | [04](04-patient-app.md) screens match |
| U4 | Patients without a phone | Ticket slip check, spoken call, contact person, appointment card, label pictograms | [08](08-patients-without-phone.md) table all built |
| U5 | New roles | Triage nurse and triage stage; laboratory technician (lite) and lab queue; cashier | [06](06-new-roles.md) P1 roles with authorisation matrix tests |
| U6 | Symptom checker | Free-text input, danger-word check, parsing (after OD-2), doctor-only likely conditions, shadow-mode model | [07](07-symptom-checker-and-ai.md) §2 flow; parsing accuracy gate |
| U7 | Unfinished M1 work | S8 billing screens, S10b disputes screens, S10 part 2b reports/exports/audit viewer/data rights/retention, S6b legacy import, audit-log RLS | Contracts' acceptance checks evidenced |

U7 items can run in parallel with U2–U6 when they touch different modules.

**Change 2026-11-02.** U0's audit and U1 as a separate phase are dropped for this round (see the [README](README.md#status-of-the-upgrade)). Work starts with U2 (public site) and the staff dashboards of [05](05-staff-workspaces.md) §5–6; each change cleans what it touches. Tests for upgraded screens follow in a separate pass once the screens are settled.

## 2. Order inside U1 (cleaning)

1. Security and privacy findings (S1, then S2).
2. Broken or misleading flows.
3. Copy: shorten every locale string that is a sentence where a label is enough; remove intro paragraphs; one disclaimer only where required.
4. Design: replace ad-hoc styles with `packages/ui` components; remove borders around cards, cards inside cards, decorative icons and illustrations inside the product; one primary button per view.
5. Accessibility fixes.
6. Code: dead code, duplicated helpers, inconsistent names, missing tests for rules.
7. Documentation drift (status lines, catalogue, matrix, changelogs).

Each step is one or more small pull requests, not one large one.

## 3. Older documents to update when a decision is implemented

| Decision | Documents |
|---|---|
| U-01 no prices | [analysis 05](../analysis/05-discovery-scheduling-and-booking.md) §1, §4; [analysis 08](../analysis/08-billing-payments-and-insurance.md) §1.3, FR-BIL-03; [S5 contract](../architecture/contracts/sprint-05-booking.md) §2.2, §3; [public pages contract](../architecture/contracts/public-pages-and-triage.md); [API catalogue](../api/catalogue.md) S5; [design 06](../design/research/06-homepage-and-public-pages.md) |
| U-02, U-03 free text and AI | [analysis 11](../analysis/11-ai-symptom-checker.md) §4, §8, FR-AI-13; [ADR 0005](../decisions/0005-symptom-checker-ml-with-safety-rules.md) note; public pages contract §2.2; [security 13](../security/13-ai-security.md) |
| U-04, U-05, U-06 public site | [design 06](../design/research/06-homepage-and-public-pages.md) §3–4; analysis 05 FR-SCH-19, FR-SCH-20, FR-SCH-22; S5 contract |
| U-07 patient app | [design 07](../design/research/07-patient-app-pages.md) §2–3 |
| U-08 no-phone patients | [analysis 06](../analysis/06-visit-lifecycle-and-queue.md) FR-QUE-21; [analysis 04](../analysis/04-patient-identity-and-medical-history.md) FR-PAT-18; [analysis 07](../analysis/07-clinical-documentation-and-pharmacy.md) FR-DOC-08; S4 contract |
| U-09 new roles | [analysis 02](../analysis/02-users-roles-and-permissions.md) §2, §3, FR-ACC-10, FR-ACC-11; analysis 06 FR-QUE-22; analysis 07 FR-CLN-11; [API README](../api/README.md) §4 |
| U-10 additions | analysis 05 FR-SCH-16, FR-SCH-17, FR-SCH-18, FR-SCH-21 |
| U-11, U-12 design and copy | [`.interface-design/system.md`](../../.interface-design/system.md); design research 01–03 |

Every update also changes the [traceability matrix](../qa/traceability-matrix.md), the [requirements index](../requirements.md) when IDs are added, and the root `CHANGELOG.md`.

## 4. Contracts

New or changed endpoints go through a contract amendment (a new `D-n` decision in the sprint contract, or a new contract for a new area) **before** code, as the [contracts README](../architecture/contracts/README.md) requires. Planned contracts:

| Contract | Covers |
|---|---|
| `upgrade-u2-discovery.md` | Listing fields without prices, map data, doctor profile and availability, facility details, intake forms |
| `upgrade-u3-patient-layer.md` | Home items endpoint, earlier-time alert, reminders |
| `upgrade-u4-no-phone.md` | Contact person, appointment card, spoken call settings |
| `upgrade-u5-roles.md` | Triage and lab stages, role seeds, permission codes |
| `upgrade-u6-triage-text.md` | Free-text triage, doctor-only likely conditions |

## 5. Definition of done (each change)

- [ ] Matches the spec in this folder, or the difference is recorded as a decision
- [ ] Follows [02](02-design-system.md): components, words, accessibility gates
- [ ] Tests: unit, authorisation matrix for new endpoints, component tests with axe, e2e for the main flow
- [ ] Older documents updated per §3; traceability matrix, catalogue and changelogs updated
- [ ] Kinyarwanda strings added as drafts for native review
- [ ] CI green; squash-merged through a pull request that names the issue and finding IDs
