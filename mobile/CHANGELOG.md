# Changelog

All notable changes to the MediLink patient app (`mobile/`) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
`pubspec.yaml` (`name+build`).

## [Unreleased]

Design polish (#260), no API or data changes:

- Changed: three depth levels only. Cards are white with a hairline and no shadow; only what
  floats over content (the card over the band, the map overlays, sheets) has one soft shadow.
  The grey "ledge" under the Home card, the ticket and the facility insurance card is gone.
- Changed: one type scale (display, title, headline, body, label, caption); Figtree for headings
  and big numbers, Inter for the rest; times, ticket numbers, waits, distances and counts use
  tabular figures.
- Changed: Me, Profile, Family, Notification settings, Settings, Records and the doctor and
  facility Services lists are inset grouped lists (muted label, one white group, hairlines).
- Changed: sub-pages (Profile, Family, Notification settings, Link my facility file, Records,
  Settings) have a light header with a large title that collapses into the bar; the other
  sub-pages get the same light bar. Main tabs keep the forest band, with one curve everywhere;
  the doctor and facility headers end in the same curve.
- Changed: the main action sits in a fixed bar at the bottom: Book, Book with this doctor,
  Confirm, Find my file, Add a member (replaces the floating button).
- Added: segmented control (Link my facility file, Add a member), one status pill (open, busy,
  closed, emergency, waiting: always a word), brand-green switches with a clear "off", and date
  and time fields that look like inputs.
- Fixed: Confirm (booking) shows white on green when it can be pressed and grey with "Choose at
  least one" when it cannot.
- Fixed: the facility name no longer sits white on the pale drawing; the drawing is no longer
  cropped (stray circle at the top right).
- Fixed: the doctor's days show the full day names, "Here" on their days and "Today" on today.
- Fixed: Family "Stop sharing" is a labelled action (it asks first, as before).
- Fixed: facility cards allow two lines for the name and put the wait on its own line.
- Fixed: Home ticket and next-visit cards no longer cut the facility name; the wait sits on its
  own line under it.
- Changed: Home quick actions are plain icons with one-line labels in a single card (no boxed
  tiles); "Near you" cards keep 16 px at both ends, the next card peeks, and the title and
  "See all" line up with the cards.
- Fixed: the OpenStreetMap credit stays visible on the map (top right, under the bar) and also
  shows on the Home map preview, as the licence asks.
- Fixed: back arrows on the doctor and facility pages are the app's own icon on a white circle.
- Changed: cards and quick actions shrink slightly while pressed (no ink ripple); rows tint
  softly; primary buttons darken. Toggles, chips and main buttons give a light tap.
- Changed: one page transition everywhere (the new page slides in a little and fades in).
- Changed: people ahead and wait times roll into place when they change (Home ticket, ticket
  page); a facility's drawing flies from the Care list into its page.
- Changed: every animation, including loading dots and the live dot, stops when the phone's
  "remove animations" setting is on.
- Added: French. Choose Français in Me → Settings or on the sign-in screen; dates, days and the
  date picker follow, and an account set to French opens the app in French. (Wording needs a
  native-speaker check.)
- Fixed: large text (1.3x, 1.6x) no longer cuts or overlaps: card heights, insurer pills and the
  doctor header grow with the text, quick actions go two by two, facility actions stack, a long
  sub-page title wraps, and "Stop sharing" moves under the name.
- Fixed: every tap target is at least 48 × 48 (notifications bell, family switcher, segments).
- Checked: all text colours reach 4.5:1 on their backgrounds (now a test).

### 1.0.8 (2026-11-06)

- Changed: rebuilt from `main` after the website and staff updates (#250, #255, #256). Same
  screens as 1.0.7; the new number lets phones with 1.0.7 install it as an update.

### 1.0.7 (2026-11-06)

- Added: "Continue with Google" under sign-in and sign-up (shown only when the server has it on).
  The first time, a sheet asks for the terms and privacy consent (research optional) before the
  account is created; an existing account with the same Gmail address is opened directly.
  Signing out also forgets the Google account on this phone, so the picker shows next time.
- Fixed: notifications whose link moved to the website's `/dashboard` pages opened nothing; they
  open the appointment, ticket, medications or documents again.

### 1.0.6 (2026-11-05)

Everything the website's patient dashboard does, in the app (no more "complete on the website"):

- Added: My profile (Me → My profile, or tap your photo): profile photo (camera or phone,
  removable; seen by you, people you share with and staff where you have a file), completion
  with what is missing, details (names, birth date, sex, phone, email, address), emergency
  contact, ID documents (masked), insurance cards (add; long-press to stop using) and health
  (allergies, conditions, medicines; "no known allergies"). Family members open the same page.
- Added: Notification settings (Me): channels per level, quiet hours, visit reminders, family
  alerts.
- Added: Link my facility file (Me): find a record a facility made, then confirm with the code
  sent to its contact, or a reference for reception.
- Added: Family → Sharing: make a one-time code to share a profile (password confirms), enter a
  code, stop sharing.

### 1.0.5 (2026-11-05)

- Changed: passwords need at least 8 characters (was 15).
- Added: Me → Settings → Change password (current password, new one twice; other phones and
  browsers are signed out).
- Fixed: errors now say what to fix (the server's field message, e.g. "password too short")
  instead of "some fields need attention".

### 1.0.4 (2026-11-05)

- Fixed: the symptom assistant asked yes/no questions with no way to answer them but typing.
  Yes / No / Not sure buttons now follow each question.
- Fixed: the assistant's answer said "the facilities below can help you" and showed none. It now
  lists facilities offering the suggested service (nearest first when location is on), with
  "More places". The possible cause shows only when the server allows naming it.
- Fixed: notifications came in Kinyarwanda while the app was in English. Changing the language in
  the app now saves it to the account (notification preferences), and signing in keeps the
  language picked on the phone.

### 1.0.3 (2026-11-05)

- Added: when the server has the sign-up email check off (test servers,
  `PATIENT_SIGNUP_EMAIL_VERIFICATION=false`), sign-up shows "Account ready" and the patient
  signs in straight away instead of waiting for an email.
- Fixed: booking failed with "some fields need attention" because the app sent no symptoms (the
  API needs 1–5). The confirm sheet now asks "What brings you in?" with symptom chips (red flags
  warn to call 912), plus an optional note.
- Added: doctor page. Tap a doctor on a facility: initials (no photo), specialty, "here today",
  the days they work as a Monday-first week, their services, bio and languages when public, and
  "Book with this doctor", which shows only their services and times (the filter can be removed).
- Fixed: selected chips (service, who it is for) showed white text on pale green.
- Added: accepted insurance on facilities. "Near you" and map cards show 2 insurers, Care cards
  3 (then "+N"), and the facility page lists them all under "Insurance accepted". Only whether it
  is accepted, never a price (U-01). Facilities with none say "No insurance listed yet".

### 1.0.2 (2026-11-05)

- Added: Home shows facilities ("Near you" once the patient allows approximate location, sorted
  by distance; the position is rounded to about 1 km before it is sent) as a swipeable row of
  cards with their building drawings, and a map preview. A full map (`/home/map`, `/care/map`,
  the map button on Care) shows facilities as pins; the cards at the bottom follow the pins.
- Changed: Home redesigned. Soft tinted shadows instead of grey elevation; the ticket card
  (number, people ahead in a ring, footer with place and wait), the next-visit card (date block)
  and a "where do you need care?" search card when nothing is planned; quick actions as icon
  tiles with full labels; a cleaner emergency row. Open/closed badges readable on the drawings.
- Fixed: with animations turned off, the loading skeleton crashed when it disappeared; screens
  with pull-to-refresh crashed when closed without being pulled.
- Added: `test_screens/` renders screens with sample data to PNG for design review
  (`flutter test test_screens --dart-define=SHOTS=<folder>`; not part of CI).

### 1.0.1 (2026-11-05)

- Fixed: going back to Home (or any tab) left the previous tab painted on top: its fade-out
  froze when the tab stopped animating. Hidden tabs are now offstage. Android back returns to
  Home before leaving the app.
- Changed: the real MediLink logo (pin, cross, zigzag) replaces the drawn cross on the splash,
  sign-in, PIN screen and header; launcher icon, themed icon and launch screen use it too.
- Added: in-app pages instead of website links: notifications (mark read, open the related
  page), symptom checker (chat with red flags first; rules checklist when the chat is off),
  family (members, profile, add a child or an adult you help), privacy (choices, who opened my
  record, privacy notice and terms), help (articles, search, support requests and replies),
  reset password.

### 1.0.0 (2026-11-05, upgrade 15)

- Added: the patient Android app (Flutter). Sign in, PIN and fingerprint unlock, auto-lock after
  2 minutes in the background.
- Added: Home with the forest band, today's ticket (live, refreshed every 15 s, strong vibration
  on "your turn") or the next visit, quick tiles, Emergency 912.
- Added: Care (facility cards with building drawings, filters, facility page, booking with a
  confirm sheet), Visits (today, upcoming, past; swipe and long-press actions), Me (records,
  medications, results, documents with screenshots blocked; settings).
- Added: offline copies of tickets, appointments and medications, encrypted on the phone;
  app-icon shortcuts (My ticket, Book, Find care, Emergency 912).
