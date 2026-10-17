# MediLink Rwanda

Find a facility, confirm your insurance, book or join the queue, and follow your turn. Every visit, prescription and receipt is kept in one place.

MediLink Rwanda makes healthcare access predictable. Patients see which nearby public and private facilities accept their insurance (Mutuelle de Santé, RAMA/RSSB, MMI, private), what they will pay, and when there is a free slot. They book or join today's queue remotely, and arrive when they are near the front.

Facilities onboard their own staff and run the whole visit electronically:
- reception and walk-ins
- the live queue
- consultation records
- prescriptions and dispensing
- billing and receipts
- disputes

> Status: **system analysis complete (v0.2); design phase next.** Phase 1 is a web platform. The mobile app, SMS, WhatsApp and USSD follow later.

## Documentation

Start with [docs/README.md](docs/README.md): the system analysis, the requirements index and the architecture decisions.

## Phase-1 users

Patient (and caregivers for dependents) · Super admin · Facility admin · Receptionist (also cashier) · Doctor / clinician · Pharmacist.

## Repository layout

```
apps/
  patient-web/     Patient web app (PWA) — React          · Phase 1
  staff-web/       Admin, reception, doctor, pharmacy, display — React · Phase 1
  patient-mobile/  Android app — React Native             · Phase 3
services/
  api/             Backend API — Django, PostgreSQL, real-time and background jobs
ml/
  symptom-checker/ ML training pipelines for the triage model · Phase 2+
docs/
  analysis/        System analysis (what and why)
  decisions/       Architecture decision records (ADRs)
  requirements.md  Requirements index
scripts/
  github-setup.sh  Creates labels and milestones with the GitHub CLI
```

## Stack

Django 5.2 + Django REST Framework · PostgreSQL 16 · Redis (Channels, Celery) · React 18 + TypeScript + Vite · hosting in Rwanda. See [ADR 0003](docs/decisions/0003-stack-django-react-postgresql.md).

## Roadmap

| Milestone | Scope |
|---|---|
| **M1 · Web MVP** | Onboarding, six roles, patient PWA, booking and remote queue join, live queue with walk-ins, consultation records, prescriptions and dispensing, documents, billing, notifications (in-app, web push, email), disputes, audit |
| **M2 · Pilot and growth** | 1–2 pilot facilities with impact measurement, referrals, record sharing, waitlist, ratings, insurance claims, subscriptions, rules-based triage |
| **M3 · Mobile and SMS** | Android app, SMS alerts and OTP, mobile money, ML triage in shadow mode |
| **M4 · Reach and intelligence** | WhatsApp, USSD, insurer integrations, EMR integration, patient-facing ML triage |

Details: [docs/analysis/16-roadmap-and-phasing.md](docs/analysis/16-roadmap-and-phasing.md).

## Getting started

Setup steps will be added with the first code. Requirements: Python 3.12+, Node.js LTS, pnpm, Docker (for PostgreSQL and Redis).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and [SECURITY.md](SECURITY.md) before touching anything that stores patient data.

## License

Proprietary. © MediLink Rwanda. All rights reserved.
