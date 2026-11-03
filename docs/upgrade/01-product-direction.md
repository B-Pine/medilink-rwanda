# 01 · Product direction

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md)

This document records each product decision of the upgrade, the reason for it, and the older documents it changes. Later documents in this folder describe the screens in detail.

## 1. What MediLink is for (unchanged)

A patient in Rwanda should know, before leaving home, **where they can be seen soon, near them, with their insurance**, then join the queue or book, and be told when to leave. A facility should run the whole visit in one system: check-in, queue, consultation, laboratory, pharmacy, billing and records. Everyone must be served, including people with no phone.

## 2. Principles of the upgrade

1. **Live facts first.** Every screen leads with the real, current answer to the user's question (who is waiting, how long, what is open), not with explanations or marketing.
2. **Nothing invented.** No estimated prices, no fake statistics, no example data in production. If a number is not known, it is not shown.
3. **Everyone is served.** Every flow works for a patient with no phone and no account, through reception, printouts and the waiting-room display.
4. **Fewer words.** Labels of one to three words, numbers before sentences, no paragraphs inside the product.
5. **One design language.** Patients, staff and the display share the same tokens, components and two brand devices: the ticket and the patient flow.
6. **Safe by default.** Clinical safety, privacy and the law come before convenience. Open questions are written down, not assumed away.

## 3. Decisions

| # | Decision | Reason | Changes |
|---|---|---|---|
| U-01 | **No prices or patient-share amounts in discovery or booking.** Facility lists, facility pages, doctor pages and the booking review show only which insurers are accepted and whether a transfer letter is needed. Amounts appear only on the bill after the visit. | The cost of a visit depends on the illness, tests and medicines. A number before the visit is wrong most of the time, misleads patients and creates disputes. | Replaces FR-BIL-03 ([analysis 08](../analysis/08-billing-payments-and-insurance.md) §1.3); [analysis 05](../analysis/05-discovery-scheduling-and-booking.md) §1 and §4 (cost estimate); S5 contract §2.2 "Cost estimate" and the `fee_rwf`, `patient_share_rwf`, `insurer_share_rwf` fields of P1–P3 and B3. Tariffs stay for billing. |
| U-02 | **Free-text symptom input.** "What are you feeling?" accepts the patient's own words in Kinyarwanda, English or French; symptom chips remain as a fallback. | Many people cannot map what they feel to a list. Their own words are also better information for the doctor. | Extends FR-SCH-10 and FR-AI-01; brings part of FR-AI-13 (free text to symptom codes) forward from P4. See [07](07-symptom-checker-and-ai.md). |
| U-03 | **Likely conditions are shown to doctors, not to patients**, until the legal and clinical conditions in [07](07-symptom-checker-and-ai.md) §5 are met. Patients get urgency, the kind of care, the level of care and nearby places. | Showing disease names to patients is likely a regulated medical device, wrong advice can harm, and available datasets do not reflect Rwanda. Doctors can use the suggestion safely. | Keeps [ADR 0005](../decisions/0005-symptom-checker-ml-with-safety-rules.md). Marked as an **open decision** because the product owner leans toward showing patients. |
| U-04 | **Home shows facilities first, as a list and a map.** Search and filters sit on top; the live list and map are the main content; the nearest 24-hour emergency departments are always visible. | Patients come to find a place. Seeing places, distance and waits at once is the fastest path. | Replaces the hero-led structure of [design 06](../design/research/06-homepage-and-public-pages.md) §3. See [03](03-public-site.md) §2. |
| U-05 | **Facility pages show services, doctors, insurance, hours and location**, led by a "Today" panel with live waits per service. | Patients choose by service and by doctor, and need to know what to bring. | Extends FR-SCH-02. See [03](03-public-site.md) §4. |
| U-06 | **Doctor pages** show what the doctor treats, languages, days present and day-by-day availability with free times and Book. They never show who booked. | Patients often look for a specific doctor; availability helps them choose a day. | New, proposed FR-SCH-19. See [03](03-public-site.md) §5. |
| U-07 | **The signed-in site is the public site plus a personal layer** (current ticket or next visit, items ready, insurance pre-selected, profile switcher). Nothing public disappears after sign-in. | One mental model for the patient; no separate "app" to learn. | Changes [design 07](../design/research/07-patient-app-pages.md) §2. See [04](04-patient-app.md). |
| U-08 | **Serve patients without a phone at every step**: printed ticket slip, display with chime, spoken call of the number, a relative or community health worker as contact, printed appointment card, printed documents and labels with pictograms. | Many patients at public facilities have no smartphone. A system that only works on a phone excludes them. | Extends FR-QUE-13, NFR-NET-06; new proposed FR-QUE-21 (spoken call), FR-PAT-18 (contact person), FR-DOC-08 (appointment card). See [08](08-patients-without-phone.md). |
| U-09 | **New staff roles in P1: triage nurse, laboratory technician (lite) and separate cashier.** Community health worker, support agent and external pharmacy in P2; insurer and ministry viewer stay P4. | These people exist in real facilities and today must borrow another role's rights, which breaks least privilege. | Brings FR-ACC-10 forward to P1; changes [analysis 02](../analysis/02-users-roles-and-permissions.md) §2–3. See [06](06-new-roles.md). |
| U-10 | **Additions found in competitor research**: pre-visit intake forms, earlier-slot alert, "what to bring" per service, doctor filters (language, gender), facility details (photos, access, on-site pharmacy and laboratory), vaccination and antenatal reminders. | Leading booking systems (Doctolib, Zocdoc, Practo) show these reduce no-shows and wasted trips. | New proposed requirements in [03](03-public-site.md) and [04](04-patient-app.md); FR-SCH-16 and FR-SCH-17 move earlier. |
| U-11 | **One clean, professional design language** for every screen, defined in [02](02-design-system.md). | The product must look built by professionals: data first, calm, consistent, fast on cheap phones. | Builds on [`.interface-design/system.md`](../../.interface-design/system.md) and design research 01–10. |
| U-12 | **Short copy.** Labels and numbers, not sentences; no explanatory paragraphs, no marketing inside the product; one disclaimer where the law or safety needs it. | Long descriptions make software feel generated and slow people down. | Applies to all locale files. See [02](02-design-system.md) §8. |

## 4. Requirement changes at a glance

Proposed IDs become real when added to their analysis document (see [10](10-implementation-plan.md) §3).

| ID | Change | Phase |
|---|---|---|
| FR-BIL-03 | **Retired** in its current form. New wording: "Discovery and booking show the insurers accepted for a service and whether a referral is required; no amounts." | P1 |
| FR-SCH-10 | Reason for visit accepts free text plus structured symptoms | P1 |
| FR-SCH-16 | Recurring plans: vaccination and antenatal reminders move to P1 as reminders (full plans stay P2) | P1 (part) |
| FR-SCH-17 | Waitlist: an "earlier slot" alert moves to P1 | P1 (part) |
| FR-SCH-19 (proposed) | Public doctor profile with availability by day | P1 |
| FR-SCH-20 (proposed) | Map view of facilities with distance from the user's position computed on the device | P1 |
| FR-SCH-21 (proposed) | Pre-visit intake form per service | P1 |
| FR-SCH-22 (proposed) | "What to bring" and facility details (photos, access, on-site services) | P1 |
| FR-AI-13 | Free text to symptom codes: P1 for Kinyarwanda, English and French, after a language-quality test | P1 |
| FR-ACC-10 | New roles without changing existing ones, moved to P1 | P1 |
| FR-ACC-11 (proposed) | Roles: triage nurse, laboratory technician, cashier | P1 |
| FR-QUE-21 (proposed) | Spoken call of the ticket number on the display | P1 |
| FR-QUE-22 (proposed) | Triage stage between reception and consultation | P1 |
| FR-PAT-18 (proposed) | Contact person (relative or community health worker) for a patient without a phone | P1 |
| FR-DOC-08 (proposed) | Printed appointment card | P1 |
| FR-CLN-11 (proposed) | Laboratory request queue and result entry by the laboratory technician | P1 |

## 5. Open decisions

| # | Question | Who decides | Blocks |
|---|---|---|---|
| OD-1 | Show likely diseases to patients before P4? | Product owner, after legal advice (Law 058/2021, Rwanda FDA) and the clinical lead | Patient-facing disease list only; the rest of [07](07-symptom-checker-and-ai.md) proceeds |
| OD-2 | Which language model, hosted where? A hosted foreign API is a cross-border transfer of health data; a self-hosted model in Rwanda is not. | Product owner + engineering + counsel | Free-text parsing (U-02) in production |
| OD-3 | Map tile provider in Rwanda (or self-hosted tiles) | Engineering + operations | Map in production; development may use a test provider |
| OD-4 | Voice files for spoken calls (recorded voice or speech synthesis in Kinyarwanda) | Product owner | FR-QUE-21 |
| OD-5 | Community health worker accounts: consent model and link to the national CHW programme | Product owner + counsel | P2 CHW role |
