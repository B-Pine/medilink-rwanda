# 09 · Audit method

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md)

The audit checks the **built system** against this folder and against professional standards, and produces a list of findings that drive the cleaning and implementation work. It is run once before the upgrade starts and again before each release. Each run writes one report in [audit/](audit/), named `YYYY-MM-DD-audit.md`.

## 1. What is audited

| Area | Scope |
|---|---|
| A · Product fit | Every screen and endpoint against the decisions of [01](01-product-direction.md) and the screen specs of [03](03-public-site.md)–[08](08-patients-without-phone.md) |
| B · Design and copy | Every screen against [02](02-design-system.md): tokens, components, layout, words, the "never do" list |
| C · Accessibility | WCAG 2.2 AA gates of [02](02-design-system.md) §7 |
| D · Code quality | Backend and frontend against the [coding standards](../development/coding-standards.md): structure, naming, duplication, dead code, tests |
| E · Security and privacy | Against [docs/security](../security/README.md) and the [go-live checklist](../security/14-go-live-security-checklist.md) |
| F · Data and API | Against the [database design](../architecture/04-database-design.md), the [API conventions](../architecture/02-api-conventions.md) and the contracts |
| G · Documentation | Status lines, catalogue, traceability matrix and changelogs against the code |
| H · Performance | The budgets of [02](02-design-system.md) §7 and [analysis 14](../analysis/14-non-functional-requirements.md) |

## 2. How each area is checked

| Area | Method | Evidence |
|---|---|---|
| A | Walk every route in both apps on the mocks and against the local API; compare with the spec tables | Route list with Match · Partial · Missing · Contradicts |
| B | Read the feature code and locale files; screenshots at 360 px and 1366 px in both themes | Findings with file and line, screenshot path |
| C | `vitest-axe` results, keyboard pass, 200 % zoom, 320 px reflow, contrast from tokens | Tool output, notes |
| D | `ruff`, `mypy`, ESLint, TypeScript, test suites and coverage; reading for duplication and dead code | Command output, file and line |
| E | CI security gates; review of permission classes, scoped querysets, RLS coverage, serializers; go-live checklist status | Gate output, findings |
| F | OpenAPI drift; endpoints vs contracts; RLS exceptions | Diff and list |
| G | `scripts/check-traceability.py`, `scripts/check-docs-links.py`; status lines vs merged work | Script output, list of stale lines |
| H | Bundle sizes from the builds; Lighthouse on the public pages with 3G throttling | Numbers per page |

## 3. Severity

| Severity | Meaning | Example |
|---|---|---|
| **S1 · Blocker** | Unsafe, illegal, data leak, or a core flow that does not work | Health data sent outside Rwanda; patient sees another patient's record; check-in fails |
| **S2 · Major** | Contradicts an upgrade decision or a requirement, or breaks a standard users will notice | Prices shown in discovery; screen fails WCAG; role sees data it must not |
| **S3 · Minor** | Off the design or copy standard, inconsistent, or untidy code | Long explanatory text; icon without label on a patient screen; duplicated helper |
| **S4 · Note** | Improvement or documentation drift | Stale status line; missing test for an edge case |

## 4. Report format

Each finding has: ID (`AUD-<area>-<n>`), area, severity, where (route, file and line), what is wrong, the rule or document it breaks, and the proposed fix. The report ends with a summary table by area and severity and the ordered list of work for cleaning ([10](10-implementation-plan.md) §2).

## 5. Rules

- The audit **does not change code**. It only records findings.
- Findings refer to the current `main` plus open pull requests that are about to merge, named in the report.
- Every S1 finding becomes a GitHub issue the same day.
- A finding is closed only by a pull request that fixes it and states the finding ID.
