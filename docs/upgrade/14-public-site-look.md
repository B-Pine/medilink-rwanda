# 14 · Public site: look audit and upgrade plan

Status: v0.1 (2026-11-04) · Owner: product owner (direction), frontend (build)

**Scope.** Every public and sign-in page of `patient-web` (the patient dashboard is out of scope). The
rule from the product owner: **nothing existing changes** (content, features, data, routes, order of
sections, the three languages); **only the look improves**: cleaner combinations of the colours we
already have, a single type scale, richer surfaces, smooth transitions, and drawn buildings on
facility cards.

**Method.** The mock build (`build:mock`) was screenshotted at 1440 px and 390 px, reduced motion,
Kinyarwanda (30 pages, `/` to `/no-such-page` plus one facility, doctor and service detail).
Earlier briefs still apply: [11 public website](11-public-website.md), the public design brief of
2026-11-04 ("clean means ordered and polished, not plain"), flat printed-paper surfaces (no glossy
mesh gradients), ochre only for waits and "your turn", WCAG 2.2 AA.

## 1. What is already good

- One template for every page (breadcrumb, H1, lead), the same header and footer, the emergency
  bar on every page.
- Brand colours and status words are consistent; status never uses colour alone.
- The home hero illustration, the three-step "how it works" drawings and the forest band.
- Facility detail: a clear "today" table, services with live waits, doctors, hours, what to bring.
- Sign-in: the forest brand panel with three benefits reads well.

## 2. Findings that apply to every page

| # | Finding | Upgrade |
|---|---|---|
| G1 | Page change is the browser's plain crossfade; the header and footer fade with the content. | Header, emergency bar and footer keep their place (`view-transition-name`, no animation); only `<main>` fades and lifts 12 px in 280 ms. Off with reduced motion. |
| G2 | The header is a flat white bar; the nav pill shows the current page with a white chip only. | Sticky header that turns into frosted glass with a hairline after scrolling (CSS scroll-driven, no JS); the current page gets a green underline that slides between items. |
| G3 | Inner pages open on an empty page colour: breadcrumb, H1 and lead float with no anchor. | A quiet page band behind the page header: white surface, hairline at the bottom, a faint drawn pattern line (`currentColor` at 6 %) on the right. Same band on every inner page. |
| G4 | Heading sizes are written per page (`text-[clamp(...)]`, `text-[1.625rem]`). | One scale in tokens: hero, page, section, card. Every page uses the tokens. |
| G5 | Panels are white with a ring shadow; all panels look the same weight. | Two surface levels: `Panel` (ring + soft shadow + 1 px top highlight) and `Panel tone="feature"` (adds a hairline in the brand-subtle colour). Corners 20–28 px. |
| G6 | Lists and grids appear all at once. | Rows and cards rise in one after another (40 ms apart, CSS only, at most 8 staggered). |
| G7 | Hover feedback differs per component; some rows have none. | One hover language: rows lift 2 px with a 2 px green line drawing in on the left; cards lift 3 px and deepen their shadow; buttons press to 98 %. |
| G8 | Loading rows are flat grey blocks. | A soft light sweep (shimmer) across skeletons; static with reduced motion. |
| G9 | FAQ answers snap open. | `interpolate-size` + `::details-content` so answers open to their height; the caret turns. |
| G10 | Footer: a large "MediLink" word in a gradient fades out at the bottom and is cut off. | Keep the word but as a clean engraved line: brand-subtle fill, no gradient, fully visible, smaller. Link columns get their headings in spaced capitals; the emergency card gets its own frame. |
| G11 | The AI assistant button floats over content at the right edge (covers card text on /for-facilities and the doctor list). | Same button, but it collapses to an icon after scrolling and keeps a safe gap from content (bottom-right, above the footer). |
| G12 | Short pages (assistant, verify, 404, resume) end high and the footer fills the screen. | `main` grows to fill the screen (`min-h`) so the footer always starts below the fold on short pages. |

## 3. Page by page

### Home `/`
- **Hero:** keep text, search, chips, illustration. Upgrade: headline on the token scale; the
  search becomes the strongest element (white pill, deeper shadow, green focus ring with a mint
  glow); chips get a hairline and lift on hover; the illustration sits in a framed panel with the
  top highlight.
- **Stat tiles:** show "0" and "–" when nothing is open (mock and night-time). Upgrade the look of
  the empty value: muted dash with the caption, numbers in tabular figures that count up once.
- **"Open near you" panel:** a large empty white box when there is nothing to show. Upgrade: the
  existing empty-state illustration and one line inside the panel.
- **Services grid:** good; add the shared hover and stagger.
- **Facilities near you:** rows with wide empty space on the right. Upgrade: facility **cards** (§4).
- **How it works:** keep the three drawings; numbers in a ring, a hairline joining the steps.
- **Trust strip and forest band:** keep; even spacing, the band's mock board gets the panel highlight.

### Find care `/find-care`, `/care`, `/search`
- Filter column of stacked selects and pills; results as rows next to the map.
- Upgrade: the filter column becomes one `Panel` with grouped sections and hairlines; results use
  facility cards (§4) in a 2-column grid beside the map, 1 column on phones; the empty result keeps
  its illustration inside a feature panel.

### Facilities `/facilities`
- Search panel, rows, map. Upgrade: facility cards (§4) in a grid next to the map; the list/map
  toggle stays.

### Facility detail `/facilities/:slug`
- Upgrade: the page band (G3) shows the facility's building drawing (§4) on the right, the type,
  location and verified mark under the name; the "today" table gets row hairlines and a tinted
  label column; empty photo slots are not drawn as grey boxes (show only real photos).

### Doctors `/doctors` and `/doctors/:slug`
- List of rows with initials and day chips.
- Upgrade: rows become a two-column grid of profile cards (initials in a ring in the brand-subtle
  colour, name, service, facility, day chips, "available today" dot). Detail: page band with the
  initials ring and the facility building drawing.
- **Bug to check (not a look change):** the first doctor in the mock list opens "doctor not found"
  (`/doctors/remera-health-center--…`). Logged for a separate fix.

### Services `/services` and `/services/:slug`
- Upgrade: category headings on the section scale, service links as tiles with an icon chip and the
  shared hover; the detail lists facilities as cards (§4).

### Symptom checker `/check-symptoms` and assistant `/assistant`
- Upgrade: the question card becomes a feature panel; answer choices are larger tiles with the
  shared hover and a pressed state; the red-flag list keeps its danger colours with a framed panel.
  The assistant chat gets message bubbles on the surface levels and a sticky composer.

### Emergency `/emergency`
- Already strong. Upgrade: the red panel gets the frame and spacing of the feature panel; the
  "nearest hospitals" list uses the shared row style.

### For facilities `/for-facilities`, apply, resume
- The page is text-only up to the buttons; the resume form sits alone at the left.
- Upgrade: page band with the facility-board illustration; role cards and the four steps on the
  token scale with stagger; FAQ and the resume form side by side on wide screens. The apply and
  resume forms sit in a feature panel with the page band.

### How it works, About, Help, Contact
- **How it works:** numbered list on the page colour. Upgrade: steps in a vertical timeline with the
  numbers in rings joined by a hairline.
- **About:** one long card of text. Upgrade: the same text split into its five existing headings,
  each a section with an icon chip, on a narrow reading column.
- **Help:** two columns of FAQ cards and a row of topic links. Upgrade: topic links become chips;
  FAQ cards use G9; the "still need help" card becomes a feature panel.
- **Contact:** form and side card. Upgrade: feature panel around the form, the side card with the
  emergency frame.

### Legal: Privacy, Terms, Accessibility
- Upgrade: the side table of contents becomes sticky with the current section highlighted
  (scroll-driven); the reading column gets the reading-page rhythm.
- **Content note:** parts of the privacy page show English text in Kinyarwanda. Logged for the
  translators (no text change here).

### Verify `/verify`, `/verify/:code`, shared `/shared/:token`
- Upgrade: the code field and button as one search-style pill in a feature panel with the
  verification illustration.

### Sign-in pages: login, sign-up, forgot, reset, verify email
- Upgrade: the forest panel gets a faint drawn pattern line and the benefits stagger in; the form
  column gets the token scale; inputs get the green focus ring with the mint glow; the "find care
  without an account" link becomes a quiet secondary button.

### Not found
- Upgrade: the empty-state illustration in a feature panel with the page band.

## 4. Facility cards with a drawn building

Replace the look of facility rows (same data, same links, same order) with cards:

1. **Drawing band** (140 px): the building for the facility `type` on a light ground with a hill line
   - `referral_hospital`: several floors, two wings, entrance canopy
   - `district_hospital`: two floors, a wide front, a flag pole
   - `health_center`: one floor, a long veranda and a pitched roof
   - `polyclinic`: a modern block with large windows
   - `private_clinic` (and anything else): a small clinic with a door canopy
   - a 24-hour emergency department adds a red cross sign on the building
   - status pill (open/closed with dot and word) in the corner
2. Type and ownership line, then the name (2 lines at most), then sector, district and distance.
3. The live line: waiting and wait range (ochre), next slot.
4. Insurers (up to 3 chips, then "+N"), then the existing badges (24-hour emergency, join remotely).
5. The existing actions ("book", map) at the bottom; the card name is the link.

Drawings use only existing tokens (`forest`, `brand`, `brand-subtle`, `on-forest-muted`, surface,
danger for the cross) and are decorative (`aria-hidden`). Grid: 1 column on phones, 2 on tablets
and beside the map, 3 on wide pages without the map.

## 5. Motion and tokens

- Durations: the existing `--ml-motion-fast` (150 ms), `--ml-motion-base` (240 ms),
  `--ml-motion-slow` (420 ms); easing `--ml-ease-out`.
- Page change ≤ 300 ms; stagger 40 ms; reveal 12–18 px.
- `prefers-reduced-motion: reduce`: no movement anywhere; page change becomes a plain swap.
- No new colours. New tokens only combine existing ones (`color-mix`) for highlights and glows.

## 6. Order of work

1. Foundation: motion, page transitions, header, page band, type scale, panels, hover, shimmer,
   FAQ, footer, assistant button (G1–G12).
2. Facility cards and the building drawings (§4), used on home, facilities, find care, search,
   services detail.
3. Page details (§3): doctors, for facilities, about, help, legal, verify, sign-in, 404.
4. Screenshots (desktop and phone, light and dark) for product-owner review before merge.
