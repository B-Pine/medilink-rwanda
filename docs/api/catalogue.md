# Phase-1 endpoint catalogue

Status: v0.1 · 2026-10-17 · **Plan only.** Implemented endpoints are defined by the generated OpenAPI schema (`GET /api/v1/schema/`); see [README](README.md) §1 for how the two relate, the status values, the permission codes († = proposed) and the note abbreviations (Idem, Ver, Step-up, RL, Audit, Async).

Sprints and requirements follow the [backend](../roadmap/backend.md) and [frontend](../roadmap/frontend.md) roadmaps. Conventions: [architecture 02](../architecture/02-api-conventions.md).

## Contents

| Sprint | Theme | Status |
|---|---|---|
| [S0](#s0--foundations) | Foundations | Implemented (backend-v0.1.0) |
| [S1](#s1--platform-and-onboarding) | Platform and onboarding | Contracted ([contract](../architecture/contracts/README.md)); rows below are the plan, the contract wins |
| [S2](#s2--facility-setup-and-staff) | Facility setup and staff | Planned |
| [S3](#s3--patients-and-identity) | Patients and identity | Contracted ([contract](../architecture/contracts/README.md)); rows below are the plan, the contract wins |
| [S4](#s4--visits-and-the-live-queue) | Visits and the live queue | Planned |
| [S5](#s5--booking-remote-join-and-calendars) | Booking, remote join and calendars | Planned |
| [S6](#s6--clinical-record-and-history) | Clinical record and history | Planned |
| [S7](#s7--pharmacy-and-documents) | Pharmacy and documents | Planned |
| [S8](#s8--billing-and-payments) | Billing and payments | Planned |
| [S9](#s9--notifications) | Notifications | Contracted ([contract](../architecture/contracts/README.md)); rows below are the plan, the contract wins |
| [S10](#s10--disputes-help-and-reports) | Disputes, help and reports | Planned |
| [S11](#s11--hardening-and-pilot-readiness) | Hardening and pilot readiness | Planned |
| [—](#not-yet-scheduled) | Not yet scheduled | Planned |

---

## S0 · Foundations

Copied from the [Sprint 0 contract](../architecture/03-sprint-0-contract.md) §2. Schemas (`StaffMe`, `PatientMe`, `LoginResult`) and audit events are defined there.

### Audience-neutral

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/health/` | Liveness and API version | Public | NFR-OPS-06 | `200 {"status":"ok","version":"0.1.0"}` | Implemented (backend-v0.1.0) |
| `GET` | `/api/v1/csrf/` | CSRF token for frontends on other hosts | Public | FR-SEC-01 | Sets the CSRF cookie ([ADR 0006](../decisions/0006-separate-frontend-and-backend-hosting.md)) | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/auth/password-reset/` | Request a reset email | Public | FR-PAT-02 | Always `202`; RL: auth; email via Mailpit in dev; Audit `auth.password_reset.requested` | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/auth/password-reset/confirm/` | Set a new password | Reset token (body) | FR-PAT-02 | `204`; revokes all sessions of the user; Audit `auth.password_reset.completed` | Implemented (backend-v0.1.0) |
| `GET` | `/api/v1/schema/` | OpenAPI 3 schema | Public (non-production) | NFR-OPS-06 | Staff-only in production | Implemented (backend-v0.1.0) |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/patient/auth/register/` | Sign up: user + self patient + link + consents | Public | FR-PAT-02, FR-SEC-04, FR-SEC-05, FR-AI-02 | `201 PatientMe` (logged in); password ≥ 15; Audit `patient.registered` | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/patient/auth/login/` | Log in | Public | FR-PAT-02 | Generic `401`; RL: auth; rotates session | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/patient/auth/logout/` | Log out | Patient session | FR-SEC-06 | `204`; deletes the patient session only | Implemented (backend-v0.1.0) |
| `GET` | `/api/v1/patient/auth/me/` | Current patient account and profiles | Patient session | FR-PAT-03 | `PatientMe` | Implemented (backend-v0.1.0) |

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/staff/auth/login/` | Staff login | Active membership or platform admin | FR-ACC-04 | `LoginResult`; generic `401`; RL: auth; rotates session; Audit `auth.login.*` | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/staff/auth/mfa/setup/` | Start TOTP enrolment | `mfa_setup_required` state | FR-ACC-04, FR-SEC-06 | Returns `otpauth_uri` and secret | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/staff/auth/mfa/confirm/` | Confirm TOTP; get 10 recovery codes | `mfa_setup_required` state | FR-ACC-04, FR-SEC-06 | Codes shown once, stored hashed; Audit `auth.mfa.enrolled` | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/staff/auth/mfa/verify/` | Second factor at login (code or recovery code) | `mfa_required` state | FR-ACC-04, FR-SEC-06 | RL: auth; rotates session; Audit `auth.mfa.*` | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/staff/auth/logout/` | Log out | Staff session | FR-SEC-06 | `204`; deletes the staff session only; Audit `auth.logout` | Implemented (backend-v0.1.0) |
| `GET` | `/api/v1/staff/auth/me/` | Current user, memberships, permissions for the active facility | Staff session | FR-ACC-01, FR-ACC-02, FR-ACC-03 | `StaffMe` | Implemented (backend-v0.1.0) |
| `POST` | `/api/v1/staff/auth/active-facility/` | Switch the active facility | Member of that facility | FR-ACC-02 | `404` if not a member; rotates session; Audit `staff.facility.switched` | Implemented (backend-v0.1.0) |

### WebSockets

Sprint 0 only needs a placeholder authenticated consumer with origin validation (check B14). Its path is not contracted.

---

## S1 · Platform and onboarding

Requirements: FR-ONB-01..03, 08, 10; FR-DOC-03 (uploads). Security: upload pipeline v1, platform step-up.

### Public

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/public/facility-applications/` | Start an application; emails a resume link | Public | FR-ONB-01 | RL: auth; bot checks | Planned |
| `GET` | `/api/v1/public/facility-applications/{id}/` | Read the draft | Applicant | FR-ONB-01 | Applicant access mechanism: README §6 item 4 | Planned |
| `PATCH` | `/api/v1/public/facility-applications/{id}/` | Autosave wizard steps (facility, location, contacts, admin person, insurers, agreements) | Applicant | FR-ONB-01 | Ver; only in `draft` or `changes_requested` | Planned |
| `POST` | `/api/v1/public/facility-applications/{id}/documents/` | Upload licence, RDB registration, TIN, accreditation, insurer contracts | Applicant | FR-ONB-01, FR-DOC-03 | `multipart`; allowlist, 10 MB, AV scan, quarantine; RL: upload | Planned |
| `DELETE` | `/api/v1/public/facility-applications/{id}/documents/{document_id}/` | Remove an upload before submission | Applicant | FR-ONB-01 | Draft only | Planned |
| `POST` | `/api/v1/public/facility-applications/{id}/submit/` | Submit or resubmit | Applicant | FR-ONB-01, FR-ONB-02 | → `submitted`; Idem; notifies super admins | Planned |
| `GET` | `/api/v1/public/locations/` | Administrative locations (province → village) | Public | FR-ONB-10 | Filters `level`, `parent`; cacheable | Planned |
| `GET` | `/api/v1/public/facility-types/` | Facility types and levels of care | Public | FR-ONB-10 | Cacheable | Planned |
| `GET` | `/api/v1/public/insurers/` | Insurers | Public | FR-ONB-10 | Cacheable | Planned |
| `GET` | `/api/v1/public/service-catalogue-items/` | Standard service names | Public | FR-ONB-10 | Localised by `Accept-Language` | Planned |

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/staff/auth/step-up/` | Re-authenticate for sensitive actions | Staff session | FR-SEC-06 | Password + second factor; opens a 5-minute window; RL: auth | Planned |

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/platform/facility-applications/` | Applications pipeline | Platform admin | FR-ONB-02 | Filters `status`, `district`, `q` | Planned |
| `POST` | `/api/v1/platform/facility-applications/` | Create an application on a facility's behalf; invites the applicant | Platform admin | FR-ONB-01 | Audit | Planned |
| `GET` | `/api/v1/platform/facility-applications/{id}/` | Application, documents, checks | Platform admin | FR-ONB-02 | | Planned |
| `POST` | `/api/v1/platform/facility-applications/{id}/start-review/` | Open for review | Platform admin | FR-ONB-02 | `submitted` → `under_review` | Planned |
| `POST` | `/api/v1/platform/facility-applications/{id}/request-changes/` | Request changes, one comment per item | Platform admin | FR-ONB-02 | → `changes_requested`; applicant notified | Planned |
| `POST` | `/api/v1/platform/facility-applications/{id}/approve/` | Approve; creates the organisation and facility (`approved`) and invites the proposed facility admin | Platform admin | FR-ONB-02, FR-ONB-05 | Step-up; Idem; Audit | Planned |
| `POST` | `/api/v1/platform/facility-applications/{id}/reject/` | Reject with reasons | Platform admin | FR-ONB-02 | Step-up; reasons required; applicant notified | Planned |
| `GET`, `POST` | `/api/v1/platform/facility-applications/{id}/notes/` | Verification notes (call, visit, document check) | Platform admin | FR-ONB-02 | Append-only | Planned |
| `GET` | `/api/v1/platform/facility-applications/{id}/events/` | Verification history | Platform admin | FR-ONB-02 | Append-only | Planned |
| `POST` | `/api/v1/platform/facility-applications/{id}/documents/{document_id}/download-links/` | Link to view a verification document | Platform admin | FR-ONB-02, FR-DOC-05 | 5-minute signed URL on the files origin; Audit | Planned |
| `GET` | `/api/v1/platform/facilities/` | Facilities by status, type, district | Platform admin | FR-ONB-02 | No clinical data | Planned |
| `GET` | `/api/v1/platform/facilities/{id}/` | Facility profile, status, licences | Platform admin | FR-ONB-02 | | Planned |
| `GET`, `POST` | `/api/v1/platform/facilities/{id}/licences/` | Operating licences with expiry dates | Platform admin | FR-ONB-08 | Reminder job at 60 and 30 days before expiry | Planned |
| `PATCH` | `/api/v1/platform/facilities/{id}/licences/{licence_id}/` | Record a renewal | Platform admin | FR-ONB-08 | Ver | Planned |
| `GET`, `POST` | `/api/v1/platform/{kind}/` | List and create master data (kinds below) | Platform admin | FR-ONB-10 | Translations rw/en/fr where shown to patients; Audit | Planned |
| `GET`, `PATCH` | `/api/v1/platform/{kind}/{id}/` | Read and edit master data | Platform admin | FR-ONB-10 | Ver; each edit is a new version; no `DELETE` (retire with `is_active=false`) | Planned |
| `POST` | `/api/v1/platform/{kind}/imports/` | Upload a bulk import and get a preview | Platform admin | FR-ONB-10 | `multipart`; validation and diff before anything is saved | Planned |
| `POST` | `/api/v1/platform/{kind}/imports/{import_id}/confirm/` | Apply a previewed import | Platform admin | FR-ONB-10 | Idem; Audit | Planned |

Master data kinds (`{kind}`):

| Kind | Content | Imports |
|---|---|---|
| `locations` | Provinces, districts, sectors, cells, villages | Yes (national list) |
| `facility-types` | Facility types, level of care | — |
| `service-catalogue-items` | Standard service names | — |
| `insurers` | Insurers and schemes | — |
| `drugs` | Drug catalogue (Essential Medicines List: generic name, strength, form; controlled flag) | Yes |
| `diagnosis-codes` | ICD-10 subset with plain-language names | Yes |
| `symptoms` | Structured symptom list (FR-AI-01) | Yes |
| `public-holidays` | Yearly holidays | — |
| `reason-codes` | Dispute categories; reasons for no-show reversal, void, reorder, priority, exemption, access, break-glass | — |
| `document-templates` | Default templates for prescriptions, sick notes, receipts, referral letters | — |

---

## S2 · Facility setup and staff

Requirements: FR-ONB-04..07, 09; FR-SCH-05..06; FR-BIL-02, 05; FR-ACC-05..07.

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET`, `PATCH` | `/api/v1/staff/facility/` | Active facility profile: description, contacts, address, map pin | Read: any member · Write: `facility.configure` | FR-ONB-04 | Singleton; Ver; every change goes to the change log | Planned |
| `POST` | `/api/v1/staff/facility/photos/` | Upload profile photos | `facility.configure` | FR-ONB-04, FR-DOC-03 | `multipart`; re-encoded, EXIF stripped | Planned |
| `GET`, `PUT` | `/api/v1/staff/facility/opening-hours/` | Weekly hours, service hours, breaks | `facility.configure` | FR-ONB-04, FR-SCH-05 | `PUT` replaces the week; Ver | Planned |
| `GET`, `PATCH` | `/api/v1/staff/facility/settings/` | Queue, booking, billing, document and notification settings | `facility.configure` | FR-ONB-04, FR-QUE-04 | Sections validated server-side; Ver; Step-up for billing | Planned |
| `GET`, `PUT` | `/api/v1/staff/facility/branding/` | Letterhead, logo, stamp image, document footer | `facility.configure` | FR-ONB-04, FR-DOC-01 | `multipart` images through the upload pipeline | Planned |
| `GET` | `/api/v1/staff/facility/config-changes/` | Configuration change log (old value, new value, who, when) | `facility.configure` | FR-ONB-04 | Append-only | Planned |
| `GET` | `/api/v1/staff/facility/setup-checklist/` | Setup checklist and what is missing | `facility.configure` | FR-ONB-03 | Computed from the configuration | Planned |
| `POST` | `/api/v1/staff/facility/go-live/` | Publish: `setup` → `live` | `facility.configure` | FR-ONB-03 | `422 business_rule_violation` lists missing steps; Audit | Planned |
| `GET`, `POST` | `/api/v1/staff/departments/` | Departments | `facility.configure` | FR-ONB-04 | Names rw/en/fr | Planned |
| `GET`, `PATCH` | `/api/v1/staff/departments/{id}/` | Edit or retire a department | `facility.configure` | FR-ONB-04 | Ver | Planned |
| `GET`, `POST` | `/api/v1/staff/services/` | Services: names, department, duration, bookable, walk-in, remote join, ticket prefix, level of care, age and sex rules, catalogue mapping | `facility.configure` | FR-ONB-04 | Ticket prefix unique per facility | Planned |
| `GET`, `PATCH` | `/api/v1/staff/services/{id}/` | Edit or retire a service | `facility.configure` | FR-ONB-04 | Ver | Planned |
| `GET`, `POST` | `/api/v1/staff/service-points/` | Rooms, desks, pharmacy windows | `facility.configure` | FR-ONB-04 | | Planned |
| `GET`, `PATCH` | `/api/v1/staff/service-points/{id}/` | Edit or retire a service point | `facility.configure` | FR-ONB-04 | Ver | Planned |
| `GET`, `POST` | `/api/v1/staff/calendar-events/` | Closures, holiday overrides, Umuganda behaviour, special days | `facility.configure` | FR-SCH-05 | Closures that hit bookings start the disruption flow (S5) | Planned |
| `PATCH`, `DELETE` | `/api/v1/staff/calendar-events/{id}/` | Edit or remove a future event | `facility.configure` | FR-SCH-05 | Soft delete; past events kept | Planned |
| `GET`, `POST` | `/api/v1/staff/schedule-templates/` | Doctor or service weekly blocks: service, service point, slot length, capacity, bookable share | `schedule.manage` (receptionist: read) | FR-SCH-06, FR-ONB-06 | Response lists cross-facility conflicts as time ranges only, never the other facility | Planned |
| `GET`, `PATCH`, `DELETE` | `/api/v1/staff/schedule-templates/{id}/` | Edit or end a block | `schedule.manage` | FR-SCH-06 | Ver; affects future unbooked slots only | Planned |
| `GET`, `POST` | `/api/v1/staff/schedule-exceptions/` | Leave, training, extra sessions | `schedule.manage`; doctors: own leave requests | FR-SCH-06 | Doctor requests start as `requested` | Planned |
| `PATCH` | `/api/v1/staff/schedule-exceptions/{id}/` | Edit an exception | `schedule.manage` | FR-SCH-06 | Ver | Planned |
| `POST` | `/api/v1/staff/schedule-exceptions/{id}/approve/` | Approve a leave request | `schedule.manage` | FR-SCH-06 | Approved leave in the future feeds the disruption flow | Planned |
| `GET`, `POST` | `/api/v1/staff/tariff-items/` | Price list: services, procedures, medicines, other charges | `facility.configure` | FR-BIL-05 | Step-up; amounts as `*_rwf` | Planned |
| `GET`, `PATCH` | `/api/v1/staff/tariff-items/{id}/` | Change a price from a date | `facility.configure` | FR-BIL-05 | Step-up; new version with `valid_from`; existing bills never change | Planned |
| `GET`, `POST` | `/api/v1/staff/insurer-rules/` | Accepted insurers: services, patient share, referral required, exclusions, ceiling | `facility.configure` | FR-BIL-02 | Step-up | Planned |
| `GET`, `PATCH` | `/api/v1/staff/insurer-rules/{id}/` | Change a rule from a date | `facility.configure` | FR-BIL-02 | Step-up; versioned with `valid_from` | Planned |
| `GET` | `/api/v1/staff/roles/` | Roles and their permissions | Any staff | FR-ACC-03 | Seeded data | Planned |
| `GET` | `/api/v1/staff/memberships/` | Staff list | `staff.manage` | FR-ACC-01 | | Planned |
| `GET`, `PATCH` | `/api/v1/staff/memberships/{id}/` | Roles and service points of a member | `staff.manage` | FR-ACC-01, FR-ACC-03 | Step-up; rotates the member's sessions; Audit | Planned |
| `POST` | `/api/v1/staff/memberships/{id}/deactivate/` | Remove access now | `staff.manage` | FR-ACC-06 | Ends sessions, closes sockets; Audit | Planned |
| `POST` | `/api/v1/staff/memberships/{id}/attest-licence/` | Attest that the clinician licence was checked | `staff.manage` | FR-ACC-07 | Required before a clinician can sign; Audit | Planned |
| `POST` | `/api/v1/staff/memberships/{id}/mfa-reset/` | Reset a member's second factor | `staff.manage` | FR-ACC-04 | Step-up; the member is notified | Planned |
| `GET`, `POST` | `/api/v1/staff/invitations/` | Invite by email with roles and service points | `staff.manage` | FR-ACC-05, FR-ONB-05 | Step-up; 7-day expiry; an existing account gets a new membership | Planned |
| `POST` | `/api/v1/staff/invitations/{id}/resend/` | Send the invitation again | `staff.manage` | FR-ACC-05 | New token, old one invalidated | Planned |
| `POST` | `/api/v1/staff/invitations/{id}/revoke/` | Cancel an invitation | `staff.manage` | FR-ACC-05 | | Planned |
| `POST` | `/api/v1/staff/auth/invitations/lookup/` | Show facility, inviter and roles for an invitation token | Invitee (token in body) | FR-ACC-05 | RL: auth | Planned |
| `POST` | `/api/v1/staff/auth/invitations/accept/` | Accept: set a password (new account) or confirm (existing account), then MFA setup | Invitee (token in body) | FR-ACC-05, FR-ACC-04 | Single use; returns `LoginResult` | Planned |
| `GET`, `PATCH` | `/api/v1/staff/clinician-profile/` | Own licence council, licence number, specialty | Staff (self) | FR-ACC-07 | | Planned |

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/platform/facilities/{id}/suspend/` | Suspend with a reason | Platform admin | FR-ONB-07 | Step-up; hidden from search, new bookings blocked, today keeps working; patients with future bookings notified | Planned |
| `POST` | `/api/v1/platform/facilities/{id}/reactivate/` | Lift a suspension | Platform admin | FR-ONB-07 | Step-up | Planned |
| `POST` | `/api/v1/platform/facilities/{id}/deactivate/` | Facility leaves or closes | Platform admin | FR-ONB-07, FR-ONB-09 | Step-up; starts the full data export (S11) | Planned |
| `POST` | `/api/v1/platform/memberships/{id}/mfa-reset/` | Reset a facility admin's second factor | Platform admin | FR-ACC-04 | Step-up; the user is notified | Planned |

---

## S3 · Patients and identity

Requirements: FR-PAT-01..09, 13, 14; FR-BIL-01; FR-SEC-08, 10. Security: field-level encryption for the national ID.

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/patient/auth/email-verification/` | Send a verification email | Patient session | FR-PAT-02 | RL: auth; verification required before clinical records are shown | Planned |
| `POST` | `/api/v1/patient/auth/email-verification/confirm/` | Confirm with the emailed token | Token (body) | FR-PAT-02 | | Planned |
| `POST` | `/api/v1/patient/auth/magic-link/` | Email a one-time login link | Public | FR-PAT-02 | Always `202`; single use, 15 minutes, bound to the browser; RL: auth | Planned |
| `POST` | `/api/v1/patient/auth/magic-link/confirm/` | Log in with the link token | Token (body) | FR-PAT-02 | Returns `PatientMe` | Planned |
| `POST` | `/api/v1/patient/auth/step-up/` | Re-authenticate for sensitive actions | Patient session | FR-SEC-06 | 5-minute window; RL: auth | Planned |
| `GET` | `/api/v1/patient/profiles/` | Profiles the account can act for (self, dependents, delegated) | Patient session | FR-PAT-03 | | Planned |
| `GET`, `PATCH` | `/api/v1/patient/profiles/{patient_id}/` | Names, date of birth, sex, contacts, emergency contact | Linked account | FR-PAT-01, FR-PAT-07 | Ver | Planned |
| `POST` | `/api/v1/patient/dependents/` | Add a child or a consenting adult | Patient session | FR-PAT-03, FR-SEC-04 | Records guardian consent | Planned |
| `GET`, `POST` | `/api/v1/patient/delegations/` | Give a caregiver access to own profile | Linked account (self) | FR-PAT-03 | Step-up; restricted records never shown to delegates | Planned |
| `POST` | `/api/v1/patient/delegations/{id}/revoke/` | End a delegation | Linked account (self) | FR-PAT-03 | Immediate | Planned |
| `GET`, `POST` | `/api/v1/patient/profiles/{patient_id}/identifiers/` | National ID, passport, refugee ID | Linked account | FR-PAT-07, FR-SEC-10 | National ID field-encrypted; responses masked (`••••1234`) | Planned |
| `GET`, `POST` | `/api/v1/patient/profiles/{patient_id}/insurance-profiles/` | Insurance cards | Linked account | FR-BIL-01 | | Planned |
| `PATCH` | `/api/v1/patient/insurance-profiles/{id}/` | Update validity, principal details | Linked account | FR-BIL-01 | Ver; resets verification status | Planned |
| `POST` | `/api/v1/patient/insurance-profiles/{id}/card-images/` | Upload card front and back | Linked account | FR-BIL-01, FR-DOC-03 | `multipart`; RL: upload | Planned |
| `GET`, `POST` | `/api/v1/patient/profiles/{patient_id}/allergies/` | Allergies (self-reported = unverified) | Linked account | FR-PAT-08 | | Planned |
| `GET`, `POST` | `/api/v1/patient/profiles/{patient_id}/conditions/` | Chronic conditions | Linked account | FR-PAT-08 | | Planned |
| `GET`, `POST` | `/api/v1/patient/profiles/{patient_id}/medications/` | Long-term medicines | Linked account | FR-PAT-08 | | Planned |
| `POST` | `/api/v1/patient/record-claims/` | Ask to link an existing walk-in record | Patient session | FR-PAT-06 | Sends a code to the registered contact; RL: auth; Audit | Planned |
| `POST` | `/api/v1/patient/record-claims/{id}/verify/` | Confirm the claim with the code | Patient session | FR-PAT-06 | Patient alerted on the registered contact | Planned |
| `GET`, `POST` | `/api/v1/patient/consents/` | Consents by kind and version; grant or withdraw | Patient session | FR-SEC-04, FR-SEC-05, FR-AI-02 | Append-only records | Planned |
| `GET` | `/api/v1/patient/profiles/{patient_id}/access-history/` | Who viewed what, when, in plain language | Linked account | FR-PAT-14, FR-SEC-08 | Delegates see only what the patient allows | Planned |

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/staff/patients/search/` | Find a patient by name, phone, national ID, file number, MediLink number | `patient.register` | FR-PAT-09, FR-PAT-04 | Criteria in the body; national ID matched by blind index; RL: search; Audit | Planned |
| `POST` | `/api/v1/staff/patients/duplicate-checks/` | Suggest likely matches before registering | `patient.register` | FR-PAT-05 | Same national ID, or similar name + date of birth + phone | Planned |
| `POST` | `/api/v1/staff/patients/` | Register a walk-in with minimum fields and spoken consent | `patient.register` | FR-PAT-04, FR-PAT-01, FR-SEC-04 | Idem; creates patient + facility patient record | Planned |
| `GET`, `PATCH` | `/api/v1/staff/patients/{id}/` | Facility patient record (file number, contacts, reception notes) | `patient.register` | FR-PAT-01, FR-PAT-07 | Role-specific serializer; Ver | Planned |
| `POST` | `/api/v1/staff/patients/{id}/reveal-identifier/` | Unmask the national ID | `patient.register` | FR-SEC-10 | Reason required; Audit | Planned |
| `GET`, `POST` | `/api/v1/staff/patients/{id}/insurance-profiles/` | Insurance cards captured at the desk | `queue.operate` | FR-BIL-01 | Card photo upload as in patient API | Planned |
| `POST` | `/api/v1/staff/patients/{id}/documents/` | Upload ID or insurance card photo | `documents.upload` | FR-DOC-03 | `multipart` | Planned |
| `GET`, `POST` | `/api/v1/staff/patients/{id}/allergies/` | Allergies seen and recorded by staff | Read: clinical roles and pharmacist · Write: `clinical.write` | FR-PAT-08 | | Planned |
| `POST` | `/api/v1/staff/patients/{id}/allergies/{allergy_id}/verify/` | Confirm or refute a patient-reported allergy | `clinical.write` | FR-PAT-08 | | Planned |
| `GET`, `POST` | `/api/v1/staff/patients/{id}/conditions/` | Chronic conditions | `clinical.write` | FR-PAT-08 | | Planned |
| `POST` | `/api/v1/staff/patients/{id}/conditions/{condition_id}/verify/` | Confirm or refute a condition | `clinical.write` | FR-PAT-08 | | Planned |
| `POST` | `/api/v1/staff/patients/{id}/consents/` | Record consent given at the desk | `patient.register` | FR-SEC-04 | Channel `reception_spoken`; recorded by | Planned |
| `POST` | `/api/v1/staff/patients/{id}/claim-confirmations/` | Confirm a record claim after an in-person ID check | `patient.register` | FR-PAT-06 | Audit | Planned |
| `GET`, `POST` | `/api/v1/staff/merge-requests/` | Request a merge of duplicates in this facility | `patients.merge_request` | FR-PAT-05 | | Planned |
| `POST` | `/api/v1/staff/merge-requests/{id}/approve/` | Approve and run the merge | `patients.merge_approve` † | FR-PAT-05 | Step-up; requester ≠ approver; Audit | Planned |
| `POST` | `/api/v1/staff/merge-requests/{id}/reject/` | Reject a merge request | `patients.merge_approve` † | FR-PAT-05 | Reason required | Planned |
| `POST` | `/api/v1/staff/merge-requests/{id}/undo/` | Reverse a merge | `patients.merge_approve` † | FR-PAT-05 | Step-up; Audit | Planned |

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/platform/merge-requests/` | Cross-facility merge requests | Platform admin | FR-PAT-05 | | Planned |
| `POST` | `/api/v1/platform/merge-requests/{id}/approve/` | Approve a cross-facility merge | Platform admin | FR-PAT-05 | Step-up; Audit | Planned |
| `POST` | `/api/v1/platform/merge-requests/{id}/reject/` | Reject a cross-facility merge | Platform admin | FR-PAT-05 | | Planned |

---

## S4 · Visits and the live queue

Requirements: FR-QUE-01..17. Tests: concurrency (parallel call next and check-in) and the 06:00–10:00 peak (NFR-PERF-01, 04).

Dependency: the roadmap puts check-in of booked patients and the Expected list (FR-QUE-02, 03, 06) in S4, but bookings arrive in S5. The booked check-in and remote-join endpoints are listed in S5; S4 builds the queue with walk-ins plus seeded bookings and remote tickets. The S4 contract must confirm this split.

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/staff/visits/` | Today board: on-site visits by service and stage, with flags | `queue.operate`; doctors read | FR-QUE-01, FR-QUE-02 | Filters `date`, `service`, `stage`, `status`; Expected list comes from bookings (S5) | Planned |
| `POST` | `/api/v1/staff/visits/` | Walk-in: create the visit and check in → first ticket | `queue.operate` | FR-QUE-01, FR-QUE-03 | Idem; one ticket even if pressed twice | Planned |
| `GET` | `/api/v1/staff/visits/{id}/` | Visit with stages, tickets and timeline | Role-specific | FR-QUE-01 | Receptionist view excludes clinical fields | Planned |
| `POST` | `/api/v1/staff/visits/{id}/complete/` | End the visit | `queue.call` or `queue.operate` | FR-QUE-01, FR-CLN-05 | `422` if the consultation is unsigned (from S6) | Planned |
| `GET` | `/api/v1/staff/tickets/` | Queue of a service and stage in calling order | `queue.operate`, `queue.call` | FR-QUE-05 | Filters `service`, `stage`, `state`, `assigned_to=me` | Planned |
| `GET` | `/api/v1/staff/tickets/{id}/` | One ticket | `queue.operate`, `queue.call` | FR-QUE-09 | | Planned |
| `GET` | `/api/v1/staff/tickets/{id}/events/` | Ticket state history (who, when, reason, device) | `queue.operate`, `queue.call` | FR-QUE-09 | Append-only; evidence for disputes | Planned |
| `POST` | `/api/v1/staff/services/{id}/call-next/` | Call the next patient by the ordering rules | `queue.call` | FR-QUE-05, FR-QUE-06, FR-QUE-07, FR-QUE-08 | Atomic (`SELECT … FOR UPDATE SKIP LOCKED`); Idem; body: stage, service point | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/call/` | Call a specific ticket | `queue.call` | FR-QUE-08 | Ver | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/recall/` | Call again | `queue.call` | FR-QUE-09 | Ver | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/no-response/` | Mark no response; re-insert N places back (max 2), then left | `queue.call`, `queue.operate` | FR-QUE-09 | Ver | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/start/` | Start service (creates the consultation draft from S6) | `queue.call` | FR-QUE-09 | Ver; Idem | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/hold/` | On hold, awaiting results | `queue.call` | FR-QUE-09 | Ver | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/return/` | Back from results with return priority | `queue.operate`, `queue.call` | FR-QUE-05 | Ver | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/next-stage/` | Done here; ticket for the next stage (payment, pharmacy) | `queue.call`, `queue.operate` | FR-QUE-04 | Ver; Idem | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/transfer/` | Move to another service, keeping the arrival time | `queue.operate`, `queue.call` | FR-QUE-17 | Ver; reason | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/set-priority/` | Priority or emergency flag with a reason | `queue.operate`; doctors for emergency | FR-QUE-05 | Ver; reason code required; Audit | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/reorder/` | Move in the queue with a reason | `queue.operate` | FR-QUE-10 | Ver; reason code + note; counted per staff member; Audit | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/step-out/` | Patient steps out (up to 30 min) | `queue.operate` | FR-QUE-09 | Ver | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/cancel/` | Cancel a waiting ticket | `queue.operate` | FR-QUE-09 | Ver; reason | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/mark-left/` | Patient left without service | `queue.operate` | FR-QUE-09 | Ver | Planned |
| `GET` | `/api/v1/staff/queue-reorders/` | Reorders to review | `facility.configure` | FR-QUE-10 | Filters `reviewed`, `staff` | Planned |
| `POST` | `/api/v1/staff/queue-reorders/{id}/review/` | Mark a reorder as reviewed, with a comment | `facility.configure` | FR-QUE-10 | Audit | Planned |
| `GET`, `PUT` | `/api/v1/staff/duty-status/` | Own status: on duty at a service point, break until, emergency, off | Doctor (self) | FR-QUE-14 | Singleton; updates estimates | Planned |
| `GET` | `/api/v1/staff/duty-statuses/` | Who is on duty and their state | Any staff | FR-QUE-14 | | Planned |
| `GET` | `/api/v1/staff/services/{id}/wait-estimate/` | Current estimate range and status message | Any staff | FR-QUE-11 | Rounded to 5 minutes | Planned |
| `GET`, `POST` | `/api/v1/staff/display-links/` | Waiting-room display links per facility or service | `facility.configure` | FR-QUE-13 | Token shown once; stored hashed | Planned |
| `POST` | `/api/v1/staff/display-links/{id}/revoke/` | Revoke a display link | `facility.configure` | FR-QUE-13 | Closes the display socket | Planned |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/patient/tickets/` | Active tickets of the account's profiles | Patient session | FR-QUE-11 | Filter `patient_id` | Planned |
| `GET` | `/api/v1/patient/tickets/{id}/` | Live tracker: number, stage, people ahead, wait range, time to leave, status message | Linked account | FR-QUE-11 | Small payload for weak networks | Planned |
| `POST` | `/api/v1/patient/tickets/{id}/running-late/` | Tell the facility "I'm running late" | Linked account | FR-QUE-07 | | Planned |
| `POST` | `/api/v1/patient/tickets/{id}/cancel/` | Give up the place | Linked account | FR-QUE-09 | Ver | Planned |
| `GET`, `POST` | `/api/v1/patient/travel-times/` | Travel time per facility for time-to-leave | Patient session | FR-QUE-11 | | Planned |
| `PATCH` | `/api/v1/patient/travel-times/{id}/` | Change a travel time | Patient session | FR-QUE-11 | | Planned |

### Public (display)

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/public/displays/{token}/` | Now serving, next 5 tickets per service, announcements | Display token | FR-QUE-13 | Ticket numbers and rooms only, never names; README §6 item 5 | Planned |

### WebSockets

| Path | Events | Requirements | Status |
|---|---|---|---|
| `/ws/v1/staff/facilities/{facility_id}/queue/` | `ticket.updated`, `visit.updated`, `duty_status.updated` | FR-QUE-12 | Planned |
| `/ws/v1/patient/tickets/{ticket_id}/` | `ticket.updated`, `ticket.called` | FR-QUE-12, FR-NOT-12 | Planned |
| `/ws/v1/display/{token}/` | `display.updated`, `ticket.called` (chime) | FR-QUE-13 | Planned |

Group joins use the same policy as the REST equivalent; the server closes sockets on logout, deactivation, loss of permission and display-link revocation.

---

## S5 · Booking, remote join and calendars

Requirements: FR-SCH-01..15; FR-BIL-03; FR-AI-01.

### Public

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/public/facilities/` | Search: location, service, insurance, open now/today, level of care, availability, type, ownership | Public | FR-SCH-01, FR-SCH-04, FR-BIL-03 | Live facilities only; distance, open status, accepts insurance, fee, estimated share, next slot, queue load, referral hint; RL: search | Planned |
| `GET` | `/api/v1/public/facilities/{slug}/` | Facility profile | Public | FR-SCH-02, FR-SCH-03 | Pre-rendered by patient-web at build time | Planned |
| `GET` | `/api/v1/public/facilities/{slug}/services/` | Services with fees, insurers and estimated share | Public | FR-SCH-02, FR-BIL-03 | `?insurer=` for the share | Planned |
| `GET` | `/api/v1/public/facilities/{slug}/doctors/` | Doctors: name, specialty, days present | Public | FR-SCH-02 | No other personal data | Planned |
| `GET` | `/api/v1/public/facilities/{slug}/queue-load/` | Queue load (low/medium/high) and walk-in wait estimate | Public | FR-SCH-02 | Cached a few seconds | Planned |
| `GET` | `/api/v1/public/facilities/{slug}/slots/` | Bookable slots for a service, doctor and date range | Public | FR-SCH-07 | Server recomputes at hold time | Planned |
| `GET` | `/api/v1/public/symptoms/` | Structured symptom list | Public | FR-AI-01, FR-SCH-10 | rw/en/fr | Planned |
| `GET` | `/api/v1/public/calendar-feeds/{token}/` | Private `.ics` subscription feed | Feed token | FR-SCH-11 | `text/calendar`; no clinical details; revocable; README §6 item 6 | Planned |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/patient/slot-holds/` | Hold a slot for 5 minutes | Patient session | FR-SCH-08 | Atomic; `409 conflict` with nearby alternatives when just taken | Planned |
| `DELETE` | `/api/v1/patient/slot-holds/{id}/` | Release a hold | Patient session | FR-SCH-08 | | Planned |
| `GET` | `/api/v1/patient/bookings/` | Bookings of the account's profiles | Patient session | FR-SCH-08, FR-SCH-11 | Filter `patient_id`, `status` | Planned |
| `POST` | `/api/v1/patient/bookings/` | Confirm a booking from a hold: who, insurance, reason for visit | Linked account | FR-SCH-08, FR-SCH-10, FR-BIL-03 | Idem; caps: 3 active, 1 per service per day; strike limits | Planned |
| `GET` | `/api/v1/patient/bookings/{id}/` | Booking with code, cost estimate, status | Linked account | FR-SCH-08 | | Planned |
| `POST` | `/api/v1/patient/bookings/{id}/cancel/` | Cancel (late if within the cut-off) | Linked account | FR-SCH-08 | Ver | Planned |
| `POST` | `/api/v1/patient/bookings/{id}/reschedule/` | Move to a held slot | Linked account | FR-SCH-08 | Ver; Idem; keeps history | Planned |
| `POST` | `/api/v1/patient/bookings/{id}/accept-change/` | Accept or decline a facility disruption proposal | Linked account | FR-SCH-14 | Never counts as a patient cancellation | Planned |
| `POST` | `/api/v1/patient/bookings/{id}/calendar-file/` | Get an `.ics` file for one booking | Linked account | FR-SCH-11 | Returns a short-lived link | Planned |
| `POST` | `/api/v1/patient/remote-joins/` | Join today's queue remotely → ticket | Linked account | FR-SCH-09, FR-QUE-07 | Idem; before the cut-off; service must allow it | Planned |
| `GET` | `/api/v1/patient/calendar-entries/` | Own and dependents' appointments and follow-ups | Patient session | FR-SCH-11 | `from`, `to` | Planned |
| `GET`, `POST` | `/api/v1/patient/calendar-feeds/` | Create the private subscription link | Patient session | FR-SCH-11 | Token shown once | Planned |
| `POST` | `/api/v1/patient/calendar-feeds/{id}/revoke/` | Revoke the subscription link | Patient session | FR-SCH-11 | | Planned |
| `GET` | `/api/v1/patient/no-show-strikes/` | Strikes and any booking limit | Patient session | FR-SCH-13 | | Planned |

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/staff/bookings/` | Reception calendar (day/week) and the Expected list | `queue.operate`; doctors: own | FR-SCH-12, FR-QUE-02 | Filters `date`, `from`, `to`, `service`, `doctor`, `status` | Planned |
| `GET` | `/api/v1/staff/slots/` | Availability for phone booking | `queue.operate` | FR-SCH-07, FR-SCH-12 | | Planned |
| `POST` | `/api/v1/staff/slot-holds/` | Hold a slot while on the phone | `queue.operate` | FR-SCH-08 | Atomic | Planned |
| `POST` | `/api/v1/staff/bookings/` | Phone booking, also for patients without an account | `queue.operate` | FR-SCH-08 | Idem | Planned |
| `POST` | `/api/v1/staff/bookings/{id}/check-in/` | Check in a booked patient → visit + ticket | `queue.operate` | FR-QUE-03, FR-QUE-06 | Idem; late beyond the grace window → walk-in ordering | Planned |
| `POST` | `/api/v1/staff/bookings/{id}/cancel/` | Cancel for the patient | `queue.operate` | FR-SCH-08 | Ver; reason | Planned |
| `POST` | `/api/v1/staff/bookings/{id}/reschedule/` | Move to a held slot | `queue.operate` | FR-SCH-08 | Ver; Idem | Planned |
| `POST` | `/api/v1/staff/bookings/{id}/reverse-no-show/` | Reverse an automatic no-show | `queue.operate` | FR-SCH-13 | Reason required; recalculates strikes; Audit | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/check-in/` | Check in a remote joiner who arrived | `queue.operate` | FR-QUE-07 | Idem | Planned |
| `GET` | `/api/v1/staff/calendar-entries/` | Doctor calendar: schedule, leave, booked load | Doctor (own) or `schedule.manage` | FR-SCH-12 | Own schedule only at the active facility; cross-facility view is an open point | Planned |
| `GET`, `POST` | `/api/v1/staff/disruptions/` | Declare a disruption → affected bookings and remote tickets | `queue.operate`, `facility.configure` | FR-SCH-14 | | Planned |
| `GET` | `/api/v1/staff/disruptions/{id}/` | Disruption with affected items and patient responses | `queue.operate`, `facility.configure` | FR-SCH-14 | | Planned |
| `POST` | `/api/v1/staff/disruptions/{id}/resolve/` | Bulk actions: another doctor, next slot, cancel | `queue.operate`, `facility.configure` | FR-SCH-14 | Idem; patients notified at once | Planned |
| `POST` | `/api/v1/staff/visits/{id}/follow-ups/` | Set a follow-up (booking or reminder) from the consultation | `clinical.write` | FR-SCH-15 | | Planned |

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET`, `PATCH` | `/api/v1/platform/settings/` | Platform rules: no-show strikes; later dispute deadlines | Platform admin | FR-SCH-13 | Step-up; Ver | Planned |

---

## S6 · Clinical record and history

Requirements: FR-CLN-01..09; FR-PAT-10..12; FR-SEC-03, 09. Prescription drafting with safety alerts is here because FR-CLN-07 is in S6; issuing and dispensing are in S7.

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/staff/visits/{id}/vitals/` | Record vitals | `vitals.record` | FR-CLN-01 | Append-only; corrections are new entries | Planned |
| `POST` | `/api/v1/staff/visits/{id}/consultations/` | Start a consultation (also done by ticket `start`) | `clinical.write` | FR-CLN-01 | Idem | Planned |
| `GET` | `/api/v1/staff/consultations/{id}/` | Consultation with addenda | `clinical.write`; treatment relationship | FR-CLN-01, FR-SEC-03 | `403 access_reason_required` outside the relationship; Audit | Planned |
| `PATCH` | `/api/v1/staff/consultations/{id}/` | Autosave the draft | `clinical.write` (author) | FR-CLN-02 | Ver; draft only | Planned |
| `POST`, `DELETE` | `/api/v1/staff/consultations/{id}/diagnoses/` | Add or remove ICD-10 diagnoses (primary/secondary, provisional/confirmed) | `clinical.write` (author) | FR-CLN-06 | Draft only; code and display text snapshotted | Planned |
| `POST` | `/api/v1/staff/consultations/{id}/prescription-items/` | Add a prescription item → safety alerts | `clinical.write` (author) | FR-CLN-07, FR-PHA-01 | Allergy, duplicate, dose and pregnancy checks; override needs a reason | Planned |
| `PATCH`, `DELETE` | `/api/v1/staff/consultations/{id}/prescription-items/{item_id}/` | Edit or remove a draft item | `clinical.write` (author) | FR-PHA-01 | Draft only | Planned |
| `POST` | `/api/v1/staff/consultations/{id}/sign/` | Sign: re-enter PIN or password; lock; content hash | `clinical.sign` (author) | FR-CLN-02, FR-SEC-06 | Idem; late entry flagged after 24 h; issues prescriptions and documents (S7); Audit | Planned |
| `POST` | `/api/v1/staff/consultations/{id}/addenda/` | Signed addendum with a reason | `clinical.sign` | FR-CLN-03 | Step-up; original never changes | Planned |
| `POST` | `/api/v1/staff/consultations/{id}/entered-in-error/` | Mark entered in error with a reason | `clinical.sign` (author) | FR-CLN-04 | Step-up; hidden from normal views, never deleted | Planned |
| `POST` | `/api/v1/staff/consultations/{id}/restrict/` | Mark a record restricted (sensitive) | `clinical.sign` | FR-CLN-08 | Restricted fields field-encrypted | Planned |
| `GET` | `/api/v1/staff/unsigned-records/` | Unsigned drafts (own; all for the facility admin, without content) | `clinical.write`, `facility.configure` | FR-CLN-05 | | Planned |
| `GET` | `/api/v1/staff/diagnosis-codes/` | ICD-10 type-ahead | `clinical.write` | FR-CLN-06 | `?q=` (a medical term, not personal data) | Planned |
| `GET` | `/api/v1/staff/drugs/` | Drug search with "available here" marker | `clinical.write`, `pharmacy.dispense` | FR-PHA-01, FR-PHA-04 | | Planned |
| `POST` | `/api/v1/staff/access-reasons/` | State a reason for opening a record outside the treatment relationship | `clinical.write` | FR-SEC-03 | Time-limited grant; feeds snooping analytics; Audit | Planned |
| `GET` | `/api/v1/staff/patients/{id}/history/` | History timeline with filters (type, diagnosis, dates) | `clinical.write`; treatment relationship | FR-PAT-09, FR-SEC-03 | < 2 s for 200 visits (NFR-PERF-05); Audit | Planned |
| `GET` | `/api/v1/staff/patients/{id}/problem-summary/` | Active diagnoses, conditions, allergies, current medicines | `clinical.write`; pharmacist: allergies only | FR-PAT-09 | | Planned |
| `POST` | `/api/v1/staff/patients/{id}/history-entries/` | Structured back-entry from paper, labelled historical | `clinical.write` | FR-PAT-12 | Shows "entered from paper by … on …" | Planned |
| `POST` | `/api/v1/staff/patients/{id}/legacy-scans/` | Attach scanned paper records with document date and type | `documents.upload` | FR-PAT-11 | `multipart`; upload pipeline | Planned |
| `GET` | `/api/v1/staff/result-reviews/` | Results inbox | `clinical.write` | FR-CLN-09 | Filter `status=pending` | Planned |
| `POST` | `/api/v1/staff/result-reviews/{id}/sign-off/` | Review and sign off an uploaded result | `clinical.sign` | FR-CLN-09 | Comment optional | Planned |
| `GET`, `POST` | `/api/v1/staff/import-batches/` | Upload a patient register (CSV/Excel) → preview | `records.import` | FR-PAT-10 | Step-up; `multipart`; Async | Planned |
| `GET`, `PATCH` | `/api/v1/staff/import-batches/{id}/` | Preview: column mapping, validation errors, likely duplicates | `records.import` | FR-PAT-10 | Ver | Planned |
| `POST` | `/api/v1/staff/import-batches/{id}/confirm/` | Import the previewed rows | `records.import` | FR-PAT-10 | Idem; Audit | Planned |
| `POST` | `/api/v1/staff/import-batches/{id}/rollback/` | Roll back within 7 days if no visits are attached | `records.import` | FR-PAT-10 | Step-up; Audit | Planned |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/patient/visits/` | My visits timeline | Patient session | FR-PAT-13 | Filter `patient_id`; email must be verified | Planned |
| `GET` | `/api/v1/patient/visits/{id}/` | Visit detail: plain-language diagnoses, instructions, addenda | Linked account | FR-PAT-13, FR-CLN-01 | Never private notes; restricted records hidden from delegates | Planned |

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/platform/break-glass-sessions/` | Emergency access to one patient's records with a reason | Platform admin | FR-ACC-09, FR-SEC-09 | Step-up; read-only; 60 minutes; Audit; notified for review | Planned |
| `GET` | `/api/v1/platform/break-glass-sessions/` | Break-glass log for weekly review | Platform admin | FR-SEC-09 | | Planned |
| `POST` | `/api/v1/platform/break-glass-sessions/{id}/review/` | Record the review outcome | Platform admin (not the user) | FR-SEC-09 | Reviewer ≠ user | Planned |

---

## S7 · Pharmacy and documents

Requirements: FR-PHA-01..05; FR-DOC-01..07. Visit summaries, prescriptions, sick notes, referral letters and lab requests are generated as PDFs by a background job when the consultation is signed, and as a new version when an addendum is signed (no create endpoint).

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/staff/prescriptions/` | Pharmacy queue and prescription lists | `pharmacy.dispense`, `clinical.write` | FR-PHA-02 | Filter `status=ready_to_dispense` | Planned |
| `GET` | `/api/v1/staff/prescriptions/{id}/` | Prescription, items, allergies, identity | `pharmacy.dispense`, `clinical.write` | FR-PHA-02 | Pharmacist serializer: no consultation notes | Planned |
| `POST` | `/api/v1/staff/prescriptions/{id}/confirm-identity/` | Record the identity check (ticket + name + date of birth, or code) | `pharmacy.dispense` | FR-PHA-02 | Audit | Planned |
| `POST` | `/api/v1/staff/prescriptions/{id}/dispense-records/` | Dispense per item: full, partial, generic substitution with reason, not available; signed | `pharmacy.dispense` | FR-PHA-02, FR-PHA-03 | Idem; quantities ≤ prescribed; `422` if unpaid and payment is required | Planned |
| `POST` | `/api/v1/staff/prescriptions/{id}/queries/` | Send back to the doctor with a question | `pharmacy.dispense` | FR-PHA-02 | Doctor answers with an addendum | Planned |
| `POST` | `/api/v1/staff/prescriptions/{id}/cancel/` | Cancel a prescription with a reason | `clinical.sign` (prescriber) | FR-PHA-01 | Only before dispensing | Planned |
| `POST` | `/api/v1/staff/prescriptions/{id}/items/{item_id}/cancel/` | Cancel one item after signing (then add a new one by addendum) | `clinical.sign` (prescriber) | FR-PHA-01 | Both items stay visible with reasons | Planned |
| `POST` | `/api/v1/staff/prescriptions/{id}/labels/` | Printable dosing labels (Kinyarwanda by default) | `pharmacy.dispense` | FR-PHA-05 | Returns a document link | Planned |
| `GET` | `/api/v1/staff/dispense-records/` | Dispensing history | `pharmacy.dispense` | FR-PHA-03 | Filters `from`, `to` | Planned |
| `GET` | `/api/v1/staff/drug-availabilities/` | Availability of catalogue drugs here | `pharmacy.dispense`, `clinical.write` | FR-PHA-04 | | Planned |
| `PUT` | `/api/v1/staff/drug-availabilities/{drug_id}/` | Mark available or not available | `pharmacy.dispense` | FR-PHA-04 | | Planned |
| `GET` | `/api/v1/staff/documents/` | Documents of a patient or visit | Role-specific | FR-DOC-01, FR-DOC-03 | Filters `patient`, `visit`, `kind`; restricted by role | Planned |
| `POST` | `/api/v1/staff/documents/` | Upload a document (result, referral letter brought by the patient, scan) | `documents.upload` | FR-DOC-03 | `multipart`; results go to the results inbox | Planned |
| `GET` | `/api/v1/staff/documents/{id}/` | Document metadata and versions | Role-specific | FR-DOC-02 | Superseded versions marked | Planned |
| `POST` | `/api/v1/staff/documents/{id}/download-links/` | Short-lived signed link | Role-specific | FR-DOC-05 | 5 minutes on `files.medilink.rw`; Audit | Planned |
| `POST` | `/api/v1/staff/documents/{id}/release/` | Mark released to the patient (printable by reception) | `clinical.sign` | FR-DOC-07 | | Planned |
| `POST` | `/api/v1/staff/documents/{id}/prints/` | Print a released document for the patient | `queue.operate`, `billing.record_payment` | FR-DOC-07 | Returns a link; Audit `document.printed` | Planned |
| `POST` | `/api/v1/staff/tickets/{id}/slips/` | Printable ticket slip (80 mm) | `queue.operate` | NFR-NET-06 | No names beyond what the patient needs | Planned |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/patient/medicines/` | My medicines with dispensing status | Patient session | FR-PHA-03 | Filter `patient_id` | Planned |
| `GET` | `/api/v1/patient/documents/` | My documents | Patient session | FR-DOC-06 | Filter `patient_id`, `kind` | Planned |
| `POST` | `/api/v1/patient/documents/` | Upload ID, insurance card, previous results, outside prescriptions | Linked account | FR-DOC-03 | `multipart`; RL: upload | Planned |
| `GET` | `/api/v1/patient/documents/{id}/` | Document metadata | Linked account | FR-DOC-06 | | Planned |
| `DELETE` | `/api/v1/patient/documents/{id}/` | Delete own non-clinical upload | Linked account (uploader) | FR-DOC-06 | Clinical documents can't be deleted | Planned |
| `POST` | `/api/v1/patient/documents/{id}/download-links/` | Short-lived signed link | Linked account | FR-DOC-05, FR-DOC-06 | Audit | Planned |
| `POST` | `/api/v1/patient/documents/{id}/share-links/` | Expiring share link for one document | Linked account | FR-DOC-06 | Token shown once | Planned |
| `POST` | `/api/v1/patient/share-links/{id}/revoke/` | Revoke a share link | Linked account | FR-DOC-06 | | Planned |
| `POST` | `/api/v1/patient/documents/{id}/facility-shares/` | Share an own upload with a facility | Linked account | FR-DOC-03 | Visible to that facility's clinicians | Planned |
| `POST` | `/api/v1/patient/document-archives/` | Download all documents as a ZIP | Patient session | FR-DOC-06 | Step-up; Async | Planned |

### Public

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/public/document-verifications/` | Verify a document by code; details only with the patient's date of birth | Public | FR-DOC-04 | Minimal data; RL: verification; every check logged | Planned |
| `GET` | `/api/v1/public/shared-documents/{token}/` | Open a document shared by a patient | Share token | FR-DOC-06 | Expiring; returns a signed link; README §6 item 6 | Planned |

---

## S8 · Billing and payments

Requirements: FR-BIL-04..13. Tests: money invariants (no negative amounts, server-side totals, no self-approval).

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/staff/visits/{id}/insurance-verifications/` | Verify insurance for this visit, or reject with a reason | `queue.operate` | FR-BIL-04 | Referral letter check where required | Planned |
| `GET` | `/api/v1/staff/bills/` | Bills awaiting payment and unpaid balances | `billing.record_payment` | FR-BIL-06, FR-BIL-12 | Filters `status`, `date` | Planned |
| `GET` | `/api/v1/staff/bills/{id}/` | Bill with lines and insurer/patient split | `billing.record_payment` | FR-BIL-06 | Medicine lines only as needed for billing | Planned |
| `POST` | `/api/v1/staff/bills/{id}/lines/` | Add a line from the tariff | `billing.record_payment` | FR-BIL-06 | Server prices and splits; Ver | Planned |
| `DELETE` | `/api/v1/staff/bills/{id}/lines/{line_id}/` | Remove a line before any payment | `billing.record_payment` | FR-BIL-06 | Reason; logged | Planned |
| `POST` | `/api/v1/staff/bills/{id}/payments/` | Record a payment (cash, MoMo, Airtel, card, insurance) → receipt | `billing.record_payment` | FR-BIL-07, FR-BIL-08, FR-BIL-13 | Idem; needs an open shift; partial allowed; optional EBM number | Planned |
| `POST` | `/api/v1/staff/bills/{id}/exemptions/` | Apply an exemption or waiver | `billing.record_payment` | FR-BIL-11 | Reason code; above threshold → approval request | Planned |
| `POST` | `/api/v1/staff/bills/{id}/void-requests/` | Request a void of a payment or receipt | `billing.record_payment` | FR-BIL-09 | Reason; needs approval | Planned |
| `POST` | `/api/v1/staff/bills/{id}/refund-requests/` | Request a refund | `billing.record_payment` | FR-BIL-09 | Reason; needs approval → credit note | Planned |
| `GET` | `/api/v1/staff/approval-requests/` | Approvals inbox: voids, refunds, waivers | `billing.approve` | FR-BIL-09, FR-BIL-11 | | Planned |
| `POST` | `/api/v1/staff/approval-requests/{id}/approve/` | Approve | `billing.approve` | FR-BIL-09, FR-BIL-11 | Step-up; requester ≠ approver (one-person clinic: allowed and flagged); Audit | Planned |
| `POST` | `/api/v1/staff/approval-requests/{id}/reject/` | Reject with a reason | `billing.approve` | FR-BIL-09 | Step-up | Planned |
| `POST` | `/api/v1/staff/credit-notes/{id}/payouts/` | Record the refund payout (cash, MoMo reference) | `billing.record_payment` | FR-BIL-09 | Idem | Planned |
| `GET` | `/api/v1/staff/receipts/{id}/` | Receipt with its gapless number | `billing.record_payment` | FR-BIL-08 | | Planned |
| `POST` | `/api/v1/staff/receipts/{id}/send/` | Email the receipt to the patient | `billing.record_payment` | FR-BIL-08 | | Planned |
| `GET`, `POST` | `/api/v1/staff/cash-shifts/` | Open a shift with the opening float; list shifts | `billing.record_payment` | FR-BIL-10 | One open shift per person | Planned |
| `POST` | `/api/v1/staff/cash-shifts/{id}/close/` | Close: counted amounts per method, note | `billing.record_payment` (owner) | FR-BIL-10 | Shows expected vs counted | Planned |
| `POST` | `/api/v1/staff/cash-shifts/{id}/review/` | Accept a closed shift | `billing.approve` | FR-BIL-10 | Audit | Planned |
| `GET` | `/api/v1/staff/patients/{id}/balances/` | Unpaid balances of a patient at this facility | `billing.record_payment` | FR-BIL-12 | Never other facilities | Planned |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/patient/bills/` | Bills and unpaid balances | Patient session | FR-BIL-12 | Filter `patient_id` | Planned |
| `GET` | `/api/v1/patient/bills/{id}/` | Bill with lines and receipts | Linked account | FR-BIL-06, FR-BIL-08 | | Planned |

---

## S9 · Notifications

Requirements: FR-NOT-01..12. Facility notification settings (reminder timings, "you are next" threshold, signature) are a section of `/api/v1/staff/facility/settings/` (S2).

### Public

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/public/web-push-key/` | VAPID public key | Public | FR-NOT-03 | | Planned |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/patient/notifications/` | Inbox | Patient session | FR-NOT-02, FR-NOT-08 | Includes dependents' notifications | Planned |
| `GET` | `/api/v1/patient/notifications/unread-count/` | Count for the bell | Patient session | FR-NOT-02 | | Planned |
| `POST` | `/api/v1/patient/notifications/{id}/read/` | Mark read | Patient session | FR-NOT-02 | | Planned |
| `POST` | `/api/v1/patient/notifications/read-all/` | Mark all read | Patient session | FR-NOT-02 | | Planned |
| `GET`, `PATCH` | `/api/v1/patient/notification-preferences/` | Channels per level, quiet hours, reminder timing, dependents' alerts, language | Patient session | FR-NOT-05, FR-NOT-06, FR-NOT-08 | Critical alerts can't be fully disabled while a ticket is active | Planned |
| `POST` | `/api/v1/patient/push-subscriptions/` | Register a browser for web push | Patient session | FR-NOT-03 | Endpoint host must be on the push-service allowlist | Planned |
| `DELETE` | `/api/v1/patient/push-subscriptions/{id}/` | Remove a browser | Patient session | FR-NOT-03 | | Planned |

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/staff/notifications/` | Staff inbox | Staff session | FR-NOT-02, FR-NOT-07 | | Planned |
| `GET` | `/api/v1/staff/notifications/unread-count/` | Count for the bell | Staff session | FR-NOT-02 | | Planned |
| `POST` | `/api/v1/staff/notifications/{id}/read/` | Mark read | Staff session | FR-NOT-02 | | Planned |
| `POST` | `/api/v1/staff/notifications/read-all/` | Mark all read | Staff session | FR-NOT-02 | | Planned |
| `GET`, `PATCH` | `/api/v1/staff/notification-preferences/` | Sound on/off, approvals digest | Staff session | FR-NOT-06 | | Planned |
| `GET`, `POST` | `/api/v1/staff/announcements/` | Facility announcements (patients in a date range, display) | `facility.configure` | FR-NOT-11 | rw/en/fr | Planned |
| `POST` | `/api/v1/staff/announcements/{id}/publish/` | Publish | `facility.configure` | FR-NOT-11 | | Planned |
| `POST` | `/api/v1/staff/announcements/{id}/withdraw/` | Withdraw | `facility.configure` | FR-NOT-11 | | Planned |
| `GET` | `/api/v1/staff/notification-deliveries/` | Delivery log for a patient or visit ("was the patient told?") | `audit.view` (dispute handlers from S10) | FR-NOT-10 | Read-only | Planned |

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET`, `POST` | `/api/v1/platform/announcements/` | Announcements to all or selected facilities | Platform admin | FR-NOT-11 | | Planned |
| `POST` | `/api/v1/platform/announcements/{id}/publish/` | Publish | Platform admin | FR-NOT-11 | | Planned |
| `GET`, `POST` | `/api/v1/platform/notification-templates/` | Versioned templates in rw/en/fr | Platform admin | FR-NOT-07, FR-NOT-09 | Lint: no clinical placeholders in push and email bodies | Planned |
| `GET`, `PATCH` | `/api/v1/platform/notification-templates/{id}/` | Edit → new version | Platform admin | FR-NOT-09 | Ver | Planned |
| `GET` | `/api/v1/platform/notification-deliveries/` | Delivery log and failure rates | Platform admin | FR-NOT-10 | | Planned |

### WebSockets

| Path | Events | Requirements | Status |
|---|---|---|---|
| `/ws/v1/patient/notifications/` | `notification.created` | FR-NOT-02 | Planned |
| `/ws/v1/staff/notifications/` | `notification.created` | FR-NOT-02 | Planned |

---

## S10 · Disputes, help and reports

Requirements: FR-DSP-01..11; FR-RPT-01..05; FR-SEC-12, 13. Retention jobs (FR-SEC-13) have no endpoint. The weekly unusual-access report comes from [security 08](../security/08-logging-monitoring-and-detection.md) §4.

### Public

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/public/help-articles/` | Help center articles | Public | FR-DSP-11 | rw/en/fr | Planned |
| `GET` | `/api/v1/public/help-articles/{slug}/` | One article | Public | FR-DSP-11 | | Planned |
| `POST` | `/api/v1/public/support-requests/` | Ask for help without logging in ("I can't log in") | Public | FR-DSP-11 | No clinical data; RL: auth | Planned |

### Patient

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/patient/disputes/` | Raise a dispute from a visit, bill, receipt, prescription, ticket, record entry or strike | Linked account (incl. guardians) | FR-DSP-01, FR-DSP-09, FR-DSP-10 | Context and audit events attached automatically; max 5 open; duplicate check | Planned |
| `GET` | `/api/v1/patient/disputes/` | My disputes | Patient session | FR-DSP-03 | Filter `patient_id` | Planned |
| `GET` | `/api/v1/patient/disputes/{id}/` | Dispute with timeline and deadlines | Linked account | FR-DSP-03 | No internal notes | Planned |
| `GET`, `POST` | `/api/v1/patient/disputes/{id}/messages/` | Conversation thread | Linked account | FR-DSP-04 | | Planned |
| `POST` | `/api/v1/patient/disputes/{id}/evidence/` | Add photos or receipts | Linked account | FR-DSP-01 | `multipart`; append-only | Planned |
| `POST` | `/api/v1/patient/disputes/{id}/accept/` | Accept the resolution → closed | Linked account | FR-DSP-03 | | Planned |
| `POST` | `/api/v1/patient/disputes/{id}/escalate/` | Disagree within 14 days → super admin | Linked account | FR-DSP-02, FR-DSP-03 | | Planned |
| `POST` | `/api/v1/patient/disputes/{id}/reopen/` | Reopen with new evidence (within 30 days, once) | Linked account | FR-DSP-03 | | Planned |
| `GET`, `POST` | `/api/v1/patient/support-requests/` | Support requests | Patient session | FR-DSP-11 | Clinical issues are redirected to the facility | Planned |
| `POST` | `/api/v1/patient/data-exports/` | Download all my data (PDF + machine-readable) | Patient session | FR-SEC-12 | Step-up; Async | Planned |
| `GET` | `/api/v1/patient/data-exports/{id}/` | Export status and link | Patient session | FR-SEC-12 | Link valid 15 minutes | Planned |
| `POST` | `/api/v1/patient/auth/close-account/` | Close the account after the retention explanation | Patient session | FR-SEC-12, FR-SEC-13 | Step-up; non-clinical data deleted after 30 days | Planned |

Rectification of personal details uses `PATCH /api/v1/patient/profiles/{patient_id}/` (S3). Clinical corrections and privacy requests are disputes of type `record_correction` and `privacy`.

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/staff/disputes/` | Facility disputes by status, type, deadline | `disputes.handle`; others: assigned for comment | FR-DSP-02, FR-DSP-03 | Filter `overdue=true` | Planned |
| `POST` | `/api/v1/staff/disputes/` | Raise a dispute at the counter for a patient | `queue.operate` | FR-DSP-09 | Marked "raised at the counter"; see note below | Planned |
| `GET` | `/api/v1/staff/disputes/{id}/` | Dispute with thread and internal notes | `disputes.handle` | FR-DSP-04 | | Planned |
| `GET` | `/api/v1/staff/disputes/{id}/evidence/` | Audit trail of the disputed item, in order | `disputes.handle` | FR-DSP-05 | Frozen copy with hash | Planned |
| `POST` | `/api/v1/staff/disputes/{id}/acknowledge/` | Acknowledge (starts the decision deadline) | `disputes.handle` | FR-DSP-03 | | Planned |
| `POST` | `/api/v1/staff/disputes/{id}/messages/` | Reply to the patient | `disputes.handle` | FR-DSP-04 | | Planned |
| `POST` | `/api/v1/staff/disputes/{id}/internal-notes/` | Note visible to handlers only | `disputes.handle` | FR-DSP-04 | | Planned |
| `POST` | `/api/v1/staff/disputes/{id}/comment-requests/` | Ask involved staff for comments | `disputes.handle` | FR-DSP-04 | | Planned |
| `POST` | `/api/v1/staff/disputes/{id}/comments/` | Involved staff member responds | `disputes.comment` | FR-DSP-04, FR-DSP-08 | Involved staff can comment, never decide | Planned |
| `POST` | `/api/v1/staff/disputes/{id}/request-info/` | Ask the patient for more information | `disputes.handle` | FR-DSP-03 | | Planned |
| `POST` | `/api/v1/staff/disputes/{id}/resolve/` | Decide and create linked actions (refund, bill correction, addendum request, strike removal, rebooking, disagreement statement) | `disputes.handle` | FR-DSP-06, FR-DSP-07, FR-DSP-08 | Step-up; conflict-of-interest check; Audit | Planned |
| `POST` | `/api/v1/staff/platform-disputes/` | Facility raises a dispute against the platform | `facility.configure` | FR-DSP-02 | Verification, suspension, subscription | Planned |
| `GET` | `/api/v1/staff/reports/operations-today/` | Live operations board | `reports.view` | FR-RPT-02 | Polled or pushed via the queue socket | Planned |
| `GET` | `/api/v1/staff/reports/daily-summary/` | Visits by source and service, waits (median, p90), no-shows, left without service | `reports.view` | FR-RPT-01, FR-RPT-03 | Filters date range, service, doctor | Planned |
| `GET` | `/api/v1/staff/reports/wait-times/` | Wait trends and estimate accuracy | `reports.view` | FR-RPT-01, FR-RPT-03 | | Planned |
| `GET` | `/api/v1/staff/reports/doctor-activity/` | Patients seen, consultation time, unsigned and late records | `reports.view` | FR-RPT-03 | | Planned |
| `GET` | `/api/v1/staff/reports/bookings/` | Booked vs capacity, no-shows, cancellations, strikes | `reports.view` | FR-RPT-03 | | Planned |
| `GET` | `/api/v1/staff/reports/finance/` | Billed, collected, insurer share, waivers, voids, refunds, shift differences | `reports.view` | FR-RPT-03 | | Planned |
| `GET` | `/api/v1/staff/reports/staff-accountability/` | Reorders, voids, overrides, waivers per staff member | `reports.view` | FR-RPT-03 | | Planned |
| `GET` | `/api/v1/staff/reports/disputes/` | Open, overdue, by type, outcomes | `reports.view` | FR-RPT-03 | | Planned |
| `GET` | `/api/v1/staff/reports/my-activity/` | Own shift or own activity | `reports.view_own` | FR-RPT-03 | | Planned |
| `POST` | `/api/v1/staff/report-exports/` | Export a report to Excel or PDF | `reports.view` | FR-RPT-04 | Step-up; watermark; CSV-injection safe; Async; Audit | Planned |
| `GET` | `/api/v1/staff/report-exports/{id}/` | Export status and link | `reports.view` (requester) | FR-RPT-04 | Link valid 15 minutes | Planned |
| `GET` | `/api/v1/staff/audit-entries/` | Facility audit log | `audit.view` | FR-SEC-07 | Filters actor, object, action, dates | Planned |
| `GET` | `/api/v1/staff/access-reviews/` | Weekly unusual-access reports | `audit.view` | FR-SEC-07 | Security 08 §4 | Planned |
| `POST` | `/api/v1/staff/access-reviews/{id}/sign-off/` | Sign off the weekly review | `audit.view` | FR-SEC-07 | Audit | Planned |

Note: the permission matrix in analysis 02 §3 gives the receptionist no "raise dispute" right, but analysis 10 §3 lets a receptionist raise one at the counter (FR-DSP-09). The S10 contract must align the matrix.

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `GET` | `/api/v1/platform/disputes/` | Escalated and platform-level disputes | Platform admin | FR-DSP-02 | | Planned |
| `GET` | `/api/v1/platform/disputes/{id}/` | Dispute with attached evidence | Platform admin | FR-DSP-05 | Clinical data only as attached evidence | Planned |
| `POST` | `/api/v1/platform/disputes/{id}/messages/` | Ask the facility or patient for information | Platform admin | FR-DSP-04 | | Planned |
| `POST` | `/api/v1/platform/disputes/{id}/final-decision/` | Final decision with written reasons | Platform admin | FR-DSP-02, FR-DSP-06 | Step-up; corrections are still made by the facility | Planned |
| `POST` | `/api/v1/platform/facilities/{id}/warnings/` | Record a warning on a facility | Platform admin | FR-DSP-06 | | Planned |
| `GET` | `/api/v1/platform/support-requests/` | Support queue | Platform admin | FR-DSP-11 | | Planned |
| `POST` | `/api/v1/platform/support-requests/{id}/replies/` | Reply | Platform admin | FR-DSP-11 | | Planned |
| `POST` | `/api/v1/platform/support-requests/{id}/close/` | Close | Platform admin | FR-DSP-11 | | Planned |
| `GET`, `POST` | `/api/v1/platform/help-articles/` | Help center content | Platform admin | FR-DSP-11 | | Planned |
| `GET`, `PATCH` | `/api/v1/platform/help-articles/{id}/` | Edit an article | Platform admin | FR-DSP-11 | Ver | Planned |
| `GET` | `/api/v1/platform/reports/network/` | Facilities by status, type, district; applications pipeline | Platform admin | FR-RPT-05 | Aggregated only | Planned |
| `GET` | `/api/v1/platform/reports/adoption/` | Active facilities, visits recorded | Platform admin | FR-RPT-05 | Aggregated only | Planned |
| `GET` | `/api/v1/platform/reports/quality/` | Disputes per 1,000 visits, escalation rate, estimate accuracy | Platform admin | FR-RPT-05 | Aggregated only | Planned |
| `GET` | `/api/v1/platform/reports/system/` | Usage, errors, notification delivery, push opt-in | Platform admin | FR-RPT-05 | | Planned |
| `POST` | `/api/v1/platform/report-exports/` | Export a platform report | Platform admin | FR-RPT-04 | Step-up; watermark; Async | Planned |
| `GET` | `/api/v1/platform/audit-entries/` | Platform audit log | Platform admin | FR-SEC-07 | | Planned |

---

## S11 · Hardening and pilot readiness

Requirements: NFR-PERF, NFR-REL, FR-SEC-14..16, FR-ONB-09. Most S11 work (load tests, backups, monitoring, pen-test fixes) has no endpoint.

### Staff

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/staff/facility/data-exports/` | Full facility data export | `facility.configure` | FR-ONB-09 | Step-up; Async; alert to the platform; Audit | Planned |
| `GET` | `/api/v1/staff/facility/data-exports/{id}/` | Export status and link | `facility.configure` | FR-ONB-09 | Link valid 15 minutes | Planned |

### Platform

| Method | Path | Purpose | Permission | Requirements | Notes | Status |
|---|---|---|---|---|---|---|
| `POST` | `/api/v1/platform/facilities/{id}/data-exports/` | Export for a deactivated facility | Platform admin | FR-ONB-09 | Step-up; Async; handed to the facility | Planned |

---

## Not yet scheduled

Required by the analysis or the security documents, but not yet in a sprint plan. Place them in a sprint contract before go-live.

| Method | Path | Purpose | Permission | Requirements / source | Status |
|---|---|---|---|---|---|
| `GET` | `/api/v1/staff/auth/sessions/` | Own active sessions | Staff session | FR-SEC-06; analysis 12 §5 | Planned |
| `POST` | `/api/v1/staff/auth/sessions/{id}/revoke/` | End one session | Staff session | FR-SEC-06 | Planned |
| `GET` | `/api/v1/patient/auth/sessions/` | Own active sessions | Patient session | FR-SEC-06 | Planned |
| `POST` | `/api/v1/patient/auth/sessions/{id}/revoke/` | End one session | Patient session | FR-SEC-06 | Planned |
| `PUT` | `/api/v1/staff/auth/pin/` | Set the unlock PIN | Staff session + step-up | FR-SEC-06; security 03 §5 | Contracted in S1 |
| `POST` | `/api/v1/staff/auth/unlock/` | Unlock an idle-locked session with the PIN | Staff session (locked) | FR-SEC-06 | Contracted in S1 |
| `POST` | `/api/v1/staff/auth/password-change/` | Change own password | Staff session + step-up | security 03 §4 | Planned |
| `POST` | `/api/v1/patient/auth/password-change/` | Change own password | Patient session + step-up | security 03 §4 | Planned |
| `POST` | `/api/v1/staff/auth/passkeys/` | Register a passkey (mandatory for super admins before go-live) | Staff session + step-up | security 03 §1, security 14 | Planned |
| `GET`, `POST` | `/api/v1/staff/devices/` | Register reception PCs as shared devices (no "trust this device") | `facility.configure` | security 03 §3, security 11 §3 | Planned |
| `GET`, `POST` | `/api/v1/staff/staff-access-reviews/` | Quarterly confirmation of the staff list and roles | `staff.manage` | security 03 §7 | Planned |
| `GET`, `PATCH` | `/api/v1/platform/feature-flags/` | Feature flags per facility | Platform admin | NFR-OPS-07 | Contracted in S1 (`/platform/feature-flags/{code}/`, `/platform/facilities/{id}/feature-flags/{code}/`) |
