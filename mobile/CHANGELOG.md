# Changelog

All notable changes to the MediLink patient app (`mobile/`) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
`pubspec.yaml` (`name+build`).

## [Unreleased]

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
