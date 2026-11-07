/**
 * S10 part 2a disputes (contract sprint-10b-disputes §3): a patient (or a guardian, or reception
 * at the counter) raises a dispute from a visit, ticket, booking, missed-visit strike,
 * prescription, bill or document; the facility handles it in a thread under deadlines that
 * escalate to the platform, which records the final decision.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import type { Paginated } from "./clinical";

export type DisputeSubjectType =
  "visit" | "ticket" | "booking" | "no_show_strike" | "prescription" | "bill" | "document";
export type DisputeType = "billing" | "medication" | "queue_booking" | "record_correction";
export type DisputeStatus =
  | "open"
  | "acknowledged"
  | "under_review"
  | "info_requested"
  | "resolved"
  | "escalated"
  | "final_decision"
  | "closed"
  | "reopened";
export type DisputeOutcome =
  | "no_show_reversed"
  | "record_corrected"
  | "correction_refused"
  | "refund"
  | "bill_correction"
  | "rebooking"
  | "rejected";
export const DISPUTE_OUTCOMES: readonly DisputeOutcome[] = [
  "no_show_reversed",
  "record_corrected",
  "correction_refused",
  "refund",
  "bill_correction",
  "rebooking",
  "rejected",
];
/** Statuses that still wait for someone (the staff "Open" tab). */
export const DISPUTE_OPEN_STATUSES: readonly DisputeStatus[] = [
  "open",
  "acknowledged",
  "under_review",
  "info_requested",
  "resolved",
  "escalated",
  "reopened",
];
/** Subject → type (contract §2.1). */
export const DISPUTE_TYPE_OF: Record<DisputeSubjectType, DisputeType> = {
  bill: "billing",
  prescription: "medication",
  visit: "queue_booking",
  ticket: "queue_booking",
  booking: "queue_booking",
  no_show_strike: "queue_booking",
  document: "record_correction",
};
/** Outcomes that fit a subject (backend `_actions`): the rest are refused with `422`. */
export function outcomesFor(
  subject: DisputeSubjectType,
  hasConsultation: boolean,
): DisputeOutcome[] {
  return DISPUTE_OUTCOMES.filter((o) => {
    if (o === "no_show_reversed") return subject === "no_show_strike" || subject === "booking";
    if (o === "refund" || o === "bill_correction") return subject === "bill";
    if (o === "record_corrected" || o === "correction_refused") return hasConsultation;
    return true;
  });
}

export const DISPUTE_LIMITS = { description: [10, 3000], message: [2, 3000], reason: [5, 1000] };

export interface DisputeRow {
  id: Uuid;
  patient_id: Uuid;
  patient_display_name: string;
  facility_name: string;
  channel: "app" | "counter";
  type: DisputeType;
  subject_type: DisputeSubjectType;
  subject_id: Uuid;
  /** IDs, numbers, amounts, times and statuses of the subject, frozen at creation. */
  subject_snapshot: Record<string, string | number | null>;
  status: DisputeStatus;
  handler_level: "facility" | "platform";
  acknowledge_by: string;
  decide_by: string | null;
  is_overdue: boolean;
  outcome: DisputeOutcome | "";
  created_at: string;
  version: number;
}

export interface DisputeMessage {
  id: Uuid;
  author_name: string;
  author_role: "patient" | "handler" | "staff" | "platform";
  visibility: "thread" | "internal" | "staff_comment";
  body: string;
  created_at: string;
}

export interface DisputeEvent {
  from_status: string;
  to_status: string;
  actor_name: string;
  reason: string;
  occurred_at: string;
}

/** P2: the patient's view; never internal notes or staff comments. */
export interface PatientDispute extends DisputeRow {
  description: string;
  decision_reason: string;
  resolved_at: string | null;
  closed_at: string | null;
  can_accept: boolean;
  can_escalate: boolean;
  can_reopen: boolean;
  can_add_statement: boolean;
  statement: string;
  messages: DisputeMessage[];
  events: DisputeEvent[];
}

export interface StaffDisputeRow extends DisputeRow {
  /** 3 or more rejected disputes: review, never block. */
  flagged: boolean;
}

export interface StaffDispute extends StaffDisputeRow {
  description: string;
  decision_reason: string;
  resolved_at: string | null;
  statement: string;
  /** False for a handler involved in the evidence or asked for a comment (FR-DSP-08). */
  can_decide: boolean;
  messages: DisputeMessage[];
  events: DisputeEvent[];
  evidence: { action: string; at: string; actor_name: string }[];
  actions: {
    id: Uuid;
    outcome: DisputeOutcome;
    linked_object_type: string;
    linked_object_id: Uuid | null;
    status: "pending" | "done";
    done_at: string | null;
  }[];
  comment_requests: {
    id: Uuid;
    member_name: string;
    membership_id: Uuid;
    responded_at: string | null;
  }[];
}

export interface RaiseDisputeInput {
  patient_id: Uuid;
  subject_type: DisputeSubjectType;
  subject_id: Uuid;
  description: string;
}

const P = "/api/v1/patient/disputes";
const S = "/api/v1/staff/disputes";
const PL = "/api/v1/platform/disputes";

export const disputesPaths = {
  patient: P + "/",
  patientOne: (id: Uuid) => `${P}/${id}/`,
  patientStep: (id: Uuid, step: "messages" | "accept" | "escalate" | "reopen" | "disagreement") =>
    `${P}/${id}/${step}/`,
  staff: S + "/",
  staffOne: (id: Uuid) => `${S}/${id}/`,
  staffStep: (
    id: Uuid,
    step: "acknowledge" | "request-info" | "messages" | "comment-requests" | "comments" | "resolve",
  ) => `${S}/${id}/${step}/`,
  platform: PL + "/",
  platformOne: (id: Uuid) => `${PL}/${id}/`,
  platformStep: (id: Uuid, step: "messages" | "final-decision") => `${PL}/${id}/${step}/`,
};

function query(params: Record<string, string | number | boolean | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createDisputesApi(client: ApiClient) {
  return {
    patient: {
      /** P1 */
      list: (params: { patient_id?: Uuid; page?: number } = {}) =>
        client.get<Paginated<DisputeRow>>(disputesPaths.patient + query(params)),
      /** P1: `422` with 5 open, `409` when this subject already has one open. */
      raise: (body: RaiseDisputeInput) => client.post<PatientDispute>(disputesPaths.patient, body),
      /** P2 */
      get: (id: Uuid) => client.get<PatientDispute>(disputesPaths.patientOne(id)),
      /** P3: a reply in `info_requested` moves it back to `under_review`. */
      message: (id: Uuid, body: string) =>
        client.post<PatientDispute>(disputesPaths.patientStep(id, "messages"), { body }),
      /** P4 */
      accept: (id: Uuid, version: number) =>
        client.post<PatientDispute>(disputesPaths.patientStep(id, "accept"), { version }),
      escalate: (id: Uuid, version: number) =>
        client.post<PatientDispute>(disputesPaths.patientStep(id, "escalate"), { version }),
      reopen: (id: Uuid, version: number) =>
        client.post<PatientDispute>(disputesPaths.patientStep(id, "reopen"), { version }),
      /** P5: only after `correction_refused`, once. */
      disagreement: (id: Uuid, statement: string) =>
        client.post<PatientDispute>(disputesPaths.patientStep(id, "disagreement"), { statement }),
    },
    staff: {
      /** S1: `status=open` for everything not closed; oldest deadline first. */
      list: (params: { status?: string; overdue?: boolean; page?: number } = {}) =>
        client.get<Paginated<StaffDisputeRow>>(disputesPaths.staff + query(params)),
      /** S3 */
      get: (id: Uuid) => client.get<StaffDispute>(disputesPaths.staffOne(id)),
      /** S4 */
      acknowledge: (id: Uuid, version: number) =>
        client.post<StaffDispute>(disputesPaths.staffStep(id, "acknowledge"), { version }),
      requestInfo: (id: Uuid, version: number, body: string) =>
        client.post<StaffDispute>(disputesPaths.staffStep(id, "request-info"), { version, body }),
      /** S5: `thread` reaches the patient; `internal` stays with the facility. */
      message: (id: Uuid, body: string, visibility: "thread" | "internal") =>
        client.post<StaffDispute>(disputesPaths.staffStep(id, "messages"), { body, visibility }),
      /** S6 */
      askComment: (id: Uuid, membership_id: Uuid) =>
        client.post<StaffDispute>(disputesPaths.staffStep(id, "comment-requests"), {
          membership_id,
        }),
      /** S7: the requested member. */
      comment: (id: Uuid, body: string) =>
        client.post<StaffDispute>(disputesPaths.staffStep(id, "comments"), { body }),
      /** S8 */
      resolve: (id: Uuid, body: { version: number; outcome: DisputeOutcome; reason: string }) =>
        client.post<StaffDispute>(disputesPaths.staffStep(id, "resolve"), body),
    },
    platform: {
      /** PL1: escalated and platform-level disputes. */
      list: (params: { page?: number } = {}) =>
        client.get<Paginated<StaffDisputeRow>>(disputesPaths.platform + query(params)),
      get: (id: Uuid) => client.get<StaffDispute>(disputesPaths.platformOne(id)),
      /** PL2 */
      message: (id: Uuid, body: string) =>
        client.post<StaffDispute>(disputesPaths.platformStep(id, "messages"), { body }),
      /** PL2: step-up. */
      finalDecision: (
        id: Uuid,
        body: { version: number; outcome: DisputeOutcome; reason: string },
      ) => client.post<StaffDispute>(disputesPaths.platformStep(id, "final-decision"), body),
    },
  };
}

export type DisputesApi = ReturnType<typeof createDisputesApi>;
