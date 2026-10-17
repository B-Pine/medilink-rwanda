# 10 · Accessibility and localisation

Status: Research v0.1 · Baseline: **WCAG 2.2 AA everywhere; AAA contrast (7:1) for patient body text where feasible.**

## 1. Why higher than the minimum

- Many patients are older. Contrast sensitivity loss often goes unnoticed on standard vision tests, which is why AAA contrast is recommended for elderly healthcare users.
- Low literacy and first-time smartphone use are common.
- Shared, glare-prone screens at reception; cheap phones outdoors in sunlight.

## 2. Checklist (design phase gates)

| Area | Requirement |
|---|---|
| Contrast | Text ≥ 4.5:1 (patient body text target ≥ 7:1: `#0F172A` on white is 17.85); UI controls and focus ≥ 3:1; measured in **both** themes ([02](02-color-system.md)) |
| Colour | Never the only signal: icon + label on every status; charts with labels or a table view |
| Text size | Patient body 18 px; user setting up to 21–22 px without breaking layouts; support 200% browser zoom and 400% reflow at 320 px |
| Targets | Patients ≥ 48 px (56 for primary actions); staff ≥ 40 px; never below 24×24 hit area (WCAG 2.2 *Target Size (Minimum)*) |
| Focus | Visible 2–3 px emerald ring with offset; never hidden under sticky headers (WCAG 2.2 *Focus Not Obscured*) |
| Keyboard | Every action reachable; staff shortcuts documented; no keyboard traps; skip link |
| Forms | Visible labels; inline errors linked to fields; focused error summary on submit; inputs keep values after errors; correct `autocomplete` and input modes |
| Authentication | Paste and password managers allowed; magic link alternative (WCAG 2.2 *Accessible Authentication*) |
| Dragging | Any drag (e.g. calendar) has a button alternative (WCAG 2.2 *Dragging Movements*) |
| Motion | `prefers-reduced-motion` respected; no flashing; the "called" alert uses one pulse, not strobing |
| Time limits | Warn and allow extension (staff idle lock is a security exception, but unsaved work is kept) |
| Screen readers | Landmarks, headings in order, live regions for queue position changes (polite) and "You're called" (assertive) |
| Language | `lang` attribute per page and for mixed-language fragments (rw / en / fr) |
| Documents | Tagged PDFs, reading order, language set ([09](09-documents.md)) |
| Testing | Automated (axe) in CI + manual keyboard and screen reader (NVDA, TalkBack) + **usability sessions with elderly patients at the pilot facility** |

## 3. Localisation

| Topic | Rule |
|---|---|
| Languages | Kinyarwanda (default), English, French. Every string goes in translation files (no hard-coded text, per CONTRIBUTING). |
| Translation quality | Native-speaker writing for Kinyarwanda, reviewed with real users. Medical terms validated with clinicians. **No raw machine translation in production.** |
| Text expansion | Design with about 30% expansion; buttons and tabs wrap; no text in images |
| Formats | Dates `14/10/2026` or "14 Ukwakira 2026" (localised month names); 24-hour time; Africa/Kigali; RWF with thousands separators, no decimals |
| Names | Rwandan names don't follow "first/last" consistently. Use "Names" as one field, plus an optional "Preferred name"; search matches any part. |
| Phone | +250 format with input mask; accept 07xx local entry |
| Addresses | Province → District → Sector → Cell → Village pickers (master data), plus free text and a map pin |
| Plurals | ICU message format (i18next) so counts read correctly in all three languages |
| Audio (later) | Voice prompts for the tracker and USSD-like flows for low-literacy users: P3+ idea, worth testing |
