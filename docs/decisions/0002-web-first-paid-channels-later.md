# ADR 0002 — Web first; paid channels later

Status: Accepted (2026-10-17)

## Context
The pitch promised a smartphone app, WhatsApp and USSD from the start. SMS, WhatsApp Business messages and USSD sessions all cost money per message or session, and USSD also needs an aggregator or telecom agreement. The team cannot fund these yet. Every role (patients, facility staff, admins) can be served by web applications.

## Decision
- **Phase 1 is web only:** a mobile-first, installable patient web app (PWA) and a staff web app.
- **Notifications in phase 1 use free channels only:** in-app, web push, email, and the waiting-room display.
- **Native mobile app in phase 3** (with SMS); **WhatsApp and USSD in phase 4.**
- Notifications and booking are built behind **channel adapters**, so new channels add an adapter and templates without changing feature code.

## Consequences
- Lower cost and one front-end technology to start.
- Patients who don't allow web push and aren't watching the app can miss "you're next" alerts. This is mitigated by the tracker page (sound, vibration, screen kept awake), the pass-over rule for remote joiners, and the waiting-room display.
- iPhone users get web push only after adding the app to their home screen (iOS 16.4+).
- Patients without smartphones are fully served through reception, printed tickets and the display, but can't track remotely until SMS/USSD arrive.
