# 03 · Typography, icons, spacing and motion

Status: Research v0.1

## 1. Typeface candidates

| Option | Headings | Body / UI | Why | Watch out |
|---|---|---|---|---|
| **A · Recommended** | **Figtree** | **Inter** | Figtree is friendly and clear, with healthcare warmth. Inter is excellent for dense UI, has tabular figures for tables, queues and money, and full Latin coverage for Kinyarwanda and French. | Two families to load; subset and self-host |
| B · Accessibility-max | Atkinson Hyperlegible Next | Atkinson Hyperlegible Next | Designed for low vision (Braille Institute); unambiguous letters (I/l/1, 0/O) | Less refined at high density; fewer weights |
| C · Corporate trust | Lexend | Source Sans 3 | Lexend designed for reading proficiency | Lexend's width eats space with long Kinyarwanda words |
| D · Medical clean | Figtree | Noto Sans | Noto's huge language coverage | Slightly wider than Inter |

The UI-UX Pro Max skill proposed B, C and D. The final choice is made in the design phase by testing real Kinyarwanda strings at real sizes.

### Font rules

- **Self-host fonts** (WOFF2, Latin + Latin-Ext subset). Don't call Google Fonts at runtime: it's an outside data request, it doesn't work offline in the PWA, and it's slower in Rwanda.
- Use `font-variant-numeric: tabular-nums` for ticket numbers, times, money, table columns and vitals.
- **Ticket numbers** (`G-023`) use a wide, unmistakable style: large, bold, letter-spaced, never confusable (0/O).

## 2. Type scale

| Token | Patient app | Staff app | Use |
|---|---|---|---|
| display | 40/48 | 32/40 | Ticket number, hero figures |
| h1 | 30/38 | 24/32 | Page title |
| h2 | 24/32 | 20/28 | Section |
| h3 | 20/28 | 16/24 semibold | Card title |
| body | **18/28** (large-text setting: 21/32) | 15/22 | Text |
| body-sm | 16/24 | 13/20 | Secondary, table cells (compact) |
| caption | 14/20 (minimum on patient side) | 12/16 | Meta, axis labels |

- **Patient minimum is 16 px for anything that matters, 18 px for body.** Research on older adults supports enlarged text and targets (systematic review in [Sources](11-sources.md)).
- Line length 60–75 characters for reading text.
- **Kinyarwanda strings run long** (an agglutinative language; for example a phrase like "Ibitaro byemewe n'ubwishingizi bwawe", to be checked by a native speaker). So:
  - never fixed-width buttons or tabs
  - allow wrapping to 2 lines on buttons
  - test every screen with the longest language
  - leave about 30% expansion room

## 3. Icons

- **Library: Phosphor Icons** (`@phosphor-icons/react`), the skill's default. It has a large healthcare set (Stethoscope, Pill, FirstAidKit, Heartbeat, Syringe, Hospital, Thermometer, Baby, Wheelchair) and consistent weights.
- **Weights:** Regular for UI, Bold for small sizes on low-end screens, Fill only for selected or active state. Never mix weights at the same level.
- **Sizes as tokens:** 16 (inline), 20 (UI default), 24 (patient default, navigation), 32–48 (empty states, tracker).
- **Labels:**
  - **Patients: every icon has a visible text label** (low-literacy research: icon meanings are not obvious).
  - **Staff:** icon-only buttons are allowed for very frequent actions, with a tooltip and an accessible name.
- **No emoji as interface icons.**

## 4. Spacing, grid, shape

| Token | Value |
|---|---|
| Base unit | 4 px; spacing scale 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 |
| Radius | 6 px (inputs, small), 10 px (buttons, cards, staff), 16 px (patient cards, sheets), full (pills, badges, avatars) |
| Elevation | Mostly borders. Shadows only for floating layers (menus, dialogs, toasts). Two shadow levels max. |
| Staff layout | Sidebar 248 px (collapsible to 64 px), content max 1440 px, 12-column grid, 24 px gutters |
| Patient layout | Single column max 640 px on phones and tablets; 1120 px for desktop pages with a 2-column split |
| Breakpoints | 360 (small Android), 640, 768, 1024, 1280, 1536 |
| Touch targets | Patients ≥ 48×48 px (56 for primary actions); staff ≥ 40×40 px, ≥ 24×24 hit area under WCAG 2.2 even in compact mode |

## 5. Motion

| Use | Duration / easing |
|---|---|
| Hover, press | 100–150 ms, ease-out, colour/opacity only (no layout shift) |
| Panels, sheets, dialogs | 200–250 ms enter, 150 ms exit |
| Queue row update | 1.5 s soft background highlight fade; no sliding rows (staff lose their place) |
| "You're called" | One clear pulse + sound + vibration; repeats every 30 s until acknowledged |
| Reduced motion | All non-essential motion off; the state is shown instantly |

No scroll-jacking or parallax. The landing page may use subtle fade-in reveals (≤ 400 ms, 8–16 px offset), disabled under reduced motion.

## 6. Voice and copy

- Kinyarwanda first, written by native speakers (not machine-translated), and reviewed with elderly users.
- **Buttons are verbs:** "Book visit", "Join queue", "Call next", "Sign record", "Record payment".
- **Numbers patients care about come first:** "About 25–35 min" before any explanation.
- **Errors say what happened and what to do:** "This slot was just taken. Here are the next free times."
- Medical words are explained or avoided on the patient side: "Medicine", not "Rx".
