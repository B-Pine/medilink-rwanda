/**
 * API types for Sprint 0, written by hand from docs/architecture/03-sprint-0-contract.md §2.
 *
 * Once the backend publishes /api/v1/schema/, run `pnpm generate-types` (openapi-typescript) and
 * replace these with aliases of the generated schema types. CI will then detect drift.
 */

export type Uuid = string;
export type LanguageCode = "rw" | "en" | "fr";

export const LANGUAGES: readonly LanguageCode[] = ["rw", "en", "fr"] as const;

/**
 * Facility types from docs/analysis/03 §1 (snake_case codes assumed; open enum because the
 * backend owns the list and may add values).
 */
export type FacilityType =
  | "health_post"
  | "health_center"
  | "district_hospital"
  | "provincial_hospital"
  | "referral_hospital"
  | "private_clinic"
  | "polyclinic"
  | "private_hospital"
  | "dental_clinic"
  | "eye_clinic"
  | "diagnostic_center"
  | (string & {});

export type RoleCode = "facility_admin" | "receptionist" | "doctor" | "pharmacist";

/**
 * Known permission codes. Feature modules add theirs by declaration merging in their own file,
 * without editing this one (shared-file protocol):
 *   declare module "../types" { interface PermissionCodes { "patients.view": true } }
 */
export interface PermissionCodes {
  "facility.configure": true;
  "staff.manage": true;
  "schedule.manage": true;
  "schedule.view": true;
  "leave.request": true;
  "booking.manage": true;
  "patient.register": true;
  "queue.operate": true;
  "queue.call": true;
  "vitals.record": true;
  "visit.reason.view": true;
  "clinical.view": true;
  "clinical.write": true;
  "clinical.sign": true;
  "clinical.amend_own": true;
  "prescription.issue": true;
  "prescription.view": true;
  "pharmacy.dispense": true;
  "billing.record_payment": true;
  "billing.approve": true;
  "documents.upload": true;
  "records.import": true;
  "records.import_clinical": true;
  "patients.merge_request": true;
  "disputes.raise": true;
  "disputes.handle": true;
  "disputes.comment": true;
  "reports.view": true;
  "reports.view_own": true;
  "audit.view": true;
  "subscription.view": true;
}

export type PermissionCode = keyof PermissionCodes;

export interface FacilitySummary {
  id: Uuid;
  name: string;
  slug: string;
  facility_type: FacilityType;
}

export interface FacilityMembership {
  facility: FacilitySummary;
  roles: RoleCode[];
}

export interface StaffMe {
  id: Uuid;
  email: string;
  full_name: string;
  preferred_language: LanguageCode;
  is_platform_admin: boolean;
  mfa_enabled: boolean;
  memberships: FacilityMembership[];
  active_facility_id: Uuid | null;
  /** Permissions for the active facility. */
  permissions: PermissionCode[];
  /** S1: feature flags enabled for the active facility (defaults without one). */
  feature_flags: string[];
  /** S1: idle lock and step-up state. */
  security: StaffSecurity;
}

export interface StaffSecurity {
  pin_set: boolean;
  lock_after_seconds: number;
  /** ISO time until which sensitive actions don't need a new step-up, or null. */
  step_up_valid_until: string | null;
}

export interface PatientProfile {
  patient_id: Uuid;
  display_name: string;
  relationship: "self" | "guardian" | "delegate";
}

export interface PatientMe {
  id: Uuid;
  email: string;
  full_name: string;
  preferred_language: LanguageCode;
  email_verified: boolean;
  profiles: PatientProfile[];
}

export type StaffLoginStatus = "authenticated" | "mfa_required" | "mfa_setup_required";

export interface StaffLoginResult {
  status: StaffLoginStatus;
  user: StaffMe | null;
}

export interface StaffAuthenticatedResult {
  status: "authenticated";
  user: StaffMe;
}

export interface MfaSetupResponse {
  otpauth_uri: string;
  secret: string;
}

export interface MfaConfirmResponse {
  status: "authenticated";
  user: StaffMe;
  recovery_codes: string[];
}

export type MfaVerifyRequest = { code: string } | { recovery_code: string };

export interface HealthResponse {
  status: "ok";
  version: string;
}

export interface CsrfResponse {
  csrf_token: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface PatientRegisterRequest {
  full_name: string;
  email: string;
  password: string;
  preferred_language: LanguageCode;
  accepted_terms_version: string;
  accepted_privacy_version: string;
  research_consent: boolean;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  uid: string;
  token: string;
  new_password: string;
}

/** Error codes from docs/architecture/02-api-conventions.md §4 (+ client-side `network_error`). */
export type ApiErrorCode =
  | "validation_error"
  | "bad_request"
  | "not_authenticated"
  | "mfa_required"
  | "permission_denied"
  | "step_up_required"
  | "session_locked"
  | "csrf_failed"
  | "not_found"
  | "conflict"
  | "business_rule_violation"
  | "rate_limited"
  | "server_error"
  | "network_error"
  | (string & {});

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string[]>;
    request_id?: string;
  };
}
