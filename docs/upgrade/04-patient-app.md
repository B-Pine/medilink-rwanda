# 04 · Patient app (signed in)

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md)

> **Superseded in part (2026-11-02):** the layout, navigation and addresses of the signed-in app follow [12 · Patient dashboard](12-patient-dashboard.md) (everything under `/dashboard`). The data and safety rules here still apply.

**Rule:** the signed-in experience is the public site ([03](03-public-site.md)) plus a personal layer. The same URLs, the same home, the same facility and doctor pages. Signing in adds the patient's own items; it never removes public content.

## 1. What changes after sign-in

| Area | Not signed in | Signed in |
|---|---|---|
| Header | Logo · Find care · Check symptoms · For facilities · language · Sign in | Logo · Find care · Visits · Health · bell · profile switcher |
| Phone navigation | None (header links) | Bottom tabs **Home · Visits · Health · Me** (56 px, icon + word) |
| Home | Search, list and map, sections | **Personal strip on top**, then exactly the public home |
| Find care | Insurance and district chosen on the device | Insurance pre-selected from the patient's verified card; recent places come from the account, on any device |
| Facility page | Public | Adds "Your next visit here", "Last visit 12 Oct"; Join and Book skip sign-in and ask "for whom" |
| Doctor page | Public | Adds "You saw Dr Keza on 12 Oct"; Book in one step |
| Symptom checker | Asks age group and pregnancy | Fills them from the active profile; result books for that profile |
| Verify | Public | Adds a link to "My documents" |

## 2. Profile switcher

Visible in the header on every signed-in page: the active profile's avatar colour and name ("Me", "Keza · 6", "Mama"). Switching profile changes Home, Visits and Health to that person's data and makes booking "for Keza". Delegates see what their link allows; restricted records are never shown to delegates.

## 3. Home

```
┌ Emergency · 912 ──────────────────────────── 🔔   Me ▾ ┐
│ ┌ G-023 · Kimironko HC · General ───────────────────┐  │  active ticket
│ │ 3 ahead · ~20 min · Leave by 09:20       [Open]   │  │
│ └───────────────────────────────────────────────────┘  │
│ Medicine ready · Kimironko HC                         ›│  items
│ Keza · Dental · Tue 10:30                             ›│
│ Balance due · Remera Clinic                           ›│
├────────────────────────────────────────────────────────┤
│ What are you feeling? …  (public home continues)       │
└────────────────────────────────────────────────────────┘
```

| State | Top of the page |
|---|---|
| Ticket active today | Ticket card: number, people ahead, wait range, "Leave by" in the attention colour; opens the tracker |
| Visit later today or tomorrow | Visit card: time, place, doctor, "Leave by", Directions, Running late, Cancel |
| Nothing scheduled | No card; the public home starts at once, with the patient's last facility first in the list |

**Items** (one line each, only when there is something to act on): medicine ready, document available, result released, balance due, dispute reply, earlier time found, vaccination or antenatal visit due, alerts off.

## 4. Visits

| Page | Content |
|---|---|
| `/visits` | Today (tickets) · Upcoming (bookings with Change, Cancel, Add to calendar) · Past (timeline) |
| `/visits/:visitId` | Live tracker for today's ticket ([§5](#5-tracker)) |
| `/visits/records/:id` | Visit summary: why you came · what was found (plain language) · what to do and warning signs · medicines with status · documents · what you paid · next visit; "Report a problem" on each section |
| `/visits/booking/:id` | Booking detail; disruption offer (keep new time, choose another, cancel) |

## 5. Tracker

```
Kimironko HC · General
        ┌─────────┐
        │  G-023  │
        └─────────┘
3 ahead · ~20 min
Leave by 09:20                     (travel 25 min ✎)
Waiting → Doctor → Payment → Pharmacy
[I'm here]   [Running late]   [Cancel]
Doctor on break until 10:00
```

- "I'm here" tells reception; reception confirms the arrival.
- "You're called · Room 4" fills the screen in emerald with sound and vibration until acknowledged; the screen stays awake; offline shows the last known state with its time.
- The install prompt (Add to Home Screen) is offered here, where alerts matter most.

## 6. Health

| Page | Content |
|---|---|
| `/medicines` | **Today** schedule by morning, midday, evening, night with pictograms and dose in words; Active · Past; status ("Ready at pharmacy", "Buy outside before 12 Nov") and the prescription code |
| `/documents` | Wallet by type (prescription, sick note, referral, receipt, result); full-screen QR for the pharmacy; download; share link with expiry; download all as ZIP |
| `/bills` | Balance first; per bill what insurance covered and what was paid, receipt; "Pay at the facility" until mobile money (P3) |
| `/records` | Signed visit records in plain language; never private notes or examination |

## 7. Me

| Page | Content |
|---|---|
| Profile | Names, date of birth, sex, contacts, emergency contact, MediLink number |
| Identity | Identity documents (masked; reveal for self and guardian) |
| Insurance | Cards with photos front and back, member number, validity, status ("Verified at Kimironko HC on 12 Oct") |
| Health profile | Allergies, conditions, long-term medicines; self-reported items marked "Unverified" |
| Family | Dependents, delegates, invite code, revoke; "Contact person" for a relative without a smartphone (see [08](08-patients-without-phone.md)) |
| Notifications | Inbox; settings: channels per level, quiet hours, dependents' alerts, reminders (vaccination, antenatal, follow-up) |
| Privacy | Who opened my record (plain language), consents, download my data, close account (with what facilities must keep) |
| Help | Articles, support requests, my disputes |
| Settings | Language, text size (three steps), data saver, theme, travel times |

## 8. Proposed additions

| Addition | Requirement |
|---|---|
| Pre-visit intake form completed from the app or the booking flow | FR-SCH-21 (proposed) |
| Earlier-time alert on an upcoming booking | FR-SCH-17 (part, moved to P1) |
| Vaccination and antenatal reminders from the national schedules | FR-SCH-16 (part, moved to P1) |
| Medicines "Today" schedule | FR-SCH-18 (moved to P1) |
| Recent places synced with the account | Part of FR-SCH-01 (no new ID) |
