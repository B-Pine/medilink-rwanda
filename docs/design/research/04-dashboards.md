# 04 · Dashboards

Status: Research v0.1

## 1. What the best dashboards do (inspiration analysed)

| Product / source | What we take |
|---|---|
| **Linear** | High density without clutter through tuned visual weight. Status is colour **and** icon coded (colour-blind safe). Keyboard-first. Command palette. |
| **Stripe Dashboard** | Tables as the primary interface; compact rows; real-time updates; nested detail in a side panel instead of a new page |
| **Vercel** | Monochrome UI, colour = meaning, one accent. Minimal cognitive load. |
| **Jane** (practice management) | Schedule as a picture: practitioner columns × time axis, blocks sized by duration; cancellations **hatched**, not coloured |
| **SimplePractice** | Show only decisions the user can act on; appointments + no-show rate as one small card |
| **OpenEMR** | Trained daily operators want everything one click away. Density is correct for them. |
| **Clinova (template)** | KPI tiles with sparkline + change; occupancy coloured **by pressure**, not by department |
| **DrChrono** | Risk flags as simple per-row markers, not fake-precise probabilities |
| **Shadcn hospital kit** | Greyscale base; colour only for change; direct value labels instead of legends |
| 2026 SaaS trend analyses | Collapsible **left sidebar** is back for complex products; one global date filter; saved views; progressive disclosure; key metric top-left |

**Lessons for healthcare specifically:**
- **Choose the audience per dashboard.** Clinical, operational and financial dashboards serve different people.
- **Reserve the strongest colour for things that must never be missed.** This prevents alert fatigue.
- **Design for health data on shared screens.** Use role-based sections and careful defaults.

## 2. The staff app shell

```
┌────────────┬──────────────────────────────────────────────────────────────┐
│ ◉ MediLink │  Kigali Clinic ▾   ⌘K Search patients, tickets…   🔔  ◐  Dr. A ▾ │
│            ├──────────────────────────────────────────────────────────────┤
│ ▣ Today    │  Page title                         [secondary] [Primary ▸]   │
│ ☰ Queue    │  ─────────────────────────────────────────────────────────── │
│ 📅 Calendar│                                                              │
│ 👤 Patients│                     content                                  │
│ 💊 Pharmacy│                                                              │
│ ₣ Payments │                                                              │
│ ⚑ Disputes │                                                              │
│ 📊 Reports │                                                              │
│ ⚙ Settings │                                                              │
│            │                                                              │
│ ● Online   │                                                              │
└────────────┴──────────────────────────────────────────────────────────────┘
```
*(In the real UI the glyphs above are Phosphor icons. Emoji are used only in this text sketch.)*

| Element | Spec |
|---|---|
| Sidebar | Grouped by role. Only what the role can use is shown (no greyed-out items). Collapsible to icons. Can be dark emerald-900 (combination B) or white. Decided in design. |
| Facility switcher | Top-left; visible at all times for multi-facility staff, so they always know which facility they're acting in |
| Command palette (`Ctrl+K`) | Find a patient or ticket, jump to a page, run actions ("Call next", "New walk-in") |
| Connection indicator | Bottom of the sidebar: Online · Reconnecting · **Offline (actions queued: 3)**. Never hidden (FR-QUE-16). |
| Notifications | Bell with count; approvals and disputes link straight to the item |
| Quick lock | Avatar menu → Lock (PIN unlock), plus automatic idle lock |
| Theme | Light / dark / system |

## 3. Dashboards per role

### 3.1 Receptionist: Today board (the most important staff screen)

```
┌ Today · Tue 14 Oct ─────────────── [Search name / phone / ID  ⌘K] [+ Walk-in (N)] ┐
│ Service: [All ▾]  General 18 waiting · Pediatrics 6 · Dental 2       Avg wait 32 min │
├──────────────── EXPECTED (booked, not arrived) ──┬──────── ON SITE ───────────────────┤
│ 08:30  Mukamana J.   General  Dr K   [Check in]  │ G-021  Waiting   12 min  Mutuelle ✓ │
│ 08:45  Habimana E.   Pediatr  —      [Check in]  │ G-022  Called ▸ Rm 4      RAMA ✓     │
│ 09:00  Uwase A.      Dental   Dr M   late 10 min │ G-023  Waiting   ★ Priority  Cash    │
│ …                                                 │ P-004  At payment   ₣ 2,000 due     │
│ Remote joiners not arrived (4) ▸                  │ …                                   │
└───────────────────────────────────────────────────┴─────────────────────────────────────┘
```

**Two lists side by side:**
- **Expected**, sorted by slot time.
- **On site**, by service and stage.

This is the visual form of ADR 0004.

**Interaction:**
- Single-key shortcuts: `N` new walk-in, `/` search, `Enter` check in.
- The selected row opens a **side panel** (patient, insurance, bill, ticket history); the board doesn't navigate away.
- The walk-in form fits in the side panel and completes in under 60 seconds: names, sex, date of birth/age, phone, insurance → ticket printed or shown.
- Flags show as small icon+label chips: priority, emergency, insurance unverified, unpaid.

### 3.2 Doctor: My queue + consultation

```
┌ My queue (General · Room 4) ──┬ Consultation · Keza U. · F · 34 y · Mutuelle ───────────┐
│ ▶ G-022  Keza U.   In consult │ ⚠ Allergy: Penicillin                     [Draft · saved] │
│   G-024  Habimana  Waiting 8m │ Reason: fever, headache 2 days (from booking)            │
│   G-025  ★ Mukamana Waiting   │ Vitals  T 38.4  BP 118/76  P 92  SpO₂ 98                │
│                               │ ┌ History ┐┌ Exam ┐┌ Diagnosis ┐┌ Plan ┐┌ Rx ┐┌ Docs ┐  │
│ [Call next ▸]  (Space)        │ │ …                                                     │ │
│ Status: ● On duty  [Break]    │ └───────────────────────────────────────────────────────┘ │
│                               │ Timeline (previous visits) ▸           [Sign & complete] │
└───────────────────────────────┴───────────────────────────────────────────────────────────┘
```

- **Call next** is the one big action, also on the space bar.
- **Allergy banner** is permanent, red with an icon (FR-CLN-07).
- The consultation is **one scrolling page with section tabs as anchors**, not separate pages. Autosave status is always visible.
- **Diagnosis:** ICD-10 search with type-ahead in plain language ("malaria" → B54).
- **Prescription:** drug search, frequency presets ("1 × 3 / day × 5 days"), and an "Out of stock here" marker.
- **Patient history** opens as a timeline drawer next to the record; you can compare while writing.

### 3.3 Pharmacist

A **prescription queue** (cards: ticket, patient, items count, paid ✓/✗, waiting time) → **dispense screen** with one row per item: dispensed / partial (qty) / substitute / not available. A large "Confirm identity" step comes first.

### 3.4 Facility admin: operations + management

- **Top row:** 4 KPI tiles, no more. Patients today, median wait (vs last week), no-show rate, revenue collected today. Each tile has a sparkline and a change indicator.
- **Live operations board:** one row per service (queue length bar coloured **by pressure**: normal, busy, overloaded with icon + label), doctors on duty, longest current wait.
- **Needs your attention list:** approvals (voids, refunds, merges), overdue disputes, unsigned records, licence expiry. These are actionable items, not charts.
- **Setup checklist card** until the facility is live.

### 3.5 Super admin

- **Applications pipeline:** a kanban or table by status (Submitted → Under review → Changes requested → Approved).
- **Network map:** facilities by district.
- **Platform health:** uptime, errors, notification delivery, push opt-in rate.
- **Escalated disputes** and break-glass reviews as attention lists.

### 3.6 Waiting-room display (TV)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  KIGALI CLINIC                                         09:42 · [rw date]    │
├────────────────────────────────────┬──────────────────────────────────────┤
│  NOW SERVING / [rw]                 │  NEXT / [rw]                         │
│                                     │  G-024   G-025   G-026               │
│     G-022   →   ROOM 4              │  P-005   P-006                       │
│     P-004   →   ROOM 2              │                                      │
├────────────────────────────────────┴──────────────────────────────────────┤
│  ℹ Pediatrics closes at 13:00 today · Book online: medilink.rw            │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Deep forest background** (combination B) with white text at 15:1.
- Ticket numbers about 8–12% of screen height, readable from 10 m.
- **No names, ever.** Chime plus a brief highlight on a new call. Bilingual labels.

## 4. Charts on dashboards (dataviz method)

| Question | Form |
|---|---|
| "How are we doing today?" | **Stat tile** (hero number + delta + sparkline), not a chart |
| Waits over time | Line chart, one series per service (max 6, fixed palette order), median + shaded P90 band |
| Arrivals by weekday × hour | **Heat map**, sequential emerald, with a table view |
| Booked vs walk-in | Stacked bar per day (2 series: emerald, blue) |
| Revenue by insurer | Horizontal bar, single colour (one series), sorted, direct labels |
| No-show rate | Stat tile + small line; never a pie |
| Estimate accuracy | Single percentage with target line |

**Rules from the dataviz skill:**
- One y-axis only.
- Thin marks, 2 px lines.
- A legend for 2+ series, plus direct labels when ≤ 4.
- A hover tooltip on every chart.
- One global date filter in a single row above the charts.
- A table view for every chart.
- Text in ink colours, never series colours.

## 5. Real-time behaviour

- **New and changed rows:** a brief emerald-50 highlight that fades over 1.5 s. Rows never jump under the cursor.
- If a row the user is focusing on moves, keep focus on it.
- **Live indicator** ("Live · updated 3 s ago") on boards. If stale for more than 30 s, show a yellow "Reconnecting" chip.
- **Sounds** (staff, optional): a distinct short tone for "new patient in my queue", another for "prescription ready". Off by default at reception.
