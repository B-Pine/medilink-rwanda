# MediLink Rwanda — System requirements

Version 0.2 · Source of truth for scope. Update by pull request.

Version 0.1 listed 21 functional requirements. Version 0.2 replaces it with the full system analysis. Each requirement now lives in its module document with an ID and a phase. This file is the index.

## 1. Purpose

Make healthcare access predictable. Before leaving home, patients know whether a facility offers the service, accepts their insurance, what they will pay, whether there is a slot, and how long the queue is. Every visit is documented and retrievable by the patient and the facility.

## 2. Phase-1 users

| User | Level |
|---|---|
| Patient (and caregiver for dependents) | Platform |
| Super admin | Platform |
| Facility admin | Facility |
| Receptionist (also cashier) | Facility |
| Doctor / clinician (doctors, nurses and midwives who consult) | Facility |
| Pharmacist | Facility |

Details: [02 · Users, roles and permissions](analysis/02-users-roles-and-permissions.md).

## 3. Phases

| Phase | Name | Summary |
|---|---|---|
| P1 | Web MVP | Web platform for all six roles: onboarding, booking, queue, clinical records, pharmacy, billing, documents, notifications (free channels), disputes, audit |
| P2 | Pilot and growth | Pilot with impact measurement; referrals; sharing; waitlist; ratings; claims; subscriptions; rules-based triage |
| P3 | Mobile and SMS | Android app; SMS; mobile money; ML triage in shadow mode |
| P4 | Reach and intelligence | WhatsApp; USSD; insurer integrations; EMR integration; patient-facing ML triage |

Details: [16 · Roadmap and phasing](analysis/16-roadmap-and-phasing.md).

## 4. Functional requirements by module

| Prefix | Module | Document |
|---|---|---|
| `FR-ACC` | Users, roles, access | [02](analysis/02-users-roles-and-permissions.md#5-requirements) |
| `FR-ONB` | Tenancy, onboarding, master data | [03](analysis/03-tenancy-onboarding-and-master-data.md#6-requirements) |
| `FR-PAT` | Patient identity, medical history, legacy import, sharing | [04](analysis/04-patient-identity-and-medical-history.md#8-requirements) |
| `FR-SCH` | Discovery, calendars, scheduling, booking | [05](analysis/05-discovery-scheduling-and-booking.md#8-requirements) |
| `FR-QUE` | Visit lifecycle and live queue | [06](analysis/06-visit-lifecycle-and-queue.md#10-requirements) |
| `FR-CLN` `FR-PHA` `FR-DOC` | Clinical record, pharmacy, documents | [07](analysis/07-clinical-documentation-and-pharmacy.md#6-requirements) |
| `FR-BIL` | Billing, payments, insurance, subscriptions | [08](analysis/08-billing-payments-and-insurance.md#9-requirements) |
| `FR-NOT` | Notifications and communication | [09](analysis/09-notifications-and-communication.md#8-requirements) |
| `FR-DSP` | Disputes, complaints, support, ratings | [10](analysis/10-disputes-complaints-and-support.md#7-requirements) |
| `FR-AI` | AI symptom checker | [11](analysis/11-ai-symptom-checker.md#9-requirements) |
| `FR-SEC` | Security, privacy, compliance | [12](analysis/12-security-privacy-and-compliance.md#11-requirements) |
| `FR-RPT` | Reporting and analytics | [13](analysis/13-reporting-and-analytics.md#6-requirements) |

## 5. Non-functional requirements

| Prefix | Area |
|---|---|
| `NFR-PERF` | Performance and capacity (including the 06:00–10:00 peak) |
| `NFR-REL` | Availability and reliability |
| `NFR-NET` | Low connectivity and devices (PWA, offline, low-end hardware) |
| `NFR-UX` | Usability, accessibility, languages (Kinyarwanda first) |
| `NFR-OPS` | Maintainability and operations |
| `NFR-INT` | Interoperability |

All in [14 · Non-functional requirements](analysis/14-non-functional-requirements.md).

## 6. Mapping from v0.1

| v0.1 | Now |
|---|---|
| FR-1 to FR-3 (discovery, verification) | FR-SCH-01..04, FR-ONB-01..03 |
| FR-4, FR-5 (insurance) | FR-BIL-01..04, FR-BIL-17 |
| FR-6 to FR-8 (booking, dependents) | FR-SCH-06..15, FR-PAT-03 |
| FR-9 to FR-13 (live queue) | FR-QUE-01..17 |
| FR-14 (smartphone app) | Patient web app in P1; mobile app P3 |
| FR-15 (WhatsApp) | FR-NOT-14 (P4) |
| FR-16 (USSD) | P4 |
| FR-17 (facility dashboard) | FR-RPT-02..03 |
| FR-18 (subscription billing) | FR-BIL-15..16 |
| FR-19 to FR-21 (symptom guide) | FR-AI-01..13 |
| NFR-1 to NFR-6 | NFR-UX, NFR-NET, FR-SEC, NFR-PERF |
