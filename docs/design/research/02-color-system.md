# 02 · Colour system: emerald

Status: Research v0.1. **Every contrast ratio below was computed** (WCAG 2.x relative luminance). The chart palette was validated with the dataviz validator for colour-blind (CVD) separation in light and dark mode. Nothing was eyeballed.

## 1. The brand ramp (emerald)

Based on the widely used Tailwind emerald scale, so designers and developers share the same values.

| Step | Hex | Main use |
|---|---|---|
| 50 | `#ECFDF5` | Brand-tinted backgrounds, selected rows, info panels |
| 100 | `#D1FAE5` | Hover on tinted surfaces, badges |
| 200 | `#A7F3D0` | Text/icons on dark emerald (sidebar, hero) |
| 300 | `#6EE7B7` | Illustrations, highlights on dark |
| 400 | `#34D399` | **Primary in dark mode** |
| 500 | `#10B981` | Illustrations, large graphics only |
| 600 | `#059669` | Focus ring, chart series 1, icons, large text only |
| **700** | **`#047857`** | **Primary button and link colour (light mode)** |
| 800 | `#065F46` | Hover/pressed, text on emerald-50 |
| 900 | `#064E3B` | Dark brand surfaces (sidebar option, hero) |
| 950 | `#022C22` | Deepest brand surface ("deep forest"), dark-mode text on emerald-400 |

### Critical finding

**White text on emerald-600 (`#059669`) is only 3.77:1.** That fails WCAG AA for normal text, and it's the shade most "emerald" templates use for buttons. MediLink's primary button is therefore **emerald-700 `#047857` (5.48:1 with white)**, with hover at emerald-800 (7.68:1).

## 2. Neutrals

Slate (cool grey) pairs cleanly with emerald and reads clinical, not cold. The page background is a faintly green-tinted off-white.

| Token | Light | Dark | Measured contrast |
|---|---|---|---|
| `bg-page` | `#F6F8F7` | `#0B1411` | — |
| `bg-surface` (cards, tables) | `#FFFFFF` | `#111C18` | — |
| `bg-raised` (menus, popovers) | `#FFFFFF` + shadow | `#16231E` | — |
| `bg-subtle` (table header, wells) | `#F1F5F9` | `#16231E` | — |
| `text-primary` | `#0F172A` | `#F1F5F9` | 17.85 on white · 17.08 on dark bg |
| `text-secondary` | `#334155` | `#CBD5E1` | 10.35 on white · 11.76 on dark surface |
| `text-muted` | `#475569` | `#94A3B8` | 7.58 white · 7.10 page · 6.81 dark surface |
| `border-subtle` (decorative dividers) | `#E2E8F0` | `#24332D` | decorative only |
| `border-input` (form controls) | `#7C8A9D` | `#5B6E66` | 3.51 on white · 3.21 on dark (≥ 3:1 required for controls) |

### Traps found

- **slate-500 `#64748B` passes on white (4.76) but fails on the page background (4.46).** Muted text is therefore slate-600.
- **slate-400 input borders (2.56) fail the 3:1 rule for form controls.** Use `#7C8A9D`.

## 3. Semantic tokens

| Token | Light | Dark | Notes |
|---|---|---|---|
| `brand` / `action-primary` | `#047857` | `#34D399` | Dark mode uses dark text `#022C22` on it (7.88:1) |
| `action-primary-hover` | `#065F46` | `#6EE7B7` | |
| `action-primary-text` | `#FFFFFF` | `#022C22` | |
| `brand-subtle-bg` | `#ECFDF5` | `#0F2A22` | Selected rows, active nav item |
| `brand-subtle-text` | `#065F46` | `#6EE7B7` | 7.29 on emerald-50 |
| `link` | `#047857` | `#34D399` | Underlined in body text |
| `focus-ring` | `#059669` (2–3 px + 2 px offset) | `#34D399` | 3.77 / 9.08 vs surface (≥ 3:1) |
| `accent` | `#FBBF24` (amber-400) with `#0F172A` text | `#FBBF24` | Highlights, "new", "time to leave". 10.69:1 with dark text. **Never white text on amber.** |

### Status colours

Each status always comes with an icon and a label.

| Status | Text / icon (light) | Background (light) | Text (dark) | Measured |
|---|---|---|---|---|
| Success | `#15803D` (green-700) | `#F0FDF4` | `#4ADE80` | 5.02 on white |
| Warning | `#B45309` (amber-700) | `#FFFBEB` | `#FBBF24` | 5.02 on white · 10.46 on dark |
| Danger | `#B91C1C` (red-700) | `#FEF2F2` | `#F87171` | 6.47 on white · 6.31 on dark |
| Info | `#1D4ED8` (blue-700) | `#EFF6FF` | `#60A5FA` | 6.70 on white · 6.87 on dark |

**Success vs brand:** because the brand is green, a "success" message could be mistaken for a button. Success uses a *different green* (green-700, a yellower green), and always has a check icon and a tinted background, never a solid emerald fill.

## 4. Queue and visit state colours

These are the states staff and patients see most. Each is a badge with an **icon + label**.

| State | Badge style | Icon (Phosphor) |
|---|---|---|
| Expected (booked, not arrived) | Outline, slate | `CalendarCheck` |
| Waiting | Blue tint (info) | `HourglassMedium` |
| Called | **Amber tint, bold** (attention) | `MegaphoneSimple` |
| In consultation | Emerald tint | `Stethoscope` |
| On hold (results) | Violet tint `#6D28D9` on `#F5F3FF` | `Flask` |
| Awaiting payment | Amber outline | `Receipt` |
| At pharmacy | Blue outline | `Pill` |
| Completed | Slate tint | `CheckCircle` |
| No-show / Left | Red outline | `UserMinus` |
| Priority | Violet solid, white text (7.10) | `Wheelchair` / `Star` |
| Emergency | Red solid, white text (6.47) | `Siren` |

On the **patient tracker**, "You're called" takes over the screen in emerald with a sound and vibration. It's the single most important moment in the app.

## 5. Approved combinations

| Combination | Where | Composition (60-30-10) |
|---|---|---|
| **A · Clinical calm** (default) | Staff app, patient app | 60% white/off-white · 30% slate text and borders · 10% emerald actions; amber only for attention |
| **B · Deep forest** | Landing hero, login brand panel, waiting-room display | Emerald-950 `#022C22` / 900 background · white and emerald-200/300 text (9.9–15:1) · amber-300 accent (10.5:1) |
| **C · Mint warmth** | Patient app home, onboarding, empty states | Emerald-50 surfaces · emerald-800 text · white cards · illustration accents |
| **D · Rwanda accent** | Marketing illustrations, campaign pages only | Emerald + sky blue `#00A1DE` + sun yellow `#FAD201`. **Never for text:** sky blue on white is 2.94:1. |

**Don'ts:**
- emerald text on a mint background below emerald-700
- white text on emerald-500/600
- white text on amber
- red and green as the only difference between two things
- more than one saturated colour per component

## 6. Chart palette (validated)

Validated with the dataviz skill's palette validator: lightness band, chroma floor, colour-blind separation (protanopia/deuteranopia), normal-vision floor, and contrast. Emerald leads so single-series charts carry the brand. **Red is excluded from series** because it's reserved for "critical" in a clinical product.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | emerald | `#059669` | `#059669` |
| 2 | blue | `#2A78D6` | `#3987E5` |
| 3 | orange | `#EB6834` | `#D95926` |
| 4 | violet | `#6250D6` | `#9085E9` |
| 5 | yellow | `#EDA100` | `#C98500` |
| 6 | magenta | `#E87BA4` | `#D55181` |

### Validator results

| Mode | Lightness | Chroma | CVD separation (worst adjacent) | Normal vision | Contrast |
|---|---|---|---|---|---|
| Light (on `#FFFFFF`) | PASS | PASS | PASS · ΔE 16.3 | PASS · ΔE 19.6 | WARN: yellow 2.17, magenta 2.69. Visible labels or a table view are required. |
| Dark (on `#111C18`) | PASS | PASS | PASS · ΔE 13.2 | PASS · ΔE 19.3 | PASS (all ≥ 3:1) |

### Rules

- **Lines and bars:** up to 6 series in this fixed order. A 7th or later series folds into "Other".
- **Scatter or maps,** where any two colours can touch: max 3 series, using **emerald, blue, yellow** (all-pairs PASS, ΔE ≥ 13.2) or emerald, blue, magenta. Emerald + blue + violet **fails** (violet and blue collapse for colour-blind users).
- **Sequential (magnitude), light:** emerald `#10B981 → #059669 → #047857 → #065F46` (4 steps, ordinal check PASS).
- **Sequential, dark:** `#065F46 → #047857 → #059669 → #10B981 → #34D399` (5 steps, PASS).
- **Status in charts** (e.g. on-time vs late) uses the status colours plus icon and label, never series colours.
- **Never two y-axes.** Waits and visit counts go in two charts.

## 7. Dark mode

- **Staff:** offered as a toggle and recommended for night shifts and dim reception areas.
- **Patients:** follows the system setting.
- **Dark is its own palette:** green-black surfaces `#0B1411` / `#111C18` / `#16231E` and the brand lifted to emerald-400. It is **not** an automatic inversion.
- Each dark pair was measured separately (tables above).
