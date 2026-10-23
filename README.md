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

> Status: **Sprint 0 (Foundations) done** (`backend-v0.1.0`, `frontend-v0.1.0`); Wave 1 next: S1 (platform and onboarding), S3 (patients and identity) and S9 (notification engine), built in parallel from their [sprint contracts](docs/architecture/contracts/README.md). Analysis, design research, security and architecture are documented. Phase 1 is a web platform; frontend and backend are hosted separately. The mobile app, SMS, WhatsApp and USSD follow later.

## Documentation

Start with [docs/README.md](docs/README.md): the system analysis, the requirements index, the architecture decisions, the API catalogue and the development guides.

## Phase-1 users

Patient (and caregivers for dependents) · Super admin · Facility admin · Receptionist (also cashier) · Doctor / clinician · Pharmacist.

## Repository layout

Frontend and backend are separate deployables ([ADR 0006](docs/decisions/0006-separate-frontend-and-backend-hosting.md)):

```
backend/                 Django API → api.medilink.rw (REST, WebSockets, background jobs)
frontend/                pnpm workspace → static hosting
  apps/staff-web/        Admin, reception, doctor, pharmacy, display → staff.medilink.rw
  apps/patient-web/      Public pages + patient PWA → medilink.rw
  apps/patient-mobile/   Android app (phase 3)
  packages/              Shared UI kit, API client, config
ml/symptom-checker/      ML pipelines for the triage model (phase 2+)
brand/                   Logos, icons, video sources
docs/                    Analysis, design, security, architecture, roadmap, decisions
scripts/                 Repository tooling
```

## Stack

**Backend:** Django 6.x + Django REST Framework · PostgreSQL 17 (row-level security) · Redis (Channels, Celery). **Frontend:** React 19 + TypeScript + Vite · Tailwind v4 design tokens · Radix UI. Hosting in Rwanda. See [ADR 0003](docs/decisions/0003-stack-django-react-postgresql.md) and [ADR 0007](docs/decisions/0007-frontend-toolchain.md).

## Roadmap

| Milestone | Scope |
|---|---|
| **M1 · Web MVP** | Onboarding, six roles, patient PWA, booking and remote queue join, live queue with walk-ins, consultation records, prescriptions and dispensing, documents, billing, notifications (in-app, web push, email), disputes, audit |
| **M2 · Pilot and growth** | 1–2 pilot facilities with impact measurement, referrals, record sharing, waitlist, ratings, insurance claims, subscriptions, rules-based triage |
| **M3 · Mobile and SMS** | Android app, SMS alerts and OTP, mobile money, ML triage in shadow mode |
| **M4 · Reach and intelligence** | WhatsApp, USSD, insurer integrations, EMR integration, patient-facing ML triage |

Details: [phasing](docs/analysis/16-roadmap-and-phasing.md) · sprint plans: [backend](docs/roadmap/backend.md) and [frontend](docs/roadmap/frontend.md).

## Getting started

Follow [docs/development/getting-started.md](docs/development/getting-started.md): Docker for PostgreSQL, Redis and Mailpit, then the Django API on port 8000 and the two React apps on ports 5173 and 5174. Requirements: Python 3.12+, Node.js LTS, pnpm, Docker. The exact commands live in [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

What changed: [CHANGELOG.md](CHANGELOG.md) for documentation and repository-wide changes; [backend/CHANGELOG.md](backend/CHANGELOG.md) and [frontend/CHANGELOG.md](frontend/CHANGELOG.md) for each deployable.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and [SECURITY.md](SECURITY.md) before touching anything that stores patient data.

## License

Proprietary. © 2026 MediLink Rwanda. All rights reserved. See [LICENSE](LICENSE).
