# Design research (v0.1)

UI/UX research and direction for MediLink Rwanda, ahead of the design phase (wireframes, design system, prototypes).

## Key decisions proposed

1. **Style: "calm clinical precision".** Accessible & Ethical as the core, Minimal/Swiss for staff tools, warm soft surfaces for patients. Neumorphism rejected (contrast risk for elderly users).
2. **Brand: emerald.** Primary is **emerald-700 `#047857`**, because white on the usual emerald-600 fails WCAG (3.77:1). Slate neutrals, amber for attention, separate status colours, a validated 6-colour chart palette led by emerald.
3. **Type:** Figtree (headings) + Inter (UI, tabular numbers), self-hosted. Patient body text 18 px.
4. **Icons:** Phosphor, always labelled on the patient side.
5. **Staff app:** left sidebar, facility switcher, command palette, side panels instead of page jumps, a live connection indicator.
6. **Signature screens:** the reception **Today board** (Expected | On site), the doctor's **My queue + consultation**, the patient **live tracker**, and the waiting-room display.
7. **Tables:** 3 densities (32/40/48 px), right-aligned tabular numbers, filter chips, saved views, an always-visible row menu, cards on mobile.
8. **Documents:** a shared A4/A5 grid with letterhead, identity block, QR verification, dosing pictograms, and an 80 mm thermal version for receipts and tickets.
9. **Local identity:** Imigongo-inspired geometry, real Rwandan photography, Kinyarwanda first.

## Documents

| # | Topic |
|---|---|
| [01](01-design-direction.md) | Design direction, principles, local identity |
| [02](02-color-system.md) | Emerald colour system: ramp, tokens, measured contrast, combinations, status and queue colours, chart palette |
| [03](03-typography-icons-layout.md) | Typography, icons, spacing, grid, motion, voice |
| [04](04-dashboards.md) | Dashboard inspiration, staff shell, dashboards per role, waiting-room display, charts, real-time |
| [05](05-authentication.md) | Login, sign-up, 2FA, invites, facility application, account flows |
| [06](06-homepage-and-public-pages.md) | Homepage conditions and structure, search, facility profile, public pages |
| [07](07-patient-app-pages.md) | Patient PWA navigation, booking flow, live tracker, records |
| [08](08-tables.md) | Data table specification |
| [09](09-documents.md) | PDF and print design: prescription, receipt, sick note, referral, ticket |
| [10](10-accessibility-and-localization.md) | Accessibility gates and localisation rules |
| [11](11-sources.md) | Sources and tools |

## Next (design phase)

Design tokens file → component library → low-fidelity wireframes of the signature screens → usability tests with reception staff and elderly patients → high-fidelity designs.
