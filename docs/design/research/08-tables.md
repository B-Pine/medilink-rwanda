# 08 · Data tables

Status: Research v0.1 · Sources: IBM Carbon data table guidance, setproduct 2026 table guide, Stripe/Linear patterns, practitioner articles ([11](11-sources.md)).

Tables are the main interface for staff: patients, bookings, bills, disputes, reports, audit logs. Stripe proves a dense table can be the product.

## 1. Anatomy

```
┌ Bills · Today ────────────────────────────────────────────────────────────────┐
│ [🔍 Search name, receipt no.]  [Status: Unpaid ✕] [Insurer: RAMA ✕]  Clear all │  ← toolbar + filter chips
│ 128 results                              [Columns ▾] [Density ▾] [Export ▾]  │
├───┬────────────┬──────────────────┬──────────┬──────────────┬─────────┬───────┤
│ ☐ │ Receipt ▲  │ Patient          │ Insurer  │      Amount  │ Status  │       │  ← sticky header
├───┼────────────┼──────────────────┼──────────┼──────────────┼─────────┼───────┤
│ ☐ │ RC-000123  │ Mukamana Jeanne  │ Mutuelle │     2,000    │ ◷ Unpaid│  ⋯    │
│ ☐ │ RC-000124  │ Habimana Eric    │ RAMA     │    15,500    │ ✓ Paid  │  ⋯    │
├───┴────────────┴──────────────────┴──────────┴──────────────┴─────────┴───────┤
│ 3 selected  [Print receipts] [Export]                       ← bulk bar        │
│ Rows 1–50 of 128            ‹ 1 2 3 ›          Rows per page [50 ▾]           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 2. Specification

| Topic | Rule |
|---|---|
| Density | Three modes, saved per user: **Compact 32 px**, **Comfortable 40 px** (staff default), **Spacious 48 px**. Two-line rows 64 px. Toolbar and bulk bar match row height (Carbon rule). |
| Cell padding | 16 px horizontal, 8 px vertical; 1 px row dividers (`border-subtle`); **no zebra striping** by default (dividers + hover are enough; zebra conflicts with selection tint) |
| Alignment | Text left; **numbers, money, durations right-aligned with tabular figures**; dates consistent (left); status left |
| Money | RWF without decimals, thousands separator, currency in the header ("Amount (RWF)") not in every cell |
| Headers | Sticky on any table taller than one screen; sortable columns show the direction arrow; `aria-sort` set |
| First column | The identifier (ticket, receipt, patient) frozen on wide tables, with a subtle shadow edge |
| Truncation | One line + ellipsis + full value on hover/focus; only one designated column may wrap |
| Sorting | Click: ascending → descending → none. **Server-side** when paginated. Multi-sort only in reports. |
| Filtering | Search + filters → **removable chips** with result count and "Clear all". Saved views ("Unpaid today", "My disputes"). |
| Pagination | 50 rows per page default (25/50/100), total count always shown; virtualization only for audit logs and reports above ~1,000 rows |
| Row click | Opens a **side panel** (keeps list context); a full page only for complex records |
| Row actions | Trailing ⋯ menu, **always visible** (not hover-only: touch and keyboard users need it); the main row action can be a visible button ("Check in") |
| Selection | Leading checkbox; Shift+click range; "Select all 128 results" banner states scope; bulk bar replaces the toolbar |
| Destructive actions | Confirmation with consequences + reason field where the domain requires one (void, reorder) |
| Status | Badge with icon + label (colours from [02](02-color-system.md) §4) |
| Empty states | First use ("No bills yet today") vs no results ("No bills match these filters [Clear filters]") |
| Loading | Skeleton rows at real row height; keep headers; `aria-busy` |
| Errors | Message + Retry, never a half-rendered grid |
| Real-time tables | New row highlight (emerald-50, 1.5 s fade); never reorder under the pointer; "3 new rows ↑" pill when scrolled down |
| Export | CSV/Excel/PDF of the **current filtered view**, logged in the audit trail (health data) |
| Privacy | Columns with sensitive data (national ID, phone) masked by default (`••••1234`) with reveal-on-click (logged) |

## 3. Responsive behaviour

| Width | Strategy |
|---|---|
| ≥ 1024 px | Full table |
| 640–1023 px | Hide low-priority columns (chosen per table); "Columns" menu to bring them back |
| < 640 px | **Card list**: each row becomes a card with the identifier, the 2–3 decision fields, and the status badge |

Pick per table which columns users need to decide. Example: the reception board on a tablet keeps ticket, name, state and wait.

## 4. Accessibility

- Real `<table>` semantics with `<th scope>`; `aria-sort`; a caption (visually hidden if needed).
- Keyboard: Tab to the table, arrow keys between rows in interactive grids, Enter opens the row, Space selects.
- Focus visible on rows and cells; the selection state is announced.
- Hit areas ≥ 24×24 px even in compact mode (WCAG 2.2).

## 5. Implementation note

TanStack Table (headless) with our own components fits ADR 0003. It gives sorting, filtering, selection, column visibility and virtualization without imposing visuals.
