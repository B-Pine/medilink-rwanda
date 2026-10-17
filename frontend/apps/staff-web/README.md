# Staff web app

Web workspaces for everyone who isn't a patient, chosen by role after login:

- **Super admin:** facility applications and verification, master data, escalated disputes, subscriptions
- **Facility admin:** setup, staff, schedules, tariffs, insurers, queue rules, approvals, reports
- **Receptionist (also cashier):** today board (expected + on site), walk-ins, check-in, queue control, payments, cash-up
- **Doctor:** my queue, consultation, patient history, prescriptions, signing
- **Pharmacist:** prescription queue, dispensing
- **Waiting-room display:** read-only kiosk view (ticket numbers only)

Stack: React 19 + TypeScript + Vite, static build hosted at `staff.medilink.rw`
([ADR 0006](../../../docs/decisions/0006-separate-frontend-and-backend-hosting.md),
[ADR 0007](../../../docs/decisions/0007-frontend-toolchain.md)). Must be usable on a low-end
reception PC or tablet. Workspace setup and conventions: [frontend README](../../README.md).

## Sprint 0 (what exists)

| Route                                                                                                                                           | Screen                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/login`                                                                                                                                        | Split-screen login (deep forest brand panel, email + password)                            |
| `/login/mfa/setup`                                                                                                                              | First login: QR + manual key, code, 10 recovery codes (print / copy, "I saved them")      |
| `/login/mfa/verify`                                                                                                                             | 6-digit code (one input, paste/autofill) or a recovery code                               |
| `/select-facility`                                                                                                                              | Facility picker (only with several memberships)                                           |
| `/today`                                                                                                                                        | App shell + Today placeholder                                                             |
| `/queue`, `/calendar`, `/patients`, `/pharmacy`, `/payments`, `/approvals`, `/reports`, `/staff`, `/settings`, `/audit`, `/platform/facilities` | Placeholders, shown in the sidebar only when the role's permissions allow (404 otherwise) |
| `/forgot-password`, `/reset-password?uid=&token=`                                                                                               | Password reset                                                                            |
| anything else                                                                                                                                   | 404                                                                                       |

The shell has a sidebar filtered by the permissions of the active facility, a facility switcher
(several memberships), a connection indicator (browser online/offline for now), and a user menu
with theme, language and logout. Access is guarded by `GET /api/v1/staff/auth/me/`.

## Run

```bash
cd frontend
pnpm --filter @medilink/staff-web dev:mock   # http://localhost:5173 with MSW mocks
pnpm --filter @medilink/staff-web dev        # against VITE_API_BASE_URL (default http://localhost:8000)
pnpm --filter @medilink/staff-web build      # dist/
```

## Mock accounts

Password for all: **`MediLink-demo-2026`** · authenticator code **`123456`** · recovery code **`k7q2-m9xd`**.

| Email                       | Flow                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `new.staff@medilink.test`   | MFA setup → recovery codes → Today (Kigali Clinic, receptionist)                                                   |
| `reception@medilink.test`   | MFA code → Today (one facility)                                                                                    |
| `doctor@medilink.test`      | MFA code → facility picker (Kigali Clinic; Remera Health Center as doctor + facility admin; Nyamirambo Polyclinic) |
| `pharmacist@medilink.test`  | MFA code → Today (pharmacy only)                                                                                   |
| `admin@medilink.test`       | Platform admin, no facility → Today + "Facility applications"                                                      |
| `ratelimited@medilink.test` | Always `429` (lockout message)                                                                                     |

Wrong password → generic error; 5 failures → `429` with `Retry-After: 60`. Details: [frontend README](../../README.md#mock-accounts-msw-vite_use_mockstrue).
