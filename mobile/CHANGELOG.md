# Changelog

All notable changes to the MediLink patient app (`mobile/`) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
`pubspec.yaml` (`name+build`).

## [Unreleased]

### 1.0.6 (2026-11-06)

- Added: "Continue with Google" under sign-in and sign-up (shown only when the server has it on).
  The first time, a sheet asks for the terms and privacy consent (research optional) before the
  account is created; an existing account with the same Gmail address is opened directly.
  Signing out also forgets the Google account on this phone, so the picker shows next time.
- Fixed: notifications whose link moved to the website's `/dashboard` pages opened nothing; they
  open the appointment, ticket, medications or documents again.

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
