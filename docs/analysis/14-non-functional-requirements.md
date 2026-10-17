# 14 · Non-functional requirements

Status: Draft v0.2 · Security and privacy requirements are in [12](12-security-privacy-and-compliance.md).

## 1. Performance and capacity

| ID | Requirement | Phase |
|---|---|---|
| NFR-PERF-01 | Handle the weekday **06:00–10:00 peak**: per facility, at least 50 check-ins per 15 minutes and 20 concurrent staff users without slowdown | P1 |
| NFR-PERF-02 | Platform-wide capacity at launch: 50 facilities, 5,000 visits/day, 2,000 concurrent patient trackers; design to scale ×10 without re-architecture | P1 |
| NFR-PERF-03 | Staff actions (check-in, call next, sign, record payment) respond in < 500 ms at the 95th percentile on the server | P1 |
| NFR-PERF-04 | Queue changes reach boards, trackers and displays in < 2 s | P1 |
| NFR-PERF-05 | Patient history opens in < 2 s for up to 200 visits | P1 |
| NFR-PERF-06 | Patient web app first load < 3 s on a 3G connection on a low-end Android phone; repeat loads served from cache | P1 |
| NFR-PERF-07 | PDF documents generated in < 5 s | P1 |

## 2. Availability and reliability

| ID | Requirement | Phase |
|---|---|---|
| NFR-REL-01 | 99.5% monthly availability during facility hours (06:00–20:00 Kigali); maintenance outside these hours with notice | P1 |
| NFR-REL-02 | Recovery point objective ≤ 15 minutes (point-in-time recovery); recovery time objective ≤ 4 hours | P1 |
| NFR-REL-03 | No lost actions: staff actions taken during brief network loss are queued and retried with their original time | P1 |
| NFR-REL-04 | Idempotent operations for check-in, payment recording and dispensing (safe to retry) | P1 |
| NFR-REL-05 | Background jobs (notifications, reminders, end-of-day) retried on failure and monitored | P1 |

## 3. Low connectivity and devices

| ID | Requirement | Phase |
|---|---|---|
| NFR-NET-01 | Patient web app is an installable **PWA**: booking details, ticket and documents viewable offline | P1 |
| NFR-NET-02 | Pages and API responses kept small; images compressed; data-saver mode for patients | P1 |
| NFR-NET-03 | Staff app works on low-end PCs (4 GB RAM) and 10" tablets with current Chrome / Edge / Firefox | P1 |
| NFR-NET-04 | Patient app works on Android 8+ (Chrome) and iOS 16.4+ (Safari) | P1 |
| NFR-NET-05 | Display screen works on a TV with a cheap Android stick or a mini PC browser | P1 |
| NFR-NET-06 | Thermal receipt / ticket printing (58 mm / 80 mm) from the browser | P1 |

## 4. Usability and accessibility

| ID | Requirement | Phase |
|---|---|---|
| NFR-UX-01 | **Kinyarwanda first**, English and French; no hard-coded user text; language switch everywhere | P1 |
| NFR-UX-02 | Elderly and low-literacy friendly: large text option, icons with labels, short flows (booking in ≤ 5 steps) | P1 |
| NFR-UX-03 | WCAG 2.2 AA for patient and staff apps | P1 |
| NFR-UX-04 | Reception: walk-in registration + ticket in < 60 seconds; check-in of a booked patient in < 15 seconds | P1 |
| NFR-UX-05 | Keyboard shortcuts for reception and doctor high-frequency actions | P1 |
| NFR-UX-06 | Dates and numbers in local formats; currency RWF without decimals | P1 |
| NFR-UX-07 | Clear, plain-language errors with what to do next | P1 |

## 5. Maintainability and operations

| ID | Requirement | Phase |
|---|---|---|
| NFR-OPS-01 | Automated tests for domain rules (queue ordering, billing splits, permissions) with high coverage; end-to-end tests for core flows | P1 |
| NFR-OPS-02 | Continuous integration: lint, type checks, tests, dependency and secret scanning on every pull request | P1 |
| NFR-OPS-03 | Repeatable deployments with containers; separate development, staging, production | P1 |
| NFR-OPS-04 | Monitoring: uptime, errors (scrubbed of personal data), queue latency, job failures, notification delivery; alerts to the team | P1 |
| NFR-OPS-05 | Structured logs without personal data | P1 |
| NFR-OPS-06 | API documented (OpenAPI) and versioned so the mobile app (P3) and future channels reuse it | P1 |
| NFR-OPS-07 | Feature flags per facility to roll features out gradually | P1 |
| NFR-OPS-08 | Database migrations reviewed and reversible | P1 |

## 6. Interoperability (designed now, built later)

| ID | Requirement | Phase |
|---|---|---|
| NFR-INT-01 | Clinical data structured with standard codes (ICD-10 diagnoses, catalogue-based medicines) so it can map to HL7 FHIR resources later | P1 |
| NFR-INT-02 | Channel adapters (SMS, WhatsApp, USSD) plug into the notification and booking services without changing core logic | P3 |
| NFR-INT-03 | Integration with insurer eligibility services, mobile money APIs and EMR systems through dedicated adapters | P3–P4 |
