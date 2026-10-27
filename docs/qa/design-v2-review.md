# Design v2 · review record

Issue #75 · PR #76 · branch `feat/design-v2`

This record lists what design v2 changed, which document asked for it, and how each part was checked. Anything the documents plan but that waits for a later sprint is listed under "Not in this change". Nothing on these screens shows numbers or features that don't exist yet.

## What changed and where it is specified

| Area | What was built | Specified in |
|---|---|---|
| Chart kit (`packages/ui` `Charts.tsx`) | Sparkline, StatTile (value, unit, week-on-week delta, honest note), TrendChart, HeatMap, LoadMeter. Each chart has a screen-reader table, and chart titles are headings. | design 02 §6 (chart palette, sequential emerald), design 04 §3.4, design 10 |
| Operations figures (backend) | `GET /api/v1/staff/reports/operations/` (`reports.view`): today, same day last week, 14-day trend, live load per service, 28-day arrivals heat map, unreviewed queue moves. Aggregates only, no names. | analysis 13 §1-2 (metric definitions), design 04 §3.4 |
| Staff · Today (facility admin) | "Operations today": 4 KPI tiles, queue load by service, needs your attention. No-show and revenue tiles say when they will be measured. | design 04 §3.4 |
| Staff · Reports | 14-day patients and wait trends (median and 9-in-10), arrivals heat map, figure cards | design 04 §3.4, analysis 13 §1 |
| Staff · Platform overview | Applications pipeline (Submitted, Under review, Changes requested, Approved) and facilities by district. Backend adds `applications.approved` and `facilities_by_district`. | design 04 §3.5 |
| Patient · app shell | Home / Find care / My visits / Help: a bottom bar on phones and a top bar from tablet width. The header has the profile switcher, notification items, language and an account menu. Also an offline banner. | design 07 §2, §4 |
| Patient · Home | The live tracker is on top when a visit is active. Otherwise Find care comes first (with "Not sure? Describe your symptoms"), then the next visit, family and shortcuts. The emergency notice stays on the page. | design 07 §3.1, design 06 H7 |
| Patient · Find care | How to visit today (walk-in steps). Booking and symptom help are marked "Coming soon". | design 07 §3.2, roadmap S5 and P2 |
| Patient · My visits | Today's tickets, plus an empty history state with a next step | design 07 §3.4, §4 |
| Patient · Help | Emergency notice first, common questions, "ask at reception", legal pages. "Report a problem" is marked "Coming soon". | design 07 §3.5, roadmap S10 |
| Patient · Settings | Language, text size (Normal / Large / Extra large; scales the whole page) and theme. Each choice is kept on the device. | design 07 §1, §3.5 |
| Public home | Hero illustration (flat two-tone emerald, one amber accent, inline SVG, desktop only) | design 06 §3, §5, H4 |

## How it was checked

| Check | Result |
|---|---|
| Unit and accessibility tests (vitest + axe): ui, staff-web, patient-web, api-client, workspace | Pass |
| New tests: operations card and reports page, receptionists don't see them; patient shell, home, settings text size, find care, my visits, help; platform pipeline and district list | Pass |
| Backend: `tests/s4/test_more_paths.py::test_operations_dashboard_figures`, onboarding overview and approval tests | Pass |
| ESLint, Prettier, TypeScript; ruff, mypy; OpenAPI regenerated with `--fail-on-warn` | Pass |
| Browser, local API with seeded data (desktop width): staff `/today`, `/reports`, `/platform`; patient `/`, `/home`, `/find-care`, `/visits`, `/support`, `/settings` (Extra large applied and reset), `/family`, `/profile` | Pass after fixes. Fixed: blank heat map cells (CSS variables), fractional axis ticks, "1 doctors", header nav labels wrapping and overlapping |
| Browser at phone width | Not checked visually: the browser window could not be resized. The bottom bar is covered by the shell tests. To do on a real phone. |

## Not in this change

- **Nearby facilities on the public home (design 06 §3):** this needs the facility directory and search from S5.
- **Booking flow, facility search results and profiles:** these come in S5.
- **Visit history, summaries, medicines and documents in My visits:** these come in S6 and S7.
- **Platform health and escalated disputes on the platform overview (design 04 §3.5):** these come in S9 and S10.
- **Native Kinyarwanda review of the new strings:** all of them are listed in `frontend/i18n-review.md`.
