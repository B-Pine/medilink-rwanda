# Sprint 10 contract, part 2b: Reports, audit log and my data

Status: v0.1 · 2026-11-02 · Wave 6 · Template: [contracts README](README.md) · Part 2a: [disputes](sprint-10b-disputes.md)

**Goal:** facility admins see a period at a glance (visits, waits, bookings, doctors, money, disputes) and export it. Facilities and the platform read the audit log. The platform sees adoption and quality across facilities. Patients download all their data.

Requirements: FR-RPT-01, 03, 04, 05; FR-SEC-07 (audit viewer); FR-SEC-12 (access and portability). The live operations board (FR-RPT-02) already exists (`/staff/reports/operations/`, S4).

## 1. Scope

| In | Out (later) |
|---|---|
| Facility period report, up to 92 days, from event timestamps and money columns (analysis 13 §1) | Excel and PDF export, async exports with watermarks (CSV first, D-2) |
| CSV export: step-up, audited, CSV-injection safe | Weekly unusual-access review (security 08 §4) and its sign-off |
| Facility audit log (`audit.view`) and the platform's whole log | Audit-log RLS (decision D2 stays open; the facility filter is applied in the view) |
| Platform figures per facility: visits, bookings, disputes, escalations | Account closure and retention jobs (FR-SEC-13, S11) |
| Patient data export (JSON) after the password | |

## 2. Rules

- Reports hold counts and sums only. Patient names never appear. Doctor names appear in the doctor rows, as facility admins already see in staff management.
- Wait is measured from check-in to the first call (S4 `_day_figures`). A booked count excludes `superseded` bookings.
- A CSV cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with `'` (OWASP CSV injection). Numbers stay numbers.
- The platform figures come from the SECURITY DEFINER function `reports_platform_figures(from, to)`, which returns one aggregate row per facility.
- The data export reuses each module's patient loaders: records (no private notes), prescriptions, bills, documents (metadata only) and disputes (no internal notes). The patient confirms with their password (D-3).

## 3. Endpoints

| # | Method and path | Permission | Notes |
|---|---|---|---|
| R1 | `GET /staff/reports/period/?from=&to=` | `reports.view` | 400 when the period exceeds 92 days or the order is wrong |
| R2 | `GET /staff/reports/period/export/` | `reports.view` + step-up | `text/csv`; audit `reports.exported` |
| A1 | `GET /staff/audit-entries/?action=&actor_id=&object_id=&from=&to=` | `audit.view` | `action` ending in `.` is a prefix; newest first |
| A2 | `GET /platform/audit-entries/` (+ `facility_id`) | platform admin | |
| PR1 | `GET /platform/reports/?from=&to=` | platform admin | Totals: live and active facilities, visits, bookings, disputes per 1,000 visits, escalation rate |
| DX1 | `POST /patient/data-export/` `{current_password}` | patient | JSON attachment; 400 on a wrong password; audit `reports.patient_data_exported` (counts only) |

## 4. Frontend

| App | Route | Screen |
|---|---|---|
| staff-web | `/reports/period` | Period picker, four headline tiles, wait trend, money, bookings, doctors and disputes tables, Export CSV |
| staff-web | `/audit`, `/platform/audit` | Audit table filtered by action |
| staff-web | `/platform/reports` | Network tiles and per-facility table |
| patient-web | Settings → My data | Password, then download |

## 5. Acceptance checks

| # | Check |
|---|---|
| S10c-B1 | R1 figures, no patient names, 92-day limit, `403` without `reports.view` |
| S10c-B2 | R2 needs step-up, is audited and formula-safe |
| S10c-B3 | A1 shows only the active facility's entries; prefix filter |
| S10c-B4 | PR1 and A2 for platform admins |
| S10c-B5 | DX1: wrong password `400`; the export has the account, prescriptions and no private notes |
| S10c-F1..F4 | Screens above, axe clean; mocks for every endpoint; rw/en/fr |

## 6. Decisions

| # | Decision | Why |
|---|---|---|
| D-1 | The period report is one endpoint (R1), not the catalogue's seven | One page shows them together; one query pass per period |
| D-2 | Export is CSV only, synchronous | Spreadsheets open it; Excel/PDF and watermarks come with async exports |
| D-3 | The patient export is confirmed with the password, not a step-up session | Patients have no step-up flow; delegations already confirm this way |
| D-4 | The period report sits at `/reports/period`; `/reports` stays the live operations board | Both are reports; the board is the daily view |
