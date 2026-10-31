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
  | "not_allowed";

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
  page?: number;
}

export interface FacilityResult {
  slug: string;
  name: string;
  type: string;
  ownership: string;
  level_of_care: string;
  district: string;
  sector: string;
  distance_km: number | null;
  open_now: boolean;
  service_code: string;
  service_name_i18n: I18n;
  accepts_insurance: "yes" | "no" | "unknown";
  fee_rwf: number | null;
  patient_share_rwf: number | null;
  next_slot_at: string | null;
  queue_load: QueueLoad | null;
  allows_remote_join: boolean;
  referral_hint: boolean;
  lat: number | null;
  lng: number | null;
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
  fee_rwf: number | null;
  insurers: string[];
  /** Patient share per insurer, in basis points of the fee. */
  insurer_shares: Record<string, number>;
  bookable: boolean;
  remote_join: boolean;
  walk_in: boolean;
  queue_load: QueueLoad | null;
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
  description_i18n: I18n;
  address: string;
  phone: string;
  district: string;
  sector: string;
  lat: number | null;
  lng: number | null;
  open_now: boolean;
  /** [date, opens, closes] for the next 7 days. */
  hours: [string, string, string][];
  closures: { date: string; reason: string }[];
  services: PublicService[];
  doctors: { membership_id: Uuid; name: string; days: number[]; service_ids: Uuid[] }[];
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
  cost: {
    fee_rwf: number | null;
    patient_share_rwf: number | null;
    insurer_code: string | null;
    insurer_accepted: boolean | null;
  };
  symptoms: BookedSymptom[];
  can_change: boolean;
  change_until: string;
  rescheduled_to_id: Uuid | null;
  pending_change: Record<string, unknown> | null;
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
  visit_id: Uuid | null;
  version: number;
}

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
    icsUrl: (id: Uuid) => bookingPaths.ics(id),
    cancel: (id: Uuid, version: number) =>
      client.post<Booking>(bookingPaths.cancel(id), { version }),
    reschedule: (id: Uuid, version: number, holdId: Uuid) =>
      client.post<Booking>(bookingPaths.reschedule(id), { version, hold_id: holdId }),
    remoteJoin: (
      body: { facility_slug: string; service_id: Uuid; patient_id: Uuid },
      idempotencyKey?: string,
    ) => client.post<PatientVisit>(bookingPaths.remoteJoin, body, idem(idempotencyKey)),
    arrived: (visitId: Uuid) => client.post<PatientVisit>(bookingPaths.arrived(visitId), {}),
    staff: {
      bookings: (p: { date?: string; service_id?: Uuid; status?: string } = {}) =>
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
    },
  };
}

export type BookingApi = ReturnType<typeof createBookingApi>;
