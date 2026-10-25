import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import { query, type ListParams, type Page } from "./masterdata";
import { uploadFile, type DownloadLink } from "./uploads";

/** Staff patients and merges (sprint-03 §3.1, §3.3 ST1–ST27, §3.4 PL1–PL5). */

declare module "../types" {
  interface PermissionCodes {
    "patients.view": true;
    "patients.identifier_reveal": true;
    "patients.insurance_verify": true;
    "patients.merge_approve": true;
  }
}

export type Sex = "female" | "male" | "other";
export type IdentifierKind = "national_id" | "passport" | "refugee_id" | "birth_certificate";
export type InsuranceStatus = "unverified" | "verified" | "rejected";
export type PrincipalRelationship = "spouse" | "child" | "parent" | "other";
export type HealthKind = "allergies" | "conditions" | "medications";
export type Verification = "unverified" | "verified" | "refuted";
export type MatchLevel = "exact_identifier" | "strong" | "possible";
export type SearchBy =
  "auto" | "name" | "phone" | "national_id" | "identifier" | "file_number" | "medilink_number";
export type RevealReason = "identity_check" | "insurance_claim" | "patient_request" | "other";
export type MergeScope = "facility" | "cross_facility" | "claim";
export type MergeStatus = "requested" | "rejected" | "cancelled" | "executed" | "undone";

export interface Identifier {
  id: Uuid;
  kind: IdentifierKind;
  issuing_country: string;
  masked_value: string;
  is_verified: boolean;
  verified_at: string | null;
}

export interface IdentifierInput {
  kind: IdentifierKind;
  issuing_country?: string;
  value: string;
}

export interface CardImage {
  upload_id: Uuid;
  scan_status: string;
}

export interface InsuranceProfile {
  id: Uuid;
  insurer_code: string;
  insurer_display: string;
  member_number: string;
  is_principal: boolean;
  principal_name: string | null;
  principal_member_number: string | null;
  relationship_to_principal: PrincipalRelationship | null;
  valid_until: string | null;
  is_expired: boolean;
  status: InsuranceStatus;
  status_reason: string | null;
  last_verified: { facility_name: string | null; at: string } | null;
  card_images: { front: CardImage | null; back: CardImage | null; can_upload: boolean };
  is_active: boolean;
  version: number;
}

export interface InsuranceInput {
  insurer_code: string;
  member_number: string;
  is_principal?: boolean;
  principal_name?: string | null;
  principal_member_number?: string | null;
  relationship_to_principal?: PrincipalRelationship | null;
  valid_until?: string | null;
}

export interface HealthItem {
  id: Uuid;
  kind: "allergy" | "condition" | "medication";
  category?: "drug" | "food" | "other";
  substance_text?: string;
  reaction?: string | null;
  severity?: "mild" | "moderate" | "severe" | "unknown";
  display?: string;
  status?: "active" | "resolved";
  onset_date?: string | null;
  drug_display?: string;
  dose_text?: string | null;
  started_on?: string | null;
  stopped_on?: string | null;
  source: "patient" | "clinician";
  verification_status: Verification;
  recorded_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

export interface HealthProfile {
  no_known_allergies: boolean | null;
  allergies: HealthItem[] | null;
  conditions: HealthItem[] | null;
  medications: HealthItem[] | null;
}

export type HealthItemInput = Record<string, string | null | undefined>;

export interface EmergencyContact {
  name: string;
  phone_e164: string;
  relationship: string;
}

export interface PatientSummary {
  facility_patient_id: Uuid;
  patient_id: Uuid;
  medilink_number: string | null;
  file_number: string | null;
  full_name: string;
  preferred_name: string | null;
  sex: Sex | null;
  date_of_birth: string | null;
  is_birth_date_estimated: boolean;
  age_years: number | null;
  phone_masked: string | null;
  national_id_masked: string | null;
  insurance: { insurer_code: string; status: InsuranceStatus; is_expired: boolean }[];
  has_account: boolean;
  is_staff_member: boolean;
  match: string | null;
}

export interface FacilityPatientDetail extends PatientSummary {
  address: string | null;
  email: string | null;
  emergency_contact: EmergencyContact | null;
  reception_notes: string | null;
  identifiers: Identifier[];
  has_care_consent: boolean;
  open_claim_reference: string | null;
  is_active: boolean;
  merged_into_facility_patient_id: Uuid | null;
  version: number;
  patient_version: number;
}

export interface ExternalMatch {
  patient_ref: Uuid;
  full_name: string;
  birth_year: number | null;
  sex: Sex | null;
  medilink_number: string | null;
  matched_on: string;
}

export interface SearchResult {
  results: PatientSummary[];
  external_match: ExternalMatch | null;
}

export interface DuplicateCheckResult {
  matches: { level: MatchLevel; patient: PatientSummary }[];
  external_match: ExternalMatch | null;
  other_facility_possible_count: number;
}

export interface AgeInput {
  date_of_birth?: string | null;
  estimated_age_years?: number | null;
  estimated_age_months?: number | null;
}

export interface DuplicateCheckInput extends AgeInput {
  full_name?: string;
  sex?: Sex | null;
  phone_e164?: string | null;
  identifier?: IdentifierInput | null;
  medilink_number?: string;
}

export interface CareConsentInput {
  version: string;
  granted: boolean;
}

export interface RegisterInput extends AgeInput {
  full_name: string;
  sex: Sex;
  phone_e164?: string | null;
  identifier?: IdentifierInput | null;
  file_number?: string | null;
  insurance?: InsuranceInput | null;
  care_consent: CareConsentInput;
  confirm_not_duplicate?: boolean;
}

export interface AddExistingInput {
  patient_ref: Uuid;
  proof: { medilink_number: string } | { identifier: IdentifierInput };
  file_number?: string | null;
  care_consent: CareConsentInput;
}

export interface PatientUpdateInput {
  version: number;
  patient_version: number;
  full_name?: string;
  preferred_name?: string | null;
  sex?: Sex | null;
  date_of_birth?: string | null;
  is_birth_date_estimated?: boolean;
  phone_e164?: string | null;
  email?: string | null;
  address?: string | null;
  emergency_contact?: EmergencyContact | null;
  file_number?: string | null;
  reception_notes?: string | null;
}

export interface RevealInput {
  field: "identifier" | "phone";
  identifier_id?: Uuid;
  reason_code: RevealReason;
  reason_text?: string;
}

export interface ConsentRecord {
  id: Uuid;
  kind: string;
  patient_id: Uuid | null;
  granted: boolean;
  version: string;
  granted_at: string;
  channel: string;
}

export interface RecordClaim {
  id: Uuid;
  status: "code_sent" | "awaiting_reception" | "completed" | "failed" | "expired" | "cancelled";
  method: "contact_code" | "reception_check";
  contact_hint: string | null;
  reference: string | null;
  expires_at: string;
}

export interface MergeSide {
  patient_id: Uuid;
  medilink_number: string | null;
  full_name: string;
  date_of_birth: string | null;
  sex: Sex | null;
  file_number: string | null;
}

export interface MergePreview {
  identifiers: number;
  insurance_profiles: number;
  health_items: number;
  account_links: number;
  facility_records_here: number;
  other_facilities: number;
  conflicts: string[];
}

export interface MergeRequest {
  id: Uuid;
  scope: MergeScope;
  status: MergeStatus;
  is_escalated: boolean;
  facility: { id: Uuid; name: string } | null;
  surviving: MergeSide;
  merged: MergeSide;
  preview: MergePreview | null;
  reason: string;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  executed_at: string | null;
  undone_at: string | null;
  version: number;
}

export interface UndoResult {
  merge: MergeRequest;
  skipped_rows: number;
}

const base = "/api/v1/staff/patients/";
export const patientsPaths = {
  base,
  search: `${base}search/`,
  duplicateChecks: `${base}duplicate-checks/`,
  addExisting: `${base}add-existing/`,
  record: (fp: Uuid) => `${base}${fp}/`,
  recordAction: (fp: Uuid, action: string) => `${base}${fp}/${action}/`,
  insurance: (fp: Uuid, profile?: Uuid) =>
    `${base}${fp}/insurance-profiles/${profile ? `${profile}/` : ""}`,
  health: (fp: Uuid, kind: HealthKind, item?: Uuid) =>
    `${base}${fp}/${kind}/${item ? `${item}/review/` : ""}`,
  merges: "/api/v1/staff/merge-requests/",
  merge: (id: Uuid, action?: string) =>
    `/api/v1/staff/merge-requests/${id}/${action ? `${action}/` : ""}`,
  platformMerges: "/api/v1/platform/merge-requests/",
  platformMerge: (id: Uuid, action?: string) =>
    `/api/v1/platform/merge-requests/${id}/${action ? `${action}/` : ""}`,
};

const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : {});

/** Whether a staff member holds a permission code in the active facility. */
export function hasPermission(
  me: { permissions: readonly string[] } | null | undefined,
  code: string,
) {
  return Boolean(me?.permissions.includes(code));
}

export function createPatientsApi(client: ApiClient) {
  return {
    search: (body: {
      query: string;
      by?: SearchBy;
      kind?: IdentifierKind;
      issuing_country?: string;
    }) => client.post<SearchResult>(patientsPaths.search, body),
    duplicateCheck: (body: DuplicateCheckInput) =>
      client.post<DuplicateCheckResult>(patientsPaths.duplicateChecks, body),
    register: (body: RegisterInput, idempotencyKey?: string) =>
      client.post<FacilityPatientDetail>(patientsPaths.base, body, idem(idempotencyKey)),
    addExisting: (body: AddExistingInput, idempotencyKey?: string) =>
      client.post<FacilityPatientDetail>(patientsPaths.addExisting, body, idem(idempotencyKey)),
    get: (fp: Uuid) => client.get<FacilityPatientDetail>(patientsPaths.record(fp)),
    update: (fp: Uuid, body: PatientUpdateInput) =>
      client.request<FacilityPatientDetail>("PATCH", patientsPaths.record(fp), { body }),
    addIdentifier: (fp: Uuid, body: IdentifierInput & { seen_document?: boolean }) =>
      client.post<Identifier>(patientsPaths.recordAction(fp, "identifiers"), body),
    reveal: (fp: Uuid, body: RevealInput) =>
      client.post<{ value: string }>(patientsPaths.recordAction(fp, "reveal"), body),

    insurance: (fp: Uuid) =>
      client.get<{ results: InsuranceProfile[] }>(patientsPaths.insurance(fp)),
    addInsurance: (fp: Uuid, body: InsuranceInput) =>
      client.post<InsuranceProfile>(patientsPaths.insurance(fp), body),
    updateInsurance: (
      fp: Uuid,
      profile: Uuid,
      body: Partial<InsuranceInput> & { version: number },
    ) => client.request<InsuranceProfile>("PATCH", patientsPaths.insurance(fp, profile), { body }),
    verifyInsurance: (
      fp: Uuid,
      profile: Uuid,
      body: { outcome: "verified" | "rejected"; valid_until?: string | null; reason?: string },
    ) => client.post<InsuranceProfile>(`${patientsPaths.insurance(fp, profile)}verify/`, body),
    uploadCard: (fp: Uuid, profile: Uuid, side: "front" | "back", file: Blob) =>
      uploadFile<InsuranceProfile>(client, {
        path: `${patientsPaths.insurance(fp, profile)}card-images/`,
        file,
        filename: `card-${side}.jpg`,
        fields: { side },
      }),
    cardLink: (fp: Uuid, profile: Uuid, side: "front" | "back") =>
      client.post<DownloadLink>(
        `${patientsPaths.insurance(fp, profile)}card-images/${side}/download-links/`,
      ),

    healthProfile: (fp: Uuid) =>
      client.get<HealthProfile>(patientsPaths.recordAction(fp, "health-profile")),
    addHealthItem: (fp: Uuid, kind: HealthKind, body: HealthItemInput) =>
      client.post<HealthItem>(patientsPaths.health(fp, kind), body),
    reviewHealthItem: (
      fp: Uuid,
      kind: HealthKind,
      item: Uuid,
      body: { outcome: "verified" | "refuted" | "entered_in_error"; note?: string },
    ) => client.post<HealthItem>(patientsPaths.health(fp, kind, item), body),
    recordConsent: (
      fp: Uuid,
      body: { kind: "care" | "research"; version: string; granted: boolean; script_read: true },
    ) => client.post<ConsentRecord>(patientsPaths.recordAction(fp, "consents"), body),
    confirmClaim: (
      fp: Uuid,
      body: { claim_reference: string; document_kind: IdentifierKind; document_matches: true },
      idempotencyKey?: string,
    ) =>
      client.post<RecordClaim>(
        patientsPaths.recordAction(fp, "claim-confirmations"),
        body,
        idem(idempotencyKey),
      ),

    merges: (params?: ListParams) =>
      client.get<Page<MergeRequest>>(patientsPaths.merges + query(params)),
    merge: (id: Uuid) => client.get<MergeRequest>(patientsPaths.merge(id)),
    requestMerge: (
      body: {
        surviving_facility_patient_id: Uuid;
        merged_facility_patient_id: Uuid;
        reason: string;
      },
      idempotencyKey?: string,
    ) => client.post<MergeRequest>(patientsPaths.merges, body, idem(idempotencyKey)),
    approveMerge: (id: Uuid, body: { version: number; decision_reason?: string }, key?: string) =>
      client.post<MergeRequest>(patientsPaths.merge(id, "approve"), body, idem(key)),
    rejectMerge: (id: Uuid, body: { version: number; decision_reason: string }) =>
      client.post<MergeRequest>(patientsPaths.merge(id, "reject"), body),
    cancelMerge: (id: Uuid) => client.post<MergeRequest>(patientsPaths.merge(id, "cancel")),
    escalateMerge: (id: Uuid) => client.post<MergeRequest>(patientsPaths.merge(id, "escalate")),
    undoMerge: (id: Uuid, body: { version: number; reason: string }) =>
      client.post<UndoResult>(patientsPaths.merge(id, "undo"), body),

    platform: {
      merges: (params?: ListParams) =>
        client.get<Page<MergeRequest>>(patientsPaths.platformMerges + query(params)),
      merge: (id: Uuid) => client.get<MergeRequest>(patientsPaths.platformMerge(id)),
      approve: (id: Uuid, body: { version: number; decision_reason?: string }, key?: string) =>
        client.post<MergeRequest>(patientsPaths.platformMerge(id, "approve"), body, idem(key)),
      reject: (id: Uuid, body: { version: number; decision_reason: string }) =>
        client.post<MergeRequest>(patientsPaths.platformMerge(id, "reject"), body),
      undo: (id: Uuid, body: { version: number; reason: string }) =>
        client.post<UndoResult>(patientsPaths.platformMerge(id, "undo"), body),
    },
  };
}

export type PatientsApi = ReturnType<typeof createPatientsApi>;
