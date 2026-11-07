# Design: MediLink public site

Recorded 2026-11-04 from the shipped public pages, which are the reference: landing, Find care,
Facilities, Doctors, Services, the facility, doctor and service pages, Emergency, How it works,
About, Help, Contact, Verify, the legal pages, For facilities, Check symptoms and the AI
assistant. The product context is in [PRODUCT.md](PRODUCT.md). The audit behind the design is in
[docs/design/public-site-audit-2026-11-04.md](../../../docs/design/public-site-audit-2026-11-04.md).

## Thesis

A national public health service, not a marketplace. Hierarchy comes from type, facts and rules
on one quiet surface. The model is Microsoft Fluent's layering (a neutral page, content on a
surface) combined with the NHS and GOV.UK service patterns: directories, summary lists, care
cards and step-by-step lists.

## Surfaces

- **Page**: `--ml-bg-page` (#f6f8f7), the neutral base layer. Nothing decorative sits on it: no
  gradient mesh, blobs or illustration.
- **Surface**: white (`bg-surface`) with a 1 px `border-border` hairline and `rounded-lg` (8 px
  on the site). There is one surface per block of content; surfaces are never nested.
- **Rows** inside a surface are divided by `border-b border-border` hairlines, with 20–24 px side
  padding (`px-5 sm:px-6`) and 16–20 px vertical padding.
- **Elevation** is only for things that float: the sticky header once scrolled, the assistant
  button, menus and dialogs. Content panels have no shadow.

## Type

- **Figtree 700** for headings (never 800). Page H1: 32 px, 40 px from `sm`. Section H2: `text-h2`.
  Row titles: Figtree 18 px or Inter semibold.
- **Inter** for everything else. Reading text uses `text-fg` at a 68ch measure; `text-fg-secondary`
  is for the second line of a row, never for body paragraphs.
- **Numbers**: times, waits, counts and distances use `tabular-nums`.
- **Case**: sentence case everywhere. There are no eyebrow or kicker labels above titles and no
  tracked uppercase captions (footer column headings included). A category or parent belongs in
  the breadcrumb.

## Colour, by meaning only

- **Forest green** (`--ml-link`, `--ml-action-primary` #17694d): actions and links only. Facility,
  doctor and service names are green links.
- **Red** (`danger`): emergency only. Used for the header strip, the emergency care card,
  "24-hour emergency" and the hospital note.
- **Amber** (`attention`): waits and "Busy".
- **Status** is always a word with a small mark: a filled dot for open, amber for busy, an empty
  ring for closed. Colour is never the only signal.
- **Violet**: kept only for the AI assistant's own identity (test badge, panel title).

## Patterns

| Need                  | Pattern                                                                                                                                                                                                                               | Where                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Many places           | Directory rows on one surface: name link, type · place · distance, emergency in red words, "Accepts …" in words; status, wait and next step (a link with an arrow) in a right-hand column from 48 rem of list width (container query) | `FacilityEntries` / `FacilityEntry` in `features/site/FacilityDirectory.tsx`; doctors list |
| A short live list     | Compact rows (name, status; type · district, wait; insurance) with a footer link                                                                                                                                                      | landing "Open near you"                                                                    |
| Facts about one thing | Summary list: label column (11 rem, semibold) and answer column, with hairlines                                                                                                                                                       | facility "Today", doctor aside                                                             |
| An index              | A heading per group over a list of links; groups as jump links in a side column                                                                                                                                                       | Services, landing "What care do you need?"                                                 |
| A sequence            | Numbered circles (1 px outline) joined by a 1 px line, with step text beside                                                                                                                                                          | How it works, landing steps, For facilities                                                |
| Urgent action         | Care card: red heading bar, signs as a plain bulleted list, one solid call button                                                                                                                                                     | Emergency                                                                                  |
| Reading               | Narrow container (48 rem), one document surface, H2s per section, "On this page" as a plain list with a hairline                                                                                                                      | About, legal pages, Accessibility                                                          |
| Questions             | `Faq` (native `details`) rows inside one surface                                                                                                                                                                                      | Help, For facilities                                                                       |

## Controls

- One primary button per view (pill, green): Search on the landing page; Join Queue or Book in
  the facility header; Call 912 (red, `rounded-md`) on Emergency.
- Next steps inside lists are text links with an arrow, never a button per row.
- Inputs and filter controls keep the pill shape of the search field. Every target is at least
  44 px.

## Motion

- One authored motion: page cross-fades (view transitions). Small hover colour changes and arrow
  nudges stay at 150 ms or less.
- Content is visible on first paint. There are no scroll reveals (`.ml-reveal` was removed),
  no entrance sequences on content, no pulsing or pinging icons on emergency, and no lift on
  hover for rows.
- Reduced motion and data saver switch the remaining motion off.

## Imagery

- No illustration heroes, phone mock-ups or invented dashboards and numbers.
- Facility photos come from the facility's own uploads. They are shown after the facts as a row
  of up to four, never as a hero gallery.
- The Imigongo zigzag appears once, on the footer's top edge.

## Do not

- Show a facility as a product card (image header, chips, a Book pill, Details, a map icon).
- Use icon tiles as page structure (icon square plus title plus arrow, in a grid).
- Add gradient text, glass panels, coloured left borders wider than 1 px, or a dark marketing
  band.
- Show draft markers or the holes they leave in legal text.
