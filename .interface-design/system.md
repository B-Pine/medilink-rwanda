# MediLink interface system

Approved 2026-11-01 from the redesign prototype (claude.ai/artifact/HBBbfVfWCe27Sbi4S4Wdfx).
Tokens live in `frontend/packages/ui/src/styles/tokens.css`; this file records the decisions
behind them. Design research: `docs/design/research/`.

## Direction

A Rwandan clinic on a busy morning: the front desk, the waiting benches, the ticket in a
patient's hand. Calm and dense for staff, warm and plain for patients. Every screen has one
focal point: the thing this person came to do.

| Person | Focal point |
|---|---|
| Receptionist | One check-in search, then Expected and Waiting side by side |
| Doctor | The patient in the room, then "Finish and call next" |
| Pharmacist | The open prescription, item by item |
| Facility admin | The patient flow with the slow step called out |
| Platform admin | Applications waiting, oldest first |
| Patient | Care near them (or their live ticket once they join) |

## Signature elements

1. **Ticket stub**: `<TicketNumber stub tone=…>`, a notched ticket. Used wherever a patient's
   ticket appears. Tones: `brand` (default), `attention` (next up, your turn), `danger`
   (emergency), `neutral` (not arrived).
2. **Flow strip**: `<FlowStrip stages=…>`, Expected → Waiting → With doctor → Payment →
   Pharmacy, with a count, one fact and a bar per stage. The bottleneck is `hot` (attention
   colour). Same strip on reception and on the facility dashboard.
3. **Imigongo** pattern only on deep-forest bands (hero, login panel, waiting-room display), at
   4-9% opacity. Never in product chrome.

## Colour

- Neutrals lean toward the forest green (`#f2f5f3` page, `#0e1f18` ink); never plain slate.
- Emerald is the only action colour. Deep forest for the few dark bands.
- **Attention** (ochre, `attention-*` tokens) is the one accent: "your turn", the slow step,
  work waiting for someone. Not for decoration.
- Status colours (success, warning, danger, info) always come with an icon and a word.
- Both themes are designed; dark keeps one hue and shifts lightness.

## Depth and surfaces

- Cards: `shadow-card` (1px ring + two soft depths), no hard border. Dark mode: ring only.
- Floating layers (menus, dialogs, side panels): `shadow-raised`.
- Sidebar and top bar sit on the page colour with a hairline edge. Active menu item is a
  surface pill with `shadow-card`.
- Inputs keep a visible border (3:1 contrast); everything else avoids lines.

## Type

- Figtree for headings and ticket numbers (tracking -0.015em on headings), Inter for text.
- Staff body 15px, patient body 18px (density tokens). Scale ratio about 1.25.
- Hierarchy from weight and colour first: value 600-700 / primary, label 500 / muted,
  meta 400 / muted, caption 12px uppercase tracked for eyebrows only.
- Every changing number is `tabular-nums`. Times are 24-hour, Kigali time, from the shared
  formatters.

## Spacing and shape

- 4px base. Staff density: cards 16px inner padding, rows 10px × 16px, page padding 24-32px.
- Radius: 6 controls, 10 cards (staff) / 16 (patient), 20 phone frames and hero bands.
- Concentric radius for nested shapes.

## Motion

- 150-300ms, `cubic-bezier(0.23, 1, 0.32, 1)`. Buttons scale to 0.97 on press.
- Live data: `ml-live-dot` pulse. Changed queue rows highlight and fade.
- Nothing animates for keyboard-driven actions; reduced motion turns movement off.

## Navigation rules

- The menu shows only permitted, built sections (no placeholder pages), grouped as daily work,
  "Manage", the MediLink platform, and help at the foot.
- A platform admin without a facility lands on the platform overview.
- A permission gap shows "You don't have access", never "Page not found".

## Example data

Mocks share one cast. Kigali Clinic doctors are Dr Uwimana Keza (general) and Dr Niyonsenga
Paul (paediatrics); reception is Habimana Eric. Facility hours are Monday to Friday 07:30-17:00.
