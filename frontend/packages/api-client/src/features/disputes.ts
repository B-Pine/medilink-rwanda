/**
 * S10 part 2a disputes (contract sprint-10b §3): patients raise and follow (P1-P5), facility
 * handlers decide (S1-S8), the platform takes escalated cases (PL1-PL2). Patient shapes never
 * carry internal notes or staff comments.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";

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
export const DISPUTE_OUTCOMES: DisputeOutcome[] = [
  "no_show_reversed",
  "record_corrected",
  "correction_refused",
  "refund",
  "bill_correction",
  "rebooking",
  "rejected",
];
/** Outcomes that fit each subject (the server refuses the rest). */
export const OUTCOMES_FOR: Record<DisputeSubjectType, DisputeOutcome[]> = {
  visit: ["rebooking", "rejected"],
  ticket: ["rebooking", "rejected"],
  booking: ["no_show_reversed", "rebooking", "rejected"],
  no_show_strike: ["no_show_reversed", "rejected"],
  prescription: ["record_corrected", "correction_refused", "rejected"],
  bill: ["refund", "bill_correction", "rejected"],
  document: ["record_corrected", "correction_refused", "rejected"],
};
export type DisputeVisibility = "thread" | "internal" | "staff_comment";
export type DisputeAuthorRole = "patient" | "handler" | "staff" | "platform";

export interface DisputeMessage {
  id: Uuid;
  author_name: string;
  author_role: DisputeAuthorRole;
  visibility: DisputeVisibility;
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

export interface DisputeRow {
  id: Uuid;
  patient_id: Uuid;
  patient_display_name: string;
  facility_name: string;
  channel: "app" | "counter";
  type: DisputeType;
  subject_type: DisputeSubjectType;
  subject_id: Uuid;
  /** IDs, numbers, amounts, times and statuses only. */
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

export interface StaffDisputeRow extends DisputeRow {
  /** 3 or more rejected disputes: review, never block. */
  flagged: boolean;
}

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

export interface StaffDispute extends StaffDisputeRow {
  description: string;
  decision_reason: string;
  resolved_at: string | null;
  statement: string;
  /** False for a handler who is involved (FR-DSP-08). */
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

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

const PAT = "/api/v1/patient/disputes";
const STF = "/api/v1/staff/disputes";
const PLT = "/api/v1/platform/disputes";

export const disputesPaths = {
  patientList: `${PAT}/`,
  patientOne: (id: Uuid) => `${PAT}/${id}/`,
  patientStep: (id: Uuid, step: string) => `${PAT}/${id}/${step}/`,
  staffList: `${STF}/`,
  staffOne: (id: Uuid) => `${STF}/${id}/`,
  staffStep: (id: Uuid, step: string) => `${STF}/${id}/${step}/`,
  platformList: `${PLT}/`,
  platformOne: (id: Uuid) => `${PLT}/${id}/`,
  platformStep: (id: Uuid, step: string) => `${PLT}/${id}/${step}/`,
};

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createDisputesApi(client: ApiClient) {
  const p = disputesPaths;
  return {
    patient: {
      list: (params: { patient_id?: Uuid; page?: number } = {}) =>
        client.get<Paginated<DisputeRow>>(p.patientList + query(params)),
      raise: (body: RaiseDisputeInput) => client.post<PatientDispute>(p.patientList, body),
      get: (id: Uuid) => client.get<PatientDispute>(p.patientOne(id)),
      message: (id: Uuid, body: string) =>
        client.post<PatientDispute>(p.patientStep(id, "messages"), { body }),
      accept: (id: Uuid, version: number) =>
        client.post<PatientDispute>(p.patientStep(id, "accept"), { version }),
      escalate: (id: Uuid, version: number) =>
        client.post<PatientDispute>(p.patientStep(id, "escalate"), { version }),
      reopen: (id: Uuid, version: number) =>
        client.post<PatientDispute>(p.patientStep(id, "reopen"), { version }),
      statement: (id: Uuid, statement: string) =>
        client.post<PatientDispute>(p.patientStep(id, "disagreement"), { statement }),
    },
    staff: {
      list: (params: { status?: string; overdue?: boolean; page?: number } = {}) =>
        client.get<Paginated<StaffDisputeRow>>(p.staffList + query(params)),
      raiseAtCounter: (
        body: Omit<RaiseDisputeInput, "patient_id"> & { facility_patient_id: Uuid },
      ) => client.post<StaffDisputeRow>(p.staffList, body),
      get: (id: Uuid) => client.get<StaffDispute>(p.staffOne(id)),
      acknowledge: (id: Uuid, version: number) =>
        client.post<StaffDispute>(p.staffStep(id, "acknowledge"), { version }),
      requestInfo: (id: Uuid, version: number, body: string) =>
        client.post<StaffDispute>(p.staffStep(id, "request-info"), { version, body }),
      message: (id: Uuid, body: string, visibility: "thread" | "internal") =>
        client.post<StaffDispute>(p.staffStep(id, "messages"), { body, visibility }),
      askComment: (id: Uuid, membershipId: Uuid) =>
        client.post<StaffDispute>(p.staffStep(id, "comment-requests"), {
          membership_id: membershipId,
        }),
      comment: (id: Uuid, body: string) =>
        client.post<StaffDispute>(p.staffStep(id, "comments"), { body }),
      resolve: (id: Uuid, body: { version: number; outcome: DisputeOutcome; reason: string }) =>
        client.post<StaffDispute>(p.staffStep(id, "resolve"), body),
    },
    platform: {
      list: (params: { page?: number } = {}) =>
        client.get<Paginated<StaffDisputeRow>>(p.platformList + query(params)),
      get: (id: Uuid) => client.get<StaffDispute>(p.platformOne(id)),
      message: (id: Uuid, body: string, visibility: "thread" | "internal") =>
        client.post<StaffDispute>(p.platformStep(id, "messages"), { body, visibility }),
      decide: (id: Uuid, body: { version: number; outcome: DisputeOutcome; reason: string }) =>
        client.post<StaffDispute>(p.platformStep(id, "final-decision"), body),
    },
  };
}

export type DisputesApi = ReturnType<typeof createDisputesApi>;
