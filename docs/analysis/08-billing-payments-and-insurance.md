# 08 · Billing, payments and insurance

Status: Draft v0.2 · In phase 1 the **receptionist is also the cashier**.

Money causes most disputes, so billing is simple to use but strict underneath. Paid records are never edited, every correction is visible, and every shift's cash is reconciled.

## 1. Insurance

### 1.1 Schemes

| Scheme | Notes for the design |
|---|---|
| **Mutuelle de Santé** (community-based, managed by RSSB) | Household membership renewed each fiscal year (July–June); coverage only once the contribution is paid. Follows the **referral pathway** (health center → district hospital → referral hospital). Patient pays a co-payment. |
| **RAMA** (RSSB medical scheme for public and formal-sector employees) | Member + dependents; patient co-payment |
| **MMI** (Military Medical Insurance) | Military and dependents |
| **Private insurers** | Various plans, ceilings and exclusions |
| **Cash / self-pay** | No insurance |

Co-payment percentages, ceilings and exclusions **are configured per facility and insurer, never hard-coded**. They change, and they differ by contract.

### 1.2 Patient insurance profile

Each profile records:
- the insurer
- the member number
- principal or dependent, with the principal's name and number
- the card photo (front and back)
- the valid-until date
- status: unverified / verified at a facility on a date / rejected

A patient can have several insurers and chooses which one to use per visit.

### 1.3 Facility acceptance

For each insurer the facility accepts, the facility admin sets:

| Setting | Example |
|---|---|
| Accepted services | All, or a list |
| Patient share | e.g. 10% |
| Referral required | Yes (e.g. Mutuelle at a district hospital) |
| Excluded items | Some medicines or procedures |
| Ceiling per visit (if any) | Amount |

Patients see "accepts your insurance: yes / no / for some services" and their **estimated share** before booking.

### 1.4 Verification at the counter

- **P1 (manual):** the receptionist checks the card (and the referral letter if required), photographs it if needed, and marks it **verified for this visit**.
- If coverage is rejected, the receptionist records the reason. The patient can switch to cash or another insurer, or leave. The patient can also raise a dispute.
- **P4:** live eligibility checks through insurer systems (RSSB, MMI), subject to partnership agreements.

## 2. Tariff (price list)

Each facility maintains:
- **Services:** consultation by service and doctor level (e.g. general vs specialist)
- **Procedures:** dressing, injection, etc.
- **Medicines:** price per unit, mapped to the drug catalogue
- **Other charges:** card or file fee, certificate fee, if the facility charges them

Price changes apply from a date and never change existing bills.

## 3. Bills

- **One bill per visit**, opened at check-in.
- **Lines** are added from the tariff:
  - the consultation, automatically from the service
  - procedures, by the receptionist
  - medicines, automatically from the prescription. Items marked "not available" are not billed.
- **Each line shows:** unit price × quantity = total, **insurer share**, **patient share** (calculated from the insurer rules), and the doctor or service it relates to.
- **Bill states:** Open → Partly paid → Paid → (Voided) / Credited.
- **Payment timing** follows the facility's queue configuration: before consultation, after, or at exit. The pharmacy can require "paid or covered" before dispensing.

### Exemptions and waivers

- Some patients pay nothing: indigent patients covered by public programmes, staff, waivers.
- The receptionist applies an exemption reason from a list.
- The facility admin approves waivers above a threshold.
- Waivers are reported.

## 4. Payments

| Method | P1 | Later |
|---|---|---|
| Cash | Recorded by receptionist | — |
| MTN MoMo / Airtel Money | Recorded manually with the transaction reference | P3: payment request to the patient's phone, confirmed automatically |
| Card | Recorded manually with the terminal reference | — |
| Insurance | Insurer share recorded as "to be claimed" | P4: electronic claims |

- **Receipts** are numbered per facility, with gapless sequences (e.g. `RC-2026-000123`). A receipt is sent to the patient's app and email and can be printed.
- **Partial payments** are allowed. The balance stays visible.
- **Unpaid balances** at the end of a visit are recorded against the patient at that facility. They are visible to staff and shown to the patient, never to other facilities.

### Fiscal receipts (EBM)

Rwanda Revenue Authority requires electronic billing machine (EBM) receipts for many taxable transactions. MediLink receipts **do not replace EBM receipts** unless MediLink is certified for it. In P1, facilities that need EBM keep issuing EBM receipts and can record the EBM receipt number on the MediLink payment. Certification or integration is a P4 decision (see [17](17-assumptions-risks-and-open-questions.md)).

## 5. Corrections: voids, refunds and credit notes

| Situation | Action | Approval |
|---|---|---|
| Wrong line before payment | Remove or change the line (logged) | None |
| Payment recorded wrongly | **Void** the payment with a reason, then record the correct one | Facility admin |
| Refund to the patient (e.g. paid but not seen) | **Refund request** → approval → **credit note** → refund payout recorded (cash, MoMo reference) | Facility admin |
| Receipt issued in error | Void receipt (number kept, marked void) | Facility admin |

**Separation of duties:** a staff member can't approve a void or refund they requested. For a one-person clinic where the facility admin is also the receptionist, self-approval is allowed but **flagged in reports**.

## 6. Shift cash-up

1. The receptionist **opens a shift**, recording the opening float.
2. Every payment recorded belongs to the open shift.
3. **Closing the shift** shows expected totals per method (cash, MoMo, card). The receptionist enters the counted amounts.
4. Differences are recorded with a note. The facility admin reviews and accepts.
5. The end-of-day report lists shifts, totals, voids, refunds, waivers and differences per staff member.

## 7. Insurance claims (facility to insurer)

- A monthly **claim list per insurer**:
  - patient name and member number
  - visit date
  - diagnosis codes
  - services and medicines
  - insurer share
  - verification status
- Exported as Excel or PDF in P2. Insurer-specific formats come later (RSSB and others have their own forms; see [17](17-assumptions-risks-and-open-questions.md)).
- **Claim status** per visit: to claim → submitted → paid / rejected (with reason). Rejections feed the disputes list if the patient is affected.

## 8. Platform subscriptions (facility to MediLink)

| Element | Rule |
|---|---|
| Plans | By facility size or type, e.g. Basic (small clinic), Standard, Hospital. Prices are an open business decision. |
| Pilot | Pilot facilities free for the pilot period |
| Invoices | Monthly or yearly, generated by the platform |
| Payment | P1: recorded manually by the super admin (bank or MoMo reference); P3: online |
| Grace | 14 days after due date → reminders → **listing hidden** (operations keep running) → after 60 days, suspension review |
| Public facilities | May be funded through a Ministry or partner agreement instead of paying directly |

## 9. Requirements

| ID | Requirement | Phase |
|---|---|---|
| FR-BIL-01 | Patient insurance profiles with card photos, validity and verification status | P1 |
| FR-BIL-02 | Facility insurer acceptance rules (services, patient share, referral required, exclusions, ceiling) | P1 |
| FR-BIL-03 | Estimated patient share shown in discovery and booking | P1 |
| FR-BIL-04 | Manual insurance verification per visit; rejection with reason | P1 |
| FR-BIL-05 | Facility tariff with effective dates | P1 |
| FR-BIL-06 | One bill per visit with insurer / patient split, lines from tariff and prescriptions | P1 |
| FR-BIL-07 | Payment recording (cash, MoMo, Airtel, card, insurance) with references; partial payments | P1 |
| FR-BIL-08 | Gapless receipt numbering; receipt document to app, email and print | P1 |
| FR-BIL-09 | Voids, refund requests, credit notes with approval and separation of duties | P1 |
| FR-BIL-10 | Shift open / close with expected vs counted totals and review | P1 |
| FR-BIL-11 | Exemptions and waivers with reasons and approval thresholds | P1 |
| FR-BIL-12 | Unpaid balances per patient per facility | P1 |
| FR-BIL-13 | Optional EBM receipt number recorded on payments | P1 |
| FR-BIL-14 | Monthly insurance claim list per insurer with claim status | P2 |
| FR-BIL-15 | Platform subscription plans, invoices, manual payment recording, grace and listing rules | P2 |
| FR-BIL-16 | Mobile money payment requests and automatic confirmation | P3 |
| FR-BIL-17 | Live insurance eligibility checks | P4 |
| FR-BIL-18 | Electronic insurance claims; EBM integration if required | P4 |
