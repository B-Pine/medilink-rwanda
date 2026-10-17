# Operations runbooks

Status: v0.1 · Index of the runbooks MediLink needs before go-live. Sources: alerts in [security 08](../security/08-logging-monitoring-and-detection.md) §3 (each alert must link a short runbook), playbooks and continuity in [security 10](../security/10-incident-response-and-continuity.md), and [security 07](../security/07-infrastructure-and-operations-security.md). The go-live checklist requires "runbooks linked" ([security 14](../security/14-go-live-security-checklist.md)).

Runbooks will live in `docs/operations/runbooks/<id>-<name>.md`. Owners are placeholders until the roles in security 10 §2 are assigned. Never put secrets, contact phone numbers or patient data in a runbook; the contact sheet is kept offline and in the key store.

## 1. Alert runbooks

One per alert rule in security 08 §3. Severity as defined there.

| ID | Runbook | Trigger | Severity | Owner | Status |
|---|---|---|---|---|---|
| AL-01 | Brute force and credential stuffing | > 50 failed logins in 5 min across accounts, or > 10 for one account | High | _TBD (security lead)_ | To write |
| AL-02 | Super admin login from a new device or outside the VPN | Any | High | _TBD (security lead)_ | To write |
| AL-03 | Break-glass access used | Any (review queue); > 2 by one person per week | Medium / High | _TBD (DPO)_ | To write |
| AL-04 | Bulk access or bulk export | One user views > 50 distinct patients in 1 h, or exports > 500 rows | High | _TBD (security lead)_ | To write |
| AL-05 | Snooping signals (daily review) | Staff-as-patient access, "other" reasons, night access, repeated access without visits | Medium | _TBD (DPO)_ | To write |
| AL-06 | Role escalation | New super admin, facility admin role granted, MFA reset | High | _TBD (security lead)_ | To write |
| AL-07 | RLS or scope failure | Query with missing facility context; spike of cross-tenant 404s for one user | High | _TBD (technical lead)_ | To write |
| AL-08 | WAF blocks | Spikes of blocked requests, or blocks on authenticated sessions | Medium | _TBD (technical lead)_ | To write |
| AL-09 | Malware found in an upload | Any | High | _TBD (security lead)_ | To write |
| AL-10 | Integrity failure | Audit hash-chain mismatch; document hash mismatch | Critical | _TBD (security lead)_ | To write |
| AL-11 | Availability at peak | Queue API p95 > 1 s; WebSocket disconnect storm; 5xx > 2 %; job backlog | High | _TBD (technical lead)_ | To write |
| AL-12 | Backup failed or restore test overdue | Backup failed or not run; restore test overdue | High | _TBD (technical lead)_ | To write |
| AL-13 | Certificate or key expiry | TLS certificate < 14 days; key rotation overdue | Medium | _TBD (technical lead)_ | To write |
| AL-14 | Critical vulnerability in a deployed image or host | Critical CVE or CISA KEV item | High | _TBD (technical lead)_ | To write |

## 2. Incident playbooks

From security 10 §5. Each one follows the incident process (detect → triage → contain → preserve evidence → eradicate → recover → notify → review) and the 48-hour breach notification clock (24 hours to facilities when MediLink is the processor).

| ID | Playbook | When | Owner | Status |
|---|---|---|---|---|
| IR-00 | Incident response process and breach notification (roles, severity, timeline, notification templates in rw/en/fr) | Every SEV1–SEV3 incident | _TBD (incident lead)_ | To write |
| IR-01 | Ransomware or destructive attack | Encrypted or destroyed systems or backups | _TBD (incident lead)_ | To write |
| IR-02 | Staff account takeover | Signs that a staff account is used by someone else | _TBD (security lead)_ | To write |
| IR-03 | Insider snooping | Confirmed or suspected access without a care reason | _TBD (DPO)_ | To write |
| IR-04 | Leaked secret | A key, password or token in a commit, log or message | _TBD (technical lead)_ | To write |
| IR-05 | Actively exploited vulnerable dependency | A dependency or component with a known exploited vulnerability | _TBD (technical lead)_ | To write |
| IR-06 | Lost or stolen staff device | A device with a staff session or trusted-device status | _TBD (facility liaison)_ | To write |
| IR-07 | Forged documents circulating | Fake prescriptions or sick notes reported | _TBD (facility liaison)_ | To write |
| IR-08 | DDoS or peak-hour outage | The service is unavailable or slow at facilities | _TBD (technical lead)_ | To write |
| IR-09 | Wrong-patient data exposure | A document or record shown or sent to the wrong person | _TBD (DPO)_ | To write |

## 3. Continuity and routine operations

From security 10 §6 and security 07.

| ID | Runbook | When | Owner | Status |
|---|---|---|---|---|
| OP-01 | Facility offline: paper fallback and later data entry | A facility loses connectivity | _TBD (facility liaison)_ | To write |
| OP-02 | Platform outage: status message, facility communication, restore | The platform is down (RTO ≤ 4 h) | _TBD (technical lead)_ | To write |
| OP-03 | Point-in-time database recovery | Data loss or corruption (RPO ≤ 15 min) | _TBD (technical lead)_ | To write |
| OP-04 | Fail over to the second Rwandan site | The primary site is lost (≤ 24 h) | _TBD (technical lead)_ | To write |
| OP-05 | Quarterly restore test | Every quarter | _TBD (technical lead)_ | To write |
| OP-06 | Deploy and roll back (backend and frontend) | Every release ([environments and deployment](../development/environments-and-deployment.md)) | _TBD (technical lead)_ | To write |
| OP-07 | Production database migration | Releases with migrations | _TBD (technical lead)_ | To write |
| OP-08 | Secret and key rotation (Django key, database, field-encryption KEK, VAPID, DKIM) | Scheduled or on suspicion ([security 05](../security/05-data-protection-and-cryptography.md) §5) | _TBD (technical lead)_ | To write |
| OP-09 | Key store unseal and recovery | Key store restart or loss | _TBD (technical lead)_ | To write |
| OP-10 | Audit chain anchoring and verification | Daily anchor; on integrity alerts | _TBD (security lead)_ | To write |
| OP-11 | Staff offboarding at MediLink | Same day as departure ([security 11](../security/11-people-process-and-physical-security.md) §1) | _TBD (security lead)_ | To write |
| OP-12 | Weekly unusual-access review and quarterly staff access review (for facility admins) | Weekly / quarterly | _TBD (facility liaison)_ | To write |
| OP-13 | On-call rota and alert routing (two people minimum) | Before go-live | _TBD (technical lead)_ | To write |
| OP-14 | Tabletop exercise (ransomware, snooping, account takeover) | Every 6 months | _TBD (incident lead)_ | To write |

## 4. What a runbook contains

Keep each runbook short enough to follow under stress:

1. **Trigger:** the alert or situation, with the dashboard or log query that confirms it.
2. **First 15 minutes:** the safe immediate steps (contain, preserve evidence, inform).
3. **Diagnosis:** what to check, in order.
4. **Resolution:** the fix, and how to confirm it worked.
5. **Communication:** who to tell (facility, NCSA, patients) and the template to use.
6. **Follow-up:** post-incident review, tickets, detection or Semgrep rules to add.
7. **Last tested:** date and outcome of the last drill.
