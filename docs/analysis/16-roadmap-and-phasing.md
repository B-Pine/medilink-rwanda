# 16 · Roadmap and phasing

Status: Draft v0.2 · Replaces the earlier M1–M5 roadmap (which put WhatsApp/SMS in the first milestone).

## Principles

- **Web first, paid channels later** ([ADR 0002](../decisions/0002-web-first-paid-channels-later.md)).
- **Pilot early:** a real facility using the system teaches more than any document.
- **Capture the right data from day one:** structured reasons for visit, coded diagnoses and timestamps make the reports, the impact claims and the AI possible.

## Phases

| Phase | Milestone | Scope | Exit criteria |
|---|---|---|---|
| **P1 · Web MVP** | M1 | Onboarding and verification · facility setup · six roles · patient PWA (discovery, booking, remote join, tracker, calendar, history, documents, dependents) · reception board with walk-ins and expected list · multi-stage queue · waiting-room display · consultation record, signing, addenda · prescriptions and dispensing · generated and uploaded documents with QR verification · legacy import (register, scans, back-entry) · billing, manual payments, receipts, voids, cash-up · notifications (in-app, web push, email) · disputes and help center · audit log and access history · core reports · structured symptom capture | All P1 requirements accepted on staging; pen test passed; facility staff can run a full day in a simulated clinic |
| **P2 · Pilot and growth** | M2 | Pilot at 1–2 facilities with baseline study and impact measurement · referrals between facilities · consented cross-facility sharing · waitlist · recurring care plans · ratings and complaints · insurance claim lists · subscriptions · simple pharmacy stock · consultation templates · rules-based triage and routing (AI stage 1) · heat maps and pilot impact report | Pilot facilities record ≥ 90% of visits in MediLink for 4 weeks; impact report published |
| **P3 · Mobile and SMS** | M3 | Android app (React Native) on the same API · SMS alerts and phone OTP · mobile money payment requests · ML triage in shadow mode (AI stage 2) | App in Play Store; SMS fallback live for critical alerts |
| **P4 · Reach and intelligence** | M4 | WhatsApp and USSD · live insurance eligibility · electronic claims · EMR integration · patient-facing ML triage (AI stage 3+) · Ministry analytics · EBM integration if required | Per-feature, after partnerships and regulatory confirmation |

## Phase 1 build order (suggested)

Detailed sprint plans: [backend roadmap](../roadmap/backend.md) · [frontend roadmap](../roadmap/frontend.md).

Each step produces something demonstrable.

1. **Foundations:** repository, CI, environments, authentication, roles, facility scoping, audit log, translations
2. **Platform and onboarding:** applications, verification, setup checklist, master data
3. **Facility setup:** services, service points, schedules, tariffs, insurers, queue rules, staff invites
4. **Patients:** sign-up, dependents, walk-in registration, duplicates, insurance profiles
5. **Queue core:** visits, check-in, tickets, ordering, call next, real-time boards, display
6. **Booking and calendars:** slots, booking, remote join, reminders, disruptions, no-shows
7. **Clinical:** consultation, signing, addenda, history, results inbox, legacy import
8. **Pharmacy and documents:** prescriptions, dispensing, PDFs, QR verification
9. **Billing:** bills, payments, receipts, approvals, cash-up
10. **Notifications:** service, channels, catalogue, preferences
11. **Disputes and help**
12. **Reports**
13. **Hardening:** performance at peak load, offline behaviour, accessibility, pen test, pilot training material

## GitHub milestones

`scripts/github-setup.sh` creates milestones M1–M4 matching the phases above.
