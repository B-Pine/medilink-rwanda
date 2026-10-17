# ADR 0003 — Stack: Django, React, PostgreSQL

Status: Accepted (2026-10-17) · Supersedes the stack part of [ADR 0001](0001-monorepo-and-stack.md)

## Context
The team chose Python/Django for the backend and React for the front end. Python also fits the planned machine-learning symptom checker ([ADR 0005](0005-symptom-checker-ml-with-safety-rules.md)). Health data must stay in Rwanda, and the team is small, so the tools must be proven and well documented.

## Decision

### Backend (`services/api`)
| Concern | Choice |
|---|---|
| Language / framework | Python 3.12+, **Django 5.2 LTS** |
| API | Django REST Framework; OpenAPI schema with drf-spectacular |
| Database | **PostgreSQL 16+**, with row-level security for tenant isolation |
| Real-time (queue boards, trackers, display) | Django Channels (WebSockets) with Redis as the channel layer; ASGI server (Uvicorn / Daphne) |
| Background and scheduled jobs (notifications, reminders, end-of-day, PDFs) | Celery + Celery Beat with Redis as broker |
| Authentication | Django auth with secure session cookies for the web apps; token auth added for the mobile app (P3); TOTP two-factor login (django-otp); Argon2 password hashing |
| Files | S3-compatible object storage hosted in Rwanda (e.g. self-hosted MinIO) via django-storages; ClamAV virus scanning |
| PDF documents | WeasyPrint (HTML templates → PDF), QR codes with `qrcode` |
| Web push / email | pywebpush (VAPID); SMTP / transactional email provider (no clinical content in emails) |
| Internal back office | Django admin for MediLink engineers only, not a user-facing dashboard |
| Quality | pytest + pytest-django, factory_boy, ruff, mypy with django-stubs |

### Front end
| App | Purpose |
|---|---|
| `apps/patient-web` | Patient PWA: public facility pages, booking, tracker, records |
| `apps/staff-web` | Super admin, facility admin, reception, doctor, pharmacy workspaces and the waiting-room display |

Shared choices: **React 18 + TypeScript + Vite**, React Router, TanStack Query, react-hook-form + zod, i18next (Kinyarwanda first), vite-plugin-pwa (Workbox) for the patient app, a typed API client generated from the OpenAPI schema, Leaflet + OpenStreetMap for maps (no per-request cost), Vitest + Testing Library, Playwright for end-to-end tests. The UI component library and design system are chosen in the design phase.

Two apps, not one, because patients and staff differ in security posture (public cacheable pages vs strict sessions and two-factor login), devices, and release pace. A shared UI package can be added if duplication grows.

### Later
- `apps/patient-mobile`: React Native (Expo), P3, on the same API.
- `ml/symptom-checker`: Python training pipelines (pandas, scikit-learn, LightGBM, MLflow); models served from the Django API.

### Infrastructure
Docker images for every service; Docker Compose for local development; Nginx as reverse proxy and TLS; hosting **in Rwanda** (provider to be chosen); GitHub Actions for CI; self-hosted error tracking (e.g. GlitchTip or self-hosted Sentry) so error data stays in Rwanda; uptime and metrics monitoring.

## Consequences
- One backend language for the API and ML; Django's admin, auth, ORM and migrations save the small team a lot of work.
- Redis is added (for Channels and Celery), which replaces ADR 0001's "PostgreSQL only" rule. It is lightweight and standard for Django.
- Two languages in the repository (Python and TypeScript). The OpenAPI-generated client keeps the front ends in sync with the API.
- Revisit if real-time load outgrows Channels, or if the team prefers a single front-end app.
