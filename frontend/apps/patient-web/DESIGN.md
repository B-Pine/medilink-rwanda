# Design: MediLink public site

Recorded 2026-11-07 (public site audit, phase 2). The reference is the patient mobile app
(`mobile/lib/app/theme.dart`): one strong anchor per screen, a flat off-white page, white cards,
colour only where it means something, very few words. Someone comparing an app screen with a
website screen should see one product. The product context is in [PRODUCT.md](PRODUCT.md).

## Tokens

| Thing   | Value                                                                                                                                                                                        | Where                                                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Palette | The app's: page #f6f8f7, surface white, forest #123d2b, brand #17694d, ink #0e1c17, ochre for waits, red for emergency only                                                                  | `packages/ui/src/styles/tokens.css` (`data-surface="site"`) |
| Spacing | 4-pt scale (Tailwind's 1 = 4 px)                                                                                                                                                             | everywhere                                                  |
| Radii   | 8 small (chips in cards, tiles), 12 cards, buttons and inputs, 20 sheets, bands and hero art                                                                                                 | `--ml-radius-*`, `rounded-panel` (12), `rounded-shell` (20) |
| Depth   | flat page; card = white + hairline, no shadow (`shadow-e1`/`e2`); floating = hairline + one soft shadow (`shadow-e3`) for menus, sheets, the map card                                        | `apps/patient-web/src/styles.css`                           |
| Type    | display 40, page title 32–42 (fluid), section 24–30, h3 18, body 16, small 14 (caption 13). Figtree for headings and big numbers, Inter for text, `tabular-nums` for times, waits and counts | `tokens.css`, `styles.css`                                  |
| Measure | reading text at most 68 characters (`ml-measure`)                                                                                                                                            | help, legal, about, answers                                 |
| Width   | one page width, 88 rem, one left edge (`PageContainer`)                                                                                                                                      | every page                                                  |
| Motion  | 150–240 ms ease-out; press scales to 0.98 (`ml-press`, `ml-card`); 2 px lift on pointer devices only; view transitions between pages; all off with reduced motion or data saver              | `styles.css`, `base.css`                                    |

`index.html` sets `data-surface="site"`, so pre-rendered pages paint with the site scale before
hydration (no shift).

## Components

Shared, in `@medilink/ui`:

- `StatusPill`: Open / Busy / Closed / Emergency / a waiting count, always a word and a dot.
- `SegmentedControl`: two to four views (List / Map), a radio group with arrow keys.
- `Select`: replaces native selects (same look in every browser); WAI-ARIA select-only combobox,
  typeahead, Escape returns focus.
- `Sheet`: bottom sheet (filters on phones) or full height (menu); focus trapped, Escape closes,
  focus returns.
- `Accordion`: questions on native `details`, the first answer open.
- `GroupedList` / `GroupedRow`: rows in one hairline card, 56 px rows, the whole row a target.
- `StickyActionBar`: the page's main action pinned to the bottom on phones.
- `Lightbox`: facility photos full size, arrows, Escape, alt text.

Site-specific, in `features/site/kit.tsx` and `FacilityDirectory.tsx`:

- `PageHeader`: breadcrumb, `<h1>`, at most one short line, one optional action. `tone="forest"`
  on the main pages (Find care, Facilities, Doctors, Services, How it works): the app's deep-green
  band with the Imigongo texture and one rounded foot. `tone="light"` (default) on reading pages.
- `FacilityEntry`: one card per facility; the whole card opens it; one action (Join or Book while
  open, else the next free time); no map icon, no arrow.
- `FacilityStatus`, `LocationSelector` (`Select` with a pin), `Faq`, `LinkRow` (a plain brand
  icon, no tile), `EmptyState`, `NotFoundState`, `ErrorState`, `LoadingRows`.

## Rules

- One primary action per view. Actions start with a verb.
- Colour by meaning only: green for actions and open, ochre for waits and busy, red for emergency.
  Status is never colour alone.
- No decoration that adds nothing: no gradient glows, no giant wordmark, no icon tile on every row,
  no floating-card collages, no glass.
- Facility illustrations in the shared flat style; facility photos only from the facility, in a
  gallery after the facts. No stock or generated photos.
- Every list has loading (skeleton with shimmer), empty, error (with retry) and offline states.
