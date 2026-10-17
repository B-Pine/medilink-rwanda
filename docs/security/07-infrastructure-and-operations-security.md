# 07 · Infrastructure and operations security

Status: v0.1 · Hosting provider in Rwanda still to be chosen (open question Q11). These controls apply to any provider.

## 1. Hosting requirements (for choosing the provider)

| Requirement | Why |
|---|---|
| Data centre(s) physically in Rwanda; **two separate sites** (primary + backup) | Law 058/2021 residency; disaster recovery |
| Private networking (VLAN/VPC), firewall rules we control | Network zoning ([02](02-security-architecture.md)) |
| Volume encryption, snapshots, object storage with object lock (immutability) | Encryption at rest; ransomware-resistant backups |
| Upstream DDoS mitigation | Availability at peak |
| Signed data processing agreement, breach notification duty to us, physical security certification (ISO 27001 or equivalent) | We're accountable for our processors |
| Console access with MFA and audit logs | Protects the infrastructure account itself |

## 2. Servers and operating system

- **Minimal OS** (e.g. Ubuntu LTS or Debian), hardened against the **CIS Benchmark** level 1.
- **SSH:** keys only (or short-lived SSH certificates), no root login, no password authentication, reachable **only from the VPN/bastion**.
- **Updates:** automatic security updates (`unattended-upgrades`) with a reboot window outside 06:00–20:00. Known-exploited vulnerabilities (the CISA KEV list) patched within 72 hours, critical within 7 days, high within 30.
- **Host firewall:** default deny inbound; only the required ports from the required zones.
- **Host intrusion detection and file integrity monitoring** with a Wazuh agent ([08](08-logging-monitoring-and-detection.md)).
- **Time sync** (NTP/chrony) on every host. Audit and queue times depend on it.
- **Infrastructure as code** (Terraform/OpenTofu + Ansible), reviewed by pull request like application code. No manual drift.

## 3. Containers

| Control | Detail |
|---|---|
| Images | Minimal base (distroless or slim), pinned by **digest**, rebuilt weekly, scanned with Trivy in CI (fail on fixable critical/high) |
| Runtime | Run as non-root, read-only root filesystem, `no-new-privileges`, all Linux capabilities dropped, no privileged containers, no Docker socket mounts |
| Resources | CPU and memory limits per service (protects the queue API from PDF or report spikes) |
| Secrets | Injected at runtime from the key store, never baked into images or `docker-compose.yml` |
| Orchestration | Start with Docker Compose on hardened hosts; move to Kubernetes only if scale requires it (then: network policies, pod security standards "restricted") |

## 4. Data services

| Service | Hardening |
|---|---|
| **PostgreSQL** | Private network only; TLS required; `scram-sha-256` auth; least-privilege roles ([04](04-authorization-and-tenant-isolation.md)); `pgaudit` for privileged and DDL statements; `statement_timeout` for the app role; streaming replica at the backup site; connection pooling (PgBouncer) with TLS |
| **Redis** | Private network only; ACL users per service (app, Celery, Channels) with passwords; dangerous commands disabled for app users (`FLUSHALL`, `CONFIG`, `KEYS`, `DEBUG`); protected mode; TLS if hosts differ; no persistence of sensitive data |
| **Object storage** (MinIO or provider) | Private buckets; separate buckets for quarantine, documents, backups; server-side encryption with our keys; versioning + **object lock** on the backup bucket; access keys per service with bucket-scoped policies |
| **Key store** (OpenBao/Vault) | HA or at least backed up and sealed; auto-unseal or a documented manual unseal by two people; audit device enabled |

## 5. Backups and recovery (ransomware resilience)

| Rule | Detail |
|---|---|
| 3-2-1-1 | 3 copies, 2 media, 1 at the second Rwandan site, **1 immutable or offline** (object lock / offline disk rotated weekly) |
| PostgreSQL | Continuous WAL archiving + nightly full backups (pgBackRest), encrypted; **point-in-time recovery**; RPO ≤ 15 min |
| Files | Object-storage replication to the second site + versioning |
| Config and keys | Infrastructure code in git; key-store backups encrypted and stored separately from data backups |
| Isolation | Backup credentials can write but not delete (deletion only by retention policy); the backup server is not domain-joined to anything the app servers can reach |
| Tests | **Quarterly restore test** to a clean environment, timed against RTO ≤ 4 h; results recorded |

## 6. Availability and DDoS

- Rate limits at the proxy (per IP, generous for carrier NAT) and in the app (per account).
- Upstream DDoS mitigation from the hosting provider.
- Static public site optionally behind a CDN (no personal data; see [02](02-security-architecture.md) §4).
- **Load test to 3× the expected 06:00–10:00 peak** before go-live. Autoscaling or headroom planned.
- **Graceful degradation:** if reports or PDF generation are overloaded, they queue; check-in, call next and payments keep priority.
- **Facility fallback:** the paper ticket procedure ([analysis 06](../analysis/06-visit-lifecycle-and-queue.md) §8) is part of business continuity.

## 7. Environments

| Environment | Data | Access |
|---|---|---|
| Local / development | Synthetic data only | Developers |
| CI | Synthetic fixtures | Pipeline |
| Staging | **Synthetic data only**, never a copy of production | Team + testers |
| Production | Real data | Two named engineers for infrastructure; app access only through the product with roles |

Production data is **never** copied to lower environments. If a bug needs real data, debug in production through logs and the audited maintenance role, or reproduce with synthetic data.

## 8. Change management

- All production changes go through pull requests + CI + review. Deployments are automated (CD) with a rollback plan.
- **Database migrations:** reviewed, reversible, tested on a production-sized synthetic dataset, run by the migrator role.
- **Emergency changes:** allowed with a later review within 2 working days.
- **Maintenance windows** outside facility hours, announced to facilities (FR-NOT-11).
