# Backend roadmap (`backend/`, deployed to `api.medilink.rw`)

Status: v0.1 · Process and Definition of Done: [roadmap README](README.md) · Conventions: [API conventions](../architecture/02-api-conventions.md) · Security: [docs/security](../security/README.md)

## Principles

1. **Domain modules** (Django apps) map to the analysis modules: `accounts`, `tenancy`, `authz`, `audit`, `patients`, `facilities`, `scheduling`, `visits` (queue), `clinical`, `pharmacy`, `documents`, `billing`, `notifications`, `disputes`, `reports`, `masterdata`.
2. **Security from line one:** deny-by-default policy layer, scoped querysets, **RLS on every facility table**, audit on every sensitive action ([security 04](../security/04-authorization-and-tenant-isolation.md)).
3. **The visit is central** ([ADR 0004](../decisions/0004-visit-centric-domain-model.md)): clinical, pharmacy, billing and documents attach to the visit.
4. **Every state machine is explicit** (tickets, bills, prescriptions, disputes, facility status), with transition events stored.
5. **Contract-first:** OpenAPI is updated in the same PR, and the frontend types are regenerated from it.

## M1 · Web MVP

### S0 · Foundations
- **Build:**
  - Django 6.x project (settings per environment, env config), DRF, drf-spectacular, CORS/CSRF for separate hosting
  - custom User (email), Argon2id, audience-scoped sessions, staff TOTP MFA with recovery codes, password reset
  - Organization / Facility / Membership / Role / Permission seeds; policy layer; RLS helper + context middleware
  - append-only hash-chained audit log
  - error format, request IDs, throttling; Channels + Celery skeletons
  - docker compose, `seed_dev`, CI
- **Requirements:** FR-ACC-01..09, FR-SEC-01/02/04/05/06/07, NFR-OPS-01..08
- **Contract:** [Sprint 0](../architecture/03-sprint-0-contract.md) (acceptance checks B1–B17)

### S1 · Platform and onboarding
- **Build:**
  - facility application lifecycle (draft → submitted → review → changes/approved/rejected → setup → live → suspended/deactivated)
  - document uploads for verification (upload pipeline v1: allowlist, size, AV scan, quarantine)
  - verification notes and history
  - master data (administrative locations, facility types, service catalogue, insurers, ICD-10 subset, drug catalogue import, holidays) with versioning and translations
  - super admin endpoints
- **Requirements:** FR-ONB-01..03, 08, 10; FR-DOC-03 (uploads)
- **Security:** upload pipeline ([security 06](../security/06-application-and-api-security.md) §4), platform step-up

### S2 · Facility setup and staff
- **Build:**
  - departments, services, service points
  - opening hours and calendars (holidays, Umuganda, closures)
  - doctor schedule templates and exceptions (conflict detection across facilities)
  - tariffs; insurer acceptance rules
  - queue rules configuration
  - staff invitations (existing account → new membership), deactivation (sessions and sockets closed)
  - setup checklist gating "live"
  - facility config change log
- **Requirements:** FR-ONB-04..07, 09; FR-SCH-05..06; FR-BIL-02, 05; FR-ACC-05..07

### S3 · Patients and identity
- **Build:**
  - Patient, identifiers (national ID field-encrypted + blind index), FacilityPatient (file numbers)
  - dependents and delegates
  - walk-in registration (minimum fields)
  - duplicate detection, merge requests (reversible), claim flow
  - insurance profiles; health profile (allergies, conditions, verified/unverified)
  - consent records; patient access-history endpoint
- **Requirements:** FR-PAT-01..09, 13, 14; FR-BIL-01; FR-SEC-08, 10
- **Security:** field-level encryption + key store integration ([security 05](../security/05-data-protection-and-cryptography.md) §4)

### S4 · Visits and the live queue (core)
- **Build:**
  - Visit, Ticket, TicketEvent state machine
  - check-in (idempotent), expected list
  - ordering engine (emergency, return, priority, booked/walk-in ratio, grace window, remote pass-over)
  - atomic call next (`SELECT … FOR UPDATE SKIP LOCKED`)
  - transfer, reorder with reason, doctor status
  - wait estimate (rolling averages, range)
  - end-of-day job
  - WebSocket groups for boards, trackers and display (notify-then-fetch)
  - display tokens
- **Requirements:** FR-QUE-01..17
- **Tests:** concurrency tests (parallel call next / check-in); load test of the 06:00–10:00 peak (NFR-PERF-01, 04)

### S5 · Booking, remote join and calendars
- **Build:**
  - slot generation (capacity, bookable share, walk-in reserve), atomic slot hold
  - booking / reschedule / cancel (patient + reception), remote queue join
  - reason-for-visit structured symptoms (AI stage 0)
  - no-show detection + strikes + reversal
  - disruption flow (bulk rebook)
  - follow-up booking
  - `.ics` export / subscription feed
  - public discovery search (location, service, insurance, open now, availability) with estimated patient share
- **Requirements:** FR-SCH-01..15; FR-BIL-03; FR-AI-01

### S6 · Clinical record and history
- **Build:**
  - Consultation (draft autosave, sign with re-auth + content hash, addenda, entered-in-error)
  - vitals, ICD-10 diagnoses, private notes (never in patient serializers)
  - restricted records; allergy, duplicate and dose alerts
  - results inbox for uploaded results
  - history timeline API with filters
  - legacy import (register CSV with preview/validation/duplicates/rollback, scans, structured back-entry)
  - treatment-relationship rule + reason-for-access prompts
- **Requirements:** FR-CLN-01..09; FR-PAT-10..12; FR-SEC-03, 09

### S7 · Pharmacy and documents
- **Build:**
  - Prescription and items (catalogue, states), pharmacy queue, dispensing (partial, substitution with reason, not available)
  - drug availability toggle
  - document generation (WeasyPrint in an isolated worker, strict URL fetcher)
  - document versions, QR verification codes and public verification endpoint (rate-limited, minimal data)
  - signed download URLs on the files origin; dosing labels
- **Requirements:** FR-PHA-01..05; FR-DOC-01..07
- **Security:** [security 06](../security/06-application-and-api-security.md) §4–5

### S8 · Billing and payments
- **Build:**
  - Bill per visit, lines from tariff and prescriptions, insurer/patient split from rules
  - exemptions/waivers; payments (cash, MoMo/Airtel/card references, insurance)
  - gapless receipts; voids/refunds/credit notes with approvals and separation of duties
  - shifts and cash-up; unpaid balances; EBM receipt number field
- **Requirements:** FR-BIL-04..13
- **Tests:** money invariants (no negative, server-side totals, no self-approval)

### S9 · Notifications
- **Build:**
  - event → notification service (recipients, preferences, quiet hours, priority, templates rw/en/fr)
  - channel adapters: in-app, web push (VAPID, endpoint allowlist), email
  - delivery log, retries, fallbacks; reminders and time-to-leave jobs
  - announcements (facility and platform)
- **Requirements:** FR-NOT-01..12

### S10 · Disputes, help and reports
- **Build:**
  - disputes (types, routing, lifecycle with deadlines and auto-escalation, evidence from the audit trail, outcome actions)
  - support requests; help center content API
  - facility and platform reports from event data (metric definitions in [analysis 13](../analysis/13-reporting-and-analytics.md))
  - exports with step-up, watermark and audit
  - weekly unusual-access report
- **Requirements:** FR-DSP-01..11; FR-RPT-01..05; FR-SEC-12, 13

### S11 · Hardening and pilot readiness
- **Build / verify:**
  - performance at 3× peak
  - penetration-test fixes
  - backup / point-in-time recovery / restore test
  - monitoring and alert rules (Wazuh, metrics)
  - retention jobs
  - data export for facilities
  - [go-live security checklist](../security/14-go-live-security-checklist.md) complete
- **Requirements:** NFR-PERF, NFR-REL, FR-SEC-14..16, FR-ONB-09

## M2–M4 (summary)

| Milestone | Backend scope |
|---|---|
| M2 · Pilot & growth | Referrals; cross-facility sharing grants + break-glass for doctors; waitlist; recurring care plans; ratings & complaints; insurance claim lists; subscriptions; simple stock; consultation templates; rules-based triage + routing (AI stage 1); de-identification pipeline; pilot impact reports |
| M3 · Mobile & SMS | Token auth for the mobile app; SMS adapter + phone OTP; mobile money payment requests + signed webhooks; ML triage in shadow mode |
| M4 · Reach & intelligence | WhatsApp and USSD adapters; insurer eligibility and e-claims integrations; EMR/FHIR integration; patient-facing ML triage; Ministry analytics; EBM integration |
