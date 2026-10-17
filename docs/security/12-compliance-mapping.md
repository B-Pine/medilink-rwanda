# 12 · Compliance mapping

Status: v0.1 · **Not legal advice.** Every legal point is to be confirmed with Rwandan counsel before launch (open questions Q2–Q5, Q8 in [analysis 17](../analysis/17-assumptions-risks-and-open-questions.md)).

## 1. Law No. 058/2021 on the protection of personal data and privacy

| Obligation (summary) | How MediLink meets it | Where |
|---|---|---|
| Lawful processing; **explicit consent** or other legal basis for sensitive (health) data | Consent records per purpose; care consent at sign-up / first visit; separate optional research consent | [analysis 12](../analysis/12-security-privacy-and-compliance.md) §3 |
| **Registration** of controllers and processors with the supervisory authority (NCSA) | MediLink registers (controller for platform data, processor for facility data). Facilities confirm their registration at onboarding. | Onboarding checklist |
| Data subject rights (access, rectification, objection, erasure, portability, etc.) | In-app access and download; rectification via record-correction disputes; consent withdrawal; account closure with retention explanation | [analysis 10](../analysis/10-disputes-complaints-and-support.md), [analysis 12](../analysis/12-security-privacy-and-compliance.md) §8 |
| Security of processing | This security documentation set | [README](README.md) |
| **Breach notification**: controller → authority within 48 h; processor → controller within 48 h; data subjects when high risk | Incident process with a 24 h internal target to facilities | [10](10-incident-response-and-continuity.md) |
| Processor contracts | Data processing agreement signed at facility onboarding; DPAs with our own processors (hosting, email) | Onboarding |
| **Storage in Rwanda** unless authorised | Hosting, backups, logs in Rwanda; third-party data flows reviewed | [02](02-security-architecture.md) §4 |
| Records of processing | Register of processing activities maintained by the DPO | §4 below |
| Data Protection Officer (where required) | Appoint a DPO (likely required given large-scale sensitive data; confirm) | [10](10-incident-response-and-continuity.md) §2 |
| Impact assessment for high-risk processing | **Data Protection Impact Assessment (DPIA)** before the pilot | §3 below |

## 2. Other frameworks

| Framework | Use |
|---|---|
| **NCSA Minimum Cybersecurity Standards for Essential Service Providers** (2023, effective July 2024) | Check whether MediLink or partner facilities are designated as ESPs. Align anyway: risk assessment, access control, system integrity. |
| **OWASP ASVS 5.0** | Verification standard. **Level 2** for the whole system; **Level 3** practices for authentication of admins, cryptography, audit logging and data protection of clinical records. |
| OWASP Top 10:2025 / API Top 10:2023 / LLM Top 10:2025 | Risk awareness and test focus ([06](06-application-and-api-security.md), [13](13-ai-security.md)) |
| NIST SP 800-63B-4 | Authentication design ([03](03-identity-authentication-sessions.md)) |
| NIST SP 800-218 (SSDF) | Development process ([09](09-secure-development-lifecycle.md)) |
| CIS Benchmarks | OS, PostgreSQL, Docker hardening ([07](07-infrastructure-and-operations-security.md)) |
| ISO/IEC 27001 (+ ISO 27799 health guidance) | Target for a later certification; our policies follow its structure, so certification is a step, not a rebuild |
| WCAG 2.2 AA | Accessible authentication and security UX ([design research 10](../design/research/10-accessibility-and-localization.md)) |

### ASVS 5.0 chapters → our documents

| ASVS 5.0 chapter (names per v5.0.0; verify numbering) | Covered in |
|---|---|
| Encoding and Sanitization | [06](06-application-and-api-security.md) §6, §9 |
| Validation and Business Logic | [06](06-application-and-api-security.md) §7 |
| Web Frontend Security | [06](06-application-and-api-security.md) §2, §6 |
| API and Web Service | [06](06-application-and-api-security.md) §3, §8 |
| File Handling | [06](06-application-and-api-security.md) §4, §5 |
| Authentication | [03](03-identity-authentication-sessions.md) |
| Session Management | [03](03-identity-authentication-sessions.md) §5 |
| Authorization | [04](04-authorization-and-tenant-isolation.md) |
| Self-contained Tokens / OAuth & OIDC | Not used in P1 (session cookies); applies to the mobile app (P3) and integrations |
| Cryptography | [05](05-data-protection-and-cryptography.md) |
| Secure Communication | [05](05-data-protection-and-cryptography.md) §2 |
| Configuration | [06](06-application-and-api-security.md) §2, [07](07-infrastructure-and-operations-security.md) |
| Data Protection | [05](05-data-protection-and-cryptography.md) |
| Secure Coding and Architecture | [02](02-security-architecture.md), [09](09-secure-development-lifecycle.md) |
| Security Logging and Error Handling | [08](08-logging-monitoring-and-detection.md), [06](06-application-and-api-security.md) §10 |
| WebRTC | Not used |

## 3. DPIA outline (to complete before the pilot)

1. Description of processing: purposes, data categories, data subjects (patients, children, staff), recipients, retention, systems, data flows.
2. Necessity and proportionality: legal basis, minimisation, accuracy, retention, rights, processors, transfers.
3. Risks to people: from [01 · Threat model](01-threat-model.md) §5–6, rated by likelihood × severity for the *patient* (discrimination, stigma, financial loss, safety).
4. Measures: links to controls in this documentation.
5. Residual risk and sign-off: DPO, leadership; consultation with NCSA if high residual risk remains.
6. Review: every major release and yearly.

## 4. Register of processing activities (starter list)

| Activity | Controller | Legal basis (to confirm) | Data | Retention |
|---|---|---|---|---|
| Patient accounts and booking | MediLink | Consent / contract | Identity, contacts, bookings | Account life + 30 days |
| Clinical care records | Facility (MediLink processor) | Health-care provision / consent | Clinical, prescriptions, documents | Legal medical-record period |
| Billing and receipts | Facility (MediLink processor) | Legal obligation / contract | Bills, payments, insurance | Tax/accounting period |
| Queue operations | Facility (MediLink processor) | Contract / legitimate interest | Tickets, timestamps | With visit |
| Notifications | MediLink + facility | Consent (non-critical), contract (critical) | Contact data, delivery logs | 2 years |
| Disputes | Facility / MediLink | Legal obligation / contract | Dispute content, evidence | 5 years after closure (to confirm) |
| Security and audit logs | MediLink + facility | Legal obligation / legitimate interest | Access records | ≥ record retention |
| Analytics and AI research | MediLink | Consent + ethics approval | De-identified data | Per study protocol |
