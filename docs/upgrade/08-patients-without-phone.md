# 08 · Patients without a phone

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md)

Many patients at public facilities have no smartphone, no account, no identity document with them, and some cannot read. MediLink must serve them as well as anyone else. This document walks through a visit for such a patient and lists what the system provides at each step.

## 1. The visit, step by step

| Step | What happens | System support |
|---|---|---|
| Arrival | The patient comes to reception | Receptionist finds them by name, file number or ID, or registers them as a walk-in in under 60 s: names, sex, age (an estimate is fine); phone and ID optional; likely duplicates suggested |
| Consent | The receptionist reads a short spoken script in the patient's language | Script on screen; "consent given" recorded with the receptionist's name |
| Insurance | The patient shows a card | Photographed at the desk; verified or rejected with a reason |
| Contact | The patient has no phone | A **contact person** (a relative's phone or a community health worker) can be recorded to receive reminders and alerts (proposed FR-PAT-18) |
| Ticket | The patient needs to know their place | **Printed ticket slip** (58 or 80 mm thermal): large ticket number, service, estimated wait, "watch the screen" in Kinyarwanda |
| Waiting | The patient cannot follow an app | **Waiting-room display** shows "Now serving G-022 → Room 4"; a **chime** and a **spoken call** of the number and room in Kinyarwanda (proposed FR-QUE-21) |
| Stepping out | The patient goes outside | Reception marks "step out" (up to 30 min); the place is kept and the patient rejoins |
| Priority | Elderly, pregnant, disabled, very sick | Priority flag with a reason; emergency first |
| Triage, lab, doctor | Normal care | No difference; the triage nurse and laboratory work from the queue |
| Payment | Cash, mobile money paid by a relative, or card | Cashier records it and **prints the receipt** |
| Medicines | The patient may not read the label | **Printed labels with pictograms** (morning, midday, evening, night) and the dose in words; the pharmacist explains aloud (on-screen reminder) |
| Documents | Sick note, referral, prescription for outside | **Printed** by reception with QR and code so anyone can verify them |
| Next visit | A follow-up is needed | Booked at the desk; a **printed appointment card** with date, time, doctor, place and booking code (proposed FR-DOC-08); the contact person gets the reminder |
| Problem | The patient disagrees with a bill or record | Reception **raises the dispute at the counter** on their behalf |
| Later | The patient gets a phone | They sign up; reception checks their ID and confirms the **record claim**, so the history follows them |

## 2. Booking without a smartphone

| Channel | How |
|---|---|
| Phone call to the facility | Reception books by phone with the doctor's free times |
| Community health worker | Books or joins the queue for the patient (P2 role, [06](06-new-roles.md) §5) |
| Relative with a smartphone | Adds the patient as a dependent or becomes a delegate with consent |
| SMS and USSD | P3 and P4 ([ADR 0002](../decisions/0002-web-first-paid-channels-later.md)) |

## 3. Printing requirements

| Item | Format | Content |
|---|---|---|
| Ticket slip | 58 or 80 mm thermal | Facility, ticket number (very large), service, date and time, estimated wait range, "Watch the screen", QR to the tracker for a relative's phone |
| Appointment card | 80 mm thermal or A6 | Facility, date, time, doctor, service, booking code, "Bring" line |
| Receipt | 80 mm or A4 | As [design 09](../design/research/09-documents.md) |
| Dosing label | 62 mm | Medicine, pictograms, dose in words, patient name, date |
| Documents | A5 or A4 | Letterhead, QR and verification code |

All printouts are black and white, in the patient's language (Kinyarwanda by default), with large type for the key number.

## 4. Requirements summary

| ID | Requirement | Status |
|---|---|---|
| FR-QUE-13 | Waiting-room display with numbers and chime | Built (S4); extend with the spoken call |
| FR-QUE-21 (proposed) | Spoken call of the number and room in Kinyarwanda (and the facility's second language) | New |
| FR-PAT-18 (proposed) | Contact person for a patient without a phone, with the patient's consent | New |
| FR-DOC-08 (proposed) | Printed appointment card | New |
| NFR-NET-06 | Thermal printing from the browser | Partly built (labels, receipts); verify the ticket slip |
| FR-DSP-09 | Disputes raised at the counter | Built (S10b backend); screens pending |
| FR-PAT-06 | Claim a record later with proof | Built (S3) |

Open decision OD-4 ([01](01-product-direction.md) §5): recorded voice files or speech synthesis for the spoken call.
