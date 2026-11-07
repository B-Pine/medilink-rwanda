/**
 * S4 visits and the live queue (contract sprint-04 §3): check-in, boards, call next, ticket
 * actions, duty status, reorder reviews, display links, public display and the patient tracker.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import type { SymptomInput } from "./booking";

/**
 * `triage` (upgrade 06 §2, #200): optional, between check-in and the doctor. `lab` (#201): a loop
 * out of the consultation; the patient comes back to the doctor when every result is in.
 */
export type Stage = "reception" | "payment" | "triage" | "consultation" | "lab" | "pharmacy";
/** The triage nurse's decision (#200); not the symptom checker's `TriageUrgency`. */
export type NurseUrgency = "normal" | "priority" | "emergency";
export type TicketState =
  | "waiting"
  | "called"
  | "in_service"
  | "no_response"
  | "on_hold"
  | "moved_to_next_stage"
  | "transferred"
  | "cancelled"
  | "left_without_service"
  | "completed";
export type DutyState = "on_duty" | "break" | "emergency" | "off";
export type PriorityClass = "elderly" | "pregnant" | "disability" | "very_sick";
export type TicketAction =
  | "recall"
  | "no-response"
  | "start"
  | "hold"
  | "return"
  | "complete"
  | "next-stage"
  | "transfer"
  | "cancel"
  | "left"
  | "step-out"
  | "priority"
  /** upgrade 05 §2: reception raises a patient to emergency; a reason is required. */
  | "emergency"
  /** S5 (R4 #102): reception confirms a remote joiner is on site; `{version}`. */
  | "confirm-arrival"
  | "reorder"
  /** #200: the triage nurse sets the urgency and sends the patient to the doctor. */
  | "triage"
  /**
   * #201: the doctor sends the patient in service to the lab (`422` without an ordered test).
   * The consultation stays a draft; the patient comes back when every result is in.
   */
  | "send-to-lab";

export interface TicketRow {
  id: Uuid;
  visit_id: Uuid;
  number: string;
  state: TicketState;
  stage: Stage;
  service_id: Uuid;
  display_name: string;
  age_years: number | null;
  sex: string | null;
  /** `emergency`, `priority:<class>`, `return`, `stepped_out`, `no_response`. */
  /**
   * `emergency`, `priority:<class>`, `return`, `stepped_out`, `no_response`; S5 adds `late`,
   * `remote` and `remote_claimed` (remote joiner not confirmed, with or without "I'm here").
   */
  flags: string[];
  priority_rank: number;
  arrival_at: string;
  called_at: string | null;
  assigned_membership_id: Uuid | null;
  service_point: string | null;
  step_out_until: string | null;
  position: number | null;
  /** S5: slot time of a booked ticket in its grace window; null for walk-ins and late arrivals. */
  slot_starts_at: string | null;
  /** S5: a booked patient who arrived after the grace window; queued as a walk-in. */
  late: boolean;
  /** S5: joined today's queue from the phone (FR-SCH-09). */
  is_remote: boolean;
  /** S5: the patient tapped "I'm here" (intent only, reception confirms). */
  remote_arrival_claimed_at: string | null;
  /** S5: reception confirmed the remote patient is on site. */
  remote_arrival_confirmed_at: string | null;
  /** upgrade 05 §2: the patient's own words at booking or check-in, and their symptoms. */
  reason_text: string;
  symptoms: string[];
  /** #200: known allergies, on triage tickets only (empty elsewhere). */
  allergies: string[];
  version: number;
}

export interface Estimate {
  min: number | null;
  max: number | null;
  status: "break" | "emergency" | "none_on_duty" | null;
  until: string | null;
}

export interface DutyRow {
  membership_id: Uuid;
  full_name: string;
  state: DutyState;
  service_point_id: Uuid | null;
  service_point: string | null;
  until_at: string | null;
}

export interface QueueGroup {
  service_id: Uuid;
  stage: Stage;
  waiting: TicketRow[];
  called: TicketRow[];
  in_service: TicketRow[];
  average_minutes: number;
  estimate_next: Estimate;
}

export interface QueueBoard {
  queues: QueueGroup[];
  duty: DutyRow[];
  updated_at: string;
}

export interface MyQueue {
  current: TicketRow | null;
  waiting: TicketRow[];
  duty: DutyRow | null;
  service_ids: Uuid[];
}

export interface CheckInInput {
  facility_patient_id?: Uuid;
  service_id?: Uuid;
  /** S5: check in a booking (its patient and service come with it). */
  booking_id?: Uuid;
  source?: "walk_in" | "emergency";
  priority_class?: PriorityClass | null;
  priority_reason_code?: string | null;
  reason_text?: string | null;
  insurance_profile_id?: Uuid | null;
  /** S5 (R4): optional symptoms at check-in (`captured_at_stage = check_in`). */
  symptoms?: SymptomInput[];
}

export interface CheckInResult {
  visit_id: Uuid;
  created: boolean;
  /** S5: a booking checked in after the grace window: queued as a walk-in ("offer a new time"). */
  late: boolean;
  ticket: TicketRow;
}

export interface TicketActionInput {
  version: number;
  stage?: Stage;
  service_id?: Uuid;
  reason_code?: string;
  reason_text?: string;
  minutes?: number;
  priority_class?: PriorityClass | null;
  before_ticket_id?: Uuid;
  /** When the action happened, for actions retried after a connection loss (FR-QUE-16). */
  client_occurred_at?: string;
  /**
   * `triage` (#200): the urgency (a priority needs `priority_class` and `reason_code`, an
   * emergency a reason), a short note, and why no vitals were taken when none were (`422`
   * otherwise).
   */
  urgency?: NurseUrgency;
  note?: string;
  no_vitals_reason?: string;
}

export interface TicketEventRow {
  id: Uuid;
  action: string;
  from_state: string;
  to_state: string;
  actor_name: string | null;
  reason_code: string;
  occurred_at: string;
  ticket_number: string;
}

export interface VisitDetail {
  id: Uuid;
  facility_patient_id: Uuid;
  display_name: string;
  source: string;
  status: string;
  is_emergency: boolean;
  priority_class: PriorityClass | null;
  checked_in_at: string | null;
  tickets: TicketRow[];
  events: TicketEventRow[];
  /** The follow-up the doctor set in this visit, for the printed card (#207). */
  follow_up: NextVisit | null;
}

export interface NextVisit {
  due_on: string;
  service_id: Uuid;
  /** Set when the follow-up was booked. */
  starts_at: string | null;
  booking_code: string;
  doctor_name: string;
}

export interface ReorderRow {
  event_id: Uuid;
  ticket_number: string;
  actor_name: string | null;
  reason_code: string;
  reason_text: string;
  old_position: string | null;
  new_position: string | null;
  occurred_at: string;
  reviewed: boolean;
}

export interface DisplayLink {
  id: Uuid;
  label: string;
  service_ids: Uuid[];
  revoked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface DisplayBoard {
  facility_name: string;
  services: {
    service_id: Uuid;
    name_i18n: Partial<Record<"rw" | "en" | "fr", string>>;
    now_serving: { number: string; service_point: string | null; state: TicketState }[];
    next: string[];
  }[];
  updated_at: string;
}

export interface PatientVisit {
  visit_id: Uuid;
  patient_id: Uuid;
  patient_display_name: string;
  facility_id: Uuid;
  facility_name: string;
  service_name_i18n: Partial<Record<"rw" | "en" | "fr", string>>;
  ticket_number: string;
  state: TicketState;
  stage: Stage;
  service_point: string | null;
  ahead: number;
  estimate: Estimate;
  leave_by: string | null;
  travel_minutes: number | null;
  /** S5: joined from the phone; "I'm here" applies until reception confirms the arrival. */
  is_remote: boolean;
  remote_arrival_claimed_at: string | null;
  remote_arrival_confirmed_at: string | null;
  version: number;
  updated_at: string;
}

export interface DayFigures {
  date: string;
  patients: number;
  completed: number;
  median_wait_min: number | null;
  p90_wait_min: number | null;
  avg_consult_min: number | null;
  left_rate_pct: number | null;
  walk_ins: number;
  emergencies: number;
}

/** Facility operations figures (analysis 13 §1-2, design 04 §3.4). Aggregates only. */
export interface Operations {
  today: DayFigures;
  same_day_last_week: DayFigures;
  trend: DayFigures[];
  now: { waiting: number; in_service: number; doctors_on_duty: number; doctors_on_break: number };
  services: {
    service_id: Uuid;
    name_i18n: Partial<Record<"rw" | "en" | "fr", string>>;
    waiting: number;
    in_service: number;
    longest_wait_min: number;
    doctors_on_duty: number;
    load: "low" | "medium" | "high";
  }[];
  arrivals_heatmap: { weekday: number; hour: number; count: number }[];
  /** Needs-your-attention counts (upgrade 05 §5); `licence_days_left` only when a licence is on file. */
  attention: Partial<Record<OperationsAttentionKey, number>>;
  /** Money today (S8): amounts in RWF and counts only. */
  finance: {
    collected_today_rwf: number;
    payments_today: number;
    bills_today: number;
    open_balance_rwf: number;
  };
  /** Today's bookings (S5). */
  bookings: {
    expected_today: number;
    checked_in_today: number;
    no_shows_today: number;
    no_show_rate_pct: number;
  };
  /** Staff on duty or on break now. */
  on_duty: { name: string; state: DutyState; room: string }[];
  updated_at: string;
}

export type OperationsAttentionKey =
  | "unreviewed_reorders"
  | "approvals_pending"
  | "shifts_to_review"
  | "unsigned_records"
  | "disputes_open"
  | "invitations_pending"
  | "staff_without_mfa"
  | "licence_days_left";

export type ReportGroup = "day" | "week" | "month";
export type ReportTable =
  "visits" | "sources" | "services" | "waits" | "diagnoses" | "money" | "lab" | "stock";
export interface ReportQuery {
  from?: string;
  to?: string;
  group?: ReportGroup;
}

/**
 * Facility report for a period (#205, upgrade 13 W6), for `reports.view`. Aggregates only, never
 * a patient name; sensitive diagnoses are counted, never named. Stock levels are now; stock
 * movements are for the period.
 */
export interface FacilityReport {
  from: string;
  to: string;
  group: ReportGroup;
  visits: {
    /** One row per day, ISO week (starts Monday) or month; `start` is its first day. */
    periods: {
      start: string;
      patients: number;
      completed: number;
      left_without_service: number;
      emergencies: number;
      no_shows: number;
    }[];
    totals: {
      patients: number;
      completed: number;
      left_without_service: number;
      emergencies: number;
      bookings_expected: number;
      no_shows: number;
      no_show_rate_pct: number | null;
    };
    by_source: { source: string; count: number }[];
    by_service: {
      service_id: Uuid;
      name_i18n: Partial<Record<"rw" | "en" | "fr", string>>;
      count: number;
    }[];
  };
  /** Joining the stage's queue on site to the first call. */
  waits: {
    stage: Stage;
    tickets: number;
    called: number;
    median_wait_min: number | null;
    p90_wait_min: number | null;
    left_without_service: number;
  }[];
  diagnoses: {
    signed_with_diagnosis: number;
    sensitive_count: number;
    top: { code: string; display: string; count: number }[];
    referrals_out: number;
    referrals_by_specialty: { specialty: string; count: number }[];
  };
  money: {
    collected_rwf: number;
    billed_rwf: number;
    by_method: { method: string; count: number; amount_rwf: number }[];
    by_insurer: {
      insurer_code: string;
      insurer_name: string;
      bills: number;
      insurer_share_rwf: number;
      patient_share_rwf: number;
    }[];
    exemptions: { reason: string; count: number; amount_rwf: number }[];
    voided_payments: { count: number; amount_rwf: number };
    voided_bills: number;
    credit_notes: { count: number; amount_rwf: number };
    refunds_paid_rwf: number;
  };
  lab: {
    ordered: number;
    cancelled: number;
    resulted: number;
    waiting: number;
    median_turnaround_min: number | null;
    p90_turnaround_min: number | null;
    by_test: {
      code: string;
      name: string;
      count: number;
      abnormal: number;
      median_turnaround_min: number | null;
    }[];
  };
  stock: {
    tracked: number;
    out_now: number;
    low_now: number;
    out_medicines: string[];
    received_units: number;
    dispensed_units: number;
    adjusted_units: number;
    expiring: {
      drug_code: string;
      display: string;
      batch_number: string;
      expiry_date: string;
      quantity_on_hand: number;
      is_expired: boolean;
    }[];
    expiring_window_days: number;
  };
}

function reportQuery(params: ReportQuery & { table?: ReportTable }): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params) as [string, string | undefined][]) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

const S = "/api/v1/staff";
export const queuePaths = {
  checkIn: `${S}/visits/check-in/`,
  visit: (id: Uuid) => `${S}/visits/${id}/`,
  board: `${S}/queue/board/`,
  mine: `${S}/queue/mine/`,
  callNext: `${S}/queue/call-next/`,
  reorders: `${S}/queue/reorders/`,
  review: (id: Uuid) => `${S}/queue/reorders/${id}/review/`,
  ticket: (id: Uuid, action: TicketAction) => `${S}/tickets/${id}/${action}/`,
  duty: `${S}/duty-status/`,
  operations: `${S}/reports/operations/`,
  report: (params: ReportQuery = {}) => `${S}/reports/facility/${reportQuery(params)}`,
  /** CSV of one table, UTF-8 with BOM; audit-logged on the server. */
  reportExport: (table: ReportTable, params: ReportQuery = {}) =>
    `${S}/reports/facility/export/${reportQuery({ ...params, table })}`,
  displayLinks: `${S}/display-links/`,
  revokeDisplay: (id: Uuid) => `${S}/display-links/${id}/revoke/`,
  display: (token: string) => `/api/v1/display/${encodeURIComponent(token)}/`,
  patientVisits: "/api/v1/patient/visits/active/",
  patientCancel: (id: Uuid) => `/api/v1/patient/visits/${id}/cancel/`,
  travelTime: (facilityId: Uuid) => `/api/v1/patient/travel-times/${facilityId}/`,
};

/** WebSocket paths (contract §3.3): notify-then-fetch messages, IDs only. */
export const queueSockets = {
  staff: "/ws/v1/staff/queue/",
  patient: "/ws/v1/patient/visits/",
  display: (token: string) => `/ws/v1/display/${encodeURIComponent(token)}/`,
};

const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : {});

export function createQueueApi(client: ApiClient) {
  return {
    checkIn: (body: CheckInInput, idempotencyKey?: string) =>
      client.post<CheckInResult>(queuePaths.checkIn, body, idem(idempotencyKey)),
    visit: (id: Uuid) => client.get<VisitDetail>(queuePaths.visit(id)),
    /**
     * S5 (R4 #102): reception confirms a remote joiner is on site. `422` when the ticket is not
     * remote or the arrival is already confirmed; `409` on a stale version.
     */
    confirmArrival: (ticket: Pick<TicketRow, "id" | "version">) =>
      client.post<TicketRow>(queuePaths.ticket(ticket.id, "confirm-arrival"), {
        version: ticket.version,
      }),
    board: () => client.get<QueueBoard>(queuePaths.board),
    /** The doctor's queue, the triage nurse's with `"triage"` (#200), the lab's with `"lab"` (#201). */
    mine: (stage?: "triage" | "lab") =>
      client.get<MyQueue>(stage ? `${queuePaths.mine}?stage=${stage}` : queuePaths.mine),
    /** `null` when nobody is waiting (204). */
    callNext: (body: { service_id: Uuid; stage?: Stage; service_point_id?: Uuid | null }) =>
      client
        .post<TicketRow | undefined>(queuePaths.callNext, body)
        .then((ticket) => ticket ?? null),
    act: (id: Uuid, action: TicketAction, body: TicketActionInput) =>
      client.post<TicketRow>(queuePaths.ticket(id, action), body),
    duty: () => client.get<DutyRow>(queuePaths.duty),
    operations: () => client.get<Operations>(queuePaths.operations),
    report: (params: ReportQuery = {}) => client.get<FacilityReport>(queuePaths.report(params)),
    setDuty: (body: {
      state: DutyState;
      service_point_id?: Uuid | null;
      until_at?: string | null;
    }) => client.request<DutyRow>("PUT", queuePaths.duty, { body }),
    reorders: (reviewed?: boolean) =>
      client.get<{ results: ReorderRow[] }>(
        `${queuePaths.reorders}${reviewed === undefined ? "" : `?reviewed=${reviewed}`}`,
      ),
    review: (eventId: Uuid, comment = "") =>
      client.post<void>(queuePaths.review(eventId), { comment }),
    displayLinks: () => client.get<{ results: DisplayLink[] }>(queuePaths.displayLinks),
    createDisplayLink: (body: { label: string; service_ids: Uuid[] }) =>
      client.post<{ link: DisplayLink; token: string }>(queuePaths.displayLinks, body),
    revokeDisplayLink: (id: Uuid) => client.post<DisplayLink>(queuePaths.revokeDisplay(id), {}),
    display: (token: string) => client.get<DisplayBoard>(queuePaths.display(token)),
    patientVisits: () => client.get<{ results: PatientVisit[] }>(queuePaths.patientVisits),
    cancelVisit: (id: Uuid) => client.post<PatientVisit>(queuePaths.patientCancel(id), {}),
    travelTime: (facilityId: Uuid) =>
      client.get<{ minutes: number | null }>(queuePaths.travelTime(facilityId)),
    setTravelTime: (facilityId: Uuid, minutes: number) =>
      client.request<{ minutes: number }>("PUT", queuePaths.travelTime(facilityId), {
        body: { minutes },
      }),
  };
}

export type QueueApi = ReturnType<typeof createQueueApi>;
