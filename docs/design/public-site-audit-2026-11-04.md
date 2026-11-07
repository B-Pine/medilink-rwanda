# Public site audit and redesign (2026-11-04)

Tracking issue: #190. The PRs are #191, #194 (which replaced #192), #193, #195, #196 and the
finishing PR. Design rules: [frontend/apps/patient-web/DESIGN.md](../../frontend/apps/patient-web/DESIGN.md).
Product context: [frontend/apps/patient-web/PRODUCT.md](../../frontend/apps/patient-web/PRODUCT.md).

## The brief

The product owner asked for this overnight. Every public page was in scope: the landing page,
the navbar pages and the footer pages. The bar:

- the pages must not look AI-generated;
- they should be what a first-rate designer would make;
- they should be pages a head of state would trust;
- they should follow standard design rules and the stable patterns of Microsoft, Google and other
  large design systems;
- **health facilities must not look like products in cards.**

## Method

1. **Before screenshots.** Captured all 21 public pages at 1440 × 900 and 390 × 844 on the mock
   server, in English, light theme and reduced motion.
2. **Audit.** Checked each page against layout, hierarchy, type, colour meaning, motion,
   accessibility and the "category default" tells of generated UI.
3. **Research.**
   - NHS design system: cards only to group actions, summary lists for key facts, care cards
     for urgency.
   - GOV.UK: step-by-step navigation, directory results.
   - Microsoft Fluent 2: a neutral base layer, content on a surface, elevation reserved for
     floating things.
4. **Direction contract.** Recorded in the impeccable surface brief:
   - **Thesis:** a national public health service, not a marketplace.
   - **Own world:** Fluent layering with NHS and GOV.UK patterns.
5. **Build.** One PR per step. After each step: desktop and phone screenshots, `tsc`, eslint and
   the affected vitest suites. Each PR merged only with CI green.
6. **Finish.** A phone pass, a dark-theme spot check and the impeccable detector on every changed
   file, which returned no findings.

## What the audit found

### Across the site

- **Product cards.** Facilities, Find care, the landing page and the assistant all showed
  facilities as cards: a type kicker, a chip row, a big green "Book" pill, "Details" and a map
  icon. This is the merchandising look the brief rejects.
- **Hidden content.** A scroll-driven reveal (`.ml-reveal`) hid every panel until it scrolled into
  view. Full-page captures showed large empty areas, and slow phones would too.
- **Icon-tile grids as page structure.** Used on the landing services, About, How it works, the
  services index and the facility facts.
- **Marketing type.** Headings at weight 800, eyebrow and kicker labels above titles, tracked
  uppercase captions (footer, legal contents, sign-in panel).
- **Floating, glowing surfaces.** Tinted shadows and lift-on-hover cards.
- **The assistant button** covered content at the top of every page.

### By page

| Page                      | Before                                                                                                                                     | After                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing                   | Clip-art clinic hero, icon tiles, product cards, three phone mock-ups, dark band with invented dashboard numbers; 7,980 px tall on a phone | Heading, search and common needs beside a live "Open near you" list; services index; steps in words; one quiet row for facilities; 4,484 px on a phone         |
| Facilities, Find care     | Product cards beside the map                                                                                                               | Directory rows: name link, type · place · distance, emergency in words, "Accepts …", status, wait, next step as a link                                         |
| Doctors                   | Cards with initials avatars and a seven-day chip strip                                                                                     | One row per doctor: name link, specialty and services, facility, days in words, "Here today"                                                                   |
| Doctor page               | Avatar tile, uppercase captions, service chips                                                                                             | Summary list, services as links                                                                                                                                |
| Services                  | Category panels with icon tiles and boxed links                                                                                            | Category headings over link lists; categories as jump links in a side column                                                                                   |
| Service page              | Eyebrow, LinkRow list, icon tile                                                                                                           | Category in the breadcrumb; facility directory rows; "What to bring" as a list                                                                                 |
| Facility page             | Product-style photo gallery under the name, stat tiles with icons, tabs hiding services, doctors, insurance and hours                      | No tabs: Today as a summary list, Services with live waits and next steps, Doctors, About, Photos after the facts; location, the week and what to bring beside |
| Emergency                 | Red banner with a pinging icon and decorative circle, pink chips, illustration                                                             | Urgent care card: red heading bar, signs as a plain list, one Call 912 button; hospitals with directions; steps as a numbered list                             |
| How it works              | Icon tiles on a gradient line, a card per step                                                                                             | Step-by-step list in one reading column                                                                                                                        |
| About                     | Five icon cards                                                                                                                            | One document with five sections                                                                                                                                |
| Legal                     | Contents in a shadowed box with an uppercase caption; "()" and "at ." where draft markers were stripped                                    | Plain contents list; no holes in the text                                                                                                                      |
| Help                      | Chip jump links, tinted "Still need help?" block                                                                                           | Text jump links, bordered row                                                                                                                                  |
| For facilities            | Bare cards, native ▶ disclosure, square buttons                                                                                            | One surface with hairlines, the site's FAQ rows, pill buttons                                                                                                  |
| Check symptoms, Assistant | Uppercase eyebrow and badge above the H1, no breadcrumb                                                                                    | Breadcrumb like every other page                                                                                                                               |
| Sign in                   | Uppercase eyebrow in the side panel                                                                                                        | Removed                                                                                                                                                        |
| Footer                    | Tracked uppercase column headings                                                                                                          | Sentence case                                                                                                                                                  |
| Verify, Contact, 404      | Already plain                                                                                                                              | Unchanged apart from shared fixes (panel borders, page heading weight)                                                                                         |

## Decisions

- **Directory, not catalogue.** A place is described in words and found by reading down a list.
  On wide lists the status, wait and next step sit in their own column so waits compare at a
  glance. A container query sets this, so it works beside the map.
- **One primary button per view.** Next steps inside lists are links with an arrow.
- **Colour by meaning.** Green for actions and links, red for emergency, amber for waits. Status
  is always a word with a mark.
- **Photos stay but move down.** Facilities upload real photos (#176), so they are shown, but
  after the facts and at a modest size.
- **One motion.** Page cross-fades only. Nothing waits for the scroll; nothing pulses on the
  emergency page.
- **No invented content.** The sample dashboard numbers and the phone mock-ups are gone. Service
  counts show only real non-zero values.

## Verified

- Desktop and phone screenshots of every public page after the change, plus a dark-theme spot
  check (home, a facility, emergency).
- `tsc`, eslint and prettier are clean. The affected vitest suites pass, including PT-F1 (home
  list with insurers and axe) and the prerender and app flows. CI is green on each merged PR.
- The impeccable detector found nothing on the changed files.

## Open items for the product owner

- **Legal content gaps.** The legal text still has "[To confirm]" gaps in the locale files:
  operator name, data protection officer contact and retention period. The page hides them
  cleanly, but the facts are needed before launch. Some French legal sections are still in
  English.
- **"Join Queue" and "Book Appointment"** in the facility header are Title Case strings. Sentence
  case would match the rest of the site.
- **Inputs and filter controls** keep their pill shape, which follows Google's search field. A
  squarer Fluent shape would be a site-wide token change, so it was not made overnight.
- **The mock server** shows every facility closed at night and gives doctors new ids on each full
  reload. Neither affects the real API.
