# 17 · Assumptions, risks and open questions

Status: Draft v0.2 · Review at every milestone.

## 1. Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A1 | Pilot facilities will let reception staff update the queue in real time | Queue estimates become wrong and trust is lost; redesign the staff flow around their reality |
| A2 | Most urban patients have a smartphone with a browser, or a family member with one | More reception-assisted flows; prioritise SMS earlier |
| A3 | Facilities accept a lightweight clinical record in MediLink (no existing EMR, or willing to use both) | Integration moves earlier; MediLink focuses on access and queue |
| A4 | Facilities will pay a subscription, or partners will fund public facilities | Business model changes |
| A5 | Hosting in Rwanda is affordable for a small team | Seek authorisation for a regional host or a partner arrangement |
| A6 | Web push is enough for most alerts in the first phase | SMS for critical alerts must be funded sooner |

## 2. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Staff don't use the system at peak times | High | High | Reception flow faster than paper; keyboard shortcuts; training; paper fallback; measure adoption |
| R2 | Wait estimates are wrong and patients stop trusting them | Medium | High | Ranges, status messages, accuracy tracking, conservative defaults |
| R3 | Data breach of health data | Low–Medium | Very high | [12](12-security-privacy-and-compliance.md); pen test; least privilege; audit |
| R4 | Scope creep into a full hospital system | High | High | Strict phase scope; out-of-scope list in [01](01-vision-scope-and-metrics.md) |
| R5 | Symptom checker gives unsafe advice | Medium | Very high | Red-flag rules first; shadow mode; under-triage release gate; not a diagnosis |
| R6 | Insurers don't provide eligibility or claims APIs | High | Medium | Manual verification and claim lists work without them |
| R7 | Regulatory classification delays the AI | Medium | Medium | AI is not on the P1 critical path |
| R8 | Favouritism or fraud in queue or payments | Medium | High | Reasons, logs, approvals, separation of duties, reports per staff member |
| R9 | Unreliable internet at facilities | High | High | Offline banner, retries, small payloads, paper fallback |
| R10 | Small team overloaded | High | Medium | Django's built-in features (admin, auth, ORM); boring, proven tools; phased delivery |
| R11 | Duplicate or wrong patient matching causes records on the wrong person | Medium | High | Duplicate checks, merge approvals, entered-in-error flow |

## 3. Open questions

| # | Question | Who answers | Needed by |
|---|---|---|---|
| Q1 | Which facility (or facilities) will pilot? Type, size, existing systems? | Team | Before P1 design ends |
| Q2 | Legal retention period for medical records and billing records in Rwanda | Lawyer / Ministry of Health | P1 |
| Q3 | Registration requirements with NCSA for MediLink and for facilities; data processing agreement template | Lawyer | Before pilot |
| Q4 | Minimum age for a self-managed patient account; age of majority handover | Lawyer | P1 |
| Q5 | Is a MediLink receipt enough, or must facilities keep issuing EBM receipts? | RRA / accountant | P1 |
| Q6 | Current co-payment rules and referral requirements for Mutuelle, RAMA, MMI | RSSB, MMI, pilot facility | P1 |
| Q7 | Insurer claim formats (RSSB forms etc.) | Pilot facility, insurers | P2 |
| Q8 | Is a digital prescription with QR legally valid for outside pharmacies? Rules for controlled medicines | Rwanda FDA / Pharmacy Council | P1 |
| Q9 | Medical device classification of the symptom checker | Rwanda FDA | P2 |
| Q10 | Access to HMIS (DHIS2) aggregate data for AI priors | Ministry / RBC | P2 |
| Q11 | Hosting provider in Rwanda; cost; backups in-country | Team | P1 design |
| Q12 | Subscription prices and plans | Team | P2 |
| Q13 | Clinical lead to sign off templates, red flags and AI content | Team | P2 |
| Q14 | Emergency number(s) and emergency guidance text to show (confirm 912 for SAMU) | Ministry / clinical lead | P1 |
