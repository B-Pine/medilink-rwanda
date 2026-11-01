# Phase 1 · Repair `main` and finish the S5a staff side: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `anthropic-skills:subagent-driven-development` (recommended) or `anthropic-skills:executing-plans`. Steps use `- [ ]` checkboxes. Master plan: [2026-10-31-m1-completion-master-plan.md](2026-10-31-m1-completion-master-plan.md).

**Goal:** get every test suite green on `main`, prove RLS on every facility table, put real bookings into the reception Expected list with booked check-in and no-show reversal, and make the docs match the code.

**Architecture:** no new endpoints. The frontend starts using what S5a already shipped: `GET /staff/bookings/` (R1), `POST /staff/visits/check-in/` with `booking_id` (R6) and `POST /staff/bookings/{id}/reverse-no-show/` (R5), all present in `backend/openapi/openapi.yaml`, in `packages/api-client/src/features/booking.ts` (`api.booking.staff.*`) and in the MSW mocks. The backend gains one test file.

**Tech stack:** pytest + PostgreSQL (backend); React 19, TanStack Query, Vitest + Testing Library + MSW (frontend).

**Out of scope here (separate plan, "Phase 1b"):** phone booking at reception (R2, R3, R4). Write that plan after Task 5 with `anthropic-skills:writing-plans`; it reuses the `ExpectedList` from Task 4.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `frontend/apps/patient-web/src/app/flows.test.tsx` | Modify | Landing test follows the live search |
| `frontend/i18n-review.md` | Regenerate | Kinyarwanda review list |
| `backend/tests/test_rls_coverage.py` | Create | Every `facility_id` table has forced RLS, or a documented exception |
| `docs/architecture/04-database-design.md` | Modify | Record the RLS exceptions (decision D3) |
| `frontend/apps/staff-web/src/features/queue/ExpectedList.tsx` | Create | Today's confirmed bookings, check-in, no-show reversal |
| `frontend/apps/staff-web/src/features/queue/BoardPage.tsx` | Modify (lines 178–190) | Mount `ExpectedList` in place of the placeholder |
| `frontend/apps/staff-web/src/features/queue/locales/{en,fr,rw}.json` | Modify | New `board.expected*` strings |
| `frontend/apps/staff-web/src/features/queue/queue.test.tsx` | Modify | Expected list tests |
| `README.md`, `docs/README.md`, `docs/api/catalogue.md`, `docs/architecture/contracts/README.md`, `docs/qa/README.md`, `docs/qa/traceability-matrix.md` | Modify | Status lines that tell the truth |
| `docs/qa/sprint-4-acceptance.md`, `docs/qa/sprint-5-acceptance.md` | Create | Acceptance records |
| `backend/CHANGELOG.md`, `frontend/CHANGELOG.md` | Modify | S2 (frontend), S4, S5a, design v2 entries |

## Environment (once per session)

Backend tests need PostgreSQL with the two roles and Redis (see `backend/docker/postgres/init/01-roles.sh` and `.github/workflows/ci-backend.yml`):

```bash
cd backend && docker compose up -d   # or a local PostgreSQL 17 + redis-server
```

```bash
export DJANGO_SETTINGS_MODULE=config.settings.test DJANGO_READ_DOT_ENV=false \
  DATABASE_URL=postgres://medilink_app:<app-pw>@127.0.0.1:5432/medilink \
  DATABASE_OWNER_URL=postgres://medilink_owner:<owner-pw>@127.0.0.1:5432/medilink \
  DATABASE_APP_ROLE=medilink_app CACHE_URL=redis://127.0.0.1:6379/1 \
  CHANNEL_LAYER_URL=redis://127.0.0.1:6379/2 CELERY_BROKER_URL=redis://127.0.0.1:6379/0
```

Frontend: `cd frontend && pnpm install --frozen-lockfile`.

---

### Task 1: The landing test follows the live search

The landing search now navigates to `/search` (PR #80); the test still expects the old "Search opens soon" message.

**Files:** Modify `frontend/apps/patient-web/src/app/flows.test.tsx:9-40`

- [ ] **Step 1: Confirm the failure**

Run: `cd frontend && pnpm vitest run apps/patient-web/src/app/flows.test.tsx -t "landing page"`
Expected: FAIL, `Unable to find an element with the text: /Search opens soon/`.

- [ ] **Step 2: Rewrite the test.** Check the landing sections first (they disappear after navigating), then search last. Replace the whole first `it(...)` inside `describe("landing page", …)` with:

```tsx
  it("has one h1, the search form, how it works, facilities band, emergency notice, footer", async () => {
    const { user } = renderApp("/");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Know before you go." }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const search = screen.getByRole("form", { name: "Find care" });
    expect(within(search).getByLabelText("What do you need?")).toBeInTheDocument();
    expect(within(search).getByLabelText("Where?")).toBeInTheDocument();
    expect(within(search).getByLabelText("Your insurance")).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "How it works" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "For health facilities" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/call 912/)).toBeInTheDocument();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Verify a document" })).toHaveAttribute(
      "href",
      "/verify",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");

    // A popular chip fills the service; Search opens the results page (S5a).
    await user.click(screen.getByRole("button", { name: "Pediatrics" }));
    expect(within(search).getByLabelText("What do you need?")).toHaveValue("pediatrics");
    await user.click(within(search).getByRole("button", { name: "Search" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Find a facility" }),
    ).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run it.** Same command. Expected: PASS.

- [ ] **Step 4: Remove the unused string.** `landing.search.comingSoon` is no longer rendered (`grep -rn "search.comingSoon" frontend/apps/patient-web/src` shows only the locale files). Delete that key from `frontend/apps/patient-web/src/i18n/locales/en.json`, `fr.json` and `rw.json` (line ~53 in each).

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/patient-web
git commit -m "test(patient-web): landing test follows the live search (S5a)"
```

### Task 2: Regenerate the Kinyarwanda review list

**Files:** Regenerate `frontend/i18n-review.md`

- [ ] **Step 1: Confirm the failure.** Run: `cd frontend && pnpm vitest run tests/i18n.test.ts`. Expected: FAIL, `i18n-review.md > lists every Kinyarwanda key … is up to date`.
- [ ] **Step 2: Regenerate.** Run: `pnpm i18n:review`.
- [ ] **Step 3: Run it.** `pnpm vitest run tests/i18n.test.ts`. Expected: PASS.
- [ ] **Step 4: Full frontend suite.** `pnpm test`. Expected: `Tests  0 failed`.
- [ ] **Step 5: Commit**

```bash
git add frontend/i18n-review.md frontend/apps/patient-web/src/i18n/locales
git commit -m "chore(frontend): regenerate i18n-review.md"
```

### Task 3: RLS on every facility table, proven by a test

`tests/test_b10_rls.py` checks two tables. The database has 45 tables with `facility_id`, and 11 of them have no RLS (audit of 2026-10-31). Seven are documented exceptions, three are undocumented (decision D3), and one contradicts the database design (`audit_auditentry`, decision D2).

**Files:** Create `backend/tests/test_rls_coverage.py`; Modify `docs/architecture/04-database-design.md` (section "Conventions", after the "Facility ownership" row, line 25)

- [ ] **Step 1: Write the failing test** with an empty exception list:

```python
"""Every table with a facility_id column has RLS enabled and forced with the
`facility_isolation` policy, unless it is listed in RLS_EXCEPTIONS with the document that
allows it (security 04 §4, database design §1)."""

from __future__ import annotations

import pytest
from django.db import connection

pytestmark = pytest.mark.django_db

RLS_EXCEPTIONS: dict[str, str] = {}


def _facility_tables() -> list[tuple[str, bool, bool, bool]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   EXISTS (SELECT 1 FROM pg_policy p
                           WHERE p.polrelid = c.oid AND p.polname = 'facility_isolation')
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_attribute a ON a.attrelid = c.oid
                 AND a.attname = 'facility_id' AND NOT a.attisdropped
            WHERE n.nspname = 'public' AND c.relkind = 'r'
            ORDER BY c.relname
            """
        )
        return cursor.fetchall()


def test_every_facility_table_has_forced_rls() -> None:
    missing = [
        name
        for name, enabled, forced, policy in _facility_tables()
        if name not in RLS_EXCEPTIONS and not (enabled and forced and policy)
    ]
    assert missing == [], f"facility tables without forced RLS: {missing}"


def test_every_exception_is_still_needed() -> None:
    protected = {name: enabled and forced for name, enabled, forced, _ in _facility_tables()}
    stale = [name for name in RLS_EXCEPTIONS if protected.get(name, True)]
    assert stale == [], f"remove from RLS_EXCEPTIONS (table gone or now protected): {stale}"
```

- [ ] **Step 2: Run it.** `cd backend && pytest tests/test_rls_coverage.py -q`.
Expected: FAIL in `test_every_facility_table_has_forced_rls` listing exactly: `audit_auditentry, core_outbox_event, facilities_public_listing, onboarding_application, onboarding_facility_feature_flag, onboarding_facility_licence, onboarding_facility_status_event, patients_consentrecord, patients_merge, patients_record_claim, scheduling_travel_time`.

- [ ] **Step 3: Fill in the exceptions**, each with its source:

```python
RLS_EXCEPTIONS: dict[str, str] = {
    # documented in contracts
    "scheduling_travel_time": "sprint-04 §2.1: patient setting, account scope",
    "facilities_public_listing": "sprint-05 §2.1: public read model, live facilities only",
    "onboarding_facility_licence": "sprint-01 S1-D3: platform verification data",
    "onboarding_application": "sprint-01 §2.3: exists before the tenant does",
    "patients_merge": "sprint-03 §2.4: cross-facility requests listed by the platform",
    "patients_consentrecord": "sprint-03 §2.4: platform table, policy-layer scoped",
    "patients_record_claim": "sprint-03 §2.4: platform table, account scoped",
    # decision D3 (master plan): recorded in database design §1 by this task
    "core_outbox_event": "database design §1: system table, IDs only, never read by API views",
    "onboarding_facility_feature_flag": "database design §1: platform-managed configuration",
    "onboarding_facility_status_event": "database design §1: platform status history",
    # decision D2 (master plan): RLS for SELECT is added in Phase 6, before the audit viewer
    "audit_auditentry": "database design §758 (pending D2): no facility reader exists yet",
}
```

- [ ] **Step 4: Run it.** Same command. Expected: `2 passed`.

- [ ] **Step 5: Record D3 in the database design.** In `docs/architecture/04-database-design.md`, after the "Facility ownership" row (line 25), add this row to the same table:

```markdown
| RLS exceptions | Tables with `facility_id` but without facility RLS are listed in `backend/tests/test_rls_coverage.py` (`RLS_EXCEPTIONS`) with their reason; the test fails for any other table without forced RLS. Besides those named in the sprint contracts: `core_outbox_event` (system table, IDs only, never served by an API view), `onboarding_facility_feature_flag` and `onboarding_facility_status_event` (platform-managed, read by platform admins across facilities). `audit_entry` (`audit_auditentry`) gets facility RLS for `SELECT` before the S10 audit viewer ships |
```

- [ ] **Step 6: Full backend suite.** `pytest -q`. Expected: `514 passed`.

- [ ] **Step 7: Commit**

```bash
git add backend/tests/test_rls_coverage.py docs/architecture/04-database-design.md
git commit -m "test(backend): forced RLS on every facility table, with documented exceptions"
```

### Task 4: The Expected list shows today's bookings

Design 04 §3.1: Expected (booked, not arrived) beside On site, sorted by slot time, with a Check in action. Contract S5 R1: Expected list = `GET /staff/bookings/?date=today&status=confirmed`. The mock seeds two bookings today at Kigali Clinic: "Niyonzima P." at 08:00 and "Mutesi A." at 10:30 (`packages/api-client/src/mocks/features/booking.ts:471-497`).

**Files:** Create `frontend/apps/staff-web/src/features/queue/ExpectedList.tsx`; Modify `BoardPage.tsx:176-190`, `locales/{en,fr,rw}.json`, `queue.test.tsx:31-44`

- [ ] **Step 1: Change the existing assertion and add the failing tests.** In `queue.test.tsx`, in the test "lists who is on site in calling order with flags, and is accessible", replace

```tsx
    expect(screen.getByText("No bookings yet")).toBeInTheDocument();
```

with

```tsx
    const expected = await screen.findByRole("list", { name: "Expected" });
    const booked = within(expected).getAllByRole("listitem");
    expect(within(booked[0]!).getByText("Niyonzima P.")).toBeInTheDocument();
    expect(within(booked[1]!).getByText("Mutesi A.")).toBeInTheDocument();
```

and add, inside the same `describe("reception board (S4-F2, F3)", …)`:

```tsx
  it("checks in a booked patient from the Expected list (S5-F5)", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const expected = await screen.findByRole("list", { name: "Expected" });
    const row = within(expected).getByText("Mutesi A.").closest("li")!;
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Check in" }));
    await waitFor(() =>
      expect(within(expected).queryByText("Mutesi A.")).not.toBeInTheDocument(),
    );
    const table = await screen.findByRole("table", { name: /General consultation · Consultation/ });
    expect(await within(table).findByText("Mutesi A.")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them.** `cd frontend && pnpm vitest run apps/staff-web/src/features/queue/queue.test.tsx -t "reception board"`.
Expected: FAIL, `Unable to find role="list" and name "Expected"`.

- [ ] **Step 3: Add the strings.** In `apps/staff-web/src/features/queue/locales/en.json`, inside `"board"`, replace the `expectedEmpty` value and add the new keys:

```json
    "expectedEmpty": "Patients booked for today appear here until they arrive.",
    "expectedCheckIn": "Check in",
    "expectedLate": "Late",
    "expectedAnyDoctor": "Any doctor",
    "expectedError": "Could not load today's bookings.",
    "expectedCheckInError": "Could not check in this booking.",
    "expectedRetry": "Try again",
```

`fr.json` (same keys):

```json
    "expectedEmpty": "Les patients ayant réservé pour aujourd'hui s'affichent ici jusqu'à leur arrivée.",
    "expectedCheckIn": "Enregistrer l'arrivée",
    "expectedLate": "En retard",
    "expectedAnyDoctor": "N'importe quel médecin",
    "expectedError": "Impossible de charger les réservations du jour.",
    "expectedCheckInError": "Impossible d'enregistrer l'arrivée pour cette réservation.",
    "expectedRetry": "Réessayer",
```

`rw.json` (draft; `pnpm i18n:review` lists them for native review):

```json
    "expectedEmpty": "Abafashe gahunda y'uyu munsi bagaragara hano kugeza bageze.",
    "expectedCheckIn": "Andika ko yageze",
    "expectedLate": "Yakererewe",
    "expectedAnyDoctor": "Muganga uwo ari we wese",
    "expectedError": "Ntibyashobotse kubona gahunda z'uyu munsi.",
    "expectedCheckInError": "Ntibyashobotse kwandika ko uyu murwayi yageze.",
    "expectedRetry": "Ongera ugerageze",
```

- [ ] **Step 4: Create `ExpectedList.tsx`:**

```tsx
import type { StaffBooking } from "@medilink/api-client";
import { newIdempotencyKey } from "@medilink/api-client";
import { Alert, Badge, Button, EmptyState } from "@medilink/ui";
import { CalendarCheck } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { queueKeys, usePollInterval } from "./live";
import { actionError, useCan, useServiceNames } from "./shared";

export const expectedKey = ["queue", "expected"] as const;

/** Today's date in Kigali as YYYY-MM-DD, the `date` filter of GET /staff/bookings/. */
export function kigaliToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(now);
}

function slotTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kigali",
  }).format(new Date(iso));
}

/**
 * Expected (design 04 §3.1, contract S5 R1): today's confirmed bookings, by slot time, until the
 * patient is checked in (R6). `serviceId` follows the board's service filter.
 */
export function ExpectedList({ serviceId }: { serviceId: string | null }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  const canCheckIn = useCan("queue.operate");
  const refetchInterval = usePollInterval();
  const language = i18n.resolvedLanguage ?? "en";

  const bookings = useQuery({
    queryKey: [...expectedKey, kigaliToday()],
    queryFn: () => api.booking.staff.bookings({ date: kigaliToday(), status: "confirmed" }),
    refetchInterval,
  });

  const checkIn = useMutation({
    mutationFn: (booking: StaffBooking) =>
      api.queue.checkIn({ booking_id: booking.id }, newIdempotencyKey()),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: expectedKey });
      void queryClient.invalidateQueries({ queryKey: queueKeys.board });
    },
  });

  if (bookings.isError) {
    return (
      <Alert tone="danger">
        {t("queue.board.expectedError")}{" "}
        <Button variant="secondary" onClick={() => void bookings.refetch()}>
          {t("queue.board.expectedRetry")}
        </Button>
      </Alert>
    );
  }

  const rows = (bookings.data?.results ?? []).filter(
    (b) => !serviceId || b.service_id === serviceId,
  );

  if (bookings.isSuccess && rows.length === 0) {
    return (
      <EmptyState
        size="inline"
        icon={CalendarCheck}
        title={t("queue.board.expectedEmptyTitle")}
        description={t("queue.board.expectedEmpty")}
        className="rounded-lg border border-dashed border-border"
      />
    );
  }

  return (
    <>
      {checkIn.isError && (
        <Alert tone="danger">
          {actionError(checkIn.error, t("queue.board.expectedCheckInError"))}
        </Alert>
      )}
      <ul
        aria-label={t("queue.board.expected")}
        className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-surface p-0"
      >
        {rows.map((booking) => (
          <li key={booking.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="w-12 shrink-0 font-semibold tabular-nums">
              {slotTime(booking.starts_at, language)}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{booking.display_name}</span>
              <span className="truncate text-body-sm text-fg-muted">
                {serviceName(booking.service_id)} ·{" "}
                {booking.doctor ?? t("queue.board.expectedAnyDoctor")}
              </span>
            </span>
            {booking.late && <Badge tone="warning">{t("queue.board.expectedLate")}</Badge>}
            {canCheckIn && (
              <Button
                variant="secondary"
                loading={checkIn.isPending && checkIn.variables?.id === booking.id}
                onClick={() => checkIn.mutate(booking)}
              >
                {t("queue.board.expectedCheckIn")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
```

(Checked: `Alert` takes `tone: "info" | "success" | "warning" | "danger"`; `Button` takes `variant: "primary" | "secondary" | "ghost" | "danger"` and `loading`.)

- [ ] **Step 5: Mount it.** In `BoardPage.tsx`, replace lines 183–189 (the `<EmptyState … />` inside `<section aria-labelledby="expected">`) with:

```tsx
          <ExpectedList serviceId={filter} />
```

Add the import after `import { LiveBadge } from "./LiveIndicator";`:

```tsx
import { ExpectedList } from "./ExpectedList";
```

If `EmptyState` and `CalendarCheck` are now unused in `BoardPage.tsx`, remove them from its imports (the heading still uses `CalendarCheck`, so check with `pnpm lint`).

- [ ] **Step 6: Run the tests.** `pnpm vitest run apps/staff-web/src/features/queue/queue.test.tsx`. Expected: all pass, including axe.
- [ ] **Step 7: Typecheck, lint, i18n.** `pnpm typecheck && pnpm lint && pnpm i18n:review && pnpm vitest run tests/i18n.test.ts`. Expected: all clean.
- [ ] **Step 8: Check in the browser.** Use the `run` skill: `pnpm --filter staff-web dev:mock`, log in as `reception@medilink.test`, open `/queue`, take a screenshot of the Expected list, click Check in, and confirm the patient moves to On site.
- [ ] **Step 9: Commit**

```bash
git add frontend/apps/staff-web/src/features/queue frontend/i18n-review.md
git commit -m "feat(staff-web): Expected list with booked check-in (S5a R1, R6; design 04 §3.1)"
```

### Task 5: Reverse a no-show from the board

Contract S5 R5: `POST /staff/bookings/{id}/reverse-no-show/` with `{version, reason_code, reason_text?}`, permission `queue.operate`. Reason codes come from S1 master data (`reason-codes`, kind `no_show_reversal`); check the exact kind with `GET /staff/master-data/reason-codes/` in the mock before writing the dialog.

**Files:** Modify `ExpectedList.tsx`, `locales/{en,fr,rw}.json`, `queue.test.tsx`

- [ ] **Step 1: Find the mock data.** Run `grep -n "no_show" frontend/packages/api-client/src/mocks/features/booking.ts`. If no booking with status `no_show` is seeded for today at Kigali Clinic, add one in `seedBookings()` after the `expected` loop, using the existing helper:

```ts
    {
      const slot: MockSlot = {
        id: id(),
        slug: FACILITIES.kigaliClinic.slug,
        service_id: SETUP_IDS.sGen,
        starts_at: today(7, 30),
        ends_at: today(8, 0),
        doctor: "Dr Keza Umutoni",
        membership_id: SETUP_IDS.mKeza,
        open_places: 0,
        capacity: 1,
        held: 0,
        booked: 1,
      };
      db.bookings.push(
        makeBooking(slot, "f9e00000-0000-4000-8000-000000000003", "Uwase Aline", "no_show", [], null, "phone"),
      );
    }
```

- [ ] **Step 2: Write the failing test** in `queue.test.tsx`:

```tsx
  it("reverses a no-show with a reason (S5a R5)", async () => {
    const { user } = await signIn("reception@medilink.test", "/queue");
    const missed = await screen.findByRole("list", { name: "Missed today" });
    const row = within(missed).getByText("Uwase A.").closest("li") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Undo no-show" }));
    const dialog = await screen.findByRole("dialog", { name: "Undo no-show" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm" });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText("Reason"), within(dialog).getAllByRole("option")[1]!);
    await user.click(confirm);
    await waitFor(() => expect(within(missed).queryByText("Uwase A.")).not.toBeInTheDocument());
  });
```

- [ ] **Step 3: Run it.** Expected: FAIL, no list "Missed today".
- [ ] **Step 4: Implement.** In `ExpectedList.tsx`, add a second query `api.booking.staff.bookings({ date: kigaliToday(), status: "no_show" })` under `queryKey: [...expectedKey, "no_show", kigaliToday()]`, rendered as `<ul aria-label={t("queue.board.missed")}>` below the Expected list (only when it has rows). Each row gets an "Undo no-show" button that opens a `Dialog` (from `@medilink/ui`, as used for "Move up" in `BoardPage.tsx`) with a `SelectField` labelled "Reason" (options from `api.masterData` reason codes of the no-show reversal kind), an optional `TextField`, and a Confirm button disabled until a reason is picked. Confirm calls `api.booking.staff.reverseNoShow(booking.id, booking.version, reasonCode, reasonText)` and invalidates `expectedKey`. Add the strings `missed` ("Missed today"), `undoNoShow` ("Undo no-show"), `reason` ("Reason"), `confirm` ("Confirm") in rw/en/fr; reuse existing board keys where they already exist (`grep -n '"confirm"\|"reason"' locales/en.json`).
- [ ] **Step 5: Run, typecheck, lint, i18n** as in Task 4 Steps 6–7. Expected: clean.
- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(staff-web): undo a no-show with a reason (S5a R5)"
```

### Task 6: Make the status lines true

**Files:** the docs listed in the file map.

- [ ] **Step 1: `README.md:15`.** Replace the status quote with:

```markdown
> Status: **S0–S4 implemented; S5a (booking core) implemented**; not yet on staging ([#17](https://github.com/B-Pine/medilink-rwanda/issues/17)). Next: S5b, S9 (notifications) and S10 part 1 (help). Plan: [M1 completion plan](docs/superpowers/plans/2026-10-31-m1-completion-master-plan.md). Phase 1 is a web platform; frontend and backend are hosted separately. The mobile app, SMS, WhatsApp and USSD follow later.
```

- [ ] **Step 2: `docs/architecture/contracts/README.md:16`.** S5 row status: `Implemented S5a: backend a523888, frontend #80 (patient) and Phase 1 (staff Expected list); S5b not started`.
- [ ] **Step 3: `docs/api/catalogue.md` Contents table (lines 13, 15, 16).** S2: `Implemented: backend #63, frontend #69 (the contract's paths win over the rows below)`. S4: `Implemented: backend #73, frontend #74 (the contract's paths win over the rows below)`. S5: `S5a implemented (a523888, #80); S5b planned (the contract's paths win over the rows below)`.
- [ ] **Step 4: `docs/qa/README.md:12`.** Replace "frontend not started" with "frontend #59".
- [ ] **Step 5: `docs/README.md:79`.** Rewrite the Wave 1 paragraph to: S0 verified; S1, S2, S3, S4 and S5a implemented and waiting for staging; S9 contracted, not started.
- [ ] **Step 6: Traceability matrix.** Run this from the repo root; it sets requirements whose sprints are S2, S4 or S5 (including multi-sprint cells) to "In progress", and S9-only rows back to "Not started":

```bash
python3 - <<'EOF'
import re
p = "docs/qa/traceability-matrix.md"
out = []
for line in open(p, encoding="utf-8"):
    m = re.match(r"^\| ((?:FR|NFR)-[A-Z]+-\d+) \|", line)
    if m:
        cells = line.rstrip("\n").split("|")
        sprint, status = cells[4].strip(), cells[7].strip()
        if status == "Not started" and re.search(r"\bS[245]\b", sprint):
            cells[7] = " In progress "
        elif status == "In progress" and re.fullmatch(r"S9\*?(, S11\*?)?", sprint):
            cells[7] = " Not started "
        line = "|".join(cells) + "\n"
    out.append(line)
open(p, "w", encoding="utf-8").writelines(out)
EOF
git diff --stat docs/qa/traceability-matrix.md
```

Expected: about 60 rows changed. Read the diff; FR-NOT-12 (`S4*, S9`) stays "In progress" because S4 built its tracker part.

- [ ] **Step 7: Commit**

```bash
git add README.md docs
git commit -m "docs: status lines match the code (S2, S4, S5a implemented; S9 not started)"
```

### Task 7: Acceptance records for S4 and S5

**Files:** Create `docs/qa/sprint-4-acceptance.md`, `docs/qa/sprint-5-acceptance.md`

- [ ] **Step 1: Generate the skeletons** from each contract's §9 with the template of `docs/qa/README.md` §5:

```bash
for n in 4 5; do
  f=$(ls docs/architecture/contracts/sprint-0$n-*.md)
  {
    echo "# Sprint $n acceptance record"
    echo
    echo "Contract: [$(basename $f)](../architecture/contracts/$(basename $f))"
    echo "Status: Open · How to fill it in: [QA README](README.md) §4"
    echo
    echo "| Check | What | Requirements | Evidence | Result |"
    echo "|---|---|---|---|---|"
    sed -n '/^## 9. Acceptance checks/,/^## 10/p' "$f" | grep -E "^\| \*?\*?S$n-[BFI][0-9]+" \
      | awk -F'|' '{printf "|%s|%s|%s| | |\n", $2, $3, $4}'
  } > docs/qa/sprint-$n-acceptance.md
done
```

- [ ] **Step 2: Fill the evidence** for each `S4-B*`/`S5-B*` row with the test name that proves it (`grep -n "def test_" backend/tests/s4/*.py backend/tests/s5/*.py`), and for S4-B4/B5/B6 and S5-B5 the output of `python manage.py queue_concurrency_check` and `booking_concurrency_check` on the dev database (both passed on 2026-10-31: "one ticket for 4 parallel check-ins", "numbers 1..11 without gaps", "11 tickets served, none twice", "3 held, 17 slot_taken (of 20)"). Rows with no test get Result `Gap` and a line in a "Known gaps" section; S5b rows (S5-B13–B15) get `Not in S5a`.
- [ ] **Step 3: Index them.** Add both files to the table in `docs/qa/README.md` §1.
- [ ] **Step 4: Commit**

```bash
git add docs/qa
git commit -m "docs(qa): Sprint 4 and Sprint 5 acceptance records"
```

### Task 8: Changelogs

**Files:** `backend/CHANGELOG.md`, `frontend/CHANGELOG.md`

- [ ] **Step 1: Backend.** Under `## [Unreleased]`, add `### Sprint 4 · Visits and the live queue` and `### Sprint 5a · Booking core`. Write the bullets from the PR bodies (`mcp__github__pull_request_read` on #73 for S4) and `git show --stat a523888` for S5a, in the style of the existing S1–S3 sections: new apps and tables, endpoints, jobs, commands, checks, and decisions D-7, D-8, D-9. Add the Phase 1 RLS coverage test under a `### Tests` line.
- [ ] **Step 2: Frontend.** Fill the empty `### Sprint 2 · Facility setup and staff` section from PR #69, and add `### Sprint 4 · Visits and the live queue` (#74), `### Sprint 5a · Booking` (#80 plus this phase's Expected list and no-show reversal) and `### Design v2` (commits 7a28501, 861d6b9, 69640cf, 26051ec; read with `git show --stat <sha>`).
- [ ] **Step 3: Commit**

```bash
git add backend/CHANGELOG.md frontend/CHANGELOG.md
git commit -m "docs: changelog entries for S2 (frontend), S4, S5a and design v2"
```

### Task 9: Verify and open the PR

- [ ] **Step 1: Everything green.** Backend `pytest -q` (expect 514 passed), `ruff check .`, `python manage.py makemigrations --check --dry-run`, OpenAPI drift (`python manage.py spectacular --file /tmp/oa.yaml && diff -q /tmp/oa.yaml openapi/openapi.yaml`). Frontend `pnpm typecheck && pnpm lint && pnpm test`.
- [ ] **Step 2: Review.** Run the `code-review` skill at `high` on the branch diff and fix what it confirms.
- [ ] **Step 3: Push and open a draft PR** with the GitHub MCP (`create_pull_request`, draft, body follows `.github/pull_request_template.md`, `Refs` the S5 issue), then `subscribe_pr_activity`.

---

## Self-review

- **Coverage of the audit findings:** failing tests (Tasks 1–2), RLS gaps and weak test (Task 3), Expected list and booked check-in (Task 4), no-show reversal (Task 5), stale statuses (Task 6), missing acceptance records (Task 7), missing changelogs (Task 8). Phone booking is deliberately in Phase 1b; audit-log RLS is Phase 6 (D2); staging is Phase 2 (D1).
- **Names used across tasks:** `ExpectedList`, `expectedKey`, `kigaliToday`, `RLS_EXCEPTIONS`, `queueKeys.board`, `api.booking.staff.bookings`, `api.booking.staff.reverseNoShow`, `api.queue.checkIn`: each is defined in this plan or exists in the code at the paths given.
- **Known soft spot:** Task 5 Step 4 is described rather than written out, because the reason-code kind for no-show reversal must be looked up in the mock first (Step 1). Write that component's code into this plan once the kind is known, before executing Task 5.
