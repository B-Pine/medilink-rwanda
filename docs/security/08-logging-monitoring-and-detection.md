# 08 · Logging, monitoring and detection

Status: v0.1 · Addresses OWASP A09:2025 (Security Logging & **Alerting** Failures).

## 1. Three kinds of logs

| Log | Purpose | Contents | Who sees it | Retention |
|---|---|---|---|---|
| **Audit log** (business, legal) | Who did what to which record | Actor, role, facility, action, object, time, device/IP, reason; hash-chained ([05](05-data-protection-and-cryptography.md) §6) | Facility admin (own facility), super admin, patient (own access history) | ≥ clinical record retention |
| **Security log** | Detect attacks | Logins, failures, MFA events, lockouts, permission denials, step-ups, break-glass, exports, config/role changes, WAF blocks, RLS context failures | Security officer, engineers | 1 year online, 3 years archived |
| **Technical log** | Debug and operations | Requests (path, status, latency, request ID), errors, job runs | Engineers | 30–90 days |

**No personal data in technical logs:**
- no request bodies
- no national IDs, names or phone numbers (use internal IDs)
- no tokens, passwords or OTPs (scrubbed by a logging filter)

Error tracking (self-hosted) uses the same scrubbing.

## 2. Collection

- Structured JSON logs with a request ID that is propagated from the proxy to the API, Celery and WebSockets.
- Shipped to a central store **in Rwanda**: Wazuh (security events, host intrusion detection, file integrity) + OpenSearch/Loki for application logs. Prometheus + Grafana for metrics.
- Logs are written to append-only storage. The log pipeline's own access is limited and audited.

## 3. Alerts (who is woken up, and when)

| Alert | Trigger (initial values, tuned in the pilot) | Severity |
|---|---|---|
| Brute force / credential stuffing | > 50 failed logins in 5 min across accounts, or > 10 for one account | High |
| Super admin login from a new device or outside VPN | Any | High |
| Break-glass used | Any (review queue); > 2 by one person per week | Medium / High |
| Bulk access | One user views > 50 distinct patient records in 1 hour, or exports > 500 rows | High |
| **Snooping signals** | Access to a *staff-as-patient* record; access with "other" as reason; access outside working hours by roles that don't work nights; repeated access to the same patient without visits | Medium (daily review) |
| Role escalation | New super admin; facility admin role granted; MFA reset | High |
| RLS / scope failure | Any query with missing facility context, or a cross-tenant 404 spike for one user (IDOR probing) | High |
| WAF | Spikes of blocked requests, or blocks on authenticated sessions | Medium |
| Malware found in an upload | Any | High |
| Integrity | Audit hash chain mismatch; document hash mismatch | Critical |
| Availability | Queue API p95 > 1 s at peak; WebSocket disconnect storm; 5xx > 2%; job queue backlog | High |
| Backups | Backup failed or not run; restore test overdue | High |
| Certificates / secrets | TLS certificate expiring < 14 days; key rotation overdue | Medium |
| Patching | Critical CVE / KEV item in a deployed image or host | High |

Alerts go to an on-call rota (two people minimum) through email + a phone notification app. Every alert has a short **runbook link**.

## 4. Insider-access monitoring (snooping)

The snooping pattern is well documented in healthcare: staff looking at colleagues, neighbours, family or celebrities. Controls:

1. **Prevent:** the treatment-relationship rule and reason prompts ([04](04-authorization-and-tenant-isolation.md) §3).
2. **Detect:** the rules above + a weekly **access report per facility**, listing unusual accesses for the facility admin to review and sign off.
3. **Deter:**
   - patients can see who accessed their record
   - staff see a notice at login ("All access is recorded and reviewed")
   - confidentiality agreements ([11](11-people-process-and-physical-security.md))
4. **Respond:** investigation playbook in [10](10-incident-response-and-continuity.md). Confirmed snooping is a personal data breach to assess for notification.

## 5. Health checks for the security programme

Monthly dashboard: MFA coverage (target 100% of staff), passkey adoption, dormant accounts disabled, open critical vulnerabilities, patch age, failed backup count, restore test status, alert response times, access reviews completed per facility.
