# 14 · Go-live security checklist

Status: v0.1 · Must be fully ticked (or risk-accepted in writing by leadership + DPO) before the first real patient record is stored.

## Legal and governance
- [ ] DPIA completed and signed ([12](12-compliance-mapping.md) §3)
- [ ] MediLink registered with NCSA (controller/processor); pilot facilities' registration confirmed
- [ ] Data processing agreements signed with pilot facilities and with our processors (hosting, email)
- [ ] DPO appointed (or written legal opinion that it isn't required)
- [ ] Privacy notice and consent texts in Kinyarwanda, English, French, reviewed by counsel
- [ ] Retention periods confirmed (Q2) and configured
- [ ] `SECURITY.md` contact and `/.well-known/security.txt` live

## Identity and access
- [ ] MFA enforced for 100% of staff; passkeys required for super admins
- [ ] Password policy per NIST 800-63B-4 (15 / 12 chars, blocklist, no composition rules)
- [ ] Session settings verified (cookie flags, idle lock, absolute timeout, rotation)
- [ ] Lockout, throttling and enumeration-safe responses tested
- [ ] Break-glass flow tested and its review process assigned

## Authorisation and data isolation
- [ ] Authorisation test matrix complete and green (every endpoint × role × tenant)
- [ ] RLS enabled + **forced** on every facility table; app role has no BYPASSRLS/superuser/ownership
- [ ] Cross-tenant and IDOR tests pass; pen test found no BOLA issues (or fixed and retested)
- [ ] Per-role serializers reviewed; no `__all__`

## Data protection
- [ ] TLS everywhere (external and internal); HSTS on; SSL Labs grade A or better
- [ ] Disk, object storage and backup encryption verified
- [ ] Field-level encryption for national ID and restricted fields; keys in the key store
- [ ] Audit log append-only + hash chain + daily anchor running
- [ ] No personal data in technical logs or error tracking (sampled check)
- [ ] All data stores and backups confirmed physically in Rwanda; third-party data flows documented

## Application
- [ ] `check --deploy` clean; CSP enforced (no unsafe-inline/eval); security headers verified
- [ ] Upload pipeline: allowlist, AV, re-encode, EXIF strip, isolated download origin
- [ ] PDF worker without network egress; strict URL fetcher; WeasyPrint patched
- [ ] Web push endpoint allowlist; neutral notification content
- [ ] Celery JSON-only; Redis ACLs; WebSocket origin validation and group authorisation
- [ ] Business-rule tests: receipts gapless, no self-approval, atomic queue actions

## Infrastructure
- [ ] Hosts CIS-hardened; SSH keys only via VPN; firewall default-deny
- [ ] No public IPs on data services; admin tools reachable only via VPN
- [ ] Containers non-root, read-only, scanned, signed
- [ ] Backups: PITR working, immutable copy at the second site, **restore test passed within RTO**
- [ ] Load test at 3× peak passed; graceful degradation verified

## Detection and response
- [ ] Central logging + Wazuh + alerts live; on-call rota of two; runbooks linked
- [ ] Snooping detection rules and weekly facility access report working
- [ ] Incident response plan approved; contact sheet complete; notification templates ready (3 languages)
- [ ] Tabletop exercise done (ransomware + account takeover)

## Testing
- [ ] Independent penetration test done; all critical/high fixed and retested
- [ ] OWASP ZAP authenticated scans clean of high findings
- [ ] Dependency, image and secret scans clean (no fixable critical/high)

## People
- [ ] Facility staff training completed and acknowledged in-app
- [ ] Facility device checklist done for every reception PC and display
- [ ] Facility admins briefed on access reviews, approvals and the weekly access report
- [ ] Paper fallback drill done at each pilot facility
