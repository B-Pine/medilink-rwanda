# Sprint 6 contract: Clinical record and history

Status: v0.1 · 2026-10-31 · Phase 4 ([M1 master plan](../../superpowers/plans/2026-10-31-m1-completion-master-plan.md)) · Template and shared-file protocol: [contracts README](README.md) · Conventions: [API conventions](../02-api-conventions.md) · Model: [S5 contract](sprint-05-booking.md)

**Sprint goal:** the doctor who starts a consultation writes it on one page beside My queue: the allergy banner is always in view, the draft saves itself, diagnoses are ICD-10 codes found in plain language, and private notes are clearly marked and never reach the patient. Signing asks the doctor to confirm it's them, locks the record and stores its fingerprint. Corrections are addenda, wrong-patient records are marked entered in error, and nothing clinical is ever deleted. A doctor sees a patient's history at the facility in a timeline drawer, but opening the record of someone who is not in their care asks for a reason, which is logged. Patients read their own signed records, without private notes.

Requirements: FR-CLN-01..09, FR-PAT-09 (clinical part), FR-PAT-10..12, FR-SEC-03, FR-SEC-06 (re-authentication for signing), FR-SEC-09, FR-ACC-08, FR-ACC-09.
Analysis: [07 · Clinical documentation](../../analysis/07-clinical-documentation-and-pharmacy.md) §1-2, §5.2; [04 · Patient identity and history](../../analysis/04-patient-identity-and-medical-history.md) §4-6; [02 · Roles](../../analysis/02-users-roles-and-permissions.md) §2.5, §3; [12 · Security](../../analysis/12-security-privacy-and-compliance.md) §3.
Database: [database design](../04-database-design.md) §5.2 (`authz_*`), §5.5 (`patients_import_*`, `patients_health_attribute`), §5.8.
Security: [04 authorisation](../../security/04-authorization-and-tenant-isolation.md) §3; [05 data protection](../../security/05-data-protection-and-cryptography.md) §1, §4, §6; [03 identity](../../security/03-identity-authentication-sessions.md) §4, §8.
Design: [04 dashboards](../../design/research/04-dashboards.md) §3.2.

## 1. Scope

The sprint ships in two pull requests, as S5 did. **S6a** is the consultation and the history. **S6b** adds the results inbox, legacy import and break-glass. Both follow this contract.

| In | Out (sprint) |
|---|---|
| **S6a:** consultation record per visit with the sections of analysis 07 §1 that are text: history, examination, plan, patient instructions, private notes | Prescriptions and the prescription builder (S7; S6a offers the alert check S7 calls) |
| **S6a:** draft autosave with `version`; unsigned records list | Referral, lab and imaging requests, sick notes (S7, with the documents they print) |
| **S6a:** ICD-10 diagnoses from master data (primary or secondary, provisional or confirmed), sensitive codes suggest a restricted record | Follow-up booking from the consultation screen: S5b builds R8; S6 only links to it |
| **S6a:** sign with recent re-authentication, lock, SHA-256 content hash, late-entry label | Consultation templates per service (FR-CLN-10, P2) |
| **S6a:** addenda (signed, with reason) and entered-in-error (with reason) | Cross-facility history with consent, emergency access by a doctor (FR-PAT-15, P2) |
| **S6a:** vitals by reception or doctor, plausible ranges, entered-in-error | Patient disagreement statement (S10, with disputes) |
| **S6a:** allergy banner data; allergy, duplicate and dose-sanity alert check | Snooping analytics and the access review report (S10 reports) |
| **S6a:** history timeline API with filters and the problem summary | AI summaries of the history (P2) |
| **S6a:** treatment-relationship rule and reason-for-access (staff-as-patient always asks) | |
| **S6a:** patient read of own and dependants' signed records, without private notes or examination | |
| **S6a:** visit completion refused while the visit has an unsigned draft (FR-CLN-05) | |
| **S6b:** results inbox: outside results uploaded by a doctor, assigned, reviewed with a comment (FR-CLN-09) | |
| **S6b:** legacy register import: upload, column mapping, preview with validation errors and likely duplicates, confirm, rollback within 7 days (FR-PAT-10) | |
| **S6b:** scanned legacy records attached to a patient (FR-PAT-11) | |
| **S6b:** structured back-entry of past diagnoses, allergies, conditions, medicines, labelled "Historical" (FR-PAT-12) | |
| **S6b:** pregnancy status and blood group (`patients_health_attribute`) for the pregnancy flag | |
| **S6b:** break-glass for the super admin: reason, step-up, 60-minute read-only access to one patient, red banner, weekly review list (FR-ACC-09, FR-SEC-09) | |
| **S6b:** patient-web "My visits" history and visit detail; staff-web results inbox, import wizard, back-entry | |

## 2. Domain model

### 2.1 Tables (app `clinical`, plus `authz_*` and `patients_*` tables created by it)

Columns follow the [database design](../04-database-design.md) §5.8. Facility tables have `facility_id`, forced RLS (`EnableFacilityRLS`) and `TimeStampedModel` timestamps. **Class** is the highest data class of the row ([security 05](../../security/05-data-protection-and-cryptography.md) §1).

| Table | PR | RLS | Class | Mutability | Notes |
|---|---|---|---|---|---|
| `clinical_consultation` | S6a | ✓ + definer read for patients (D-4) | C4 | Locked after signing (trigger) | `visit_id`, `patient_id`, `facility_patient_id`, `author_membership_id`, `status` (`draft`, `signed`, `entered_in_error`), `started_at`, `signed_at NULL`, `content_hash bytea NULL`, `is_late_entry`, `is_restricted`, `history_enc`, `examination_enc`, `plan_enc`, `instructions_enc`, `private_notes_enc` (all `bytea NULL`, D-2), `entered_in_error_reason NULL`, `entered_in_error_at NULL`, `entered_in_error_by_membership_id NULL`, `version`. **Unique** draft per (`visit_id`, `author_membership_id`). Indexes (`facility_id`, `visit_id`), (`facility_id`, `patient_id`, `signed_at` desc), (`facility_id`, `author_membership_id`) where draft. The trigger rejects any change of content, hash, author, patient or `signed_at` once `status <> 'draft'`, and every `DELETE` |
| `clinical_diagnosis` | S6a | ✓ | C3 (C4 when sensitive) | Locked after signing (trigger on the parent's status) | `consultation_id`, `code_system`, `code`, `display`, `plain_language` (snapshots in the doctor's language at the time), `rank` (`primary`, `secondary`), `certainty` (`provisional`, `confirmed`), `is_sensitive`. One primary per consultation (partial unique). Index (`facility_id`, `code`) |
| `clinical_addendum` | S6a | ✓ | C3 / C4 | Append-only (trigger) | `consultation_id`, `author_membership_id`, `reason`, `body_enc`, `content_hash`, `signed_at`, `is_by_author` |
| `clinical_vitals` | S6a | ✓ | C3 | Append-only, except the entered-in-error columns (trigger) | `visit_id`, `patient_id`, `consultation_id NULL`, `recorded_by_membership_id`, `recorded_at`, `temperature_c numeric(4,1)`, `systolic_mmhg`, `diastolic_mmhg`, `pulse_bpm`, `respiratory_rate`, `spo2_pct`, `weight_kg numeric(5,2)`, `height_cm numeric(5,1)`, `muac_mm`, `entered_in_error_at NULL`, `entered_in_error_by_membership_id NULL`, `entered_in_error_reason`. CHECK plausible ranges (§2.2) and at least one measurement |
| `authz_access_reason` | S6a | ✓ | C2 | Append-only | `user_id`, `membership_id`, `patient_id`, `facility_patient_id`, `reason_code` (`care_continuity`, `results_review`, `admin_request`, `other`), `reason_text`, `granted_until`. Created by the `clinical` app (D-3) |
| `clinical_result_review` | S6b | ✓ | C3 | State machine (light) | As database design |
| `clinical_history_entry` | S6b | ✓ | C3 | Append-only | As database design, "Historical, entered from paper by Dr X on date" |
| `patients_import_batch`, `patients_import_row` | S6b | ✓ | C2 / C3 | State machine; rows mutable until confirmed | As database design; raw rows purged after the rollback window |
| `patients_health_attribute` | S6b | — (patient-level) | C3 | Append-only | As database design |
| `authz_break_glass_session` | S6b | — (platform) | C2 | Append-only (+ review fields) | As database design |

### 2.2 Rules

| Topic | Rule |
|---|---|
| Opening | `clinical.write` opens a consultation for a visit of the active facility whose status is `on_site` or `completed` (a completed visit gives a late entry later). Opening again returns the same draft of this author (idempotent). Another clinician opens their own draft for the same visit (one visit may have several records, analysis 07 §1). The draft starts with `started_at = now` |
| Draft and autosave | Only the author edits a draft. `PATCH` takes `version` and any of the sections, `is_restricted` and the full `diagnoses` list (replaced as a whole). A stale `version` → `409` with the current draft. Section text ≤ 20 000 characters; private notes ≤ 10 000. Autosaves are not audited (they happen every few seconds); signing is |
| Diagnoses | `code` must be an active `masterdata_diagnosis_code` (`icd10`). The server snapshots `display` and `plain_language` in the request language and `is_sensitive`. At most 12, no repeated code, at most one `primary`. Search is the S1 endpoint `GET /staff/master-data/diagnosis-codes/?q=` (plain language works: "malaria" → B54) |
| Restricted | The doctor sets `is_restricted`. A sensitive diagnosis sets `suggest_restricted` in the response; it never restricts silently. Restricted records are hidden from the patient's delegates, are never shared across facilities (P2), and show a "Restricted" chip to staff |
| Private notes | Stored encrypted (C4). Returned only by the staff clinical serializer, to holders of `clinical.view` who pass the access rule. **Never** in a patient serializer, a notification, a log, an audit entry or an export |
| Signing | The author with `clinical.sign` signs with `{version}`. Needs recent authentication (≤ 5 minutes: the login's second factor or `POST /staff/auth/step-up/`), else `403 step_up_required`. Needs one primary diagnosis. The server builds the canonical content (§2.3), stores its SHA-256 as `content_hash`, sets `signed_at`, `status = signed`, and `is_late_entry` when `signed_at − started_at > 24 h` |
| Lock | After signing, the content columns cannot change: the service refuses (`422`) and a trigger refuses too (D-5). Detail responses recompute the hash and return `integrity: ok \| mismatch` |
| Addendum | On a signed record, by a holder of `clinical.write` with recent authentication: the author needs `clinical.amend_own`; another clinician at the facility may add one, attributed and flagged `is_by_author = false`. Body ≤ 10 000 characters (encrypted), reason ≤ 300 required. Signed at once with its own hash over the record hash, reason, body, author and time. Readers see the original and every addendum in order |
| Entered in error | The author with `clinical.amend_own` and recent authentication marks a draft or signed record `entered_in_error` with a reason (≤ 300). It disappears from the timeline, the problem summary and patient views, stays readable by direct link with a red "Entered in error" banner, and is never deleted |
| Completion (FR-CLN-05) | A consultation-stage ticket cannot `complete` or go to the next stage while the visit has a **draft** consultation: `422 business_rule_violation` "Sign or mark the draft entered in error first". A visit that never had a consultation can still complete (reception-only or pharmacy-only visits, D-6). Drafts appear in the **Unsigned records** list for their author and the facility admin |
| Vitals | `vitals.record` (reception, doctor) records for a visit of the active facility that is `on_site` (or `completed` the same day). Ranges: temperature 30–45 °C, systolic 50–260, diastolic 20–160 (below systolic), pulse 20–250, respiratory rate 4–80, SpO₂ 50–100 %, weight 0.3–400 kg, height 20–250 cm, MUAC 50–400 mm. At least one value. The doctor's open draft for the visit is linked (`consultation_id`). Reception reads only the vitals they recorded (analysis 02 §2.4); clinicians read all. The recorder or a `clinical.write` holder marks a row entered in error with a reason |
| Allergy banner | Consultation detail and the problem summary return the patient's drug, food and other allergies that are not entered in error or refuted, with `verification_status`, and `no_known_allergies` (S3 health profile) |
| Alerts (FR-CLN-07) | `POST alerts` checks drugs before prescribing: **allergy** when an active allergy's substance matches the drug's generic name or drug class (case and accent insensitive); **duplicate** when an active long-term medicine (S3) or another item of the same request has the same generic name; **dose** when `quantity > max_usual_quantity` of the drug. Alerts are warnings with `severity` (`high` for a verified or severe allergy, else `medium`); S7 stores the override reason with the prescription item |
| Treatment relationship (FR-SEC-03) | A clinician has a relationship with a patient at the active facility when the patient has an open visit there today, **or** the clinician authored a consultation, recorded vitals or held a ticket for the patient there in the last 30 days. Without one, reads of clinical content (C2, C7 detail, H1, H2, AL1, C1 for a completed visit) return `403 access_reason_required` until the clinician gives a reason (A1). A reason opens access to that patient for that user for 120 minutes (`granted_until`) |
| Staff as patient | When the facility record is `is_staff_member`, a reason is required even with a relationship (security 04 §3). Each reason is logged and the access appears for review (S10 report) |
| Other facilities | No clinical data from another facility reaches a staff user in M1 (consent is P2). Patient IDs of another facility are `404` |
| Patient read | Patients read signed, not entered-in-error records of profiles they hold as `self` or `guardian`, and as `delegate` only when the record is not restricted. The patient serializer has: facility, service date, doctor's name, signed time, late-entry label, vitals, history, plan, instructions, diagnoses (plain language first, then code), addenda. It has **no** examination and **no** private notes (analysis 07 §1) |
| Audit | Every staff read of clinical content writes `clinical.*.viewed` with a `patients_audit_link`, so the patient's access history (S3, FR-PAT-14) can show it (D-7). Writes are audited at open, sign, addendum, entered in error, vitals, and reason given |
| Break-glass (S6b) | Super admin only in M1. `POST /platform/break-glass/` with `{patient_id, facility_id, reason_code, reason_text}` and step-up opens a 60-minute read-only session for that patient at that facility. Platform reads run in the facility's RLS context set after the platform check (database design D4). The patient's access history shows it; a second super admin reviews it in the weekly list |
| Legacy import (S6b) | Upload a CSV (S1 uploads pipeline) → map columns → preview: per row, validation errors and likely duplicates (S3 matching) → confirm creates patients and facility records in one batch → rollback within 7 days if no visit is attached to any of its records. Nothing is saved before confirm. No patient notification (analysis 04 §6) |
| Results inbox (S6b) | A doctor's upload of type `outside_result` creates a `pending` review assigned to the uploader or the doctor of the patient's latest visit; review with an optional comment → `reviewed`. The inbox lists pending items of the doctor |

### 2.3 Canonical content and hash

`content_hash = SHA-256(json)` where `json` is the UTF-8 JSON with sorted keys and no spaces of:

```
{"consultation_id", "visit_id", "patient_id", "facility_id", "author_membership_id",
 "signed_at" (ISO 8601 UTC, microseconds), "is_restricted",
 "sections": {"history", "examination", "plan", "patient_instructions", "private_notes"},
 "diagnoses": [{"code_system", "code", "display", "rank", "certainty"} sorted by rank, code]}
```

An addendum's hash covers `{"consultation_hash" (hex), "addendum_id", "author_membership_id", "reason", "body", "signed_at"}`.

### 2.4 Audit events

S6a: `clinical.consultation.opened`, `clinical.consultation.viewed`, `clinical.consultation.signed`, `clinical.consultation.entered_in_error`, `clinical.addendum.added`, `clinical.vitals.recorded`, `clinical.vitals.entered_in_error`, `clinical.history.viewed`, `clinical.access_reason.given`.
S6b: `clinical.result.reviewed`, `clinical.history_entry.added`, `patients.import.previewed`, `patients.import.confirmed`, `patients.import.rolled_back`, `authz.break_glass.opened`, `authz.break_glass.reviewed`.
Metadata holds IDs and codes only (never text, never diagnoses of a restricted record).

## 3. Endpoints

All under `/api/v1`. **Ver** = `version` in the body; **Up** = recent authentication (≤ 5 min) or `403 step_up_required`; **Rel** = the treatment-relationship rule (§2.2) or `403 access_reason_required`.

### 3.1 Staff, S6a (`/staff/…`)

| # | Method and path | Permission | Request → response | Notes |
|---|---|---|---|---|
| C1 | `POST /staff/visits/{visit_id}/consultation/` | `clinical.write` | → `201 Consultation` (new draft) · `200` (this author's existing draft) | Rel for a completed visit; `422` visit cancelled or left |
| C2 | `GET /staff/consultations/{id}/` | `clinical.view` | → `Consultation` | Rel. Includes `allergies`, `no_known_allergies`, visit vitals, diagnoses, addenda, `integrity` |
| C3 | `PATCH /staff/consultations/{id}/` | `clinical.write`, author | `{version, history_text?, examination_text?, plan_text?, patient_instructions_text?, private_notes?, is_restricted?, diagnoses?: [{code, rank, certainty}]}` → `200 Consultation` | Ver; `422` not a draft; `400` unknown code |
| C4 | `POST /staff/consultations/{id}/sign/` | `clinical.sign`, author | `{version}` → `200 Consultation` | Ver, Up; `422` no primary diagnosis or not a draft |
| C5 | `POST /staff/consultations/{id}/addenda/` | `clinical.write` (+ `clinical.amend_own` when author) | `{reason, body}` → `201 Addendum` | Up; `422` not signed |
| C6 | `POST /staff/consultations/{id}/entered-in-error/` | `clinical.amend_own`, author | `{version, reason}` → `200 Consultation` | Ver, Up |
| C7 | `GET /staff/consultations/` | `clinical.unsigned_list` | `?status=draft&mine=true&page=` → paginated `ConsultationRow` (patient display name, visit date, author, started_at, status, is_late) | No clinical content; doctors see their own unless they also hold `facility.configure` |
| V1 | `GET`, `POST /staff/visits/{visit_id}/vitals/` | `GET`: `vitals.record` or `clinical.view` · `POST`: `vitals.record` | `POST {temperature_c?, systolic_mmhg?, …, recorded_at?}` → `201 Vitals` · `GET` → `{results: [Vitals]}` | Reception sees own rows only |
| V2 | `POST /staff/vitals/{id}/entered-in-error/` | recorder, or `clinical.write` | `{reason}` → `200 Vitals` | |
| H1 | `GET /staff/clinical/patients/{facility_patient_id}/history/` | `clinical.view` | `?type=consultation\|vitals&code=&from=&to=&page=&page_size=` → paginated `HistoryItem` newest first | Rel. `code` matches a diagnosis code prefix (`B5` → B50–B54). < 2 s for 200 visits (NFR-PERF) |
| H2 | `GET /staff/clinical/patients/{facility_patient_id}/problem-summary/` | `clinical.view` | → `{allergies, no_known_allergies, conditions, medications, recent_diagnoses, is_staff_member}` | Rel |
| A1 | `POST /staff/clinical/patients/{facility_patient_id}/access-reasons/` | `clinical.view` | `{reason_code, reason_text?}` (text required for `other`) → `201 {granted_until}` | |
| A2 | `GET /staff/clinical/patients/{facility_patient_id}/access/` | `clinical.view` | → `{has_relationship, is_staff_member, reason_required, granted_until}` | Lets the screen ask for the reason before loading |
| AL1 | `POST /staff/clinical/alerts/` | `clinical.write` or `prescription.issue` | `{facility_patient_id, items: [{drug_code, quantity?}]}` → `{alerts: [{drug_code, kind: allergy\|duplicate\|dose, severity, allergy_id?, substance?, verification_status?}]}` | Rel. 1–20 items; unknown drug `400` |

`Consultation`: `id, visit_id, facility_patient_id, patient {id, display_name, age_years, sex}, author {membership_id, full_name}, status, started_at, signed_at, is_late_entry, is_restricted, suggest_restricted, history_text, examination_text, plan_text, patient_instructions_text, private_notes, diagnoses: [{id, code, display, plain_language, rank, certainty, is_sensitive}], vitals: [Vitals], addenda: [Addendum], allergies: [Allergy], no_known_allergies, content_hash (hex), integrity, entered_in_error {at, reason, by} | null, can_edit, can_sign, version`.

`HistoryItem`: `kind (consultation | vitals), id, occurred_at, visit_id, service_name_i18n, author_name, status, is_restricted, is_late_entry, diagnoses: [{code, display, certainty, rank}], addenda_count, vitals: Vitals | null`.

### 3.2 Patient, S6a (`/patient/…`)

| # | Method and path | Request → response | Notes |
|---|---|---|---|
| PR1 | `GET /patient/records/` | `?patient_id=&page=` → paginated `PatientRecordRow` (`id, patient_id, facility_name, service_date, doctor_name, signed_at, diagnoses: [{code, plain_language, certainty}]`) | Profiles of the account by §2.2 Patient read. Through `clinical_patient_records(account)` (D-4) |
| PR2 | `GET /patient/records/{id}/` | → `PatientRecord` (§2.2 Patient read) | `404` for another account's record, a restricted record for a delegate, a draft or an entered-in-error record |

### 3.3 S6b endpoints

| # | Method and path | Permission | Notes |
|---|---|---|---|
| R1 | `GET /staff/results-inbox/` · `POST /staff/results-inbox/{id}/review/` | `clinical.view` | `{comment?}`; FR-CLN-09 |
| L1 | `POST /staff/patient-imports/` · `GET …/{id}/` · `PUT …/{id}/mapping/` · `GET …/{id}/rows/` · `POST …/{id}/confirm/` · `POST …/{id}/rollback/` | `records.import` | Up on confirm and rollback; FR-PAT-10 |
| L2 | `POST /staff/clinical/patients/{facility_patient_id}/scans/` | `documents.upload` | S1 upload + document type and date; FR-PAT-11 |
| L3 | `GET`, `POST /staff/clinical/patients/{facility_patient_id}/history-entries/` | `records.import_clinical` | FR-PAT-12; shown in H1 as `kind = legacy` |
| G1 | `POST /platform/break-glass/` · `GET /platform/break-glass/` · `POST …/{id}/review/` | super admin, Up | FR-ACC-09, FR-SEC-09 |
| G2 | `GET /platform/break-glass/{id}/patients/{patient_id}/history/` | super admin with an open session | Read-only H1 and C2 data for that facility |

## 4. Permissions

One new code, `clinical.unsigned_list` ("See the list of unsigned clinical records, without content"), granted to `doctor` and `facility_admin` (analysis 07 §2 "Unsigned records list for the doctor and the facility admin"; the facility admin has no clinical content, analysis 02 §2.3). Registered in the `[S6]` block of `authz/catalogue.py` and seeded by `clinical` migration `0002`.

S0 codes used: doctor `clinical.view`, `clinical.write`, `clinical.sign`, `clinical.amend_own`, `vitals.record`, `prescription.issue`, `records.import_clinical`; receptionist `vitals.record`; facility admin `records.import`. Receptionists, pharmacists and facility admins never receive diagnoses, notes or examination (analysis 02 §3); the pharmacist's prescription and allergy view comes with S7.

## 5. Background jobs

None in S6a (the unsigned list is a query; the access reason expires by time). S6b: `patients.purge_import_rows` (daily: raw rows of batches past their rollback window) and `authz.break_glass_review_reminder` (weekly, signal for S9).

## 6. Frontend

### 6.1 staff-web, feature `clinical` (`src/features/clinical/`)

| Route / slot | Screen | PR | Shown to |
|---|---|---|---|
| `/queue/mine/consultation/:consultationId` | **Consultation page** beside My queue (design 04 §3.2): header with name, sex, age; permanent red **allergy banner** (icon + text, "No known allergies" or "Allergies not recorded" otherwise); autosave status ("Draft · saved 09:12", "Saving…", "Not saved: retry"); section tabs as anchors on one scrolling page: Reason, Vitals, History, Examination, Diagnosis (ICD-10 type-ahead in plain language, primary/secondary, provisional/confirmed), Plan, Instructions, **Private notes** (marked "Never shown to the patient" with a lock icon); restricted switch with the suggestion; **Sign** (step-up dialog when `step_up_required`), after signing: read-only view, addendum form, entered-in-error dialog | S6a | `clinical.write` |
| My queue (S4) | "Open consultation" on the current patient (C1); "Complete" shows the unsigned-draft error | S6a | `queue.call` |
| History drawer | **Timeline drawer** next to the record: problem summary on top, then items newest first with filters (type, diagnosis code, dates), restricted and late-entry chips | S6a | `clinical.view` |
| Reason dialog | **Reason for access** before showing the record of a patient without a relationship or a staff member: reason list + text for "Other" | S6a | `clinical.view` |
| `/clinical/unsigned` | Unsigned records list | S6a | `clinical.unsigned_list` |
| Reception board (S4) | Vitals form in the side panel | S6a | `vitals.record` |
| `/clinical/results` | Results inbox | S6b | `clinical.view` |
| `/settings/patient-import` | Import wizard: upload → mapping → preview with errors and duplicates → confirm → batches with rollback | S6b | `records.import` |

### 6.2 patient-web, feature `records` (S6b)

`/visits` history section and `/visits/records/:id` visit detail: plain-language diagnosis first, instructions, vitals, addenda; never private notes (design 07 §3.4).

### 6.3 Shared packages

| Package | Deliverable |
|---|---|
| `packages/ui` | `AllergyBanner`, `AutosaveStatus`, `SectionAnchors` |
| `packages/api-client` | `features/clinical.ts` (C1–C7, V1–V2, H1–H2, A1–A2, AL1, PR1–PR2) |
| MSW mocks | `mocks/features/clinical.ts`: Kigali Clinic; patient Keza U. (penicillin allergy, in Dr Keza's queue) with 3 signed consultations (malaria B54, hypertension I10, one with an addendum) and one draft; a staff-member patient that needs a reason; ICD-10 search |
| Translations | staff-web `clinical`; patient-web `records` (rw, en, fr) |

## 7. Integration points

Shared files: S6 adds `[S6]` blocks next to the existing markers:

- `config/settings/base.py` (`INSTALLED_APPS` `medilink.clinical`; `ENUM_NAME_OVERRIDES`), `config/urls.py`, `authz/catalogue.py`, `audit/actions.py`
- frontend registries (`features.ts`, `i18n/features.ts`, `mocks/features.ts`, `endpoints.ts`, `api-client/index.ts`)
- `.github/workflows/ci-backend.yml` coverage loop (`medilink/clinical`)

**Hooks used:** S4 `visits.Visit`, `Ticket` (completion guard through a `pre_save` receiver in the `clinical` app, D-6); S3 `FacilityPatient`, health profile (allergies, conditions, medicines), `record_patient_event`; S1 diagnosis codes, drugs, step-up; S5b follow-up (R8).

**Interfaces offered:** `clinical.alerts.check(patient, items)` for S7 prescribing; `clinical.access.require_access(principal, facility_patient)` for S7, S8 and S10 views of clinical data; `clinical.models.Consultation` as the `consultation_id` of S5b follow-ups and S7 prescriptions.

## 8. Dependencies

| Depends on | Status |
|---|---|
| S1 master data (ICD-10, drugs), step-up · S3 patients and health profile · S4 visits | Merged |
| S5b follow-up (R8) | In progress in parallel; the consultation links to it once merged |
| S9 notifications | In progress in parallel; S6 needs none in S6a |

## 9. Acceptance checks

### Backend

| # | Check | Source |
|---|---|---|
| S6-B1 | Every S6a §3 endpoint in the OpenAPI schema (`--fail-on-warn`) | architecture 02 |
| S6-B2 | Authorisation matrix: each S6a endpoint × receptionist / doctor (author, other doctor) / pharmacist / facility admin / patient / anonymous | FR-SEC-01, analysis 02 §3 |
| S6-B3 | Cross-facility `404` for visits, consultations, vitals and patients of another facility; forced RLS on every `clinical_*` and `authz_access_reason` table; no context → 0 rows | security 04 |
| S6-B4 | Draft autosave: author only, stale `version` → `409`, diagnoses replaced, unknown or inactive code rejected, one primary | FR-CLN-02, 06 |
| S6-B5 | Sign: step-up required, primary diagnosis required, hash matches the canonical content, late entry after 24 h, integrity `ok` and `mismatch` | FR-CLN-02, security 05 §6 |
| S6-B6 | Lock: service and **database trigger** refuse content changes after signing and every delete | FR-CLN-02, 04 |
| S6-B7 | Addenda: by author (amend_own) and by another doctor (attributed), step-up, hash; original unchanged; append-only | FR-CLN-03 |
| S6-B8 | Entered in error: author only, reason, hidden from timeline and patient, never deleted | FR-CLN-04 |
| S6-B9 | Completion refused with a draft; allowed after signing or without a consultation; unsigned list per role, without content | FR-CLN-05 |
| S6-B10 | Vitals: ranges, at least one value, reception sees own rows, entered in error | analysis 07 §1 |
| S6-B11 | Alerts: allergy by name and class, refuted ignored, duplicate with long-term medicines and within the request, dose sanity | FR-CLN-07 |
| S6-B12 | Treatment relationship: open visit today, recent care, no relationship → `access_reason_required`, reason opens 120 min, staff-as-patient always asks; reasons and views audited with patient links | FR-SEC-03, FR-ACC-08 |
| S6-B13 | History timeline: filters (type, code prefix, dates), newest first, entered-in-error excluded, problem summary | FR-PAT-09 |
| S6-B14 | **Private notes never appear in any patient-facing serializer** (field introspection of every serializer used under `/patient/`, and the encrypted plaintext absent from every patient response); examination absent too | FR-CLN-01 |
| S6-B15 | Patient read: self, guardian, delegate (restricted hidden), other account `404`, drafts and entered-in-error hidden | FR-PAT-13, FR-CLN-08 |
| S6-B16 | Section text and private notes stored encrypted (no plaintext in the row) | FR-SEC-10 |
| S6-B17 | Migrations reversible; earlier suites green; coverage ≥ 90 % for `medilink/clinical` | NFR-OPS-08 |
| S6-B18 | (S6b) Results inbox: assignment, review, inbox per doctor | FR-CLN-09 |
| S6-B19 | (S6b) Legacy import: mapping, preview errors and duplicates, nothing saved before confirm, rollback window and the attached-visit rule | FR-PAT-10 |
| S6-B20 | (S6b) Scans and back-entry labelled historical, in the timeline | FR-PAT-11, 12 |
| S6-B21 | (S6b) Break-glass: super admin only, step-up, reason, 60-minute window, read-only, review, patient access history | FR-ACC-09, FR-SEC-09 |

### Frontend

| # | Check | Source |
|---|---|---|
| S6-F1 | All S6a §6 screens work on mocks; role gating; `409` refetch; `step_up_required` opens the step-up dialog and retries the sign | ADR 0007 |
| S6-F2 | Consultation page: one scroll with anchors, autosave status always visible, allergy banner permanent (icon + text), private notes marked | design 04 §3.2 |
| S6-F3 | ICD-10 type-ahead in plain language; primary/secondary; provisional/confirmed; sensitive suggests restricted | FR-CLN-06, 08 |
| S6-F4 | History drawer beside the record with filters and problem summary | FR-PAT-09 |
| S6-F5 | Reason-for-access dialog blocks the record until a reason is given | FR-SEC-03 |
| S6-F6 | Text in `clinical` (rw, en, fr); dates through `dateFormat()`; axe clean on every new screen | NFR-UX-01, 03 |
| S6-F7 | (S6b) Results inbox, import wizard, patient records | FR-CLN-09, FR-PAT-10 |

### Integration

| # | Check | Source |
|---|---|---|
| S6-I1 | Rebased; OpenAPI regenerated; shared files only in `[S6]` blocks | contracts README |
| S6-I2 | Real API: call next → open consultation → vitals → diagnose → sign with step-up → complete → the patient sees the record without private notes | FR-CLN-01, 02, 05 |
| S6-I3 | Local performance: history of a patient with 200 visits opens in < 2 s (p95) on the dev machine; staging waits for #17 | NFR-PERF |

## 10. Decisions and deviations from the docs

| # | Topic | Decision |
|---|---|---|
| D-1 | Referral, lab request, sick note tables (database design §5.8 "S6") | Built with S7, which prints them (referral letter, sick note PDF). S6 keeps the consultation text sections, diagnoses and vitals |
| D-2 | Encryption of consultation text (database design: only private notes and restricted payloads are `*_enc`) | **All** free-text sections are field-encrypted with `medilink.patients.crypto` (AES-256-GCM bound to table, column and row), not only C4. Clinical text is the most sensitive data in the system and is never searched by content, so encryption costs nothing in features. `restricted_payload_enc` is not needed: restricted records are filtered by `is_restricted`, and their text is already encrypted |
| D-3 | `authz_access_reason` lives in `authz`, which has no migrations | Created by the `clinical` app with its database-design table name, as S4 D-8 did for `core_outbox_event` |
| D-4 | Patient read policy on `clinical_consultation` (database design "✓ + patient policy") | As S4 D-7 and S5 D-1: the SECURITY DEFINER function `clinical_patient_records(account)` returns `(consultation_id, facility_id)` of signed, not entered-in-error records of the account's profiles (delegates: not restricted); the view then reads each in that facility's RLS context. The patient role never gets a policy that reads clinical rows |
| D-5 | Lock enforcement | Service checks plus a `BEFORE UPDATE OR DELETE` trigger on `clinical_consultation`, a parent-status trigger on `clinical_diagnosis`, append-only triggers on `clinical_addendum` and `authz_access_reason`, and a column-guard trigger on `clinical_vitals` (only the entered-in-error columns change) |
| D-6 | "A visit cannot be completed until its consultation is signed" with S4 owning the queue code | The `clinical` app connects a `pre_save` receiver on `visits.Ticket`: a consultation-stage ticket moving to `completed` or `moved_to_next_stage` while the visit has a draft raises `422`. S4 code is unchanged. Visits with no consultation still complete (reception-only and pharmacy-only visits); a facility setting to require one is left for S11 |
| D-7 | Patient access history (S3 `ACCESS_HISTORY` is a fixed set in the S3 module) | S6 writes `patients_audit_link` rows for every clinical read, so the data is there; showing the `clinical.*.viewed` actions in the patient's list needs an S3-owned change, done in S10 with the access history screens |
| D-8 | Relationship window and reason lifetime as facility settings | Fixed in S6a: 30 days of recent care, 120 minutes per reason (security 04 §3 gives no number). The settings schema has no `clinical` section; S11 can add one |
| D-9 | Signing "with PIN or password" (analysis 07 §2) | Uses the S1 step-up (password and authenticator code, or the login's second factor within 5 minutes). The PIN only unlocks an idle session (security 03 §5) and is not a signing factor |
| D-10 | Opening a consultation on the S4 `start` action (S4 §7 "interfaces offered") | The S4 signal was never built. The doctor opens the consultation from My queue (C1, idempotent), so a started ticket without notes stays possible (e.g. a quick transfer) |
| D-11 | Break-glass for doctors across facilities (security 03 §8) | P2 with consent sharing; S6b builds the super admin case only (FR-ACC-09) |
| D-12 | Paths of the patient-scoped clinical endpoints (found while building S6a) | S3 routes `/staff/patients/{id}/{kind}/` for its health profile items, which matches any `/staff/patients/{id}/<word>/`. S6 therefore serves H1, H2, A1, A2 (and S6b L2, L3) under `/staff/clinical/patients/{facility_patient_id}/…`. The ID is still the S3 facility record |
| D-13 | Outside results come in through L2 (`document_type = outside_result`): the scan and its inbox item are one action; uploads use the S1 purpose `clinical_document`, readable only through the audited `POST /staff/clinical/scans/{id}/download-link/` | §2.2 "A doctor's upload of type `outside_result`" (no endpoint named) | One upload path for scans and results; the generic upload read policy would bypass the relationship rule |
| D-14 | Health attributes get their own endpoints, `GET`/`POST /staff/clinical/patients/{fp}/health-attributes/` (`clinical.view` / `clinical.write`), and appear in the consultation and the problem summary | §1 lists the table only | The pregnancy flag needs a way to record it |
| D-15 | Break-glass adds `POST /platform/break-glass/{id}/end/`, needs a reason of at least 20 characters, and a back-entered allergy also creates an unverified S3 allergy | §3.3 G1 | Ending early limits exposure; a short reason is not reviewable; allergy alerts must see paper allergies |
