# 07 · Patient app pages (PWA)

Status: Research v0.1

## 1. Principles from research on older and low-literacy users

- **Simplified navigation:** one main task per screen; at most 5 bottom-nav items.
- **Enlarged text and touch targets:** body 18 px; targets 48 px+, 56 px for primary actions (60 px+ recommended for users with tremor).
- **Icons always with text labels.**
- **Error-tolerant:** undo instead of "Are you sure?" where possible. Nothing is lost on back or refresh (drafts saved).
- **One question per screen** for longer flows: booking, symptom picker, sign-up.
- **Co-design with older users.** Usability tests at the pilot facility with elderly patients and caregivers are part of the design phase.

## 2. Navigation

```
Mobile bottom navigation (4 items + profile in header):
  [ Home ]  [ Find care ]  [ My visits ]  [ Help ]
Header: profile switcher (Me ▾) · notifications 🔔 · language
```

Desktop uses a top navigation with the same items.

## 3. Key screens

### 3.1 Home

- **If a visit is active today:** the **live tracker card** fills the top half (see 3.3).
- **Otherwise:** next appointment card, "Find care" big button, family members' upcoming visits, documents recently added.
- **A push-off banner** when notifications are disabled: "Turn on alerts so we can tell you when to leave" (FR-NOT-03).

### 3.2 Booking flow (one decision per screen)

```
1 Who is it for?      [Me] [Keza, 6] [Mama] [+ Add]
2 What do you need?   Service list with icons (or "Not sure? Describe symptoms" ▸ P2 triage)
3 Where?              Facilities list (insurance ✓, distance, next slot, wait load)
4 When?               Day strip + time chips (morning / afternoon groups) — or "Join today's queue"
5 Reason              Symptom chips (structured) + optional text
6 Review & confirm    Facility, time, insurance, your estimated share, cancellation rule  [Book visit]
  → Success: ticket/booking code, "Add to calendar", "Turn on alerts", directions
```

- A progress indicator ("Step 3 of 6") and a back button that keeps answers.
- Slot holding is visible: "We're holding this time for 5:00".

### 3.3 Live tracker (the signature screen)

```
┌──────────────────────────┐
│ Kigali Clinic · General  │
│                          │
│        G-023             │  ← display size, tabular, high contrast
│   Your ticket number     │
│                          │
│  ●●●●○  4 people ahead   │  ← simple progress dots, not a percentage
│                          │
│  About 25–35 min         │  ← range, never exact
│  Leave home by 09:20     │  ← from your travel time (editable)
│                          │
│  Stage: Waiting for the  │
│  doctor  ▸ then Pharmacy │
│                          │
│ [ I'm here – check in ]  │
│ [ Running late ]  [Cancel]│
│ ⓘ Doctor on break until  │
│   10:00                  │  ← honest status message
└──────────────────────────┘
```

- **States:**
  - Remote (not arrived)
  - Waiting on site
  - **You're next**
  - **You're called → Room 4**: full-screen emerald, sound and vibration, repeats until acknowledged
  - Payment
  - Pharmacy
  - Done
- Keeps the screen awake while open (Wake Lock API). Works offline with the last known state and a "Last updated 09:12" note.

### 3.4 My visits (records)

- **Timeline by date.** Each visit card shows facility, doctor, service, status, and chips for available items: Summary · Medicines · Documents · Receipt.
- **Visit detail:** diagnosis in plain language, instructions, medicines (with dispensing status), documents (download/share), receipt, follow-up date, "Report a problem".
- **My medicines:** active vs past; each with **dosing pictograms** (morning / midday / evening / night icons) and text. Pictograms improve understanding for low-literacy patients (see research in [09](09-documents.md)).

### 3.5 Other screens

| Screen | Notes |
|---|---|
| Family | Dependents list; add a child (name, date of birth, sex); delegated adults with consent status |
| Insurance | Card photos (front/back), number, validity; "Used at Kigali Clinic on 12 Oct, verified ✓" |
| Health profile | Allergies, conditions, long-term medicines; "unverified" label for self-reported items |
| Documents | Filter by type; download, share link (expiry choice), QR shown full-screen for pharmacies |
| Disputes and help | "Report a problem" wizard: pick the item → what's wrong → details → submit; status timeline |
| Privacy | Who accessed my records (plain-language list), consents with toggles, download my data, delete account |
| Settings | Language, text size (Normal / Large / Extra large), notifications, travel time, theme |

## 4. States to design for every screen

Empty (first use, with a next action) · loading (skeleton matching layout) · offline (cached content + banner) · error (what happened + retry) · no permission · session expired (resume after login).
