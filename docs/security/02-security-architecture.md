# 02 · Security architecture

Status: v0.1 · Principle: **defence in depth**. Every layer assumes the one in front of it can fail.

## 1. Layers

| Layer | Controls |
|---|---|
| People and process | Training, least privilege, access reviews, separation of duties, incident response |
| Edge | TLS 1.2/1.3 only, HSTS, WAF (OWASP Core Rule Set), rate limits, request size limits, bot throttling |
| Application | Authentication with MFA, server-side authorisation on every request, input validation, output encoding, CSP, CSRF protection, secure file handling, business-rule checks |
| Data | PostgreSQL row-level security per facility, field-level encryption, encrypted storage, append-only audit log, least-privilege database roles |
| Infrastructure | Private networks, no public database / Redis / storage, hardened OS and containers, patched images, VPN-only administration |
| Detection and response | Central logs, alerts, insider-access analytics, backups with immutable copies, tested restores, incident playbooks |

## 2. Network zones

| Zone | Contains | Inbound | Outbound |
|---|---|---|---|
| **Edge (DMZ)** | Reverse proxy / WAF (Nginx + ModSecurity or Coraza with OWASP CRS) | 443 from internet (80 only redirects) | Application zone only |
| **Application** | Django ASGI servers, Celery workers, ClamAV | From edge only | Data zone; **egress allowlist**: email relay, browser push services, OS/package mirrors |
| **PDF worker** | WeasyPrint rendering | Task queue only | **None** (no network egress) |
| **Data** | PostgreSQL, Redis, object storage, key store | From application zone only | None (except backup target) |
| **Management** | VPN gateway (WireGuard + MFA), bastion, monitoring/SIEM, backup server | VPN only | To all zones (restricted ports) |

No component in the data zone has a public IP address. The Django admin, Celery Flower, database consoles and monitoring dashboards are reachable **only through the VPN**.

## 3. Domains and origins

| Origin | Purpose | Notes |
|---|---|---|
| `medilink.rw` | Public website, facility pages, verification page | No login cookies on this origin |
| `app.medilink.rw` | Patient PWA | Session cookie scoped to this host |
| `staff.medilink.rw` | Staff app | Separate session cookie; stricter CSP and timeouts |
| `api.medilink.rw` | API + WebSockets | Or same-origin paths under each app (decided in design) |
| `files.medilink.rw` | Downloads through short-lived signed URLs | **Separate origin**, so a malicious file can't run script in the app's origin; `Content-Disposition: attachment`; sandbox CSP |

Patient and staff apps on separate hosts limit the damage of an XSS bug in one, and allow different policies.

## 4. Data residency decisions

| Service | Decision |
|---|---|
| Hosting, database, files, backups, logs, SIEM | **In Rwanda**, at two separate sites (primary + backup) |
| CDN / DDoS protection (e.g. Cloudflare) | **Only for the public website and static assets** (no personal data). App and API domains are served directly from Rwanda, because a foreign CDN terminating TLS would see patient data. Revisit if a provider can terminate TLS inside Rwanda; legal review required. |
| Email | Transactional emails contain **no clinical data**. Prefer a Rwanda-based relay; if a foreign provider is used, it carries only names, emails and links (record it as a transfer and get legal confirmation). SPF, DKIM and DMARC (`p=reject`). |
| Web push | Payloads are **end-to-end encrypted** (Web Push encryption) and contain no clinical details, so the browser vendors' push servers can't read them |
| Error tracking | Self-hosted (GlitchTip / Sentry) in Rwanda; personal data scrubbed before sending |
| AI / LLM | No patient data to foreign AI APIs without authorisation; prefer self-hosted models ([13](13-ai-security.md)) |
| Source code, CI | GitHub (outside Rwanda): **never real patient data, secrets or production dumps** in the repository, issues or CI logs |

## 5. Key security decisions (summary)

| Decision | Detail in |
|---|---|
| Session cookies (HttpOnly, Secure, SameSite) for web apps. No tokens in browser storage. | [03](03-identity-authentication-sessions.md) |
| Staff MFA mandatory; passkeys preferred; TOTP fallback | [03](03-identity-authentication-sessions.md) |
| Authorisation in one policy layer + PostgreSQL RLS as a second wall | [04](04-authorization-and-tenant-isolation.md) |
| Field-level encryption for national ID and restricted clinical fields; blind index for search | [05](05-data-protection-and-cryptography.md) |
| Hash-chained, append-only audit log with daily anchoring | [05](05-data-protection-and-cryptography.md), [08](08-logging-monitoring-and-detection.md) |
| Upload quarantine + AV + re-encoding; isolated file origin | [06](06-application-and-api-security.md) |
| PDF renderer without network and with a strict URL fetcher | [06](06-application-and-api-security.md) |
| Django 6.x built-in CSP with nonces (or django-csp on 5.2 LTS) | [06](06-application-and-api-security.md) |
| Immutable / offline backups at a second Rwandan site | [07](07-infrastructure-and-operations-security.md) |
| CI security gates: SAST, dependency audit, secret scan, image scan, DAST | [09](09-secure-development-lifecycle.md) |
