# 06 · Homepage and public pages

Status: Research v0.1 · Requirements: FR-SCH-01..04

## 1. What healthcare sites that convert have in common

From 2026 healthcare website roundups and booking products (Doctolib, Zocdoc, One Medical patterns):

- **Booking is the hero, not a buried link.** Search or book is above the fold, with real-time availability.
- **Trust signals are visible:** certifications, privacy, real people, transparent pricing.
- **Book by service or by provider.**
- **Confirmations and reminders** are promised up front.
- **Social proof** comes before the main call to action (the skill's "Trust & Authority + Conversion" pattern).

## 2. Homepage requirements ("conditions")

| # | Condition | Why |
|---|---|---|
| H1 | The **search box is the hero**: "What do you need?" (service) + "Where?" (location / use my location) + insurance chip | The core promise: find care that accepts *your* insurance |
| H2 | Works fully **without an account** | Lowers the barrier; the account comes at booking |
| H3 | Two audiences, two paths: **Patients** (main page) and **For facilities** (separate page with "Register your facility") | Different needs; don't mix them in one hero |
| H4 | Loads fast on 3G: hero image under ~200 KB (AVIF/WebP), fonts self-hosted and subset. **Hero video** (muted 8–12 s loop, under ~2 MB, WebM + MP4, deep forest overlay about 60% so headline contrast holds) plays **only on wide screens with a good connection**. Phones, data-saver (`Save-Data`) and `prefers-reduced-motion` get the poster image. A pause control is always present. | Real network conditions in Rwanda; WCAG 2.2.2 Pause, Stop, Hide |
| H5 | **Kinyarwanda by default**, language switch at the top | First language of the users |
| H6 | Honest claims only: measured numbers after the pilot, never invented statistics | Trust, and the pitch corrections in [01](../../analysis/01-vision-scope-and-metrics.md) |
| H7 | Emergency notice always reachable: "Emergency? Go to the nearest emergency department or call [national number]" | Safety; the product isn't for emergencies |
| H8 | Indexable public pages (server-rendered or pre-rendered) for facilities and services | Free acquisition through Google |
| H9 | Accessible: one H1, landmarks, skip link, 4.5:1 text, keyboard-usable search, reduced motion | Public service standard |
| H10 | No pop-ups on arrival; cookie notice minimal (no tracking cookies in P1) | Respect and speed |

## 3. Homepage structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ MediLink   Find care  How it works  For facilities     RW ▾   Log in   │
├──────────────────────────────────────────────────────────────────────────┤
│ DEEP FOREST HERO (emerald-950, faint Imigongo pattern)                   │
│                                                                          │
│   Know before you go.                                [photo: Rwandan     │
│   Find a clinic that accepts your insurance,          nurse + elderly    │
│   book, and arrive when it's your turn.               patient, real]     │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │ Service ▾ e.g. Pediatrics │ 📍 Kicukiro ▾ │ Insurance: Mutuelle ▾ │ [Search]│
│   └──────────────────────────────────────────────────────────────────┘   │
│   Popular: General · Pediatrics · Dental · Antenatal care · Eye          │
├──────────────────────────────────────────────────────────────────────────┤
│ HOW IT WORKS — 3 steps with icons: Find → Book or join queue → Arrive    │
│ on time ("We tell you when to leave home")                               │
├──────────────────────────────────────────────────────────────────────────┤
│ THE LIVE TRACKER — phone mockup showing "G-023 · 4 ahead · 25–35 min"   │
│ The unique feature, shown, not described                                 │
├──────────────────────────────────────────────────────────────────────────┤
│ NEARBY FACILITIES (if location allowed) — cards with insurance, wait load│
├──────────────────────────────────────────────────────────────────────────┤
│ YOUR RECORDS IN ONE PLACE — prescriptions, receipts, sick notes, QR      │
├──────────────────────────────────────────────────────────────────────────┤
│ TRUST — "Your data stays in Rwanda", encrypted, verified facilities only,│
│ after pilot: real numbers + testimonials (with photo consent)            │
├──────────────────────────────────────────────────────────────────────────┤
│ FOR FACILITIES — band in mint: "Run your queue, records and billing in   │
│ one place" [Register your facility]                                      │
├──────────────────────────────────────────────────────────────────────────┤
│ FAQ (insurance, cost, privacy, no smartphone?) · Emergency notice        │
│ Footer: languages, contacts, privacy, terms, verify a document ▸         │
└──────────────────────────────────────────────────────────────────────────┘
```

**"Verify a document"** in the footer is the public QR verification page (FR-DOC-04), useful for pharmacies and employers.

## 4. Other public pages

| Page | Key content |
|---|---|
| **Search results** | Split view on desktop (list + map); list-first on mobile with a map toggle. Each card shows name, type, distance, open/closed, **"Accepts Mutuelle ✓"**, fee and *your* share, next slot, wait load (low/medium/high with icon + label). Filters as removable chips. |
| **Facility profile** | Header (photo, name, verified badge, type, open now), action bar [Book] [Join today's queue], services with fees and insurers, doctors and days, hours and closures, map and directions, ratings (P2). Mutuelle referral hint where relevant. |
| **Service pages** ("Pediatrics in Kigali") | SEO landing listing facilities for a service and district |
| **For facilities** | Problem → features per role (screenshots) → how onboarding works (verify, set up, go live) → pricing (after the decision) → "Register your facility" |
| **How it works / Help center** | Plain-language guides with illustrations; "No smartphone? Ask at reception" |
| **Verify document** | Code or QR scan → minimal validity result (FR-DOC-04) |
| **Legal** | Privacy notice (three languages), terms, data processing summary for facilities |

## 5. Imagery and illustration rules

- Real Rwandan people and places, with recorded consent. No western stock.
- Illustrations: flat, two-tone emerald plus neutral, one amber accent; diverse ages; mothers, children, elderly, workers.
- Imigongo-inspired line patterns as backgrounds at 4–8% opacity.
- Every meaningful image has alt text in the page language. Decorative images have empty alt.
