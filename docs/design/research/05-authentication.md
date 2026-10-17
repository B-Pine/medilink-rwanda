# 05 · Login, sign-up and account flows

Status: Research v0.1 · Requirements: FR-ACC-04/05, FR-PAT-02, FR-SEC-06

## 1. Patterns that work (from research)

| Pattern | Apply to MediLink |
|---|---|
| Make the path obvious: "Log in" vs "Create account" clearly different | Separate pages with distinct titles; a link to switch between them |
| Ask only what account creation needs; collect the rest later (progressive profiling) | Patient sign-up: name, email (phone in P3), password, language. Insurance, ID and dependents come later, at first booking. |
| Email as identifier, no username | Yes |
| No "confirm password"; show/hide toggle instead | Yes |
| Password rules shown **before** typing, ticked live | Yes, plus a strength hint |
| Allow paste and password managers (`autocomplete="username"`, `current-password`, `new-password`) | Required: WCAG 2.2 *Accessible Authentication* |
| Offer a non-memory method | **Magic link by email** for patients in P1; passkeys later |
| Keep the email filled after a failed attempt; never clear input | Yes |
| "Forgot password?" directly under the password field | Yes |
| Errors next to the field, in plain words, with a next step; error summary at the top after submit, focused | Yes |
| Generic first error to avoid revealing which emails exist, more help after repeats | Yes |
| Lockout says how long and what to do | Yes |
| Log in right after sign-up; welcome step instead of bouncing to login | Yes |
| Verify email later unless the domain is high-risk | **Patients:** can browse and book immediately, but verify before seeing clinical records. **Staff:** always verified (invite link). |
| Invisible or risk-based bot protection; no always-on CAPTCHA | Yes, with an accessible fallback |
| "Remember this device" to reduce two-factor prompts | **Staff on personal devices only**; never on shared reception PCs |
| OTP autofill on mobile (`autocomplete="one-time-code"`) | For authenticator codes now and SMS in P3 |

## 2. Layouts

### Staff login (desktop): split screen

```
┌──────────────────────────────┬───────────────────────────────────────┐
│                              │                                       │
│  DEEP FOREST panel           │   Log in to MediLink                  │
│  (emerald-950 + Imigongo     │                                       │
│   line pattern, 6% opacity)  │   Email                               │
│                              │   [______________________________]    │
│  "Every visit, on time."     │   Password                 Show 👁    │
│                              │   [______________________________]    │
│  ✓ Encrypted · Data in Rwanda│   Forgot password?                    │
│                              │                                       │
│                              │   [        Log in        ]  (emerald) │
│                              │                                       │
│                              │   Language: Kinyarwanda ▾             │
└──────────────────────────────┴───────────────────────────────────────┘
```

- **Two-factor step:** a 6-digit field (one input, not six boxes, so paste and autofill work), "Use a recovery code" link, "Trust this device for 30 days" only if the device is not marked shared.
- **Facility picker** after login for multi-facility staff: cards with facility name, role(s), last used.

### Patient login and sign-up (mobile first)

```
┌──────────────────────────┐
│  ◉ MediLink      RW ▾    │
│                          │
│  [ illustration: mother  │
│    & child, mint bg ]    │
│                          │
│  Welcome                 │
│  Book care and skip the  │
│  long wait.              │
│                          │
│  Email                   │
│  [____________________]  │
│  [ Continue          ▸ ] │   ← email-first: existing account → password / magic link
│                          │      new email → short sign-up
│  ─────── or ───────      │
│  [ Email me a login link]│
│                          │
│  Find care without an    │
│  account ▸               │   ← discovery never requires login
└──────────────────────────┘
```

- **Email-first single flow:** the user types an email, and the app decides between login and sign-up, with clear text about what happens next. This suits first-time and older users.
- The language switch is visible on every auth screen, at the top.
- **Guest discovery:** search and facility pages need no account. The account is required only at booking, with a "Continue booking after sign-up" handover so nothing is lost.
- **Consent step** (FR-SEC-04) is part of sign-up: a plain-language summary with "Read the full privacy notice". The optional **research consent** is a separate, unticked choice.

## 3. Other account flows to design

| Flow | Key points |
|---|---|
| Staff invite acceptance | Shows facility name, inviter and role, so the invitee knows it's real. Then set password → set up 2FA (QR + manual key + recovery codes to print) → licence number (clinicians). |
| Facility application wizard | 5 steps with a progress bar and autosave: Facility → Location (map pin) → Documents (drag/drop + phone camera) → Admin person → Review & submit. Resume from email link. |
| Password reset | Email → link → new password → signed in. No security questions. |
| Session timeout (staff) | Warn 60 s before with "Stay signed in"; idle lock screen with PIN unlock showing *who* is locked |
| Account switch on a shared reception PC | "Not you? Switch user" on the lock screen |
| Patient profile switch | Avatar switcher at the top: "Me · Keza (6) · Mama". The current profile is always visible on booking and record screens. |
| Account deletion | Explains what is deleted and what facilities must keep by law, before confirming |

## 4. Accessibility checklist for auth screens

- Visible `<label>`s (no placeholder-only fields); 48 px+ inputs on patient screens.
- Logical focus order; focus visible; the error summary receives focus after a failed submit.
- Errors announced (`role="alert"`) and linked with `aria-describedby`.
- No time limits without warning and extension.
- No CAPTCHA puzzles without an alternative.
- Works at 200% zoom and at 360 px width.
