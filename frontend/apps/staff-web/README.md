# Staff web app

Web workspaces for everyone who isn't a patient, chosen by role after login:

- **Super admin:** facility applications and verification, master data, escalated disputes, subscriptions
- **Facility admin:** setup, staff, schedules, tariffs, insurers, queue rules, approvals, reports
- **Receptionist (also cashier):** today board (expected + on site), walk-ins, check-in, queue control, payments, cash-up
- **Doctor:** my queue, consultation, patient history, prescriptions, signing
- **Pharmacist:** prescription queue, dispensing
- **Waiting-room display:** read-only kiosk view (ticket numbers only)

Planned stack: React 18 + TypeScript + Vite. Must be usable on a low-end reception PC or tablet; the live queue depends on staff updating it in real time.
