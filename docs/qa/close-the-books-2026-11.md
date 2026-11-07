# Close the books · 2026-11-04

Status: Done for W10 ([upgrade 13](../upgrade/13-full-visit-plan.md) §3, #209) · Owner: QA

This record lists the sprint issues of M1 that stayed open after their build merged. For each one it says what is built (with the pull requests) and what is truly left. "Left" is one of three kinds:

- **Staging:** a check that needs the staging environment in Rwanda, real devices, Mailpit end to end or a load run. These wait for #17 and are copied to its checklist.
- **Evidence:** a check whose test exists and passes in CI, but whose acceptance row still says Pending. Filling the evidence column is release work, not build work.
- **Gap:** something not built.

An issue is closed when only staging checks and evidence remain. It stays open when a gap remains.

## Summary

| Issue | Sprint | Built | Left | Decision |
|---|---|---|---|---|
| #31 | S1 · Platform and onboarding | Backend and frontend; S1-I6 now goes through S9 `dispatch()` | Staging: S1-I4 (ClamAV, S3 storage, files origin headers). Evidence rows | Close |
| #61 | S2 · Facility setup and staff | Backend (#63), frontend; invitations, service points, go-live check | Staging: S2-I2 (Mailpit end to end), S2-I3 (real API). Evidence rows | Close |
| #71 | S4 · Visits and the live queue | Backend, reception board, My queue, display, patient tracker; triage stage (#211) | Staging: S4-I2 (two browsers on the real API), S4-I4 (load). S4-I3 has a code path and unit test, no end-to-end test | Close |
| #77 | S5a · Booking core | Discovery, slots and holds, booking, remote join, booked check-in, no-shows | Staging: S5-I2 (real API, two browsers), S5-I3 (load) | Close |
| #78 | S5b · Disruptions, follow-ups, calendars | Disruptions with patient responses (S5-B13), follow-ups (B14), calendar feed (B15); reception calendar, disruption wizard, follow-up action | Evidence rows only | Close |
| #33 | S9 · Notification engine | Engine, channels (in-app, email, web push), preferences, announcements; staff and patient screens | Staging: S9-I2 (web push on real Chrome and Firefox), S9-I4 (Mailpit in three languages). S9-I1 and I3 now have their frontend | Close |
| #123 | S7 · Pharmacy and documents | S7a (#125, #133, #134), S7b documents, verification and share links (#142); stock (#218), label pictograms (#221) | Staging: S7-I1, I2 | Close |
| #137 | S8 · Billing, payments, insurance | Backend (#139); staff screens: bills and bill page, payment stage, shifts, approvals, receipt print (S8-F1..F5); claims and shift summary (#219) | **Gap:** patient My bills in patient-web (S8-F6; the API exists). Staging: S8-I1, I2. The S8-F row of the acceptance record says "Not started" and is stale | Keep open |
| #140 | S6b · Results inbox, import, back-entry, break-glass | Results inbox, scans, back-entry, health attributes, break-glass console | **Gap:** legacy register import with preview, confirm and rollback (S6-B19) and its import wizard (S6-F7). Staging: S6-I2, I3 | Keep open |

## Update · 2026-11-07 (pre-launch cleanup)

The two gaps above are built, and the disputes screens with them:

| Issue | Was left | Built | Now |
|---|---|---|---|
| #137 | Patient My bills (S8-F6) | `/dashboard/bills`, balance first; bill detail with shares, payments and receipt numbers; overview reminder (#283) | Closed. Staging S8-I1, I2 stay in #17 |
| #140 | Legacy register import (S6-B19) and its wizard (S6-F7) | Backend from the 2026-11-02 branch, migrations renumbered after the lab loop; staff import wizard (#285) | Closed. Staging S6-I2, I3 stay in #17 |
| #263 | Disputes screens (S10b-F1..F3) | Patient, staff and platform screens, mocks and tests (#284) | Closed |

Kinyarwanda day and month names now go through `dateFormat()` on every screen (#283, closes #9).

## Staging checks moved to #17

S1-I4 · S2-I2, I3 · S4-I2, I4 · S5-I2, I3 · S6-I2, I3 · S7-I1, I2 · S8-I1, I2 · S9-I2, I4

## Notes

- The acceptance records (`sprint-N-acceptance.md`) still say Pending on most rows. Their tests exist and run in CI on every pull request; recording the evidence per row is part of the release checklist, not of these issues.
- The [traceability matrix](traceability-matrix.md) summary was recounted from its rows on this date.
- FR-QUE-22 (triage) and FR-CLN-11 (laboratory loop) were already in the analysis documents ([06](../analysis/06-visit-lifecycle-and-queue.md), [07](../analysis/07-clinical-documentation-and-pharmacy.md)) and in the matrix from #200 and #201.
