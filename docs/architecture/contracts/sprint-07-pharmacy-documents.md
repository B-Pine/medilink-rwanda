# Sprint 7 contract: Pharmacy and documents

Status: v0.1 · 2026-11-01 · Wave 5 ([M1 master plan](../../superpowers/plans/2026-10-31-m1-completion-master-plan.md)) · Template and shared-file protocol: [contracts README](README.md) · Conventions: [API conventions](../02-api-conventions.md) · Model: [S6 contract](sprint-06-clinical.md)

**Sprint goal:** the doctor prescribes from the drug catalogue inside the consultation, sees allergy, duplicate and dose alerts and "not in stock here" before signing, and the prescription is issued when the consultation is signed. The pharmacist sees the facility's ready prescriptions, confirms who the patient is, records per item full, partial, generic substitution (same ingredient and strength, with a reason) or not available, and signs the dispensing. The patient sees what was dispensed in **My medicines**. Every clinical document is a PDF from the signed data, with a document number and a QR code that anyone can check on a public page that shows almost nothing.

Requirements: FR-PHA-01..05, FR-DOC-01..07, FR-CLN-07 (override recorded on the item).
Analysis: [07 · Clinical documentation and pharmacy](../../analysis/07-clinical-documentation-and-pharmacy.md) §2 (prescriptions after signing, safety checks), §3, §4, §5; [02 · Roles](../../analysis/02-users-roles-and-permissions.md) §3.
Database: [database design](../04-database-design.md) §5.8 (`clinical_referral`, `clinical_lab_request`, `clinical_sick_note`), §5.9, §5.10.
Security: [06 application security](../../security/06-application-and-api-security.md) §4–5, §7; [05 data protection](../../security/05-data-protection-and-cryptography.md) §4; [04 authorisation](../../security/04-authorization-and-tenant-isolation.md) §3.

## 1. Scope

The sprint ships in two pull requests, as S5 and S6 did. **S7a** is prescribing, the pharmacy and availability. **S7b** is the generated documents and their verification. Both follow this contract.

| In | Out (sprint) |
|---|---|
| **S7a:** prescription per consultation, edited while the consultation is a draft; items from the drug catalogue or free text flagged "not in catalogue" | Stock quantities, batches and expiry dates (P2, analysis 07 §4 "Simple stock … comes in P2") |
| **S7a:** S6 alert check on every item; an allergy alert needs an override reason before signing; duplicate and dose alerts are warnings | Drug-specific pregnancy warnings (P2, curated list) |
| **S7a:** issue on consultation sign (same transaction, contract D-1); `awaiting_payment` when the facility asks for payment first, else `ready_to_dispense`; expiry after `documents.prescription_valid_days` | The payment itself (S8 calls `pharmacy.payments.mark_covered`) |
| **S7a:** after issue, change = cancel the item with a reason + a new item; cancel the whole prescription with a reason | Therapeutic substitution by the pharmacist (never; a query goes back to the doctor) |
| **S7a:** pharmacy queue of the facility (ready, partly dispensed, queried), identity confirmation, dispensing per item (full, partial, generic substitution, not available), signed dispensing record; controlled medicines need an extra confirmation | Controlled-medicine register beyond the flag and the confirmation (regulatory review, analysis 17) |
| **S7a:** pharmacist query to the prescriber, answered by an S6 addendum | Cross-facility dispensing of another facility's prescription (outside pharmacies use the QR page) |
| **S7a:** per-facility drug availability toggle; prescribers see "not in stock here" in the drug search | |
| **S7a:** dosing label data per dispensed item (Kinyarwanda by default) and the staff-web print view | |
| **S7a:** patient **My medicines**: own and dependants' prescriptions with item and dispensing status | |
| **S7b:** referral letter, lab and imaging request, sick note (tables deferred from S6, S6 D-1), each signed with the consultation or later by the author | Insurance claim summaries (S8) and receipts/invoices (S8 generates them through this service) |
| **S7b:** PDF generation in an isolated worker (WeasyPrint, strict URL fetcher, no network), letterhead, author and licence, number, QR code, patient language | Ticket slips (S4 prints them from the browser) |
| **S7b:** documents and versions; amendment = new version, old one "superseded" | |
| **S7b:** document numbers per facility, prefix and year without gaps (row lock) | |
| **S7b:** public verification by code: minimal projection, details only after a date-of-birth match, every attempt logged, rate-limited | |
| **S7b:** signed short-lived download links, access logged into the patient's access history; patient download (single, ZIP) and expiring share link; reception prints documents released to the patient | |

## 2. Domain model

### 2.1 Tables

Apps `pharmacy` (S7a) and `documents` (S7a creates it with the number counter; S7b adds the rest). Common columns (`id` UUIDv7, `facility_id`, `created_at`, `updated_at`) are not repeated. Every table with `facility_id` has forced RLS (`facility_isolation`), as every earlier sprint.

| Table | Key columns | Notes |
|---|---|---|
| `pharmacy_prescription` | `visit_id`, `consultation_id` **unique**, `patient_id`, `prescriber_membership_id`, `status`, `number varchar(20) NULL` (set on issue: `RX-2026-000123`), `issued_at NULL`, `expires_at NULL`, `cancelled_reason NULL`, `version` | **Unique** (`facility_id`, `number`). Index (`facility_id`, `status`) where `ready_to_dispense` or `partly_dispensed` |
| `pharmacy_prescription_item` | `prescription_id`, `drug_id NULL`, `drug_code`, `drug_display` (snapshot), `free_text_drug NULL`, `is_off_catalogue`, `dose varchar(60)`, `frequency_code`, `route`, `duration_days smallint NULL`, `quantity integer` CHECK > 0, `instructions_enc`, `substitution_allowed` (default true), `status`, `alert_overrides jsonb` (`[{kind, reason}]`), `replaces_item_id NULL`, `cancelled_reason NULL`, `dispensed_quantity integer` default 0 | CHECK `drug_id` set ⇔ not `is_off_catalogue`. Locked after issue (trigger): only `status`, `dispensed_quantity`, `cancelled_reason` change |
| `pharmacy_prescription_event` | `prescription_id`, `item_id NULL`, `from_status`, `to_status`, `actor_id NULL`, `reason`, `occurred_at` | Append-only (trigger) |
| `pharmacy_dispense_record` | `prescription_id`, `pharmacist_membership_id`, `identity_check_method` (`ticket_name_dob`, `verification_code`), `controlled_confirmed boolean`, `signed_at`, `document_id NULL` (S7b) | Append-only |
| `pharmacy_dispense_line` | `dispense_record_id`, `prescription_item_id`, `outcome` (`full`, `partial`, `substituted`, `not_available`), `quantity` CHECK ≥ 0, `substitute_drug_id NULL`, `substitute_display NULL`, `substitution_reason NULL` | Append-only. CHECK `substituted` ⇒ reason and substitute. Total dispensed ≤ prescribed (service under a row lock, plus a trigger) |
| `pharmacy_drug_availability` | `drug_id`, `is_available`, `updated_by_membership_id` | **Unique** (`facility_id`, `drug_id`). No row = available |
| `pharmacy_prescription_query` | `prescription_id`, `raised_by_membership_id`, `message_enc`, `status` (`open`, `answered`, `closed`), `answered_by_addendum_id NULL`, `answered_at NULL` | While a query is open the prescription stays in the queue, marked "queried" |
| `documents_number_counter` | `prefix varchar(4)`, `year smallint`, `last_value bigint` | **Unique** (`facility_id`, `prefix`, `year`). `next_number()` locks the row (no gaps; a rolled-back transaction gives the number back) |
| `clinical_referral`, `clinical_lab_request`, `clinical_sick_note` (S7b, created by `documents`, S6 D-1) | As database design §5.8 plus `author_membership_id`, `signed_at`, `document_id NULL` | Locked after signing |
| `documents_document`, `documents_document_version`, `documents_verification_record`, `documents_verification_log`, `documents_share_link`, `documents_facility_share` (S7b) | As database design §5.10 | Verification tables have no facility RLS (public projection, database design §5.10) |

Item and prescription statuses:

| Item `status` | Meaning |
|---|---|
| `draft` | Being written (consultation draft) |
| `issued` | Signed; waiting for payment (if asked) or for the pharmacy |
| `partly_dispensed`, `dispensed` | Running total of dispense lines |
| `not_available` | The pharmacist recorded "buy outside"; still valid outside through the QR code until expiry |
| `cancelled` | By the prescriber with a reason (or replaced by a new item) |
| `expired` | Not dispensed in time |

The **prescription status** sums up its items (analysis 07 §3): `draft` → `issued` → (`awaiting_payment` →) `ready_to_dispense` → `partly_dispensed` → `dispensed`; `not_available` when every open item is not available; `cancelled`; `expired`. A prescription with no remaining open items after cancellations is `cancelled`.

### 2.2 Rules

| Topic | Rule |
|---|---|
| Who prescribes | The consultation author with `prescription.issue`, while the consultation is a draft (S6 C3 author rule). One prescription per consultation, created on the first item (idempotent) |
| Items | Catalogue drug by `drug_code` (master data `Drug`, active) or `free_text_drug` (≤ 120 characters, flagged `is_off_catalogue`, listed for the super admin in S7b's off-catalogue review query). `quantity` defaults to dose × frequency × duration when all three are numeric, editable |
| Alerts | Each save of an item runs S6 `clinical.alerts.check(patient, items)` and returns the alerts with the prescription. Signing is refused (`422 alert_override_required`) while an **allergy** alert has no override reason (≥ 5 characters) on its item; duplicate and dose alerts are shown, not blocking (FR-CLN-07). Overrides are stored on the item |
| Not in stock | Drug search returns `available_here` (no availability row, or `is_available`). Prescribing an unavailable drug is allowed (the patient buys outside) and shown on the item |
| Issue | S6 `sign()` sends `consultation_signed` inside its transaction (contract D-1). The `pharmacy` receiver issues the prescription in that transaction: number from the counter (`RX-{year}-{6 digits}`), `issued_at`, `expires_at = issued_at + documents.prescription_valid_days`, items `issued`, status `awaiting_payment` when `billing.pay_before_dispensing` is true, else `ready_to_dispense`. A prescription without items is deleted. Failure rolls the signing back |
| After issue | The prescriber (any doctor with `prescription.issue` at the facility for a cancellation) cancels an item with a reason (`409` stale version; `422` already dispensed in part or full); "change" = cancel + new item that points to it (`replaces_item_id`), with the alert check again. A new item after issue needs recent authentication (Up), as signing does |
| Payment | `pharmacy.payments.mark_covered(prescription)` moves `awaiting_payment` → `ready_to_dispense` (S8). S7a ships it with tests; nothing calls it yet |
| Queue | `ready_to_dispense`, `partly_dispensed` and prescriptions with an open query, of the active facility, oldest issue first; each row shows the patient's display name, age, the visit's active ticket number (if any), the number of items and flags (controlled, queried, not in stock) |
| Identity | Dispensing needs `identity_check_method`: `ticket_name_dob` (the pharmacist confirmed ticket, name and date of birth with the patient) or `verification_code` (the patient showed the prescription code, S7b; in S7a the check compares the prescription `number`) |
| Dispense | One call records lines for any subset of open items: `full` (remaining quantity), `partial` (1 … remaining − 1), `substituted` (only when the item allows it; substitute drug must have the same `generic_name` and `strength`, a different code, and a reason ≥ 5 characters; quantity as full or partial), `not_available`. Controlled drugs need `controlled_confirmed: true`. Under a row lock on the prescription; `version` in the body. Signed with `signed_at` and the pharmacist; immutable |
| Query | The pharmacist raises a query (message ≤ 1,000 characters, encrypted). The doctor answers by adding an S6 addendum and linking it (`answered`); the pharmacist closes it. A therapeutic change is a new item by the doctor |
| Expiry | Job: items still `issued` or `not_available` past `expires_at` become `expired`; the prescription status is recomputed |
| Dosing label | Per dispensed line: drug display, dose, frequency in words, route, duration, instructions, patient display name, date, facility; in `documents.label_language` (default `rw`) or the requested language |
| Patient read | Own and dependants' prescriptions (S3 links; delegates see them unless the consultation is restricted). Items with drug, dose, frequency, duration, instructions and status; dispensing outcome per item. No prescriber notes, no alert overrides |
| Access | Staff reads of a prescription use S6 `clinical.access.require_access` for doctors; pharmacists see prescriptions of their facility in the queue without the relationship rule (their role is dispensing, analysis 02 §3). Every read writes an audit entry with the patient link (access history) |

### 2.3 Audit events

`pharmacy.prescription.issued`, `.item_added_after_issue`, `.item_cancelled`, `.cancelled`, `.covered`, `.expired` (job, counts only); `pharmacy.dispensed` (`prescription_id`, `line_count`, `outcomes`, `controlled`); `pharmacy.query.raised`, `.answered`, `.closed`; `pharmacy.availability.changed` (`drug_code`, `is_available`); `pharmacy.prescription.viewed` (patient link). IDs and codes only; never doses, instructions or messages. S7b: `documents.generated`, `.superseded`, `.downloaded`, `.shared`, `.share_revoked`, `.printed`, `documents.verification.checked` (in `documents_verification_log`, not the audit chain).

## 3. Endpoints

All under `/api/v1`. **Ver** = `version` in the body; **Up** = recent authentication (≤ 5 min) or `403 step_up_required`; **Rel** = S6 treatment-relationship rule or `403 access_reason_required`.

### 3.1 Staff, S7a (`/staff/…`)

| # | Method and path | Permission | Request → response | Notes |
|---|---|---|---|---|
| P1 | `GET /staff/consultations/{id}/prescription/` | `clinical.view` | → `Prescription` (items, alerts, statuses) or `404` when none | Rel |
| P2 | `POST /staff/consultations/{id}/prescription/items/` | `prescription.issue`, author | `{drug_code? \| free_text_drug?, dose, frequency_code, route, duration_days?, quantity?, instructions?, substitution_allowed?, alert_overrides?}` → `201 Prescription` | Draft consultation; creates the prescription on the first item. After issue: Up, `replaces_item_id?` |
| P3 | `PATCH /staff/prescription-items/{id}/` | `prescription.issue`, author | Same fields + `version` (of the prescription) → `200 Prescription` | Draft only (`422 locked` after issue) |
| P4 | `DELETE /staff/prescription-items/{id}/` | `prescription.issue`, author | `?version=` → `200 Prescription` | Draft only |
| P5 | `POST /staff/prescription-items/{id}/cancel/` | `prescription.issue` | `{version, reason}` → `200 Prescription` | After issue; `422` when dispensed |
| P6 | `POST /staff/prescriptions/{id}/cancel/` | `prescription.issue` | `{version, reason}` → `200 Prescription` | `422` when anything was dispensed |
| P7 | `GET /staff/prescriptions/{id}/` | `prescription.view` or `clinical.view` | → `Prescription` with dispense records and queries | Pharmacist: own facility; doctor: Rel |
| PQ1 | `GET /staff/pharmacy/queue/` | `pharmacy.dispense` | `?status=ready\|partly\|queried&q=&page=` → paginated `PharmacyQueueRow` | |
| PD1 | `POST /staff/prescriptions/{id}/dispense/` | `pharmacy.dispense` | `{version, identity_check_method, verification_code?, controlled_confirmed?, lines: [{item_id, outcome, quantity?, substitute_drug_code?, substitution_reason?}]}` → `201 Prescription` | `422` rules of §2.2; `409` stale |
| PD2 | `GET /staff/prescriptions/{id}/labels/` | `pharmacy.dispense` | `?language=` → `{labels: [DosingLabel]}` | Dispensed lines only |
| PQ2 | `POST /staff/prescriptions/{id}/queries/` | `pharmacy.dispense` | `{message}` → `201 PrescriptionQuery` | One open query at a time (`409`) |
| PQ3 | `POST /staff/prescription-queries/{id}/answer/` | `prescription.issue` | `{addendum_id}` → `200 PrescriptionQuery` | Addendum on the prescription's consultation |
| PQ4 | `POST /staff/prescription-queries/{id}/close/` | `pharmacy.dispense` | → `200 PrescriptionQuery` | |
| PA1 | `GET /staff/pharmacy/availability/` | `pharmacy.dispense` or `pharmacy.availability` | `?q=&available=&page=` → paginated `{drug_code, display, is_available, updated_at}` | Catalogue drugs |
| PA2 | `PUT /staff/pharmacy/availability/{drug_code}/` | `pharmacy.availability` | `{is_available}` → `200` | Audited |
| PS1 | `GET /staff/drugs/` | `prescription.issue` or `pharmacy.dispense` | `?q=` (≥ 2 characters) → `[{code, display, generic_name, strength, form, is_controlled, available_here}]` (25) | Trigram search on `generic_name`; `available_here` for the active facility |

### 3.2 Patient, S7a (`/patient/…`)

| # | Method and path | Request → response | Notes |
|---|---|---|---|
| M1 | `GET /patient/prescriptions/` | `?patient_id=&status=active\|past&page=` → paginated `PatientPrescriptionRow` (number, facility, issued, expires, status, item count) | Own and dependants' (S3) |
| M2 | `GET /patient/prescriptions/{id}/` | → `PatientPrescription` (§2.2 Patient read) | `404` for another account's; restricted consultations hidden from delegates |

### 3.3 S7b endpoints

| # | Method and path | Permission | Notes |
|---|---|---|---|
| CR1 | `GET`, `POST /staff/consultations/{id}/referrals/` · `…/lab-requests/` · `…/sick-notes/` | `clinical.write` (author) | Draft with the consultation or after signing (signed on creation; Up) |
| D1 | `GET /staff/documents/?patient_id=&visit_id=&kind=` · `GET /staff/documents/{id}/` | `clinical.view` (Rel) or `documents.print` (released only) | |
| D2 | `POST /staff/documents/{id}/download-link/` | as D1 | Signed URL on the files origin, 5 minutes, audited (access history) |
| D3 | `POST /staff/documents/{id}/print/` | `documents.print` | Released to the patient only; audited |
| D4 | `GET /patient/documents/` · `GET …/{id}/` · `POST …/{id}/download-link/` · `POST /patient/documents/archive/` (ZIP) | patient | Own and dependants' released documents |
| D5 | `POST /patient/documents/{id}/share-links/` · `DELETE …/share-links/{link_id}/` · `GET /public/shared-documents/{token}/` | patient / public | Expiry 1–30 days; token 32 bytes shown once, stored as SHA-256 |
| V1 | `GET /public/verify/{code}/` · `POST /public/verify/{code}/details/` (`{date_of_birth}`) | public | Minimal projection; details after a DOB match; `verify` rate limit; every attempt logged |

## 4. Permissions

New codes, registered in the `[S7]` block of `authz/catalogue.py` and seeded by migrations:

| Code | Meaning | Granted to |
|---|---|---|
| `pharmacy.availability` | Mark catalogue drugs available or not at the facility | `pharmacist`, `facility_admin` |
| `documents.print` (S7b) | Print documents released to the patient | `receptionist`, `pharmacist` |

S0 codes used: doctor `prescription.issue`, `prescription.view`, `clinical.view`, `clinical.write`; pharmacist `prescription.view`, `pharmacy.dispense`. Pharmacists never receive diagnoses, notes or examination (analysis 02 §3): prescription responses carry no consultation text.

## 5. Background jobs

`pharmacy.expire_prescriptions` (hourly, per facility in its RLS context). S7b: `documents.render` (on commit after a signed source; isolated worker queue `documents`), `documents.purge_share_links` (daily).

## 6. Frontend

### 6.1 staff-web

| Route / mount | Screen | Rules |
|---|---|---|
| Consultation page (S6), new section **Prescription** (anchor) | Prescription builder: drug search with "not in stock here", dose, frequency, route, duration, quantity (calculated, editable), instructions, substitution toggle; alerts inline with the item; allergy alert needs an override reason before Sign; after signing: items read-only with status, Cancel item (reason), Change (cancel + new) | Mounted in the S6 page through a slot exported by `pharmacy` (S6 code changes only inside a `[S7]` marker) |
| `/pharmacy` | Pharmacy queue: tabs Ready, Partly dispensed, Queried; search by name, number or ticket | Nav item for `pharmacy.dispense` |
| `/pharmacy/prescriptions/:id` | Dispense: identity confirmation first (method), items with outcome per item, substitution picker (same ingredient and strength), controlled confirmation, Sign dispensing; query to the doctor; print labels | |
| `/pharmacy/availability` | Availability list with search and switches | `pharmacy.availability` |
| `/pharmacy/prescriptions/:id/labels` | Print view of dosing labels (one per page, 62 mm label width) | Browser print |

### 6.2 patient-web

| Route | Screen |
|---|---|
| `/medicines` and a Home card | My medicines: active and past prescriptions per person; items with dose in words and status ("Ready at the pharmacy", "Partly given: 10 of 21", "Not available here: buy outside before 12 Nov") |
| `/medicines/:id` | Prescription detail with the dispensing outcome per item |

### 6.3 Shared packages

api-client `pharmacy` module and MSW mocks for §3.1–3.2 (sessions, CSRF, permissions, the §2.2 rules, `409`, `422`, step-up); namespaces `pharmacy` (staff-web) and `medicines` (patient-web) in rw/en/fr.

## 7. Integration points

**Shared files (`[S7]` blocks):** `config/settings/base.py` (`INSTALLED_APPS`, `ENUM_NAME_OVERRIDES`), `config/urls.py`, `authz/catalogue.py`, `audit/actions.py`, `.github/workflows/ci-backend.yml` (coverage loop), frontend feature registries, `navigation.ts`.
**S6 changes (contract D-1):** `clinical.signals.consultation_signed` (sent in `sign()` inside the transaction) and an `[S7]` slot in the consultation page. Nothing else in S6 changes.
**Settings:** `billing.pay_before_dispensing` (bool, default false) and `documents.label_language` (`rw`/`en`/`fr`, default `rw`), registered by `pharmacy`.
**Interfaces offered:** `pharmacy.payments.mark_covered(prescription)` (S8); `documents.numbers.next_number(facility_id, prefix)` (S7b, S8 receipts); S7b `documents.render(kind, source)` (S8 receipts).

## 8. Dependencies

S6 (consultations, alert check, addenda, access rule) and S1 (master data drugs, uploads storage). S7b needs WeasyPrint and `qrcode` (added to `requirements/base.in` with hashes; justified in the S7b PR).

## 9. Acceptance checks

### Backend

| # | Check | Source |
|---|---|---|
| S7-B1 | Every §3.1–3.2 endpoint in the schema; `spectacular --validate --fail-on-warn` | architecture 02 |
| S7-B2 | Authorisation: doctor author only for drafts; pharmacist own facility only (other facility `404`); patient own and dependants'; receptionist and facility admin get no prescription content | security 04 |
| S7-B3 | Items: catalogue or flagged free text; quantity default; draft edits with `409` on stale `version`; locked after issue | FR-PHA-01 |
| S7-B4 | Alerts run on save; signing refused while an allergy alert has no override; overrides stored | FR-CLN-07 |
| S7-B5 | Issue on sign in the same transaction: number without gaps, expiry from the setting, `awaiting_payment` with the setting; empty prescription removed; a failure rolls the signing back | FR-PHA-01 |
| S7-B6 | After issue: cancel item with reason, change = cancel + new (Up), prescription cancel; refused when dispensed; events recorded | analysis 07 §2 |
| S7-B7 | Queue: ready, partly, queried rows of the active facility only, flags | FR-PHA-02 |
| S7-B8 | Dispense: identity method required; full, partial, substitution (same ingredient and strength, allowed, reason), not available; controlled confirmation; never more than prescribed (parallel calls); signed and immutable | FR-PHA-02, 03 |
| S7-B9 | Query raised, answered by an addendum, closed; one open at a time | analysis 07 §4 |
| S7-B10 | Availability toggle audited; `available_here` in the drug search | FR-PHA-04 |
| S7-B11 | Dosing labels in Kinyarwanda by default and on request | FR-PHA-05 |
| S7-B12 | Patient My medicines: statuses visible, no overrides or notes; delegates don't see restricted consultations | FR-PHA-03 |
| S7-B13 | Expiry job; `mark_covered` | analysis 07 §3 |
| S7-B14 | Forced RLS on every new facility table; append-only events, dispense records and lines; audit IDs only; migrations reverse; coverage ≥ 90 % | database design |
| S7-B15..B22 | (S7b) generation in the isolated worker with the strict fetcher; numbering; versions; verification projection, DOB details, logging and rate limit; signed links and access history; share links; print; referral, lab request, sick note | FR-DOC-01..07 |

### Frontend

| # | Check | Source |
|---|---|---|
| S7-F1 | Prescription builder inside the consultation: search with "not in stock here", alerts inline, override reason required for allergy before Sign, read-only after signing with cancel and change | FR-PHA-01, FR-CLN-07 |
| S7-F2 | Pharmacy queue with tabs and search; nav item only with `pharmacy.dispense` | FR-PHA-02 |
| S7-F3 | Dispense screen: identity first, outcome per item, substitution picker limited to the same ingredient and strength, controlled confirmation, server errors inline, `409` reload | FR-PHA-02, 03 |
| S7-F4 | Availability switches; dosing label print view | FR-PHA-04, 05 |
| S7-F5 | Patient My medicines and detail with plain-language statuses | FR-PHA-03 |
| S7-F6 | MSW mocks for every endpoint; `pharmacy` and `medicines` namespaces in rw/en/fr with parity; axe clean; dates through `dateFormat()` | contracts README |
| S7-F7 | (S7b) documents lists, download, share links, verification page, print | FR-DOC |

### Integration

| # | Check |
|---|---|
| S7-I1 | On staging: a doctor prescribes with an allergy override and signs; the pharmacist dispenses partly then fully; the patient sees both steps |
| S7-I2 | Only `pharmacy`, `documents`, the S6 signal and slot, and `[S7]` blocks changed; OpenAPI regenerated; suites green |

## 10. Decisions and deviations from the docs

| # | Decision | Contract or design text it changes | Why |
|---|---|---|---|
| D-1 | S6 `sign()` sends `consultation_signed` inside its transaction; S7 issues the prescription in a receiver. The consultation page gets an `[S7]` slot | S6 contract §7 ("Interfaces offered") | Issue must be atomic with signing (analysis 07 §3 "Draft → Issued: consultation signed"); a signal keeps S6 free of pharmacy imports |
| D-2 | `documents_number_counter` is created by S7a in a new `documents` app (S7b adds the documents tables) | Database design §5.10 lists the counter with documents | Prescription numbers are needed on issue in S7a |
| D-3 | Item instructions and query messages are encrypted (`patients.crypto`) | Database design §5.9 lists them as plain columns | Same approach as S6 D-2: free text can hold clinical detail |
| D-4 | `dispensed_quantity` on the item (running total) | Database design §5.9 (computed from lines) | The "never more than prescribed" check under one row lock, and the queue's "10 of 21" without a join |
| D-5 | Pharmacists see prescriptions of their facility without the treatment-relationship rule | S6 §2.2 Rel | Dispensing is their role (analysis 02 §3); they never see consultation text |
| D-6 | Payment-first is a facility setting (`billing.pay_before_dispensing`, default false); S8 moves prescriptions on with `mark_covered` | Analysis 07 §3 "facility requires payment first" | Billing is S8; the state exists now so S8 only adds the call |
| D-7 | Verification in S7a compares the prescription number; the random verification code comes with S7b | Analysis 07 §4 "the prescription's verification code" | The code belongs to the verification record (S7b) |
