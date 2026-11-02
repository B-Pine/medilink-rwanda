# 11 · Public website (design and implementation brief)

Status: Adopted 2026-11-02 · Owner: product owner · Part of the [system upgrade](README.md) · **Supersedes [03](03-public-site.md) where they differ**

This is the product owner's brief for every public page of `medilink.rw`. It refines [03 · Public site](03-public-site.md): where the two disagree (home structure, route names, navigation, footer, palette), this document wins and 03 points here. The rules of [01](01-product-direction.md) still apply: no prices (U-01), nothing invented, everyone served.

## 1. Objective

**Make healthcare access feel simple.** MediLink is not a hospital site, a blog or a booking landing page: it helps people in Rwanda find facilities, services and doctors, see availability and decide where and when to get care. Every public page works without an account, on a small phone, for someone with little digital experience, in Kinyarwanda, English or French.

Clarity, spacing, readability and consistency come before looking sophisticated. Real working pages, not mock-ups.

## 2. Brand and visual direction

Concept: **"The clinic, made visible."** Trust, clarity, accessibility, reliability, calm.

| Token | Value | Use |
|---|---|---|
| Deep forest | `#123D2B` | Footer, sign-in band, hero identity |
| Primary emerald | `#168451` | The only action colour (white text 4.72:1) |
| Link emerald | `#11744A` | Text links on the page background (AA) |
| Dark text | `#17231D` | Body and headings |
| Secondary text | `#647168` | Supporting text |
| Page | `#F7F9F7` | Soft background |
| Surface | `#FFFFFF` | Cards, rows, inputs |
| Light green surface | `#EDF5EF` | Highlights, selected states |
| Ochre | existing `attention-*` | Waiting times and important time information |
| Red | existing `danger-*` | Emergencies and critical alerts only |
| Borders | subtle grey-green | Hairlines |

Typography: Figtree for headings, Inter for body, navigation, forms and labels. Confident but not oversized headings.

Style: soft white and light-green backgrounds, generous whitespace, subtle borders, one corner radius scale, light shadows only where useful, consistent page widths, smooth hover and focus, subtle page transitions, one icon library (Phosphor), consistent button and input heights.

Avoid: glassmorphism, excessive gradients, heavy shadows, too many cards, cards in cards, excessive rounded containers, emoji icons, stock photos of doctors or patients, fake reviews, testimonials or statistics, decorative clutter, promotional banners, excessive animation, long paragraphs.

## 3. Shared navbar

- **Desktop:** logo (home) left; centre links Home · Find Care · Facilities · Doctors · Services · How It Works; right: language (EN/RW/FR), Sign In, primary "Find Care" button. White, 76–84 px high, subtle bottom border, sticky. The active page has a subtle emerald sliding indicator. Not crowded, no oversized buttons.
- **Mobile:** logo left, menu icon right; a clean slide-down panel with the links, Find Care and Sign In; it closes on navigation and locks background scrolling.
- **Emergency** is reachable from the navigation without looking like an advertisement.

## 4. Homepage `/`

1. **Hero** (two columns on desktop): label "MEDILINK RWANDA", headline "Healthcare, made easier.", one supporting line, primary "Find Care", secondary link "How MediLink works", reassurance "Explore healthcare services without creating an account." Right: a custom SVG illustration (a person searching, a map marker, a facility, a queue ticket, a connection between them). Light background, optional low-contrast Imigongo pattern, the headline dominant.
2. **Find the care you need:** search input (facility, service, specialty, symptom), location selector, Find Care. Horizontal on desktop, stacked on mobile. No sign-in.
3. **Healthcare facilities near you:** real rows (name, type, location, distance when known, open status, live wait when available, insurers, services, View) with List | Map, and "View all facilities".
4. **Emergency access:** "Need emergency care?" with "Find emergency facilities". Red only for the indicator; no alarming banner; only verified, configured emergency contacts.
5. **How MediLink works:** four steps (Find care · Check availability · Join or book · Receive care), horizontal on desktop, vertical on mobile, line icons.
6. **Sign-in invitation:** full-width deep forest band, "Your healthcare journey, in one place.", Sign In and "Explore healthcare first". Never implies registration is required.
7. **Final action:** "Ready to find healthcare?" and Find Care.

## 5. Routes

| Route | Page | Data |
|---|---|---|
| `/` | Home | Facility search (P1) |
| `/find-care` | Discovery: search, location, filters panel (type, services, open now, insurance, emergency department, distance), list and map, loading, empty and error states, compact rows with Join or Book. No prices. | P1 |
| `/facilities` | Directory: search, location, type, service, open now, load more; same rows as Find care | P1 |
| `/facilities/:slug` | Header (name, type, location, address, verified only if true, open status, directions); **Today** panel (hours, live wait, services, insurance, emergency department if applicable, queue or booking); tabs Overview · Services · Doctors · Insurance · Hours & Location; What to bring; primary Join Queue or Book Appointment by real availability | P2, P3 |
| `/doctors` | Directory: name search, specialty, facility and availability filters; name, specialty, facility, published days, View profile. Never patients or bookings | Facility profiles (P2) until a doctor directory endpoint exists |
| `/doctors/:slug` | Name, specialty, description, facility, verified qualifications, day-by-day availability, Book | P2, P3 |
| `/services` | "Explore healthcare services": searchable, grouped by category, icons; only services in platform data | Public service catalogue |
| `/services/:slug` | Name, plain-language explanation, what it involves, facilities offering it, what to bring, Find facilities | Catalogue, P1 |
| `/how-it-works` | Six steps (search, select, join or book, confirmation, arrive and check in, follow the visit) plus: no account needed, walk-ins registered at the facility, reception confirms arrival, patients without smartphones served by tickets, printouts and spoken calls | Static |
| `/emergency` | "Need emergency care?", seek help now, emergency facilities with directions, verified contacts only, how to find the nearest emergency department. Fast and simple | P1 |
| `/help` | Searchable help, categories (finding care, queue, booking, arrival, insurance, accounts, documents, technical), expandable FAQs, contact support | Public help articles + FAQ |
| `/about` | What MediLink is, the problem, how it connects patients and facilities, accessibility commitment, data protection. Editorial; no invented numbers or partners | Static |
| `/contact` | Two columns: support contacts (if configured) and a form (name, email or phone, subject, message) with validation, loading, success and error | Needs a public contact endpoint |
| `/privacy`, `/terms`, `/accessibility` | Readable documents with a last-updated date; text needing legal review is marked | Static |

`/care`, `/search` and the old `/find-care` signed-in page redirect or resolve to the public `/find-care`.

## 6. Footer

Deep forest `#123D2B`. Left: light logo, "Connecting people to healthcare facilities across Rwanda.", social links only when official accounts are configured. Three columns: **Explore** (Find Care, Facilities, Doctors, Services), **Information** (How It Works, About MediLink, Help & Support, Contact), **Legal** (Privacy Policy, Terms of Service, Accessibility). Bottom: copyright, MediLink Rwanda, language, a small trust statement; subtle dividers, muted light-green text, links brighten on hover. No newsletter, banners or large illustrations.

## 7. Illustrations

Custom minimal SVG in emerald, forest, white and a little ochre; consistent line weight; friendly, professional, never childish; light backgrounds. Used for the home hero, How it works, empty search results, the emergency page if useful and small empty states. They never compete with content or slow the page.

## 8. Interaction and motion

Smooth anchor scrolling, subtle page transitions, navbar indicator transitions, hover and press states, gentle section reveals, smooth mobile menu, dropdown transitions, smooth list and map switching, skeleton loading, visible focus. 150–300 ms, natural easing, no bouncing, no heavy parallax, `prefers-reduced-motion` respected, nothing essential delayed by animation.

## 9. Responsive, accessibility, performance

- Mobile first; checked at 360, 390, 768, 1024 and 1440 px; no horizontal overflow; proper mobile layouts, not shrunk desktop.
- WCAG 2.2 AA: semantic HTML, keyboard, visible focus, contrast, labels, helpful validation, accessible menus, alt text, screen-reader status, reduced motion. Status never by colour alone. Prepared for rw, en and fr.
- Optimised SVG, lazy non-essential content (the map), small dependencies, pre-rendering where supported, no layout shift.

## 10. Architecture

Existing stack (pnpm monorepo, React Router, Tailwind v4, `packages/ui`, `packages/api-client`). Shared pieces: `PublicNavbar` (with mobile navigation), `PublicFooter`, `PageContainer`, `PageHeader`, `Breadcrumbs`, `SearchBar`, `LocationSelector`, `FacilityListItem` (`FacilityRow`), `FacilityStatus`, `WaitingTime`, `InsuranceList`, `ServiceItem`, `DoctorListItem`, `EmptyState`, `LoadingSkeleton`, `ErrorState`. Real API data; clearly labelled mock fixtures only in development; loading, empty, error and success states everywhere.

## 11. Build order

1. Foundation: tokens, type, buttons and inputs, navbar, mobile navigation, footer, page container.
2. Main discovery: home, Find care, facilities directory, facility profile, emergency.
3. Additional discovery: doctors, doctor profile, services, service detail.
4. Information: how it works, help, about, contact, privacy, terms, accessibility.
5. Refinement: responsive checks, motion, accessibility, states, performance, consistency.

## 12. Changes to earlier documents

| Earlier | Change |
|---|---|
| [03](03-public-site.md) §1 site map | Adds `/facilities`, `/doctors`, `/doctors/:slug`, `/services`, `/services/:slug`, `/how-it-works`, `/help`, `/contact`, `/accessibility`; discovery is `/find-care`; doctor pages are `/doctors/:slug` (was `/facilities/:slug/doctors/:id`) |
| [03](03-public-site.md) §2 home | Hero first (headline, illustration), then search, then the facility list and map (03 had the list first) |
| [03](03-public-site.md) §1 header and footer | Navigation and footer as §3 and §6 above |
| [02](02-design-system.md) §2 colour | Palette values as §2 above |
| [02](02-design-system.md) §2 imagery | Custom SVG illustrations are allowed on public pages (§7 above); stock photos still are not |

## 13. Backend still needed

| Need | Proposed endpoint | Until then |
|---|---|---|
| Doctor directory and doctor profile by one id | `GET /public/doctors/`, `GET /public/doctors/{id}/` | Built from the facility profiles (P2) |
| Emergency department flag on listings | `has_emergency_24h` on P1 and P2 (03 §12) | The filter and the emergency list show hospitals and say so; no claim of an emergency department |
| Public contact form | `POST /public/contact/` (support app, rate-limited) | The form validates and shows a clear error when the endpoint is missing; mock answers in development |
| Specialty and verified qualifications of doctors | Fields on the public doctor profile | Shown as the services the doctor works in |
