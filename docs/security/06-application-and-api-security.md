# 06 · Application and API security

Status: v0.1 · Maps OWASP Top 10:2025 and OWASP API Security Top 10:2023 to concrete controls for Django + React.

## 1. OWASP Top 10:2025 mapping

| Risk | MediLink controls |
|---|---|
| **A01 Broken Access Control** (now includes SSRF) | Policy layer + scoped querysets + RLS + authz test matrix ([04](04-authorization-and-tenant-isolation.md)); SSRF controls (§5, §8) |
| **A02 Security Misconfiguration** | Hardened settings (§2), `check --deploy` in CI, IaC-reviewed infrastructure, no debug or default credentials, security headers |
| **A03 Software Supply Chain Failures** | Lock files with hashes, dependency audit, SBOM, pinned image digests, Renovate/Dependabot, review of new dependencies ([09](09-secure-development-lifecycle.md)) |
| **A04 Cryptographic Failures** | [05](05-data-protection-and-cryptography.md) |
| **A05 Injection** | ORM only (raw SQL needs a security review and parameters); no shell calls with user input; template autoescape; React escaping; CSV-injection-safe exports (§9) |
| **A06 Insecure Design** | Threat model per feature, abuse cases, business-rule controls (§7) |
| **A07 Authentication Failures** | [03](03-identity-authentication-sessions.md) |
| **A08 Software or Data Integrity Failures** | Signed records, document hashes, hash-chained audit log, JSON-only task serialisation, signed CI artefacts |
| **A09 Security Logging & Alerting Failures** | [08](08-logging-monitoring-and-detection.md) |
| **A10 Mishandling of Exceptional Conditions** | Fail closed (missing facility context → empty + alert); generic error pages; transactions roll back fully; no stack traces to users; timeouts and circuit breakers on external calls |

## 2. Django hardening (production settings)

```python
DEBUG = False
ALLOWED_HOSTS = ["api.medilink.rw"]          # frontends are static sites on other hosts (ADR 0006)
SECRET_KEY = env("DJANGO_SECRET_KEY"); SECRET_KEY_FALLBACKS = env.list("DJANGO_SECRET_KEY_FALLBACKS", default=[])

SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")   # only because the proxy overwrites it
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = env.bool("SECURE_HSTS_PRELOAD", default=False)  # opt-in after a stable period
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# Audience-scoped session cookies "__Host-ml_staff" / "__Host-ml_patient" are chosen per request
# path by a custom session middleware (ADR 0006); both use these flags:
SESSION_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True; SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_NAME = "__Host-ml_csrf"; CSRF_COOKIE_SECURE = True   # token also returned by GET /api/v1/csrf/
CSRF_TRUSTED_ORIGINS = ["https://staff.medilink.rw", "https://medilink.rw"]
CORS_ALLOWED_ORIGINS = CSRF_TRUSTED_ORIGINS; CORS_ALLOW_CREDENTIALS = True

DATA_UPLOAD_MAX_MEMORY_SIZE = 2_621_440        # JSON bodies
FILE_UPLOAD_MAX_MEMORY_SIZE = 2_621_440
DATA_UPLOAD_MAX_NUMBER_FIELDS = 500
```

- **Content Security Policy:** Django **6.0+ has built-in CSP** (`ContentSecurityPolicyMiddleware`, `SECURE_CSP`, nonces). ADR 0003 names Django 5.2 LTS. Either use **django-csp** on 5.2, or adopt the latest 6.x and move to the next LTS (6.2, expected April 2027). Recommended: **6.x**, for built-in CSP and the tasks framework.

```python
from django.utils.csp import CSP
SECURE_CSP = {
    "default-src": [CSP.SELF],
    "script-src": [CSP.SELF, CSP.NONCE],
    "style-src": [CSP.SELF, CSP.NONCE],
    "img-src": [CSP.SELF, "data:", "https://files.medilink.rw"],
    "connect-src": [CSP.SELF, "wss://api.medilink.rw"],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.SELF],
    "form-action": [CSP.SELF],
    "object-src": [CSP.NONE],
}
```
Start with `SECURE_CSP_REPORT_ONLY` in staging, then enforce. The React builds must not need `unsafe-inline` or `unsafe-eval`.

- **Other headers** (set at the proxy for static assets too): `Permissions-Policy: camera=(self), geolocation=(self), microphone=()`, `Cross-Origin-Resource-Policy: same-site`.
- **Django admin:** only for engineers, on a non-obvious path, reachable only through the VPN, MFA enforced (`django-otp` admin site), read-only models where possible.
- **CI gate:** `python manage.py check --deploy --fail-level WARNING` on the production settings.

## 3. API (OWASP API Top 10:2023)

| Risk | Control |
|---|---|
| API1 BOLA | Scoped lookups + RLS + cross-tenant tests |
| API2 Broken authentication | [03](03-identity-authentication-sessions.md) |
| API3 Broken object *property* level auth | Per-role serializers, explicit fields, reject unknown input fields |
| API4 Unrestricted resource consumption | Pagination max 100; query timeouts (`statement_timeout` 5 s for web); throttles per user and endpoint; upload limits; expensive reports run as background jobs |
| API5 Broken function level auth | Separate route groups per audience; deny-by-default |
| API6 Unrestricted access to sensitive business flows | Booking caps, slot-hold limits, verification-page throttling, refund/void approvals |
| API7 SSRF | No user-supplied URL fetching; push endpoint allowlist (§8); PDF fetcher lockdown (§5); egress firewall |
| API8 Security misconfiguration | §2; CORS allowlist only for our origins, credentials only same-site |
| API9 Improper inventory | OpenAPI schema generated in CI = the API inventory; old versions retired with dates; no undocumented endpoints |
| API10 Unsafe consumption of APIs | Future insurer, MoMo and EMR integrations: validate responses, timeouts, TLS verification, signed webhooks with replay protection |

**Webhooks (P3+, e.g. mobile money callbacks):** HMAC signature verification, timestamp tolerance of 5 min, idempotency keys, IP allowlist where the provider supports it, and the payment confirmed by querying the provider, never trusted from the callback alone.

## 4. File uploads

| Step | Control |
|---|---|
| Size | Proxy `client_max_body_size 10m`; app checks again |
| Type | **Allowlist by content (magic bytes)**, not by extension or the browser's `Content-Type`: PDF, JPEG, PNG, HEIC/HEIF (converted). **No SVG, HTML or Office macros.** |
| Quarantine | Saved to a quarantine bucket with a random name; not downloadable until scanned |
| Malware scan | ClamAV (signatures updated hourly); infected → rejected and alert |
| Images | Re-encoded with Pillow (strips scripts and polyglots), **EXIF stripped (removes GPS location)**, decompression-bomb limits (`Image.MAX_IMAGE_PIXELS`) |
| PDFs | Structure check (e.g. reject JavaScript / embedded files / encrypted PDFs); optional sanitisation |
| Storage | Private bucket; object key = UUID; original filename kept only as metadata (sanitised) |
| Download | Through `files.medilink.rw` with a 5-minute signed URL after an authz check; `Content-Disposition: attachment`; `X-Content-Type-Options: nosniff`; `Content-Security-Policy: sandbox` |

## 5. PDF generation (WeasyPrint)

WeasyPrint fetches URLs referenced in HTML and CSS. A 2026 advisory (CVE-2026-55073, third-party database) describes a bypass of `url_fetcher` restrictions that allows **local file reads / SSRF**. Our controls:

1. Templates are our own Django templates with **autoescape**. User data is only ever inserted as escaped text, never as HTML or CSS.
2. A **custom `url_fetcher`** allows only `data:` URIs and an explicit allowlist of bundled static files (fonts, logo, letterhead). It rejects `file:`, `http(s):` and everything else.
3. Never pass user-influenced values to `stylesheets=[...]` or XMP metadata parameters (the bypass path); keep WeasyPrint at the latest patched version.
4. Rendering runs in a **separate worker container with no network egress**, a read-only filesystem except a temp dir, CPU and time limits (e.g. 20 s), and memory limits.
5. Facility-uploaded letterheads, logos and stamps are images processed by the upload pipeline (§4), embedded as `data:` URIs.

## 6. Front end (React)

- React escapes output by default. **`dangerouslySetInnerHTML` is banned** (ESLint `react/no-danger` as an error). If rich text is ever needed, use DOMPurify with an allowlist.
- No secrets in front-end code. No tokens in `localStorage` or `sessionStorage`.
- **No third-party scripts** (no analytics trackers, no chat widgets) in apps that show patient data. Self-hosted fonts.
- **Service worker / offline (PWA):**
  - cache the app shell and **minimal** visit data (ticket number, facility, time)
  - documents and clinical summaries are stored offline only after the user chooses "Save for offline", with a warning on shared phones
  - all caches and IndexedDB are cleared on logout and account switch
  - the service worker never caches `/api/` responses by default
- **Staff app:** auto-lock overlay hides content immediately (not just after a request); sensitive fields masked; print views marked "Confidential".
- **Dependencies:** `npm ci` from the lockfile, audit in CI, no install scripts from untrusted packages (`--ignore-scripts` where possible).

## 7. Business logic integrity

| Area | Control |
|---|---|
| Queue | Call next and check-in are atomic (`SELECT … FOR UPDATE SKIP LOCKED`), idempotency keys on actions, version numbers on tickets, reorder only with reason |
| Booking | Atomic slot hold; caps per patient; holds expire; server recomputes availability |
| Money | Amounts as integer RWF, server-calculated totals and splits (client totals ignored), no negative quantities or prices, gapless receipts, voids/refunds through approvals, no self-approval, shift cash-up |
| Clinical | Signing locks; addenda only; prescriptions can't be edited after dispensing; dispensing quantities ≤ prescribed |
| Documents | Verification code random; superseded/cancelled status shown on the verification page |
| Disputes | Rate limits; can't modify the evidence trail |
| Time | Server time only (NTP-synced); client timestamps used only as hints for offline queued actions, always validated (not in the future, within the shift) |

## 8. Notifications, real-time and background jobs

- **Web push SSRF:** the push subscription endpoint URL comes from the browser. It's accepted **only if its host matches the allowlist of browser push services** (e.g. `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`). Requests go through the egress proxy.
- **Content:** "You're called: Room 4" is fine. **No diagnoses, medicines or service names that reveal sensitive care** ("HIV clinic") in push, email or the display.
- **WebSockets (Channels):**
  - `AllowedHostsOriginValidator` + `AuthMiddlewareStack`
  - group join authorised per §4 of [04](04-authorization-and-tenant-isolation.md)
  - messages are **notify-then-fetch**: they carry IDs and versions, and the client fetches details through the authorised API
  - connections are closed on logout or deactivation
  - per-connection rate limits
- **Celery:** `task_serializer = accept_content = ["json"]` (**no pickle**). Tasks take IDs, not personal data. The result backend is disabled or stores no personal data. Time limits on every task. Redis with ACL users and passwords on the private network.

## 9. Other injection and output risks

- **CSV / Excel exports:** cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'` (formula injection).
- **Email templates:** user names escaped; header injection prevented by Django's mail API.
- **Logs:** user input is not interpolated into log format strings; newlines are escaped (log injection).
- **Redirects:** only to internal paths (`url_has_allowed_host_and_scheme`), so the login `next` parameter can't redirect to a phishing site.
- **QR codes:** encode only the verification URL with the code. The verification page never reflects input unescaped.

## 10. Error handling

- Users get generic, friendly errors with a reference ID. Details go to logs only.
- Unexpected exceptions roll back the transaction (no half-saved bills or tickets).
- External calls (email, push, future insurer APIs) have timeouts and retries with backoff; failure never blocks core queue actions.
