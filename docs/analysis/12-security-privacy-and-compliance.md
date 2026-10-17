# 12 · Security, privacy and compliance

Status: Draft v0.2 · Legal points must be confirmed by a lawyer before launch. **How** each requirement is implemented: [docs/security](../security/README.md).

## 1. Legal frame

| Area | Source | Impact |
|---|---|---|
| Personal data protection | **Law No. 058/2021** on the protection of personal data and privacy | Health data is **sensitive personal data**. Requires a lawful basis or explicit consent, security measures, data subject rights, breach notification, registration with the supervisory authority, and restrictions on storing or processing outside Rwanda. |
| Supervisory authority | National Cyber Security Authority (NCSA), data protection office | Registration of controllers and processors; breach notification; complaints |
| Medical devices | Rwanda FDA | Classification of the symptom checker ([11](11-ai-symptom-checker.md)) |
| Research | Rwanda National Ethics Committee | Use of patient data to train models |
| Health professionals | RMDC, NCNM, National Pharmacy Council | Licence numbers on clinical documents |
| Medical records retention | Ministry of Health rules | Retention period (open question) |
| Tax receipts | Rwanda Revenue Authority (EBM) | See [08](08-billing-payments-and-insurance.md) |

## 2. Who is responsible for which data

| Data | Controller (decides why and how) | MediLink's role |
|---|---|---|
| Patient account, preferences, discovery, booking requests | **MediLink** | Controller |
| Clinical records, bills, queue history created at a facility | **The facility** | **Processor** on the facility's behalf, under a **data processing agreement** signed at onboarding |
| Patient-uploaded documents | Patient (MediLink holds them as controller for the service) | Controller |
| De-identified analytics and AI training data | MediLink (with ethics approval and consent) | Controller |

Both MediLink and each facility must be registered with the authority where the law requires. The onboarding checklist asks facilities to confirm this ([03](03-tenancy-onboarding-and-master-data.md)).

## 3. Consent

| Consent | When | Can withdraw? |
|---|---|---|
| Terms and privacy notice | Sign-up | Close account |
| **Processing of health data for care** | Sign-up / first visit (explicit, plain language, Kinyarwanda first) | Care records already created are kept as required by law |
| Notifications (non-critical) | Settings | Yes |
| Location use | When first used | Yes |
| **Sharing records with other facilities** | Per share or standing ([04](04-patient-identity-and-medical-history.md)) | Yes, anytime |
| **Research / AI training use** (de-identified) | Separate, optional, never a condition of care | Yes; excluded from future training sets |
| Guardian consent for minors | When adding a dependent | — |

Walk-in patients registered by reception get a short, spoken consent script plus a printed notice. The receptionist records that consent was given.

Every consent is stored with its version, time, channel and who recorded it.

## 4. Access control

- **Role-based access** ([02](02-users-roles-and-permissions.md)), always enforced on the server.
- **Tenant isolation:** every staff query is scoped to the active facility. **PostgreSQL row-level security** is a second safety net, so a coding mistake can't leak another facility's data.
- **Treatment relationship:** a doctor sees clinical data only for patients with a visit at their facility, or with patient consent.
- **Break-glass (emergency access):** the doctor (cross-facility, P2) or the super admin (disputes, investigations) states a reason. Access is time-limited, logged, reviewed weekly, and visible to the patient.
- **Restricted records** (sensitive diagnoses) have extra rules ([07](07-clinical-documentation-and-pharmacy.md)).

## 5. Authentication

| User | P1 | Later |
|---|---|---|
| Staff | Email + strong password + **two-factor login (authenticator app)**; re-authentication to sign clinical records | Hardware keys optional |
| Patients | Email + password, or a passwordless email link; optional two-factor login | Phone + SMS OTP (P3) |
| Display screens | Revocable device link, read-only | — |

Other authentication rules:
- **Sessions:** staff sessions time out after 15 minutes idle on shared PCs (configurable). There is a quick PIN unlock for the same user. Users can see their active sessions and end them.
- **Brute-force protection:** rate limits and temporary lockouts. Credential stuffing is mitigated by checking passwords against breached-password lists.
- **Account recovery:** email-based for patients. For staff, the facility admin resets two-factor login, which is logged.

## 6. Audit log

**Every** read and write of patient data, every permission change and every configuration change is logged:

| Field | Example |
|---|---|
| Who | User, role, facility |
| What | Action (view, create, update, sign, amend, export, print, download) and object |
| When | Timestamp |
| Where | IP, device / session |
| Why | Reason when required (break-glass, reorder, void, merge) |

- **Append-only:** no user can edit or delete audit entries. Entries are chained by hash so tampering is detectable.
- **Patients see their own access history** in plain language: "Kigali Clinic · Doctor · viewed your record · 12 Oct 2026 10:14".
- **Facility admins** see their facility's log. **Super admins** see the platform log.
- Retained at least as long as the clinical records it refers to.

## 7. Data protection measures

| Measure | Detail |
|---|---|
| Encryption in transit | TLS 1.2+ everywhere, HSTS |
| Encryption at rest | Database and file storage encrypted; backups encrypted |
| Field-level protection | National ID and restricted clinical fields encrypted at application level |
| Data residency | Hosting, databases, files and backups **in Rwanda**. No third-party service may receive patient data outside Rwanda without authorisation: error tracking, email, analytics, AI. Error reports must be scrubbed of personal data. |
| Data minimisation | Collect only what each feature needs; reception registration uses minimum fields |
| De-identification | For analytics and research exports: remove direct identifiers, generalise dates and locations, check re-identification risk |
| Secrets | Environment variables / secret manager; never in code ([SECURITY.md](../../SECURITY.md)) |
| Test data | Generated only; never real patient data in development or testing |

## 8. Patient rights (data subject rights)

| Right | How |
|---|---|
| Access | All own data in the app; full download (PDF + machine-readable) |
| Rectification | Correct personal details directly; clinical corrections through the record-correction dispute ([10](10-disputes-complaints-and-support.md)) |
| Objection / restriction | Withdraw optional consents; restrict sharing |
| Erasure | Account closure; non-clinical data deleted; clinical records kept as legally required, with a clear explanation |
| Portability | Machine-readable export |
| Information | Privacy notice in three languages; access history |

Requests are answered within the legal time limit, tracked like disputes.

## 9. Retention

| Data | Retention |
|---|---|
| Clinical records, prescriptions, dispensing, clinical documents | Legal medical-records period (to be confirmed) — never hard-deleted before |
| Bills, payments, receipts | Tax and accounting retention period (to be confirmed) |
| Audit logs | At least as long as the records they cover |
| Queue events | Kept with the visit; aggregated statistics kept indefinitely |
| Notifications delivery log | 2 years |
| Closed patient accounts' non-clinical data | Deleted after 30 days |
| Rejected facility applications | 2 years |

## 10. Security operations

- **Backups:** daily encrypted backups, kept in Rwanda, with **point-in-time recovery**. Restoring from backup is tested every quarter.
- **Incident response:** detect → contain → assess → notify the authority and affected people within the legal time limit → review. Roles and contacts are documented before launch.
- **Vulnerability management:** dependency scanning in CI, regular updates, a penetration test before go-live and yearly.
- **Secure development:** code review for every change; extra review for changes touching patient data (the `patient-data` label); no direct pushes to `main`.

## 11. Requirements

| ID | Requirement | Phase |
|---|---|---|
| FR-SEC-01 | Server-side role-based access control and facility scoping on every request | P1 |
| FR-SEC-02 | PostgreSQL row-level security for tenant isolation | P1 |
| FR-SEC-03 | Treatment-relationship rule for clinical data access | P1 |
| FR-SEC-04 | Consent records (versioned) for care, notifications, location, sharing | P1 |
| FR-SEC-05 | Separate optional research consent | P1 |
| FR-SEC-06 | Staff two-factor login; re-authentication for signing; idle timeout with PIN unlock | P1 |
| FR-SEC-07 | Append-only, hash-chained audit log of all access to patient data | P1 |
| FR-SEC-08 | Patient access history in plain language | P1 |
| FR-SEC-09 | Break-glass access with reason, time limit, review and patient visibility | P1 |
| FR-SEC-10 | Encryption in transit and at rest; field-level encryption for national ID and restricted fields | P1 |
| FR-SEC-11 | All patient data processed and stored in Rwanda; third-party services scrubbed or local | P1 |
| FR-SEC-12 | Data subject rights: access, download, rectification, erasure with retention explanation, portability | P1 |
| FR-SEC-13 | Retention rules per data type | P1 |
| FR-SEC-14 | Encrypted backups with point-in-time recovery; tested restores | P1 |
| FR-SEC-15 | Incident response plan and breach notification procedure | P1 |
| FR-SEC-16 | Penetration test before go-live | P1 |
| FR-SEC-17 | De-identification pipeline for analytics and research | P2 |
