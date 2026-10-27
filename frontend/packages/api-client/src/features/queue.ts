/**
 * S4 visits and the live queue (contract sprint-04 §3): check-in, boards, call next, ticket
 * actions, duty status, reorder reviews, display links, public display and the patient tracker.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";

export type Stage = "reception" | "payment" | "consultation" | "pharmacy";
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
  | "reorder";

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
  flags: string[];
  priority_rank: number;
  arrival_at: string;
  called_at: string | null;
  assigned_membership_id: Uuid | null;
  service_point: string | null;
  step_out_until: string | null;
  position: number | null;
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
}

export interface CheckInResult {
  visit_id: Uuid;
  created: boolean;
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
  attention: Record<string, number>;
  updated_at: string;
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
    board: () => client.get<QueueBoard>(queuePaths.board),
    mine: () => client.get<MyQueue>(queuePaths.mine),
    /** `null` when nobody is waiting (204). */
    callNext: (body: { service_id: Uuid; stage?: Stage; service_point_id?: Uuid | null }) =>
      client
        .post<TicketRow | undefined>(queuePaths.callNext, body)
        .then((ticket) => ticket ?? null),
    act: (id: Uuid, action: TicketAction, body: TicketActionInput) =>
      client.post<TicketRow>(queuePaths.ticket(id, action), body),
    duty: () => client.get<DutyRow>(queuePaths.duty),
    operations: () => client.get<Operations>(queuePaths.operations),
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
