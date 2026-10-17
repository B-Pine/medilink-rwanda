# Coding standards

Status: v0.1 · Applies to `backend/` and `frontend/`. Tooling enforces most of this (ruff, mypy, ESLint, Prettier, Semgrep); this page explains the rules the tools can't fully check. Security rules come from [security 06](../security/06-application-and-api-security.md) and [security 09](../security/09-secure-development-lifecycle.md).

## 1. General

- Code, identifiers, comments, commits and docs are in **English**. User-facing text goes through translation files ([translations](translations.md)).
- Prefer simple, explicit code over clever code. Small functions, clear names, no dead code, no commented-out code.
- Comments explain **why**, not what. Reference requirement IDs where a rule comes from the analysis: `# FR-QUE-06: grace window −30/+15 min`.
- Never commit secrets, real patient data or production dumps ([SECURITY.md](../../SECURITY.md)). Test data is generated.
- Every behaviour change updates the docs it contradicts, the relevant `CHANGELOG.md`, and the [API catalogue](../api/catalogue.md) when endpoints change.

## 2. Naming across the stack

| Thing | Convention | Example |
|---|---|---|
| URL path segments | Plural nouns, kebab-case, trailing slash | `/api/v1/staff/service-points/` |
| Actions | `POST` sub-resource, kebab-case verb | `/api/v1/staff/tickets/{id}/call/` |
| JSON fields, query parameters | `snake_case` | `amount_rwf`, `is_bookable`, `?page_size=50` |
| Enum values | lowercase `snake_case` | `"in_consultation"` |
| Error codes | lowercase `snake_case`, stable | `business_rule_violation` |
| Permission codes | `<area>.<action>` | `queue.operate`, `billing.approve` |
| Audit events | `<object>.<action>[.<result>]`, past tense or result | `auth.login.failure`, `staff.facility.switched` |
| Domain events | `<Object><Verb>` in code, `object.verb` on the wire | `TicketCalled` / `ticket.called` |
| Database tables | `<app>_<entity>` | `visits_ticket_event` |
| Money | Integer RWF, `_rwf` suffix | `patient_share_rwf` |
| Flags | `is_` / `has_` prefix | `is_restricted` |
| Timestamps / dates | `_at` (UTC `timestamptz`) / `_on` or `_date` (`date`) | `signed_at`, `due_on`, `service_date` |

## 3. Python and Django (`backend/`)

### 3.1 Tooling

- Python 3.12+ with type hints on all public functions. `mypy` with `django-stubs` (strict on new modules).
- `ruff check` (including the bandit `S` rules) and `ruff format`. Configuration lives in `backend/pyproject.toml`.
- Dependencies: `pip-tools` with hash-pinned `requirements/*.txt`. A new dependency needs the checklist in [security 09](../security/09-secure-development-lifecycle.md) §3 in the pull request.

### 3.2 Folder structure per module

Each domain module is one Django app under `backend/medilink/` ([architecture 01](../architecture/01-system-architecture.md) §2):

```
backend/medilink/<module>/
  models.py            tables: db_table set, constraints, field data classes
  managers.py          scoped querysets: for_facility(...), for_account(...)
  policies.py          authorisation policies, registered with medilink.authz
  services.py          write operations and business rules (transactions, events, audit)
  selectors.py         read queries used by views (always scoped)
  events.py            domain events, published through the outbox
  tasks.py             Celery tasks
  api/
    serializers.py     one serializer per role and purpose, explicit fields
    views.py           thin views: authorise → service/selector → serialise
    urls.py            routes, grouped by audience (staff, patient, platform, public)
  admin.py             Django admin (engineers only)
  migrations/
backend/tests/<module>/  pytest tests for the module
```

### 3.3 Models and database

- Follow the [database design](../architecture/04-database-design.md) conventions: UUIDv7 `id`, `created_at`/`updated_at`, `version` on mutable models, `facility` FK on facility-owned models, money as `BigIntegerField` in RWF, `TextChoices` + `CheckConstraint` for enums, `on_delete=PROTECT` by default.
- **Every new facility-owned table gets RLS in its migration** (the Sprint 0 helper operation) and a test that proves it ([testing strategy](testing-strategy.md) §3.3).
- Declare each field's data class (C0–C4). C4 fields and the national ID use the encrypted field type.
- Migrations are reviewed and reversible. Never edit a migration that has run on staging. Use `CREATE INDEX CONCURRENTLY` (non-atomic migration) for large tables.
- No raw SQL in application code. Where it is unavoidable (RLS helpers, `SKIP LOCKED`), parameterise it and mark it for security review.

### 3.4 Views, serializers and authorisation

- Every view declares its permission policy explicitly; the global default **denies** ([security 04](../security/04-authorization-and-tenant-isolation.md) §2). Call `authorize(user, "<action>", obj)` from the policy layer, never ad-hoc `if user.role == …` checks.
- Querysets always start from a scoped manager: `Visit.objects.for_facility(request.facility)`. `.objects.all()` in views is blocked by a Semgrep rule. Look objects up through the scope, so another facility's ID returns **404**.
- Serializers list fields explicitly (never `fields = "__all__"`), one per role where output differs (`VisitReceptionSerializer`, `VisitClinicalSerializer`). Reject unknown input fields.
- The server sets `facility_id`, `created_by`, prices, totals, shares and statuses. Client values for these are ignored.
- Endpoints live under exactly one audience (`/staff/`, `/patient/`, `/platform/`, `/public/`). Patient and staff never share an endpoint.
- Actions with side effects accept `Idempotency-Key`; mutable resources check `version` ([API conventions](../architecture/02-api-conventions.md) §5).

### 3.5 Business logic and transactions

- Business rules live in `services.py`, not in views, serializers or model `save()` methods. A service function is named for the action: `check_in_visit()`, `call_next_ticket()`, `record_payment()`.
- One request = one transaction (`ATOMIC_REQUESTS` or `transaction.atomic()`), which is also what makes the RLS context transaction-local.
- Concurrency-sensitive actions lock rows: `select_for_update(skip_locked=True)` for call next, a locked counter row for ticket and receipt numbers.
- Every state change of a ticket, booking, bill, prescription, dispute or application writes its event row in the same transaction, and sensitive actions write an audit entry.
- Publish domain events through the outbox in the same transaction; never send emails, pushes or socket messages inside the request transaction.

### 3.6 Errors

- Raise domain exceptions (`BusinessRuleViolation`, `Conflict`, `NotFound`, …) from services. One global DRF exception handler turns them into the error format of [API conventions](../architecture/02-api-conventions.md) §4, with the `request_id`.
- `code` values are stable and documented; `message` is localised (gettext) and written for the user: what happened and what to do next (NFR-UX-07).
- Never return stack traces, SQL or internal IDs of other tenants. Unexpected exceptions roll back the transaction and return `500 server_error` with a generic message.

### 3.7 Time, money and text

- Use `django.utils.timezone.now()`; store UTC; compute "today" and display values in `Africa/Kigali` with `zoneinfo`. Never create naive datetimes.
- Money is integer RWF. Shares use basis points; the rounding rule is decided in the S8 contract, implemented in one function, and tested (lines always add up to the bill total).
- User-facing strings in Python (`gettext_lazy`) and templates (`{% translate %}`) are always translatable.

### 3.8 Logging and background jobs

- Structured JSON logs with the request ID. Log internal IDs, never names, phone numbers, national IDs, tokens, passwords, OTPs or request bodies. Don't interpolate user input into log format strings.
- Celery: JSON serialiser only; tasks take IDs and the facility context, never personal data; tasks are idempotent and have time limits; the task wrapper sets the RLS context.

### 3.9 Security rules (checked in review and by Semgrep)

- No `mark_safe` on user data, no raw SQL without review, no `.objects.all()` in views, no `fields = "__all__"`.
- No user-supplied URL is fetched by the server. Web push endpoints must match the push-service allowlist; PDF rendering uses the locked URL fetcher ([security 06](../security/06-application-and-api-security.md) §5, §8).
- Uploads go through the upload pipeline (type by content, size, AV scan, quarantine, re-encoding).
- Redirects only to internal paths; CSV/Excel exports neutralise formula injection.
- No clinical details in notifications, emails, push payloads, logs or display screens.

## 4. TypeScript and React (`frontend/`)

### 4.1 Tooling

- TypeScript `strict: true`. No `any` (use `unknown` and narrow); non-null assertions only in tests.
- ESLint (typescript-eslint, react, react-hooks, jsx-a11y; `react/no-danger` is an error) and Prettier. Shared configuration in `packages/config` ([ADR 0007](../decisions/0007-frontend-toolchain.md)).

### 4.2 Folder structure

```
frontend/apps/<app>/src/
  app/                   router, providers, app shell, route guards
  features/<module>/     one folder per domain module (auth, queue, booking, clinical, billing, …)
    api.ts               TanStack Query hooks over packages/api-client
    components/          feature components (PascalCase.tsx)
    routes/              lazy-loaded route modules
    schemas.ts           zod schemas for forms
    *.test.tsx           component tests next to the code
  mocks/                 MSW handlers for the sprint contracts
  locales/               translation resources (if not in a shared package)
frontend/packages/ui/src/components/<Component>/   Component.tsx, Component.test.tsx, index.ts
frontend/packages/api-client/src/                  client, errors, generated OpenAPI types
frontend/apps/<app>/e2e/                           Playwright specs (*.spec.ts)
```

The exact layout is fixed in `frontend/README.md`; keep features self-contained and import shared code only from `packages/*`.

### 4.3 Naming

| Thing | Convention |
|---|---|
| Components and their files | `PascalCase` (`TodayBoard.tsx`) |
| Hooks | `useCamelCase` (`useCallNext`) |
| Other files | `kebab-case.ts` |
| Types and interfaces | `PascalCase`; API types come from the generated schema, not hand-written copies |
| Query keys | Arrays from the feature's key factory: `visitKeys.list(params)` |
| Tests | `*.test.ts(x)` (unit/component), `*.spec.ts` (Playwright) |

### 4.4 Data and state

- All HTTP goes through `packages/api-client` (credentials, CSRF, `Accept-Language`, error parsing). Components never call `fetch` directly.
- Server state lives in TanStack Query; local UI state in components. Don't copy server data into global stores.
- WebSocket messages only invalidate or refetch queries (notify-then-fetch); they never carry data to render.
- Optimistic updates only for queue actions, with rollback on error and a `version` conflict refresh.

### 4.5 Forms and errors

- react-hook-form + zod. Map `ApiError.fields` to field errors; keep the user's input after errors; show a focused error summary on submit failure.
- Handle error codes, not messages: `not_authenticated` → login, `mfa_required` → second factor, `step_up_required` → re-authentication dialog, `conflict` → refresh with the current data, `rate_limited` → wait message using `Retry-After`. Show the `request_id` in unexpected-error messages so support can trace it.

### 4.6 Styling and design system

- Use the design tokens from `packages/ui` only (Tailwind theme mapped to CSS variables). No hex colours or ad-hoc spacing in feature code ([design research 02](../design/research/02-color-system.md)).
- Every screen works in light and dark themes, at 200% zoom, and at 320–360 px width.
- Build on the shared components (Button, Field, ErrorSummary, DataTable, …) rather than restyling Radix primitives in features.

### 4.7 Accessibility (acceptance criteria, not polish)

From [design research 10](../design/research/10-accessibility-and-localization.md) (WCAG 2.2 AA baseline):

- Visible labels on every input; errors linked with `aria-describedby`; correct `autocomplete`; paste allowed in password and code fields.
- Everything reachable by keyboard, visible focus ring, no traps, skip link; documented shortcuts for reception and doctors (NFR-UX-05).
- Colour is never the only signal: status = icon + label.
- Patient targets ≥ 48 px and body text 18 px; staff targets ≥ 40 px.
- Live regions: queue position changes are polite; "You're called" is assertive.
- Respect `prefers-reduced-motion`; any drag has a button alternative.
- `lang` attribute follows the selected language.

### 4.8 Security in the browser ([security 06](../security/06-application-and-api-security.md) §6)

- No tokens or personal data in `localStorage`/`sessionStorage`; sessions are cookies on the API host.
- `dangerouslySetInnerHTML` is banned. No third-party scripts, trackers or chat widgets; fonts are self-hosted.
- The service worker never caches `/api/` responses by default; offline data is minimal and cleared on logout and profile switch.
- The staff idle lock hides content immediately; sensitive values are masked until revealed (and the reveal is audited).

### 4.9 Performance

- Code-split per route; keep the patient app's first load under 3 s on 3G (NFR-PERF-06). Track bundle size in CI.
- Skeletons match the final layout; images are compressed and lazy-loaded.

## 5. Internationalisation

All user-facing text is in translation files, Kinyarwanda first ([translations](translations.md)). No string concatenation for sentences; use interpolation and ICU plurals. Dates, times and numbers are formatted with the locale helpers (24-hour time, Africa/Kigali, RWF without decimals).

## 6. Documentation

- Markdown, sentence-case headings, short sentences, tables for reference data. Relative links between documents; every link must resolve.
- Mermaid diagrams use simple syntax. Don't start node labels with a number followed by a dot (`1.`), which GitHub renders as a list; write `1 · Step` instead.
- Status line at the top of each document (`Status: v0.1 · …`). Update the relevant index (`docs/README.md`, section READMEs) when adding a document.
