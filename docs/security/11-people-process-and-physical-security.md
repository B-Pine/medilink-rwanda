# 11 · People, process and physical security

Status: v0.1 · Most healthcare breaches involve people: phishing, weak practices on shared PCs, curiosity. Technology alone can't fix that.

## 1. MediLink team

| Control | Detail |
|---|---|
| Background and agreements | Confidentiality agreement and acceptable-use policy signed before access to any production system |
| Least privilege | Production infrastructure: 2 named engineers. Production data: only through the product's roles or the audited maintenance role. |
| Training | Onboarding security training; yearly refresh; phishing simulations twice a year |
| Devices | Company or approved laptops with full-disk encryption, automatic updates, screen lock ≤ 5 min, password manager, hardware security key for production and GitHub |
| Offboarding | Same-day removal from GitHub, VPN, key store, hosting console, monitoring; rotate shared secrets they knew |

## 2. Facility staff (provided by MediLink as part of onboarding)

**Training pack** (Kinyarwanda first, 20 minutes, video + one-page poster). Each facility staff member acknowledges it in-app at first login:

1. **Your account is yours:** never share passwords or 2FA; lock the screen when you step away (keyboard shortcut taught).
2. **Only open records you need for care.** All access is recorded, and patients can see who viewed their record.
3. **No clinical information over the phone** or to relatives without the patient's permission. Direct people to the app or to the facility in person with ID.
4. **Recognise phishing:** MediLink will never ask for your password or code by phone, SMS or WhatsApp. Log in only at `staff.medilink.rw`.
5. **Report problems:** lost device, suspicious messages, a colleague misusing access → facility admin or MediLink support.
6. **Paper fallback** procedure when the system is offline.

The **facility admin** has extra duties:
- the quarterly access review
- the weekly unusual-access report
- approving voids and refunds
- removing leavers the same day

## 3. Shared reception PCs and devices

**Facility device checklist**, part of go-live:

| Control | Detail |
|---|---|
| OS and browser | Supported OS with automatic updates; current Chrome/Edge/Firefox; no unknown extensions |
| Accounts | Standard (non-admin) Windows/OS user; separate admin account held by the facility's IT person |
| Protection | Built-in antivirus on; disk encryption (BitLocker/FileVault) where available |
| Screen | Auto-lock; **privacy filter** on screens facing patients; position screens away from the waiting area |
| MediLink | Device registered as **shared** (no "trust this device", short idle lock, PIN unlock per user); browser set not to save passwords on shared PCs, or to use a separate browser profile per staff member |
| Printing | Printers in staff-only areas; uncollected prints shredded |
| Waiting-room display | Kiosk-mode browser, auto-start, no keyboard/mouse attached, display token only; screen shows no names |

## 4. Patients

- In-app security tips:
  - use your own phone where possible
  - lock your phone
  - don't share login links
  - check who can access your records in **Privacy**
- **Shared family phones:** profile switching and delegates are explicit. Restricted records are never shown to delegates. Patients are told how to remove a delegate.
- **Scam awareness:** MediLink never asks for payment by phone call. Payments happen at the facility (P1) or through in-app requests (P3).

## 5. Physical security (hosting)

Covered by the hosting provider's controls and certification: access control, CCTV, visitor logs, environmental protection. We verify these before signing, and yearly ([07](07-infrastructure-and-operations-security.md) §1).

## 6. Process controls (separation of duties)

| Process | Control |
|---|---|
| Money | Requester ≠ approver for voids, refunds and waivers; shift cash-up; reports per staff member |
| Roles | Facility admin can't grant themselves super-admin powers; super admins can't edit facility clinical/billing data |
| Production changes | Author ≠ reviewer; deploy through CI only |
| Break-glass | Use reviewed by someone other than the user |
| Patient merges | Requested by reception, approved by facility admin (cross-facility by super admin) |
