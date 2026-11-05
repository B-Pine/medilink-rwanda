# Changelog

All notable changes to the MediLink patient app (`mobile/`) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
`pubspec.yaml` (`name+build`).

## [Unreleased]

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
