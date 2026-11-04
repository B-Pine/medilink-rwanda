/**
 * Super admin console (upgrade 2026-11-02): command centre, user directory and account actions,
 * security and access logs, and the break-glass review list (S6 G1/G2).
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import type { Paginated } from "./clinical";

export type UserKind = "platform" | "staff" | "patient";

export interface ConsoleMembership {
  facility_id: Uuid;
  facility_name: string;
  roles: string[];
  is_active: boolean;
  /** When the access was removed, and why (empty while active). */
  deactivated_at: string | null;
  deactivation_reason: string;
}

export interface ConsoleUser {
  id: Uuid;
  full_name: string;
  email: string;
  /** Staff work phone (E.164); empty for patients and when not given. */
  phone: string;
  /** For clinicians: their profession code, else empty. */
  profession: string;
  /** For clinicians: valid, expiring, expired or missing; null for everyone else. */
  licence_state: "valid" | "expiring" | "expired" | "missing" | null;
  kind: UserKind;
  is_active: boolean;
  mfa_enabled: boolean;
  facilities: ConsoleMembership[];
  last_login: string | null;
  created_at: string;
}

export interface ConsoleEvent {
  id: Uuid;
  occurred_at: string;
  action: string;
  outcome: "success" | "failure" | "info";
  actor_id: Uuid | null;
  actor_name: string;
  actor_email: string;
  actor_role: string;
  facility_name: string;
  object_type: string;
  object_ref: string;
  reason: string;
  ip: string;
  device: string;
}

export interface ConsoleInvitation {
  facility_id: Uuid;
  facility_name: string;
  roles: string[];
  invited_at: string;
  expires_at: string;
}

export interface ConsoleUserDetail extends ConsoleUser {
  email_verified: boolean;
  /** Signed up and has not opened the confirmation link: cannot sign in yet. */
  verification_pending: boolean;
  preferred_language: "rw" | "en" | "fr";
  /** Seconds left of the block after failed passwords or MFA codes (0 = none). */
  sign_in_blocked_for: number;
  sessions: { ref: string; audience: string; created_at: string | null; expires_at: string }[];
  /** Pending staff invitations sent to this email. */
  invitations: ConsoleInvitation[];
  events: ConsoleEvent[];
  /** What admins changed on the account and its facility access, newest first. */
  changes: ConsoleEvent[];
}

export interface UserSummary {
  total: number;
  platform: number;
  staff: number;
  patient: number;
  locked: number;
  /** Staff and platform admins without two-step sign-in (patients have none). */
  without_mfa: number;
  verification_pending: number;
  /** Facilities that have staff, for the filter. */
  facilities: { id: Uuid; name: string }[];
}

export interface UserListParams {
  /** Name, email or phone (0788… finds +250788…). */
  q?: string;
  kind?: UserKind;
  status?: "active" | "locked";
  mfa?: "on" | "off";
  facility?: Uuid;
  role?: string;
  verification?: "pending";
  page?: number;
}

export interface AccountUpdate {
  full_name?: string;
  /** Staff and platform admins only: a patient's phone is on their patient record. */
  phone?: string;
  preferred_language?: "rw" | "en" | "fr";
  reason: string;
}

export interface CommandCenter {
  generated_at: string;
  overview: {
    applications: Record<string, number>;
    licences: Record<string, number>;
    facilities: Record<string, number>;
    oldest_waiting_application: { id: Uuid; submitted_at: string } | null;
    facilities_by_district: { district_code: string; district: string; count: number }[];
  };
  waiting_now: number;
  live_facilities: number;
  attention: {
    applications_waiting: number;
    licences_expiring: number;
    licences_expired: number;
    disputes_escalated: number;
    break_glass_to_review: number;
    stale_facilities: number;
    locked_accounts: number;
  };
  security: {
    failed_logins_24h: number;
    successful_logins_24h: number;
    staff_total: number;
    staff_with_mfa: number;
    active_sessions: number;
  };
  map: {
    id: Uuid;
    slug: string;
    name: string;
    type: string;
    district: string;
    lat: number;
    lng: number;
    waiting: number;
    stale: boolean;
  }[];
  activity: ConsoleEvent[];
}

/** S6 G1: a break-glass session, as the platform list returns it. */
export interface BreakGlassSession {
  id: Uuid;
  user_name: string;
  patient_id: Uuid;
  facility_id: Uuid;
  facility_name: string;
  reason_code: string;
  reason_text: string;
  starts_at: string;
  expires_at: string;
  ended_at: string | null;
  is_open: boolean;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_outcome: string;
  review_note: string;
}

export type AccountAction =
  | "lock"
  | "unlock"
  | "reset-mfa"
  | "revoke-sessions"
  | "send-password-reset"
  | "resend-verification"
  | "clear-sign-in-block";

const PL = "/api/v1/platform";

export const consolePaths = {
  /** CSV of staff and platform accounts (never patients); fetch it with the session cookie. */
  usersExport: (params: Omit<UserListParams, "page"> = {}) =>
    `${PL}/users/export/${query({ ...params })}`,
};

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export interface LogParams {
  q?: string;
  action?: string;
  outcome?: "failure";
  page?: number;
}

export function createConsoleApi(client: ApiClient) {
  return {
    commandCenter: () => client.get<CommandCenter>(`${PL}/command-center/`),
    users: (params: UserListParams = {}) =>
      client.get<Paginated<ConsoleUser>>(`${PL}/users/${query({ ...params })}`),
    userSummary: () => client.get<UserSummary>(`${PL}/users/summary/`),
    user: (id: Uuid) => client.get<ConsoleUserDetail>(`${PL}/users/${id}/`),
    /** Step-up and a reason; never on yourself (`422`). */
    updateUser: (id: Uuid, body: AccountUpdate) =>
      client.request<ConsoleUserDetail>("PATCH", `${PL}/users/${id}/`, { body }),
    /** Step-up, a reason of 5 characters or more; never on yourself (`422`). */
    act: (id: Uuid, action: AccountAction, reason: string) =>
      client.post<ConsoleUser>(`${PL}/users/${id}/${action}/`, { reason }),
    /** Remove or restore access to one facility (step-up, reason; keeps the last facility admin). */
    facilityAccess: (id: Uuid, facilityId: Uuid, action: "remove" | "restore", reason: string) =>
      client.post<ConsoleUserDetail>(`${PL}/users/${id}/facilities/${facilityId}/${action}/`, {
        reason,
      }),
    securityEvents: (params: LogParams = {}) =>
      client.get<Paginated<ConsoleEvent>>(`${PL}/security-events/${query({ ...params })}`),
    accessEvents: (params: LogParams = {}) =>
      client.get<Paginated<ConsoleEvent>>(`${PL}/access-events/${query({ ...params })}`),
    breakGlass: (params: { needs_review?: boolean; page?: number } = {}) =>
      client.get<Paginated<BreakGlassSession>>(`${PL}/break-glass/${query(params)}`),
    reviewBreakGlass: (
      id: Uuid,
      body: { outcome: "appropriate" | "inappropriate"; note?: string },
    ) => client.post<BreakGlassSession>(`${PL}/break-glass/${id}/review/`, body),
  };
}

export type ConsoleApi = ReturnType<typeof createConsoleApi>;
