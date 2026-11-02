# Sprint 10 contract, part 2a: Disputes

Status: v0.1 · 2026-11-02 · Wave 6 ([M1 master plan](../../superpowers/plans/2026-10-31-m1-completion-master-plan.md)) · Template and shared-file protocol: [contracts README](README.md) · Conventions: [API conventions](../02-api-conventions.md) · Part 1: [help and support](sprint-10-help-support.md)

**Sprint goal:** a patient (or a guardian, or reception at the counter) raises a dispute from the thing that went wrong: a visit, ticket, booking, missed-visit strike, prescription, bill or document. The system attaches the facts (the subject's snapshot and its audit trail). The facility handles it in a thread with internal notes and comments from involved staff, under deadlines that escalate to the platform on their own. The decision creates real actions: a strike reversed now, or a pending action for the bill, the record or a rebooking.

Requirements: FR-DSP-01..10. Analysis: [10 · Disputes](../../analysis/10-disputes-complaints-and-support.md) §2, §3, §6. Database: [database design](../04-database-design.md) §5.13. Security: [04 authorisation](../../security/04-authorization-and-tenant-isolation.md) §3.

Reserved names: backend app `medilink.disputes`; staff-web feature `disputes`; patient-web feature `disputes`; api-client module `disputes`; translation namespace `disputes` in both apps.

## 1. Scope

| In | Out (later) |
|---|---|
| Raise from a subject: `visit`, `ticket`, `booking`, `no_show_strike`, `prescription`, `bill`, `document`; type derived from the subject | Photo and file evidence uploads (S1 uploads exist; a later PR adds `evidence/` uploads with scanning) |
| Channels: app (patient or guardian), counter (reception, `queue.operate`) | Facility ↔ platform disputes (`/staff/platform-disputes/`), privacy disputes to the platform directly |
| Lifecycle of analysis 10 §3 with deadlines (72 h acknowledge, 10 days decide, 7 days to accept, 14 days to disagree, 30 days to reopen once) and an hourly job | Refund, bill correction and rebooking *execution* (S8 owns bills; the action is recorded `pending` with the linked object) |
| Thread, internal notes, comment requests and staff comments; evidence view frozen at creation | Complaints, ratings, quality score (P2) |
| Outcomes: `no_show_reversed` reverses the strike now (S5 `reverse_no_show`); `record_corrected` and `correction_refused` link the consultation; `refund`, `bill_correction`, `rebooking` recorded pending; `rejected` | Dispute reports (part 2b) |
| Conflict of interest; one-person facility straight to the platform | |
| Abuse: 5 open per patient, one open per subject, repeated rejected flagged | |
| Patient disagreement statement when a correction is refused (FR-DSP-07) | |
| Notifications through S9 (`disputes.*` events) | |

## 2. Domain model (`medilink.disputes`)

| Table | Key columns | Notes |
|---|---|---|
| `disputes_dispute` | `facility_id`, `patient_id`, `raised_by_account_id NULL`, `raised_by_membership_id NULL`, `channel` (`app`, `counter`), `type` (`billing`, `medication`, `queue_booking`, `record_correction`), `subject_type`, `subject_id`, `subject_snapshot jsonb`, `description_enc`, `status`, `handler_level` (`facility`, `platform`), `acknowledge_by`, `decide_by NULL`, `acknowledged_at NULL`, `resolved_at NULL`, `escalated_at NULL`, `closed_at NULL`, `reopen_count`, `outcome NULL`, `decision_reason NULL`, `version` | Forced RLS (`facility_isolation`). Partial unique (`subject_type`, `subject_id`) where open |
| `disputes_dispute_event` | `dispute_id`, `from_status`, `to_status`, `actor_id NULL` (null = system), `reason`, `occurred_at` | Append-only |
| `disputes_message` | `dispute_id`, `author_user_id`, `author_role` (`patient`, `handler`, `staff`, `platform`), `visibility` (`thread`, `internal`, `staff_comment`), `body_enc` | Append-only; patients never read `internal` or `staff_comment` |
| `disputes_evidence` | `dispute_id`, `kind` (`audit_extract`, `record_snapshot`), `snapshot jsonb`, `snapshot_sha256` | Append-only; frozen at creation; IDs, actions and times only |
| `disputes_comment_request` | `dispute_id`, `requested_membership_id`, `requested_by_id`, `responded_message_id NULL`, `responded_at NULL` | |
| `disputes_action` | `dispute_id`, `outcome`, `linked_object_type NULL`, `linked_object_id NULL`, `status` (`pending`, `done`), `created_by_id`, `done_at NULL` | |
| `disputes_disagreement` | `dispute_id` **unique**, `consultation_id`, `patient_id`, `statement_enc`, `created_by_account_id` | Database design `clinical_disagreement_statement`, owned by `disputes` (D-1) |

Statuses: `open` → `acknowledged` → `under_review` ⇄ `info_requested` → `resolved` → `closed`; `escalated` → `final_decision` → `closed`; `closed` → `reopened` → `under_review` (once, within 30 days).

### 2.1 Rules

| Topic | Rule |
|---|---|
| Subject | The subject must belong to the patient and the facility. Type: bill → `billing`, prescription → `medication`, visit/ticket/booking/strike → `queue_booking`, document → `record_correction`. The snapshot holds IDs, numbers, amounts, times and statuses, never clinical text |
| Evidence | At creation: the audit entries whose `object_id` is the subject (action, time, actor name), frozen with a SHA-256 |
| Who raises | Linked accounts (self, guardian) through the app; reception with `queue.operate` at the counter |
| Limits | 5 open disputes per patient (`422 too_many_open`); one open dispute per subject (`409 already_open`); patients with 3 or more `rejected` outcomes are flagged in the staff list (never blocked) |
| Routing | Facility handlers have `disputes.handle`. A facility where only one active member has `disputes.handle` routes the dispute to the platform at once (`handler_level=platform`) |
| Conflict of interest | A handler who is the subject's actor in the evidence, or was asked for a comment, cannot acknowledge or resolve (`422 conflict_of_interest`); they can still comment |
| Deadlines | `acknowledge_by` = raised + 72 h; `decide_by` = acknowledged + 10 days. Job (hourly): past `acknowledge_by` in `open`, or past `decide_by` in `acknowledged`/`under_review`/`info_requested` → `escalated`; `resolved` for 7 days → `closed` |
| Patient after resolve | Accept → `closed`; disagree within 14 days → `escalated`; after `closed`, reopen once within 30 days → `reopened` → `under_review` |
| Outcomes | `no_show_reversed` (subject must be the strike or its booking: S5 `reverse_no_show` runs in the same transaction; action `done`); `record_corrected` (action `pending`, linked consultation: the author adds an addendum); `correction_refused` (reason required; the patient may then file one disagreement statement linked to the consultation); `refund`, `bill_correction`, `rebooking` (`pending`, linked object); `rejected` |
| Platform | Platform admins see escalated and platform-level disputes (SECURITY DEFINER listing), message the patient and record the final decision with step-up |
| Encryption | Description, messages and statements encrypted (`patients.crypto`, as S7 D-3) |

## 3. Endpoints

| # | Method and path | Permission | Notes |
|---|---|---|---|
| P1 | `GET`, `POST /patient/disputes/` | linked account | `POST {patient_id, subject_type, subject_id, description}` |
| P2 | `GET /patient/disputes/{id}/` | linked account | Thread only; no internal notes or staff comments |
| P3 | `POST /patient/disputes/{id}/messages/` | linked account | `{body}`; replying in `info_requested` moves it back to `under_review` |
| P4 | `POST /patient/disputes/{id}/accept/` · `…/escalate/` · `…/reopen/` | linked account | `{version}`; deadlines as §2.1 |
| P5 | `POST /patient/disputes/{id}/disagreement/` | linked account | `{statement}`; only after `correction_refused` |
| S1 | `GET /staff/disputes/` | `disputes.handle` | `status`, `overdue=true`; flags |
| S2 | `POST /staff/disputes/` | `queue.operate` | Counter: `{facility_patient_id, subject_type, subject_id, description}` |
| S3 | `GET /staff/disputes/{id}/` | `disputes.handle` or a comment request to me | Thread, internal notes, comments, evidence, actions |
| S4 | `POST /staff/disputes/{id}/acknowledge/` · `…/request-info/` | `disputes.handle` | `{version}` (+ `{message}` for request-info) |
| S5 | `POST /staff/disputes/{id}/messages/` | `disputes.handle` | `{body, visibility: thread or internal}` |
| S6 | `POST /staff/disputes/{id}/comment-requests/` | `disputes.handle` | `{membership_id}` |
| S7 | `POST /staff/disputes/{id}/comments/` | `disputes.comment` (the requested member) | `{body}` |
| S8 | `POST /staff/disputes/{id}/resolve/` | `disputes.handle` | `{version, outcome, reason}`; actions created |
| PL1 | `GET /platform/disputes/` · `GET …/{id}/` | platform admin | Escalated and platform-level |
| PL2 | `POST /platform/disputes/{id}/messages/` · `…/final-decision/` | platform admin | Final decision: step-up, `{version, outcome, reason}` |

## 4. Notifications (S9 registry)

`disputes.updated` (patient: status changes and handler messages, important, in-app + push + email), `disputes.opened` (facility handlers, in-app), `disputes.comment_requested` (the member, in-app), `disputes.escalated` (platform admins, in-app + email). No dispute text in any notice.

## 5. Frontend

| App | Route | Screen |
|---|---|---|
| patient-web | `/disputes`, `/disputes/new?subject_type=&subject_id=&patient_id=`, `/disputes/:id` | My disputes; raise (what went wrong, in words); thread with deadlines, accept / disagree / reopen, disagreement statement. "Report a problem" links on the visit, medicines and documents pages |
| staff-web | `/disputes`, `/disputes/:id` | Facility queue (Open, Overdue, All) with flags; detail with evidence timeline, thread, internal notes, comment requests, acknowledge, ask for information, resolve |
| staff-web | `/platform/disputes`, `/platform/disputes/:id` | Escalated cases; message and final decision |

## 6. Acceptance checks

| # | Check |
|---|---|
| S10b-B1 | Every endpoint in the schema; `spectacular --validate --fail-on-warn` |
| S10b-B2 | Subject ownership: another patient's or facility's subject `404`; type derived; snapshot without clinical text |
| S10b-B3 | Limits: 6th open `422`, same subject `409`, flag after 3 rejected |
| S10b-B4 | Lifecycle transitions and `409` on stale `version`; patients never see internal notes or staff comments |
| S10b-B5 | Deadlines job escalates and closes; one-person facility routes to the platform |
| S10b-B6 | Conflict of interest refuses the involved handler |
| S10b-B7 | `no_show_reversed` reverses the strike in the same transaction; other outcomes create pending actions; disagreement statement only after `correction_refused` |
| S10b-B8 | Forced RLS on facility tables; append-only events, messages and evidence; text encrypted; audit IDs only; notifications sent |
| S10b-F1 | patient-web raise, thread, accept/disagree/reopen, statement; axe clean |
| S10b-F2 | staff-web queue and detail with evidence, notes, comments, resolve; platform final decision; axe clean |
| S10b-F3 | MSW mocks for every endpoint; `disputes` namespaces in rw/en/fr |

## 7. Decisions

| # | Decision | Why |
|---|---|---|
| D-1 | The disagreement statement lives in `disputes_disagreement` (database design names `clinical_disagreement_statement`) | Only disputes write it; S6 stays unchanged; staff reading the consultation see it through the dispute |
| D-2 | Evidence uploads are not in part 2a | Uploads need the scan pipeline and a review of what a photo may show; the frozen audit extract covers the facts |
| D-3 | Refund, bill correction and rebooking are recorded as pending actions | The bill or slot belongs to S8/S5 screens; the handler completes them there and the action links the object |
