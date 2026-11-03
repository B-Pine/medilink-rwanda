# 06 · New roles

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md)

Phase 1 had six roles ([analysis 02](../analysis/02-users-roles-and-permissions.md)). Real Rwandan facilities have more people with distinct jobs. Giving them another role's rights breaks least privilege (a laboratory technician with doctor rights could read every diagnosis). This document defines the new roles, what each does, what it sees and what it may never see.

Roles are permission sets, so adding a role must not change existing roles (FR-ACC-10, moved to P1).

## 1. Summary

| Role | Phase | Where | Main permission codes (proposed) |
|---|---|---|---|
| Triage nurse | P1 | staff-web | `triage.operate`, `vitals.record`, `visit.reason.view`, `queue.call` (triage stage only) |
| Laboratory technician | P1 (lite) | staff-web | `lab.operate`, `lab.result.enter` |
| Cashier | P1 | staff-web | `billing.record_payment` without `queue.operate` |
| Community health worker (Umujyanama w'Ubuzima) | P2 | patient-web, special account | `chw.follow` (linked patients only) |
| Platform support agent | P2 | staff-web platform | `support.handle` |
| External pharmacy | P2 | public verification + small account | `prescription.external_dispense` |
| Insurer | P4 | dedicated portal | `claims.view`, `eligibility.answer` |
| Ministry / district viewer | P4 | reports portal | `analytics.view_aggregate` |

## 2. Triage nurse (P1)

**Job:** see patients after check-in and before the doctor; take vitals, spot danger signs, set priority.

```
Triage · General                                   [Call next]
G-024 Habimana · M 52 · "Ububabare mu gatuza"  ⚠ chest pain   12 min
G-025 ★ Mukamana · F 71 · Fever 3 days                         8 min
```

| Does | Sees | Never |
|---|---|---|
| Calls the next patient to triage; records vitals (temperature, blood pressure, pulse, SpO₂, weight, MUAC); sets priority or emergency with a reason; confirms symptoms and adds a short note; sends the patient to the consultation queue | Reason for visit, the patient's words, age and sex, allergies, red-flag marker | Diagnoses, past clinical notes, prescriptions, bills |

**System change:** a new optional queue stage `triage` between reception and consultation, enabled per facility (proposed FR-QUE-22).

## 3. Laboratory technician (P1, lite)

**Job:** run the tests a doctor ordered and send results back to the doctor.

```
Lab requests   Waiting 6 · In progress 2 · Done today 14
G-022 Keza U.   Malaria RDT · Full blood count   Dr Uwimana   Paid ✓   [Start]
```

| Does | Sees | Never |
|---|---|---|
| Sees lab requests of the facility; confirms identity; records the sample; enters results (structured value or an uploaded file); marks done. The result goes to the doctor's results inbox and the patient returns to the queue with return priority. Prints a sample label and, once the doctor releases it, a result slip. | Test names, request reason, patient identity, payment status | Diagnoses, notes, other visits; releasing results to the patient (the doctor reviews first) |

**System change:** a lab request queue on top of the S7 `clinical_lab_request` table, result entry, and an optional `lab` stage (proposed FR-CLN-11). A full laboratory information system stays out of scope.

## 4. Cashier (P1)

**Job:** take payments, nothing else.

| Does | Sees | Never |
|---|---|---|
| Opens and closes a shift; sees bills at the payment stage; records cash, MTN MoMo, Airtel Money or card with references; prints receipts; applies exemptions; requests voids and refunds | Bill lines (medicines by name only), insurer and patient shares, balance | Approving own void or refund, changing prices, reordering the queue, clinical data |

**System change:** a `cashier` role seeded with the billing codes but not `queue.operate`; the payment stage queue as its home screen.

## 5. Community health worker (P2)

**Job:** bring people in the village who have no phone into the system and follow them up.

```
My people   12 · This week 3 · Missed 1
Uwase A.     ANC visit Tue 10:30 · Kimironko HC     [Remind]
Habimana J.  Joined queue G-031 · 4 ahead            [Track]
```

| Does | Sees | Never |
|---|---|---|
| Registers a person with their consent; finds care, books or joins the queue for them; receives their reminders and ticket alerts; follows up missed visits, vaccinations and antenatal care | Only linked people: visit times and places, tickets | Diagnoses, records, anyone not linked; acting without a valid link |

**Needs:** the patient's recorded consent, revocable at any time; a link to the national community health worker programme (open decision OD-5).

## 6. Platform support agent (P2)

Handles the support queue (triage, reply, close), edits help articles, checks a user's account state and notification delivery log. Never sees clinical or billing data and never approves facilities, merges or disputes.

## 7. External pharmacy (P2)

Verifies a MediLink prescription by code or QR, confirms the patient's date of birth, and marks items "dispensed outside" so they cannot be used twice. Sees only the items and their status.

## 8. Insurer (P4) and ministry viewer (P4)

- **Insurer:** eligibility answers and monthly claim lists (member number, visit date, diagnosis codes, services, amounts); marks claims paid or rejected with a reason. Sees only its own members' claims.
- **Ministry or district viewer:** anonymised aggregates only (load by facility and level, wait trends, referral flows, stock-outs, top diagnoses by district); groups smaller than 10 hidden.

## 9. Changes needed

| Document or code | Change |
|---|---|
| [Analysis 02](../analysis/02-users-roles-and-permissions.md) §2 and §3 | New role sections and permission matrix columns |
| FR-ACC-10 | Move to P1 |
| Permission catalogue (`authz/catalogue.py`) and seeds | New role codes and grants through `extend()` in a sprint block |
| Staff-web navigation | Role-specific home screens (triage queue, lab queue, payment queue) |
| Queue settings | Optional `triage` and `lab` stages |
| Authorisation test matrix | New columns for every endpoint |
