# 05 · Staff workspaces

Status: Draft v0.1 · 2026-11-02 · Part of the [system upgrade](README.md) · Host: `staff.medilink.rw` (staff-web)

Each role has **one focal point**: the thing the person came to do. Everything else is one click away. New roles (triage nurse, laboratory technician, cashier and later roles) are in [06](06-new-roles.md); how each role serves patients without a phone is in [08](08-patients-without-phone.md).

## 1. Shell (all staff)

| Element | Rule |
|---|---|
| Sidebar | On the page colour; groups: daily work · Manage · MediLink platform · Help at the foot. Shows only sections the person may use **and** that are built. The active item is a surface pill. Collapses to icons. |
| Top bar | Facility switcher (always visible for multi-facility staff), `Ctrl+K` command bar (patients, tickets, pages, actions), notification bell, user menu (theme, language, Lock, Security, Sign out) |
| Connection | Bottom of the sidebar: Online · Reconnecting · Offline (n actions queued); never hidden |
| Access | A page outside the role says "You don't have access"; platform pages stay invisible to facility staff |
| Security | Idle lock with PIN unlock; step-up re-authentication for sensitive actions; sessions per audience |
| Device | Works on a 1366 × 768 low-end PC and a 10-inch tablet |

## 2. Receptionist

**Focal point:** one check-in search, then Expected and On site side by side.

```
[ Search: name · phone · ID · file no. · ticket ]  [N Walk-in]  [Book by phone]
Expected 12 → Waiting 18 → Doctor 4 → Payment 3 → Pharmacy 5
┌ Expected ─────────────────────────┬ On site ─────────────────────────────┐
│ 08:30 Mukamana J. Gen  Intake ✓   │ G-021 Waiting 12m  Mutuelle ✓        │
│ 08:45 Habimana E. Ped  [Check in] │ G-022 Called → Room 4                │
│ Remote: Uwase A. I'm here [Confirm]│ G-023 ★ Elderly  Waiting  No phone   │
└───────────────────────────────────┴───────────────────────────────────────┘
```

| Sees | Does |
|---|---|
| Expected bookings with intake status (done or missing), Late badge | Check in (booking code or QR on the patient's phone), New time |
| Remote joiners, "I'm here" claims first | Confirm arrival |
| On site by service and stage, flags (priority, emergency, unpaid, insurance unverified, no phone) | Priority with a reason, transfer, reorder with a reason, step out, mark left, cancel |
| The patient's own words and a red-flag marker | Raise emergency priority at once |
| Insurance card photo, verification state, transfer letter needed | Photograph card, verify or reject with a reason |
| Missed today (no-shows) | Undo with a reason |
| Shift totals (when also cashier) | Bills, payments, receipts, exemptions, void or refund requests, shift close |
| — | Register a walk-in in under 60 s; book by phone; print slip, documents, appointment card; raise a dispute at the counter |

**Never sees:** diagnoses, clinical notes, prescriptions (except medicine names on bills).

## 3. Doctor (doctors, nurses and midwives who consult)

**Focal point:** the patient in the room, then "Finish and call next".

| Area | Content |
|---|---|
| My queue | Duty control (on duty, break, emergency, off) with room; the patient in the room as a large card; Up next as ticket stubs; Call next (Space) |
| Consultation (one scroll with anchors) | Pinned bar: allergies, pregnancy, autosave status. Sections: reason (patient's words + symptoms + intake answers), triage result with **likely conditions (doctors only)**, vitals, history, examination, diagnosis (ICD-10 search in plain language), plan, instructions, private notes (never shown to patients), prescription (catalogue, availability, alerts), letters and requests (referral, lab request, sick note, follow-up), Sign & finish with step-up |
| History drawer | Visits timeline, active problems, current medicines, paper back-entry and scans |
| Other pages | My calendar and leave · My public profile (approve or edit) · Unsigned records · Results inbox · Pharmacist and lab questions · My activity |

**Rules:** treatment relationship or a stated reason to open a record; signed records locked with a content hash; corrections by addendum; no billing access.

## 4. Pharmacist

**Focal point:** the open prescription, item by item.

| Area | Content |
|---|---|
| Queue | Tabs Ready · Partly given · Questions; search by name, prescription number or ticket; flags (paid or covered, controlled, not in stock) |
| Dispense | Identity first (ticket + name + date of birth, or the prescription code); allergy bar; per item: All · Part · Substitute (same ingredient and strength, with a reason) · Not available; controlled-medicine confirmation; one signature; print labels with pictograms |
| Other | Availability switches per drug · Dispensing history · Verify another facility's prescription · My activity |

**Never sees:** diagnoses, notes, examination, bill amounts.

## 5. Facility admin

**Focal point:** the patient flow with the slow step called out, then "Needs your attention".

```
Expected 12 → Waiting 18 → Doctor 4 → Payment 3 → Pharmacy 5
Waiting for a doctor is the slow step · 8 people · up to 31 min
Patients today 86   Median wait 28 min   No-shows 6 %   Collected 412,000
Needs your attention
  Void request · RC-000231                      ›
  Dispute due tomorrow                          ›
  3 unsigned records · Dr Niyonsenga            ›
  Licence expires in 30 days                    ›
```

| Section | Sees · does |
|---|---|
| Operations | Live board per service (queue, longest wait, doctors on duty); reorders to review; post a closure or announcement |
| **Public profile** | **Preview of how patients see the facility** (home list, map pin, facility page, doctor pages); edit description, photos, access details, "what to bring"; approve doctor profiles |
| Services and rooms | Departments, services (who it is for, walk-in, booking, remote join, intake form), service points, ticket prefixes |
| Schedules | Doctor weekly templates, leave approval, cross-facility conflicts (times only), disruptions with bulk rebooking |
| Bookings | Day and week calendars, no-shows, earlier-time alerts |
| Staff | Members, roles, MFA, licence attestation, invitations, deactivation |
| Tariff and insurance | Prices (internal, for billing only), accepted insurers, patient share, transfer letter, exclusions |
| Rules | Queue (stages including triage and lab, ratio, grace), booking, billing, documents, notifications, intake forms |
| Approvals | Voids, refunds, waivers, merges, cash shifts |
| Disputes | Facility disputes with deadlines and evidence |
| Reports | Daily summary, waits (median and 90th percentile), estimate accuracy, heat map, doctor activity, finance by insurer, staff accountability; export with step-up |
| Audit | Facility audit log; weekly unusual-access report with sign-off |
| Branding | Letterhead, logo, stamp, footer |
| Setup | Checklist and go-live until live |

**Never sees:** clinical content unless also a doctor; other facilities; cannot approve own void or refund (except a one-person clinic, flagged).

## 6. Super admin (MediLink team)

**Focal point:** applications waiting, oldest first, and anything that makes the network untrustworthy.

| Section | Sees · does |
|---|---|
| Overview | Applications waiting, licences expiring, facilities by status, **facilities with stale live data**, escalated disputes, break-glass to review, platform health (API, notification delivery, push opt-in) |
| Applications | Pipeline, documents, duplicates, notes; approve, request changes, reject with step-up |
| Facilities | Status, licences, feature flags, network map, data health; setup, go-live, suspend, reactivate, deactivate, warnings |
| Public listing check | How each facility appears to patients; hide a facility with wrong data |
| Master data | Locations, facility types, services, insurers, drugs, ICD-10, symptoms, "Treats" tags, holidays, reason codes (rw/en/fr) |
| Triage and AI | Triage logs (input as codes, result, rules version), missed red flags, symptom trends by district; rules versions after clinical sign-off; later model versions and shadow results |
| Disputes | Escalated cases with frozen evidence; final decision with step-up |
| Merges | Cross-facility and escalated merges, claims |
| Support | Request queue, help articles, announcements, notification templates and delivery log |
| Reports | Network, adoption, quality, patients, revenue (aggregates only) |
| Security and audit | Platform audit log, break-glass log and reviews, security events, staff MFA coverage |
| Settings | Strike rules, dispute deadlines, feature flag defaults |

**Never:** browse clinical records (only dispute evidence or break-glass: reason, step-up, 60 minutes read-only, visible to the patient, reviewed by another admin); edit facility records; see individual patients in reports. Access only through the VPN or IP allowlist, with passkeys.

## 7. Waiting-room display

Deep-forest full screen: "Now serving G-022 → Room 4" in very large figures, the next numbers per service, a clock, one announcement line, a chime and a **spoken call** of the number in Kinyarwanda (proposed FR-QUE-21). No names, ever. Opened with a revocable link; read-only.
