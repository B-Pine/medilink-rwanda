# 01 · Vision, scope and success metrics

Status: Draft v0.2

## 1. Problem

In a survey in Gasabo, Nyarugenge and Kicukiro, patients reported arriving at facilities as early as 06:00 and not being seen until late afternoon. Waits of three to four hours are common.

- **Working people** lose income.
- **Parents** spend the day worrying about a sick child.
- **Elderly patients with chronic conditions** find the uncertainty more stressful than the illness.

The root problem is **missing information before the trip**. Patients cannot easily find out:

- whether the facility offers the service they need today
- whether it accepts their insurance (Mutuelle de Santé, RAMA/RSSB, MMI, private), and what they will pay
- whether there is a free slot
- how long the queue is, and when they should arrive
- what level of care they need, so they don't go straight to a referral hospital and risk losing Mutuelle coverage

Facilities face problems of their own:

- paper registers
- no-shows they can't measure
- queues they can't see
- clinical records that are hard to retrieve
- no reliable evidence when a patient disputes a bill or a prescription

## 2. Vision

> Every patient in Rwanda knows, before leaving home, where to go, whether they are covered, what it will cost, and when to arrive. Every visit is recorded and retrievable, safely, for the patient and the facility.

## 3. Goals

| # | Goal | How MediLink delivers it |
|---|---|---|
| G1 | Predictable access | Discovery with insurance acceptance and fees; booking; remote queue join; live position and wait estimate |
| G2 | Less time wasted on site | Arrive close to your turn: "time to leave" alerts, check-in on arrival |
| G3 | Every patient served, booked or not | One queue for booked patients, remote joiners and walk-ins, with fair, configurable ordering |
| G4 | Complete, retrievable clinical record | Signed consultations, prescriptions, dispensing, documents, and import of previous records |
| G5 | Fewer no-shows and less paperwork | Reminders, no-show tracking, electronic registers, billing and claim reports |
| G6 | Right level of care | Routing by service and level of care, and later an AI symptom checker that protects referral hospitals |
| G7 | Trust and accountability | Audit trail on every action, dispute handling, patient access history |

## 4. Who benefits

| Stakeholder | Value |
|---|---|
| Patient / caregiver | Certainty before travelling; less waiting; all records, prescriptions and receipts in one place; a way to raise disputes |
| Receptionist | Faster check-in than paper; walk-ins and bookings on one board; payments and receipts in the same tool |
| Doctor | Patient history at hand; reason for visit known before the consultation; prescriptions and sick notes in a few clicks |
| Pharmacist | Clear, legible, verified prescriptions; payment status visible |
| Facility admin | Visibility of load, wait times, no-shows, revenue and disputes; insurance claim lists; staff accountability |
| MediLink (platform) | Subscription revenue; data that proves impact; a base for national scale |
| Health system (later) | Anonymised load data; patients spread better across levels of care |

## 5. Scope

### In scope by phase

| Phase | Scope |
|---|---|
| **P1 · Web MVP** | Facility onboarding and verification; facility setup; staff and roles; patient web app (PWA); discovery with insurance and fees; calendars and booking; remote queue join; one queue for bookings and walk-ins; waiting-room display; consultation record with signing and amendments; prescriptions; pharmacy dispensing; documents (generated and uploaded); previous records and legacy import; reception billing, manual payment recording, receipts, cash-up; notifications (in-app, web push, email); disputes; audit log; basic reports; structured symptom capture (AI stage 0) |
| **P2 · Pilot and growth** | Pilot at 1–2 facilities with impact measurement; referrals between facilities; consented cross-facility record sharing; waitlist; ratings; insurance claim reports; platform subscription billing; simple pharmacy stock; rules-based triage (AI stage 1); richer reports |
| **P3 · Mobile and SMS** | Android app on the same API; SMS alerts and phone OTP; mobile money payment integration; ML symptom model in shadow mode (AI stage 2) |
| **P4 · Reach and intelligence** | WhatsApp and USSD; live insurance eligibility checks; integration with electronic medical record systems; ML symptom checker for patients (AI stage 3+); anonymised Ministry analytics; Rwanda Revenue Authority EBM integration if required |

### Out of scope (for now)

- Telemedicine and video consultations
- Full hospital management: wards, admissions, theatre, HR, payroll
- Full lab information system (lab results are uploaded as documents in P1)
- Full pharmacy inventory and procurement (P1 has only an available / not available flag)
- Diagnosis by AI shown to patients
- Ambulance dispatch (the emergency guidance points to the national emergency number)

## 6. Success metrics

Impact claims must be measured, not assumed. **A baseline study at each pilot facility before go-live is mandatory**: a manual sample of arrival, call and finish times over at least two weeks. Without it, no reduction can be claimed.

| Metric | Definition | Target |
|---|---|---|
| Time on site | Check-in → visit completed | Reduce versus baseline; target set after the baseline study |
| Wait to be seen | Check-in → first call by a clinician | Reduce versus baseline |
| Wait-estimate accuracy | Share of patients called within their shown range | ≥ 80% by end of pilot |
| No-show rate | Booked visits never checked in ÷ booked visits | Reduce versus baseline |
| Walk-in fairness | Average wait of walk-ins compared with booked patients | Walk-ins not disadvantaged beyond the configured ratio |
| Record completeness | Visits closed with a signed clinical record | ≥ 95% |
| Staff adoption | Visits recorded in MediLink ÷ all visits (sampled) | ≥ 90% at pilot facilities |
| Patient satisfaction | Post-visit rating | Track; target after baseline |
| Dispute resolution | Disputes resolved within the time limit | ≥ 90% |
| Load distribution (P2+) | Visits at health centers vs referral hospitals for the same services | Track; claims only after data exists |

### Corrections to the original pitch

- **CHUK** is a national referral and teaching hospital, not a local health center.
- **"50% less waiting":** booking and queue visibility mainly reduce *time spent physically waiting on site*. They don't add clinical capacity. Report time on site and wait to be seen separately.
- **"30% more flow to under-used facilities":** keep this as a goal until pilot data supports a number.
- **"AI-powered symptom checker":** it guides patients to the right care. It does not diagnose. See [11](11-ai-symptom-checker.md).

## 7. Constraints

- **No paid channels at first.** SMS, WhatsApp and USSD cost money, so P1 uses only in-app notifications, web push and email.
- **Data stays in Rwanda.** Health data is sensitive personal data under Law No. 058/2021.
- **Small team and small budget.** Prefer simple, proven technology: Django, React, PostgreSQL. See [ADR 0003](../decisions/0003-stack-django-react-postgresql.md).
- **Low-end devices and weak networks** at reception desks and on patients' phones.
- **Kinyarwanda first.** Many patients are elderly or have low literacy.
