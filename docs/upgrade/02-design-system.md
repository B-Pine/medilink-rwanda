# 02 · Design system

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md) · Builds on [`.interface-design/system.md`](../../.interface-design/system.md) (approved 2026-11-01) and [design research](../design/research/README.md)

This is the rulebook every screen follows: patient, staff, display and print. When a screen breaks one of these rules, the audit ([09](09-audit-method.md)) records it as a defect. Token values live in `frontend/packages/ui/src/styles/tokens.css`; this document explains the rules behind them.

## 1. Direction: "the clinic, made visible"

Each screen answers one question with live data. The interface gets its quality from typography, spacing and real numbers, not from decoration. It should feel like a precise instrument: calm, dense where staff need density, spacious where patients need space.

Three brand devices carry the identity:

| Device | What it is | Where it appears |
|---|---|---|
| **Ticket** | A notched ticket stub with the ticket number in large display figures. Tones: brand (default), attention (next up, your turn), danger (emergency), neutral (not arrived). | Patient tracker and home, reception queue rows, doctor's queue, waiting-room display, printed ticket slip |
| **Flow** | Expected → Waiting → (Triage) → Doctor → (Lab) → Payment → Pharmacy, with a count and bar per stage; the slowest stage is highlighted in the attention colour. | Reception board, facility admin dashboard, patient tracker (as a stage line) |
| **Time** | The most prominent number on a screen is a time: wait, slot or "leave by". | Every patient screen; the display |

## 2. Foundations

| Area | Rule |
|---|---|
| **Grid** | 4 px base unit. Staff: 12 columns, 24 px gutters, sidebar 240 px (64 px collapsed), content max 1440 px. Patient: one column up to 640 px; two columns from 1024 px. Breakpoints 360, 640, 768, 1024, 1280. |
| **Type** | Figtree for headings and ticket numbers, Inter for text, both self-hosted. Scale 12 · 14 · 16 · 18 · 24 · 32 · 48 · 72 (ticket). Staff body 15 px, patient body 18 px (21 px with large text). Hierarchy comes first from weight (400, 500, 600) and colour, then size. Every changing number uses tabular figures. |
| **Colour** | Ink `#0E1F18` on page `#F2F5F3` and surface `#FFFFFF`; neutrals tinted toward forest green. **Emerald `#047857`** is the only action colour. **Ochre** (`attention-*`) is the only accent and means time or "your turn". **Red** means danger only. Status colours (success, warning, danger, info) always come with an icon and a word. No other colours in the product chrome. |
| **Colour (public brief, 2026-11-02)** | Light values follow [11](11-public-website.md) §2: forest `#123D2B`, emerald `#168451` (white 4.72:1), link `#11744A`, text `#17231D`, page `#F7F9F7`, light green `#EDF5EF`. Dark theme unchanged. |
| **Illustration (public pages)** | Custom minimal SVG illustrations are allowed on public pages ([11](11-public-website.md) §7); stock photos and generic AI art are still not. |
| **Dark theme** | Designed, not inverted: surfaces `#0A1310`, `#101C17`, `#14221C`; emerald lifted to `#34D399` with dark text `#022C22`. Recommended for night shifts. |
| **Surfaces** | Flat. Hairline dividers separate rows. Cards only for things a person acts on. One soft card shadow (`shadow-card`); a raised shadow only for menus, dialogs and side panels. No borders on cards, no cards inside cards. Inputs keep a visible border at 3:1 contrast or more. |
| **Radius** | 6 px controls, 10 px staff cards, 16 px patient cards, 20 px hero bands, full round for pills. Nested shapes use concentric radius. |
| **Icons** | Phosphor, one weight (Regular) for UI, Fill only for a selected state. 16, 20 or 24 px. Patient screens: every icon has a visible label. Staff screens: icon-only buttons only for frequent actions, with a tooltip and an accessible name. |
| **Imagery** | Real Rwandan photography with recorded consent, only on public pages. The Imigongo pattern only on deep-forest bands, at 4–9 % opacity. No stock photos, no generic AI illustrations, no emoji as icons. |

## 3. Core components

All live in `packages/ui`, one file each, with unit and axe tests. Feature code composes them and never restyles them.

| Component | Rule |
|---|---|
| `TicketNumber` (stub) | The ticket device; display size 48–72 px on the tracker and display, 20–24 px in rows |
| `FlowStrip` | Stage counts and bars; one stage `hot` at most |
| `LiveValue` | A number with a small live dot; hover or focus shows "updated 12 s" |
| `FacilityRow` | Name · type · distance · open · waiting · ~minutes · insurance chips · one action. Columns align across rows. |
| `FacilityMap` | Pins by type (health centre, hospital, clinic) and coloured by wait; selected pin opens a compact card; keyboard list alternative |
| `DoctorCard` | Name, title, specialty, "Treats" tags, languages, next free time, Book |
| `AvailabilityStrip` | Seven days with a fill bar and "n free"; tapping a day shows time chips |
| `CommandBar` | Staff `Ctrl+K`; patient search field that accepts free text |
| `SidePanel` | Detail on the right on staff screens; the list keeps its scroll and focus |
| `SegmentedControl` | Duty status, List \| Map, filters with two to four options |
| `InlineStatus` | Icon + word ("Ready · Paid"), never a colour alone |
| `DataTable` | Densities 32/40/48 px, sticky header, right-aligned tabular numbers, chips for filters, row actions always visible, cards below 640 px |
| `EmptyState` | One line and one action, no illustration |
| `ProfileSwitcher` | Avatar colour and name of the active profile, visible on every signed-in patient screen |

## 4. Layout patterns

| Surface | Pattern |
|---|---|
| Public pages | Search and filters on top; the list (and map on desktop) is the main content; three to five sections in total |
| Patient app | Header with profile switcher and bell; bottom tabs Home · Visits · Health · Me on phones, the same items in the header from 768 px |
| Staff workspaces | Sidebar grouped by daily work, Manage, Platform, Help; a page title row with one primary action; content as a queue or table with a side panel |
| Waiting-room display | Deep-forest full screen, "Now serving" with room, next numbers, clock, announcement line |
| Print | Black and white, A5/A4 documents, 58/80 mm thermal slips and receipts, QR verification block |

## 5. Interaction

- **One primary button per view.** Other actions are secondary or quiet.
- **Keyboard first on staff screens:** `/` search, `N` new walk-in, `Space` call next, `J`/`K` next and previous row, `Enter` open, `Esc` close. Shortcuts are ignored while typing or while a dialog is open.
- **Optimistic updates** for queue actions, rolled back with a clear message when the server refuses (`409` reloads the item).
- **Live without noise:** a changed row glows once for 1.5 s and never moves under the pointer or the focus; new rows above the fold show a "3 new" pill instead of jumping.
- **Undo before confirm:** reversible actions offer undo; irreversible or audited ones ask for a reason in a dialog.
- **Progressive disclosure:** the decision first, the details one tap away.
- **Patients:** one decision per screen in multi-step flows, step indicator, back keeps answers, nothing lost on refresh.

## 6. Motion

- 150–250 ms, easing `cubic-bezier(0.23, 1, 0.32, 1)`; buttons scale to 0.97 on press.
- Only three moments animate: the "You're called" takeover (with sound and vibration until acknowledged), live-row highlights, and panels entering.
- No parallax, no scroll-jacking, no animated counters. `prefers-reduced-motion` and data-saver mode turn movement off.
- **Decision 2026-11-02 (product owner):** public pages also use gentle transitions. Page sections enter with a 220 ms fade and 4 px lift, staggered by 40 ms (`.ml-stagger`); cards, dialogs and the map card rise into place (`animate-rise`, 240 ms); hover and pressed states ease over 150–200 ms; a live value glows once when it changes. Opacity and transform only, one easing (`ease-out-quint`).

## 7. Accessibility and performance (release gates)

| Gate | Target |
|---|---|
| Standard | WCAG 2.2 AA everywhere; patient body text aims for 7:1 contrast |
| Targets | Patients ≥ 48 px (56 px primary); staff ≥ 40 px; never below 24 × 24 px hit area |
| Keyboard and screen reader | Every action reachable; visible focus ring (emerald, 2 px offset); live regions: queue position polite, "You're called" assertive |
| Zoom and reflow | 200 % zoom; 320 px width without horizontal scroll |
| Language | `lang` follows the UI language; 30 % room for longer Kinyarwanda strings; no text in images |
| Performance | Public pages: largest content in < 2.5 s and < 100 KB JavaScript on 3G. Patient app first load < 3 s on 3G. Staff actions < 500 ms server time. |

## 8. Words

| Rule | Example |
|---|---|
| Labels are one to three words | "Join", "Call next", "Sign", "Insurance" |
| Numbers before sentences | "6 waiting · ~25 min", not "There are currently 6 people waiting" |
| No subtitles under headings, no intro paragraphs | The page title is enough |
| Buttons are verbs | "Book", not "Submit" |
| Empty states: one line + one action | "No visits yet · Find care" |
| Errors: what happened + what to do | "Time just taken · Pick another" |
| One disclaimer, only where required, small | Symptom checker result: "Guidance, not a diagnosis" |
| Kinyarwanda first, written by native speakers | No raw machine translation in production |
| No marketing voice inside the product | No "We're excited", "Seamless", "Revolutionary" |

## 9. What we never do

These patterns make software look amateur or machine-generated, and the audit flags them:

- Gradient heroes, glassmorphism, neon or purple accents, heavy drop shadows.
- A row of three feature cards with an icon each; icons on every line.
- Cards inside cards; a border around every block.
- Centred text inside the product; long paragraphs; repeated explanations of obvious actions.
- Emoji as icons; decorative illustrations in the product; stock doctors.
- Placeholder data, fake statistics, "Coming soon" pages in navigation.
- More than one primary button, or colours that carry no meaning.
