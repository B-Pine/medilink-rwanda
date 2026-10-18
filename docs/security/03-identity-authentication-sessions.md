# 03 · Identity, authentication and sessions

Status: v0.1 · Standards: NIST SP 800-63B-4 (final, July 2025), OWASP ASVS 5.0 (Authentication, Session Management), WCAG 2.2 Accessible Authentication.

## 1. Account types and assurance

| Account | Factors | Target assurance |
|---|---|---|
| **Super admin** | Password + **passkey / FIDO2 security key (mandatory)**; access only via VPN or admin IP allowlist | Highest (phishing-resistant, AAL3-like) |
| **Facility staff** (admin, receptionist, doctor, pharmacist) | Password + **MFA mandatory**: passkey preferred, TOTP authenticator app as fallback | AAL2 (phishing-resistant where passkeys are used) |
| **Patient** | Password **or** email magic link; optional TOTP / passkey; phone OTP from P3 | AAL1, with step-up for sensitive actions |
| **Display device** | Revocable, read-only device token scoped to one facility / service | Not a user |

TOTP can be phished: a fake login page can relay the code. That's why **passkeys are the target for all staff**. Synced passkeys are recognised at AAL2 in NIST 800-63B-4.

## 2. Passwords

| Rule | Value | Source |
|---|---|---|
| Minimum length, password-only accounts (patients without 2FA) | **15 characters** (passphrase encouraged: "three words you can remember") | NIST 800-63B-4 |
| Minimum length with MFA (staff, patients with 2FA) | **12 characters** | NIST allows 8; we choose 12 |
| Maximum length | ≥ 64 characters accepted | NIST |
| Composition rules (must have symbol, etc.) | **None** | NIST says verifiers shall not impose them |
| Forced periodic change | **No**; change only on evidence of compromise | NIST |
| Blocklist | Common, breached and context words (MediLink, facility name, user's name) | NIST |
| Breach check | Offline breached-password list; optionally the k-anonymity range API (sends only a 5-character hash prefix, no personal data) | |
| Hashing | **Argon2id** (Django `Argon2PasswordHasher`), parameters reviewed yearly | OWASP Password Storage |
| Paste and password managers | **Allowed** (`autocomplete` attributes set) | WCAG 2.2 |
| Show / hide toggle | Yes | |

```python
# settings (sketch)
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",  # only to upgrade legacy hashes
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "medilink.security.validators.ContextualMinimumLengthValidator"},  # 15 or 12 depending on MFA
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "medilink.security.validators.BreachedPasswordValidator"},          # offline list
]
```

## 3. Multi-factor authentication

- **Enrolment at first login** for staff (from the invite flow). Recovery codes are generated once (10 single-use codes, hashed at rest) and shown for printing.
- **Libraries:** `django-otp` for TOTP; WebAuthn/passkeys via a maintained library (e.g. `webauthn` / django-allauth MFA).
- **TOTP secrets** are encrypted at rest with the application key store ([05](05-data-protection-and-cryptography.md)).
- **Development-only bypass:** `DEV_SKIP_STAFF_MFA` lets developers test locally without an authenticator app. It only works with `DEBUG` on, system checks refuse it everywhere else (`medilink.E003`, and `check --deploy` always: `medilink.E004`), and each use is audit-logged as `mfa_method: dev_skip`. It must never be set in staging or production.
- **"Trust this device" (30 days)** is only offered on devices not marked as shared. Reception PCs are registered as shared devices by the facility admin.
- **MFA reset** is done by the facility admin for their staff, or by the super admin for facility admins. It requires the requester's own MFA and is logged and notified to the affected user.
- **Security notifications** go to the user on: new device login, MFA change, password change, role change.

## 4. Step-up (re-authentication)

Recent strong authentication (≤ 5 minutes) is required for:
- **signing a clinical record or addendum** (PIN or password + device already MFA-verified) (FR-CLN-02)
- voids, refunds, waivers, approvals
- changing roles, inviting staff, exporting data, changing tariffs or insurer rules
- break-glass access
- changing own email, password, MFA
- patients: viewing restricted records, downloading all data, adding a delegate, deleting the account

## 5. Sessions

| Setting | Staff app | Patient app |
|---|---|---|
| Mechanism | Django server-side session on the API host (`api.medilink.rw`); cookie `__Host-ml_staff`, selected for `/api/v1/staff/*` and `/api/v1/platform/*` | `__Host-ml_patient`, selected for `/api/v1/patient/*` ([ADR 0006](../decisions/0006-separate-frontend-and-backend-hosting.md)) |
| Cookie flags | `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain` (host-only) | same |
| Idle timeout | 15 min (configurable 5–30) → **lock screen** with PIN unlock (same user only); the session itself ends after 4 h idle (S1-D: a 15-min logout would make PIN unlock pointless) | 30 days with "keep me signed in", else 12 h; sensitive views re-auth after 15 min idle |
| Absolute lifetime | 12 h (one shift) | 30 days |
| Rotation | New session ID on login, privilege change and facility switch (prevents fixation) | On login |
| Concurrent sessions | Visible list; "sign out other sessions" | same |
| Logout / deactivation | Server-side session deleted; WebSocket connections closed immediately | same |

- **No JWT in `localStorage`** for web apps: browser storage is readable by any XSS. The mobile app (P3) will use short-lived access tokens + refresh tokens in the platform's secure storage.
- **CSRF:** Django's CSRF middleware. The SPA reads the CSRF cookie and sends `X-CSRFToken`. `CSRF_TRUSTED_ORIGINS` lists only our app origins.
- **The PIN unlock** (4–6 digits, staff only) unlocks an *existing* session on the same device for the same user. It's rate-limited (5 tries → full login) and never replaces MFA at login.

## 6. Login protection

| Threat | Control |
|---|---|
| Credential stuffing | Per-account and per-device throttling with progressive delays; breached-password checks; MFA |
| Brute force | After 5 failures: delay grows; after 10: account soft-locked 15 min + email to owner; staff lock alerts the facility admin |
| Shared IPs (mobile carrier NAT, a whole facility behind one IP) | **IP limits are high and only one signal**; account, device and behaviour signals carry more weight, so a busy facility isn't blocked |
| Account enumeration | Same response and timing for "wrong password" and "no account" on login and reset; sign-up says "check your email" in both cases |
| Magic-link abuse | Single use, 15-minute expiry, bound to the requesting browser (state cookie), stored hashed, invalidated after use or new request |
| Invite links | Single use, 7-day expiry, bound to the invited email, hashed at rest |
| Password reset | Single-use token, 30-minute expiry, all sessions revoked after reset, notification email |
| Bots | Invisible checks (timing, honeypot fields, rate limits); accessible challenge only when risk is high |

## 7. Account lifecycle

- **Joiners:** an invitation from the facility admin, with roles chosen (least privilege by default).
- **Movers:** role changes take effect immediately. The old session is rotated, and the change is logged and notified.
- **Leavers:** deactivation removes access at once. Every quarter, a **staff access review** asks each facility admin to confirm their staff list and roles (the system prompts and records the confirmation).
- **Dormant accounts:** staff accounts with no login for 60 days are disabled automatically, and the facility admin is notified.
- **Shared accounts are forbidden.** Every action is attributable to one person.

## 8. Break-glass

- Allowed for: a doctor needing another facility's records in an emergency (P2), and the super admin during investigations or disputes.
- Requires step-up auth + a reason (list + text). Grants time-limited (e.g. 60 min), read-only access to the specific patient.
- Shown with a red banner while active.
- Logged, notified to the patient (P2) and to the facility admin or a second super admin.
- **Reviewed weekly.** Unjustified use is a disciplinary matter.
