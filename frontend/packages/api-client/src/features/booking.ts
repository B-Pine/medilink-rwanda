/**
 * S5 discovery and booking (contract sprint-05 §3): public search, facility profiles, slots and
 * symptoms; patient holds, bookings and remote join; staff bookings, phone booking and no-shows.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import type { PatientVisit } from "./queue";

export type I18n = Partial<Record<"rw" | "en" | "fr", string>>;
export type QueueLoad = "low" | "medium" | "high";
export type LevelOfCare = "primary" | "secondary" | "tertiary";
export type BookingStatus =
  "confirmed" | "cancelled" | "late_cancelled" | "no_show" | "checked_in" | "superseded";
export type BookingSource = "online" | "phone" | "follow_up" | "referral" | "rebooking";
export type BookingRuleCode =
  | "age_rule"
  | "sex_rule"
  | "limit_active"
  | "limit_strikes"
  | "same_day_service"
  | "hold_expired"
  | "cancel_closed"
  | "remote_closed"
  | "not_allowed"
  // S5b
  | "no_offer"
  | "resolved";

export interface FacilitySearchInput {
  service_code?: string;
  district_code?: string;
  sector_code?: string;
  /** Sent in the body only, never in a URL (contract D-2). */
  near?: { lat: number; lng: number } | null;
  insurer_code?: string;
  open_now?: boolean;
  level_of_care?: LevelOfCare | "";
  available_today?: boolean;
  /** Only facilities whose admin declares a 24-hour emergency department. */
  emergency?: boolean;
  page?: number;
}

export interface FacilityResult {
  slug: string;
  name: string;
  type: string;
  ownership: string;
  level_of_care: string;
  /** Declared by the facility admin (24-hour emergency department). */
  emergency_department: boolean;
  district: string;
  sector: string;
  distance_km: number | null;
  open_now: boolean;
  service_code: string;
  service_name_i18n: I18n;
  accepts_insurance: "yes" | "no" | "unknown";
  /** Accepted insurer codes, sorted (public-pages contract §2.1). No amounts (U-01, S5 D-14). */
  insurers: string[];
  next_slot_at: string | null;
  queue_load: QueueLoad | null;
  /** People waiting now and the wait for a new arrival (public-pages contract §2.1). */
  waiting: number | null;
  wait_range: WaitRange | null;
  allows_remote_join: boolean;
  referral_hint: boolean;
  lat: number | null;
  lng: number | null;
}

/** Minutes a new arrival can expect to wait. */
export interface WaitRange {
  min: number;
  max: number;
}

export interface FacilitySearchPage {
  count: number;
  page: number;
  results: FacilityResult[];
}

export interface PublicService {
  id: Uuid;
  code: string;
  name_i18n: I18n;
  /** Insurers that accept this service. No fee or share is published (U-01, S5 D-14). */
  insurers: string[];
  bookable: boolean;
  remote_join: boolean;
  walk_in: boolean;
  queue_load: QueueLoad | null;
  /** Live, counts only (public-pages contract §2.1); null when the queue is not published. */
  waiting: number | null;
  wait_range: WaitRange | null;
  next_slot_at: string | null;
  min_age_months: number | null;
  max_age_months: number | null;
}

export interface PublicFacility {
  slug: string;
  name: string;
  type: string;
  ownership: string;
  level_of_care: string;
  verified: boolean;
  emergency_department: boolean;
  description_i18n: I18n;
  address: string;
  phone: string;
  /** Set by the facility admin; empty when not given. */
  email: string;
  website: string;
  /** Stable public URLs of the admin's photos (each redirects to the image). */
  photos: string[];
  district: string;
  sector: string;
  lat: number | null;
  lng: number | null;
  open_now: boolean;
  /** [date, opens, closes] for the next 7 days. */
  hours: [string, string, string][];
  closures: { date: string; reason: string }[];
  services: PublicService[];
  doctors: {
    membership_id: Uuid;
    name: string;
    days: number[];
    service_ids: Uuid[];
    /** upgrade 05 §3: written by the doctor; empty when not made public. */
    specialty?: string;
    bio_i18n?: Partial<Record<"rw" | "en" | "fr", string>>;
    languages?: string[];
  }[];
}

export interface PublicSlot {
  id: Uuid;
  starts_at: string;
  ends_at: string;
  doctor: string | null;
  membership_id: Uuid | null;
  open_places: number;
}

export interface SlotWeek {
  service_id: Uuid;
  days: { date: string; slots: PublicSlot[] }[];
}

export interface Symptom {
  code: string;
  name_i18n: I18n;
  body_system: string;
  is_red_flag: boolean;
}

export interface Hold {
  hold_id: Uuid;
  expires_at: string;
}

export interface SymptomInput {
  code: string;
  duration_days?: number;
  severity?: "mild" | "moderate" | "severe" | "";
}

export interface BookInput {
  hold_id: Uuid;
  patient_id: Uuid;
  insurance_profile_id?: Uuid | null;
  symptoms: SymptomInput[];
  reason_text?: string;
}

export interface BookedSymptom {
  code: string;
  label: string;
  duration_days: number | null;
  severity: string;
}

export interface Booking {
  id: Uuid;
  booking_code: string;
  status: BookingStatus;
  source: BookingSource;
  patient_id: Uuid;
  patient_display_name: string;
  facility_slug: string;
  facility_name: string;
  service_id: Uuid;
  service_name_i18n: I18n;
  doctor: string | null;
  starts_at: string;
  ends_at: string | null;
  service_point: string | null;
  /** Which insurer and whether the facility accepts it; amounts appear only on the bill. */
  cost: {
    insurer_code: string | null;
    insurer_accepted: boolean | null;
  };
  symptoms: BookedSymptom[];
  can_change: boolean;
  change_until: string;
  rescheduled_to_id: Uuid | null;
  /** S5b: an unanswered disruption offer (the booking already shows the new time). */
  pending_change: PendingChange | null;
  version: number;
}

export interface StaffBooking {
  id: Uuid;
  booking_code: string;
  status: BookingStatus;
  source: BookingSource;
  patient_id: Uuid;
  facility_patient_id: Uuid | null;
  display_name: string;
  age_years: number | null;
  sex: string | null;
  service_id: Uuid;
  membership_id: Uuid | null;
  doctor: string | null;
  starts_at: string;
  symptoms: BookedSymptom[];
  late: boolean;
  /** S5b: a disruption offer waits for the patient's answer. */
  has_pending_change: boolean;
  visit_id: Uuid | null;
  version: number;
}

// ---- S5b: disruptions, follow-ups, calendars (contract sprint-05 §3 B10, B11, R7-R9) ----------

export type DisruptionKind = "doctor_absent" | "closure" | "schedule_change";
export type DisruptionAction = "move_doctor" | "next_slot" | "cancel";
export type PatientResponse = "pending" | "accepted" | "declined" | "rebooked_other" | "cancelled";
/** Why one item could not be applied (R7 `problems`). */
export type DisruptionProblem =
  | "no_slot"
  | "same_day_service"
  | "not_for_ticket"
  | "booking_closed"
  | "ticket_closed"
  | "already_applied"
  | "not_found";

/** The offer shown to the patient: codes, times and the doctor's name; never the staff note. */
export interface PendingChange {
  item_id: Uuid;
  disruption_kind: DisruptionKind;
  action: DisruptionAction;
  previous_starts_at: string | null;
  previous_doctor: string | null;
  reply_by: string;
  /** True when silence counts as yes after `reply_by`; otherwise reception calls. */
  auto_accept: boolean;
}

export interface Disruption {
  id: Uuid;
  kind: DisruptionKind;
  membership_id: Uuid | null;
  doctor: string | null;
  service_id: Uuid | null;
  service_name_i18n: I18n | null;
  starts_at: string;
  ends_at: string;
  reason: string;
  status: "open" | "resolved";
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
  counts: {
    total: number;
    not_applied: number;
    pending: number;
    accepted: number;
    declined: number;
    rebooked_other: number;
    cancelled: number;
  };
  version: number;
}

export interface DisruptionItem {
  id: Uuid;
  target: "booking" | "ticket";
  booking_id: Uuid | null;
  booking_code: string | null;
  ticket_id: Uuid | null;
  ticket_number: string | null;
  facility_patient_id: Uuid | null;
  display_name: string;
  contact_phone: string | null;
  service_id: Uuid;
  starts_at: string;
  doctor: string | null;
  previous_starts_at: string | null;
  previous_doctor: string | null;
  action: DisruptionAction | null;
  patient_response: PatientResponse;
  reply_by: string | null;
  auto_accept: boolean | null;
  new_booking_id: Uuid | null;
  applied_at: string | null;
  resolved_at: string | null;
  version: number;
}

export interface DisruptionDetail {
  disruption: Disruption;
  items: DisruptionItem[];
  /** Item ID -> reason code, after an apply. */
  problems?: Record<Uuid, DisruptionProblem>;
}

export interface DisruptionInput {
  kind: DisruptionKind;
  membership_id?: Uuid | null;
  service_id?: Uuid | null;
  starts_at: string;
  ends_at: string;
  reason: string;
}

export type DisruptionApplyInput =
  | { items: { id: Uuid; action: DisruptionAction; membership_id?: Uuid | null }[] }
  | { all: DisruptionAction; membership_id?: Uuid | null };

export type FollowUpMode = "booking" | "reminder";
export interface FollowUp {
  id: Uuid;
  visit_id: Uuid;
  due_on: string;
  mode: FollowUpMode;
  status: "booked" | "due" | "no_slot" | "done" | "cancelled";
  booking: StaffBooking | null;
  created_at: string;
  version: number;
}

export interface CalendarBlock {
  service_id: Uuid;
  membership_id: Uuid | null;
  doctor: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  booked: number;
  bookings: StaffBooking[];
}

export interface StaffCalendar {
  view: "day" | "week";
  from_date: string;
  to_date: string;
  /** Staff without reception rights (doctors) see only their own calendar. */
  only_own: boolean;
  services: { id: Uuid; name_i18n: I18n }[];
  doctors: { id: Uuid; name: string }[];
  days: { date: string; blocks: CalendarBlock[]; other_bookings: StaffBooking[] }[];
  disruptions: {
    id: Uuid;
    kind: DisruptionKind;
    membership_id: Uuid | null;
    service_id: Uuid | null;
    starts_at: string;
    ends_at: string;
    status: "open" | "resolved";
  }[];
}

export interface CalendarFeedStatus {
  is_active: boolean;
  created_at: string | null;
  last_accessed_at: string | null;
}

/** B10: keep the moved time, cancel, or another time with a hold. */
export type RespondInput =
  | { response: "accept" | "cancel"; version?: number }
  | {
      hold_id: Uuid;
      version?: number;
    };

/** No-show reversal reasons (contract sprint-05 §2.2 No-show); `other` needs `reason_text`. */
export const NO_SHOW_REVERSAL_REASONS = ["patient_was_present", "facility_delay", "other"] as const;
export type NoShowReversalReason = (typeof NO_SHOW_REVERSAL_REASONS)[number];

export interface StaffBookInput {
  hold_id: Uuid;
  facility_patient_id: Uuid;
  insurance_profile_id?: Uuid | null;
  contact_phone?: string;
  symptoms: SymptomInput[];
  reason_text?: string;
}

/** 409 body of a hold: the error envelope plus up to 3 nearby times. */
export interface SlotTakenBody {
  error: { code: "slot_taken" | "not_bookable"; message: string };
  alternatives: PublicSlot[];
}

const PUB = "/api/v1/public";
const PAT = "/api/v1/patient";
const STF = "/api/v1/staff";

export const bookingPaths = {
  search: `${PUB}/facilities/search/`,
  facility: (slug: string) => `${PUB}/facilities/${encodeURIComponent(slug)}/`,
  facilitySlots: (slug: string) => `${PUB}/facilities/${encodeURIComponent(slug)}/slots/`,
  symptoms: `${PUB}/symptoms/`,
  hold: (slotId: Uuid) => `${PAT}/slots/${slotId}/hold/`,
  release: (holdId: Uuid) => `${PAT}/holds/${holdId}/`,
  bookings: `${PAT}/bookings/`,
  booking: (id: Uuid) => `${PAT}/bookings/${id}/`,
  ics: (id: Uuid) => `${PAT}/bookings/${id}/calendar.ics`,
  cancel: (id: Uuid) => `${PAT}/bookings/${id}/cancel/`,
  reschedule: (id: Uuid) => `${PAT}/bookings/${id}/reschedule/`,
  remoteJoin: `${PAT}/visits/remote-join/`,
  arrived: (visitId: Uuid) => `${PAT}/visits/${visitId}/arrived/`,
  staffBookings: `${STF}/bookings/`,
  staffSlots: `${STF}/slots/`,
  staffHold: (slotId: Uuid) => `${STF}/slots/${slotId}/hold/`,
  staffCancel: (id: Uuid) => `${STF}/bookings/${id}/cancel/`,
  staffReschedule: (id: Uuid) => `${STF}/bookings/${id}/reschedule/`,
  reverseNoShow: (id: Uuid) => `${STF}/bookings/${id}/reverse-no-show/`,
  // S5b
  respond: (id: Uuid) => `${PAT}/bookings/${id}/respond/`,
  calendarFeed: `${PAT}/calendar-feed/`,
  disruptions: `${STF}/disruptions/`,
  disruption: (id: Uuid) => `${STF}/disruptions/${id}/`,
  disruptionApply: (id: Uuid) => `${STF}/disruptions/${id}/apply/`,
  followUp: (visitId: Uuid) => `${STF}/visits/${visitId}/follow-up/`,
  staffCalendar: `${STF}/calendar/`,
};

const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : {});

function query(params: Record<string, string | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createBookingApi(client: ApiClient) {
  return {
    search: (body: FacilitySearchInput) =>
      client.post<FacilitySearchPage>(bookingPaths.search, body),
    facility: (slug: string) => client.get<PublicFacility>(bookingPaths.facility(slug)),
    slots: (slug: string, p: { service_id: Uuid; date?: string; membership_id?: Uuid | null }) =>
      client.get<SlotWeek>(bookingPaths.facilitySlots(slug) + query(p)),
    symptoms: () => client.get<Symptom[]>(bookingPaths.symptoms),
    hold: (slotId: Uuid) => client.post<Hold>(bookingPaths.hold(slotId), {}),
    release: (holdId: Uuid) => client.request<void>("DELETE", bookingPaths.release(holdId)),
    book: (body: BookInput, idempotencyKey?: string) =>
      client.post<Booking>(bookingPaths.bookings, body, idem(idempotencyKey)),
    bookings: (when: "upcoming" | "past" = "upcoming") =>
      client.get<{ results: Booking[] }>(`${bookingPaths.bookings}?when=${when}`),
    booking: (id: Uuid) => client.get<Booking>(bookingPaths.booking(id)),
    /** Absolute URL of the `.ics` file (served by the API host, with the session cookie). */
    icsUrl: (id: Uuid) => `${client.baseUrl}${bookingPaths.ics(id)}`,
    cancel: (id: Uuid, version: number) =>
      client.post<Booking>(bookingPaths.cancel(id), { version }),
    reschedule: (id: Uuid, version: number, holdId: Uuid) =>
      client.post<Booking>(bookingPaths.reschedule(id), { version, hold_id: holdId }),
    remoteJoin: (
      body: {
        facility_slug: string;
        service_id: Uuid;
        patient_id: Uuid;
        symptoms?: SymptomInput[];
      },
      idempotencyKey?: string,
    ) => client.post<PatientVisit>(bookingPaths.remoteJoin, body, idem(idempotencyKey)),
    /** "I'm here" (B9): records the patient's claim; reception confirms the arrival. */
    arrived: (visitId: Uuid) => client.post<PatientVisit>(bookingPaths.arrived(visitId), {}),
    /** B10 (S5b): answer a disruption offer; with `hold_id` the result is the new booking. */
    respond: (id: Uuid, body: RespondInput) => client.post<Booking>(bookingPaths.respond(id), body),
    /** B11 (S5b): the private calendar link; `create` shows the URL once. */
    calendarFeed: {
      get: () => client.get<CalendarFeedStatus>(bookingPaths.calendarFeed),
      create: () => client.post<{ url: string; created_at: string }>(bookingPaths.calendarFeed, {}),
      revoke: () => client.request<void>("DELETE", bookingPaths.calendarFeed),
    },
    staff: {
      /** R1. The Expected list is `{ date: today, status: "confirmed" }`; `no_show` lists no-shows. */
      /** `code`: the booking code from the patient's phone (today and later, date ignored). */
      bookings: (p: { date?: string; service_id?: Uuid; status?: string; code?: string } = {}) =>
        client.get<{ count: number; results: StaffBooking[] }>(
          bookingPaths.staffBookings + query(p),
        ),
      slots: (p: { service_id: Uuid; date?: string; membership_id?: Uuid | null }) =>
        client.get<SlotWeek>(bookingPaths.staffSlots + query(p)),
      hold: (slotId: Uuid) => client.post<Hold>(bookingPaths.staffHold(slotId), {}),
      book: (body: StaffBookInput, idempotencyKey?: string) =>
        client.post<StaffBooking>(bookingPaths.staffBookings, body, idem(idempotencyKey)),
      cancel: (id: Uuid, version: number, reasonCode: string) =>
        client.post<StaffBooking>(bookingPaths.staffCancel(id), {
          version,
          reason_code: reasonCode,
        }),
      /** R4: move a booking to a held slot (a new booking replaces it). */
      reschedule: (id: Uuid, version: number, holdId: Uuid) =>
        client.post<StaffBooking>(bookingPaths.staffReschedule(id), { version, hold_id: holdId }),
      reverseNoShow: (
        id: Uuid,
        version: number,
        reasonCode: NoShowReversalReason,
        reasonText = "",
      ) =>
        client.post<StaffBooking>(bookingPaths.reverseNoShow(id), {
          version,
          reason_code: reasonCode,
          reason_text: reasonText,
        }),
      // S5b
      disruptions: (p: { status?: "open" | "resolved" } = {}) =>
        client.get<{ count: number; results: Disruption[] }>(bookingPaths.disruptions + query(p)),
      disruption: (id: Uuid) => client.get<DisruptionDetail>(bookingPaths.disruption(id)),
      createDisruption: (body: DisruptionInput) =>
        client.post<DisruptionDetail>(bookingPaths.disruptions, body),
      applyDisruption: (id: Uuid, body: DisruptionApplyInput) =>
        client.post<DisruptionDetail>(bookingPaths.disruptionApply(id), body),
      followUp: (visitId: Uuid) => client.get<FollowUp>(bookingPaths.followUp(visitId)),
      createFollowUp: (visitId: Uuid, body: { in_days: number; mode: FollowUpMode }) =>
        client.post<FollowUp>(bookingPaths.followUp(visitId), body),
      calendar: (
        p: {
          from?: string;
          to?: string;
          view?: "day" | "week";
          service_id?: Uuid;
          membership_id?: Uuid;
        } = {},
      ) => client.get<StaffCalendar>(bookingPaths.staffCalendar + query(p)),
    },
  };
}

export type BookingApi = ReturnType<typeof createBookingApi>;
