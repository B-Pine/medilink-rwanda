# MediLink Rwanda security

Status: v0.1 · How MediLink protects patient data, money and availability, and how we build and run the system securely. The requirements are in [analysis 12](../analysis/12-security-privacy-and-compliance.md); these documents explain **how** they are met.

## Security objectives

1. **Confidentiality of health data:** only the right person, for a care reason, sees a record, and every view is recorded.
2. **Integrity:** signed clinical records, documents, receipts and the audit trail can't be changed without trace.
3. **Availability:** reception never stops at the 06:00–10:00 peak; there is a paper fallback if it does.
4. **Accountability:** every action is attributable to one person.
5. **Compliance:** Law 058/2021 (consent, residency, breach notification within 48 h), NCSA standards.

## Baseline standards

OWASP ASVS 5.0 **Level 2** (Level 3 practices for admin auth, crypto, audit, clinical data) · OWASP Top 10:2025 · OWASP API Security Top 10:2023 · OWASP LLM Top 10:2025 · NIST SP 800-63B-4 · NIST SP 800-218 (SSDF) · CIS Benchmarks · STRIDE + LINDDUN threat modelling.

## Documents

| # | Document | Answers |
|---|---|---|
| [01](01-threat-model.md) | Threat model | What we protect, from whom; STRIDE, abuse cases, privacy threats, top risks |
| [02](02-security-architecture.md) | Security architecture | Layers, network zones, domains, data-residency decisions |
| [03](03-identity-authentication-sessions.md) | Identity, authentication, sessions | Passwords, MFA/passkeys, step-up, sessions, lockouts, lifecycle, break-glass |
| [04](04-authorization-and-tenant-isolation.md) | Authorisation and tenant isolation | Policy layer, scoped queries, clinical access rules, **PostgreSQL RLS**, authz testing |
| [05](05-data-protection-and-cryptography.md) | Data protection and cryptography | Classification, TLS, encryption at rest, field encryption, keys, integrity, retention, exports |
| [06](06-application-and-api-security.md) | Application and API security | OWASP mappings, Django hardening + CSP, uploads, PDFs, React, business logic, real-time, jobs |
| [07](07-infrastructure-and-operations-security.md) | Infrastructure and operations | Hosting, OS, containers, PostgreSQL/Redis/storage, backups, DDoS, environments, changes |
| [08](08-logging-monitoring-and-detection.md) | Logging, monitoring, detection | Audit vs security vs technical logs, alerts, insider snooping detection |
| [09](09-secure-development-lifecycle.md) | Secure development lifecycle | Repo protection, CI security gates, testing, dependencies, vulnerability handling |
| [10](10-incident-response-and-continuity.md) | Incident response and continuity | 48 h legal clock, roles, severity, playbooks, continuity |
| [11](11-people-process-and-physical-security.md) | People, process, physical | Team and facility training, shared PCs, separation of duties |
| [12](12-compliance-mapping.md) | Compliance mapping | Law 058/2021, NCSA, ASVS chapters, DPIA, processing register |
| [13](13-ai-security.md) | AI security | Poisoning, privacy attacks, prompt injection, model supply chain |
| [14](14-go-live-security-checklist.md) | Go-live checklist | What must be true before the first real patient record |
| [15](15-sources.md) | Sources | Standards and research used |

## The ten controls that matter most

1. **Server-side authorisation on every request + PostgreSQL row-level security** (two walls between facilities).
2. **MFA for all staff; passkeys for admins**; NIST-aligned passwords; no tokens in browser storage.
3. **Treatment-relationship access + reason prompts + patient-visible access history** against snooping.
4. **Append-only, hash-chained audit log**: the evidence for disputes and investigations.
5. **Encryption in transit and at rest**, field-level for national ID and restricted records, keys outside the database.
6. **Safe file and PDF handling** (quarantine, AV, re-encode, isolated origin; renderer without network).
7. **Separation of duties for money and roles** (no self-approval; gapless receipts; cash-up).
8. **Immutable backups at a second Rwandan site + tested restores** against ransomware.
9. **CI security gates** (SAST, dependency audit, secrets, image scan, `check --deploy`, authz matrix) + an independent pen test.
10. **Incident response ready for the 48-hour notification clock**, with a paper fallback for facilities.
