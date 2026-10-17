# 10 · Incident response and business continuity

Status: v0.1 · Legal anchor: Law 058/2021 requires a **controller** to notify the supervisory authority (NCSA) within **48 hours** of becoming aware of a personal data breach, and a **processor** to notify the controller within 48 hours. Data subjects must be informed where the breach is likely to create high risk. Confirm the current details with counsel.

## 1. Who is responsible for notifying

| Data affected | Controller | MediLink's duty |
|---|---|---|
| Facility clinical, billing, queue data | The facility | As **processor**: notify the affected facility **within 24 hours** (our internal target, leaving the facility time for its 48-hour duty), and support its notification to NCSA and patients |
| Patient accounts, platform data, discovery/booking requests | MediLink | As **controller**: notify NCSA within 48 hours; notify affected patients when high risk |
| Both | Both | Coordinate one joint communication plan |

## 2. Team and roles

| Role | Person (to assign) | Duties |
|---|---|---|
| Incident lead | Security lead | Runs the response, decides severity, keeps the timeline |
| Technical lead | Senior engineer | Containment, investigation, recovery |
| Data protection officer (DPO) | To appoint (likely required for large-scale sensitive data processing; confirm with counsel) | Legal assessment, notifications to NCSA, facilities, patients |
| Communications | Founder / lead | Messages to facilities, patients, public |
| Facility liaison | Support lead | Keeps affected facilities informed, coordinates paper fallback |

Contact sheet (phones, backups, NCSA contacts, hosting provider, counsel) is kept offline and in the key store. It's reviewed quarterly.

## 3. Severity

| Level | Examples | Response |
|---|---|---|
| **SEV1** | Confirmed breach of clinical data; ransomware; production compromise; full outage at peak | Immediate, all hands, 24/7 until contained; notification clock starts |
| **SEV2** | Suspected breach; one account takeover; snooping confirmed; partial outage | Within 1 hour, business hours + on-call |
| **SEV3** | Vulnerability without evidence of exploitation; failed backup; malware blocked | Within 1 working day |

## 4. Process

```
Detect → Triage (severity, is personal data involved?) → Contain → Preserve evidence →
Eradicate → Recover → Notify (≤ 48 h legal clock; ≤ 24 h to facilities as processor) → Review (≤ 10 days)
```

- **Evidence:** snapshot affected systems before changes; export the relevant audit/security logs and verify the hash chain; keep a written timeline (UTC + Kigali time).
- **Notifications** include: what happened, what data, how many people, consequences, what we did, what people should do, contact point. Templates in three languages are prepared in advance.
- **Post-incident review:** blameless, with actions tracked to completion. Every SEV1/SEV2 updates the threat model.

## 5. Playbooks (summary)

| Playbook | Key steps |
|---|---|
| **Ransomware / destructive attack** | Isolate the affected zone (network cut); don't pay without legal and leadership decision; check immutable backups are intact; rebuild hosts from code (don't clean); restore from the last clean point; rotate all secrets; facilities switch to the paper procedure; notify |
| **Staff account takeover** | Disable the account, kill sessions, reset MFA; review its audit trail (what was viewed/changed/exported); notify the facility; assess as a breach if records were viewed |
| **Insider snooping** | Preserve the access log; suspend access pending investigation; facility admin + DPO interview; confirmed → breach assessment, patient notification if required, disciplinary action by the facility |
| **Leaked secret** (key in a commit or log) | Rotate immediately; search logs for use; purge from history; root-cause the leak path |
| **Vulnerable dependency (actively exploited)** | Check exposure; patch or mitigate (WAF rule, feature flag off) within 72 h; check logs for exploitation |
| **Lost / stolen staff device** | Revoke the device's sessions and trusted-device status; check access since loss |
| **Forged documents circulating** | Confirm via the verification page; mark any affected documents cancelled; inform the facility and, where relevant, employers or pharmacies who asked |
| **DDoS / peak outage** | Engage provider mitigation; tighten rate limits; shed load from reports and PDFs; status message to facilities; paper fallback |
| **Wrong-patient data exposure** (e.g. document sent to the wrong person) | Revoke links; mark entered-in-error; notify the affected patient; breach assessment |

## 6. Business continuity

| Scenario | Continuity measure | Target |
|---|---|---|
| App unavailable at a facility (internet down) | Offline banner + queued actions; **printed pre-numbered tickets and paper log**, entered later | Facility keeps operating |
| Platform outage | Status page; paper procedure; restore | RTO ≤ 4 h |
| Data loss | Point-in-time recovery | RPO ≤ 15 min |
| Primary site lost | Restore at the second Rwandan site from replicas and backups | ≤ 24 h |
| Key person unavailable | Two people for every critical access (infrastructure, key store, backups) | — |

**Exercises:** a tabletop exercise every 6 months (ransomware, snooping, account takeover). Restore test every quarter. Paper-fallback drill at pilot facilities during training.
