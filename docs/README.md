# MediLink Rwanda documentation

## System analysis (v0.2)

What the system must do and why. Read in order the first time.

| # | Document | Read it for |
|---|---|---|
| 00 | [System overview](analysis/00-overview.md) | The big picture: visits, three levels, modules, channels |
| 01 | [Vision, scope and success metrics](analysis/01-vision-scope-and-metrics.md) | Problem, goals, in/out of scope per phase, how we measure impact |
| 02 | [Users, roles and permissions](analysis/02-users-roles-and-permissions.md) | The six phase-1 roles, their dashboards, the permission matrix |
| 03 | [Tenancy, onboarding and master data](analysis/03-tenancy-onboarding-and-master-data.md) | How facilities join, get verified, set up and onboard staff |
| 04 | [Patient identity and medical history](analysis/04-patient-identity-and-medical-history.md) | Accounts vs patients, dependents, walk-ins, previous records, legacy import, sharing |
| 05 | [Discovery, calendars, scheduling and booking](analysis/05-discovery-scheduling-and-booking.md) | Search, calendars, slots, booking, remote join, no-shows, disruptions |
| 06 | [Visit lifecycle and the live queue](analysis/06-visit-lifecycle-and-queue.md) | The core: stages, ticket states, ordering, wait estimates |
| 07 | [Clinical documentation, prescriptions, pharmacy and documents](analysis/07-clinical-documentation-and-pharmacy.md) | Consultation records, signing, addenda, dispensing, PDFs, QR verification |
| 08 | [Billing, payments and insurance](analysis/08-billing-payments-and-insurance.md) | Insurance rules, bills, receipts, voids, cash-up, claims, subscriptions |
| 09 | [Notifications and communication](analysis/09-notifications-and-communication.md) | Events, channels, priorities, catalogue, announcements |
| 10 | [Disputes, complaints, support and feedback](analysis/10-disputes-complaints-and-support.md) | Dispute types, routing, lifecycle, outcomes |
| 11 | [AI symptom checker](analysis/11-ai-symptom-checker.md) | ML approach, datasets, safety, evaluation, roadmap |
| 12 | [Security, privacy and compliance](analysis/12-security-privacy-and-compliance.md) | Law 058/2021, consent, access control, audit, retention |
| 13 | [Reporting and analytics](analysis/13-reporting-and-analytics.md) | Metric definitions, facility and platform reports, pilot impact |
| 14 | [Non-functional requirements](analysis/14-non-functional-requirements.md) | Performance, reliability, offline, accessibility, operations |
| 15 | [Conceptual data model](analysis/15-conceptual-data-model.md) | Entities and relationships |
| 16 | [Roadmap and phasing](analysis/16-roadmap-and-phasing.md) | Phases P1–P4 and build order |
| 17 | [Assumptions, risks and open questions](analysis/17-assumptions-risks-and-open-questions.md) | What could go wrong and what we still need to find out |
| — | [Glossary](analysis/glossary.md) | Terms used across the documents |

## Requirements

[requirements.md](requirements.md) is the index of all requirement IDs by module and phase.

## Architecture decisions

| ADR | Decision | Status |
|---|---|---|
| [0001](decisions/0001-monorepo-and-stack.md) | Monorepo and stack (TypeScript everywhere) | Superseded by 0003 (stack); monorepo kept |
| [0002](decisions/0002-web-first-paid-channels-later.md) | Web first; SMS, WhatsApp, USSD later | Accepted |
| [0003](decisions/0003-stack-django-react-postgresql.md) | Django + React + PostgreSQL | Accepted |
| [0004](decisions/0004-visit-centric-domain-model.md) | The visit is the central domain entity | Proposed |
| [0005](decisions/0005-symptom-checker-ml-with-safety-rules.md) | ML symptom checker inside clinician-signed safety rules | Proposed |

## Design research (v0.1)

UI/UX direction, emerald colour system, dashboards, login/sign-up, homepage, patient app, tables, documents and accessibility: [design/research/README.md](design/research/README.md).

## Security (v0.1)

Threat model, security architecture, authentication, authorisation and tenant isolation, cryptography, application/API security, infrastructure, monitoring, secure development, incident response, compliance, AI security and the go-live checklist: [security/README.md](security/README.md).

## Next: design

The design phase will produce the system architecture, detailed database design, API specification, UI/UX design (flows, wireframes, design system) and a test strategy, all based on these documents.
