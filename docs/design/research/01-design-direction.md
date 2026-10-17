# 01 · Design direction and principles

Status: Research v0.1 · Input to the design phase. Sources in [11 · Sources](11-sources.md).

## 1. What we are designing for

| Factor | Implication |
|---|---|
| Elderly, low-literacy and first-time smartphone users (patients) | Large type, plain words, icons always labelled, one decision per screen, forgiving errors |
| Busy reception at 06:00–10:00 on low-end PCs | Speed over beauty: keyboard-first, dense but legible, no heavy animation |
| Doctors with a few minutes per patient | Everything for one consultation on one screen; history one click away |
| Weak networks, cheap Android phones | Small pages, system-light visuals, offline states designed, not improvised |
| Kinyarwanda first (long words), English, French | Layouts must stretch; no fixed-width buttons; no text in images |
| Health data shown in public places (reception, waiting room) | Privacy by layout: names hidden on shared screens, quick lock |
| Trust is the product | Calm, consistent, honest. No dark patterns, no fake urgency, no stock "AI" gloss |

## 2. Chosen style: "calm clinical precision"

A blend of three proven styles:

| Style | Taken for | Reference products |
|---|---|---|
| **Accessible & Ethical** (core) | High contrast, visible focus, 44 px+ targets, semantic structure, reduced motion | NHS digital service manual, GOV.UK Design System |
| **Minimal / Swiss** (staff apps) | Grid, typographic hierarchy, colour only where it means something, dense tables | Linear, Stripe Dashboard, Vercel |
| **Soft, warm surfaces** (patient app) | Rounded cards, mint tints, friendly illustrations, generous spacing | Doctolib, One Medical, Jane |

**Rejected:**
- **Neumorphism.** The UI-UX Pro Max skill suggested it for health apps. Its low-contrast embossed surfaces fail elderly users and WCAG.
- **Glassmorphism and heavy gradients.** Costly on cheap phones, and poor contrast.
- **Neon or AI-style purple gradients.** They undermine clinical trust.

## 3. Design principles

1. **Clarity before beauty.** Every screen answers "Where am I? What do I do next?" in under 3 seconds.
2. **Colour carries meaning, never decoration.** Emerald means *brand and primary action*. Status colours mean *state*. Everything else is neutral (pattern from Vercel and Linear).
3. **Never colour alone.** Every status has an icon and a word. This covers colour-blind users, printed documents and low-quality screens.
4. **One primary action per view.** One emerald button; everything else is secondary or quiet.
5. **Density fits the user.** Patients get spacious layouts. Staff get dense, scannable layouts, with a density switch (comfortable / compact).
6. **Fast is a feature.** Optimistic updates for queue actions, skeletons that match the final layout, no spinners for actions under 300 ms.
7. **Design every state.** Empty, loading, offline, error, no permission, and too much data are designed screens, not afterthoughts.
8. **Privacy is visible.** Shared screens show ticket numbers, not names. Sensitive fields are masked until revealed. Staff screens lock quickly.
9. **Words are design.** Kinyarwanda-first copy, short sentences, verbs on buttons ("Book visit", not "Submit").
10. **Rwandan, not generic.** Local photography, Imigongo-inspired geometry, and the national context. It must not look like a US telehealth template.

## 4. Local visual identity

- **Imigongo geometry:** the traditional Rwandan art from Nyakarambi, with zig-zag, diamond and spiral geometric patterns. A restrained line version can be used as a brand texture: hero backgrounds, empty-state illustrations, document watermarks, the waiting-room display frame. Use emerald-on-emerald tints or white at low opacity, never the full black-and-ochre palette, so it stays calm.
- **National colour echo:** the flag's sky blue, sun yellow and green can appear as an *occasional* accent trio (e.g. the illustration set or the landing page footer), not in the UI system.
- **Photography:** real Rwandan patients, nurses and facilities, with consent forms. No generic western stock images.
- **Illustration:** simple flat people with diverse ages: elderly, mothers with babies, workers. Two-tone emerald and neutral, with one accent.

## 5. Two products, one family

| | Patient web app (PWA) | Staff web app |
|---|---|---|
| Mood | Warm, reassuring, spacious | Calm, precise, efficient |
| Layout | Single column, bottom navigation on mobile, top navigation on desktop | Left sidebar + top bar + content; split views |
| Density | Spacious (16–24 px gaps, 48–56 px controls) | Comfortable by default, compact option (8–16 px gaps, 36–40 px controls) |
| Type size | Body 17–18 px, option to enlarge to 20–22 px | Body 14–15 px, tables 13–14 px |
| Colour use | Mint tints, emerald primary, illustration | Mostly neutral, emerald for primary action and selection only |
| Motion | Gentle (200–300 ms), reduced-motion respected | Minimal (≤ 150 ms), none on data updates except a brief highlight |
| Dark mode | Follows system, toggle in settings | Toggle; recommended for night shifts |

Both share the same tokens, components, icons and voice.
