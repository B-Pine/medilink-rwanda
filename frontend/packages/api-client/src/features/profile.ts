import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import { query, type Page } from "./masterdata";
import type {
  ConsentRecord,
  EmergencyContact,
  HealthItem,
  HealthItemInput,
  HealthKind,
  HealthProfile,
  Identifier,
  IdentifierInput,
  InsuranceInput,
  InsuranceProfile,
  RecordClaim,
  Sex,
} from "./patients";
import { uploadFile, type DownloadLink } from "./uploads";

/** Patient self-service (sprint-03 §3.1, §3.2 PA1–PA26). */

export type LinkRelationship = "self" | "guardian" | "delegate";

export interface ProfileSummary {
  patient_id: Uuid;
  display_name: string;
  relationship: LinkRelationship;
  medilink_number: string | null;
  date_of_birth: string | null;
  completion_percent: number;
}

export interface ProfileCompletion {
  details: boolean;
  identifier: boolean;
  emergency_contact: boolean;
  care_consent: boolean;
  insurance: boolean;
  allergies_reviewed: boolean;
}

export interface PatientProfileDetail {
  patient_id: Uuid;
  relationship: LinkRelationship;
  medilink_number: string | null;
  full_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  is_birth_date_estimated: boolean;
  sex: Sex | null;
  phone_e164: string | null;
  email: string | null;
  address: string | null;
  emergency_contact: EmergencyContact | null;
  no_known_allergies: boolean | null;
  has_care_consent: boolean;
  completion: ProfileCompletion;
  version: number;
}

export interface ProfileUpdateInput {
  version: number;
  full_name?: string;
  preferred_name?: string | null;
  date_of_birth?: string | null;
  is_birth_date_estimated?: boolean;
  sex?: Sex | null;
  phone_e164?: string | null;
  email?: string | null;
  address?: string | null;
  emergency_contact?: EmergencyContact | null;
  no_known_allergies?: boolean | null;
}

export interface DependentInput {
  relationship: "guardian" | "delegate";
  full_name: string;
  sex: Sex;
  date_of_birth?: string | null;
  estimated_age_years?: number | null;
  consent_version: string;
  consent_attested?: boolean;
}

export interface DelegationRow {
  id: Uuid;
  patient_id: Uuid;
  profile_name: string;
  holder_name: string | null;
  relationship: LinkRelationship;
  granted_at: string | null;
  can_revoke: boolean;
}

export interface PendingInvite {
  id: Uuid;
  patient_id: Uuid;
  profile_name: string;
  relationship: LinkRelationship;
  expires_at: string;
}

export interface Delegations {
  granted: DelegationRow[];
  received: DelegationRow[];
  pending_invites: PendingInvite[];
}

export interface Invite {
  id: Uuid;
  code: string;
  relationship: LinkRelationship;
  expires_at: string;
}

export type ClaimLookup =
  | { identifier: IdentifierInput }
  | { medilink_number: string }
  | { phone_e164: string; full_name: string };

export interface ConsentState {
  current_versions: Record<string, string>;
  consents: ConsentRecord[];
  history: ConsentRecord[];
}

export interface AccessHistoryItem {
  id: Uuid;
  occurred_at: string;
  action: string;
  actor_kind: "staff" | "self" | "linked_account" | "platform" | "system";
  actor_role: string | null;
  facility: { id: Uuid; name: string } | null;
}

const p = "/api/v1/patient/";
export const profilePaths = {
  profiles: `${p}profiles/`,
  profile: (id: Uuid) => `${p}profiles/${id}/`,
  profileAction: (id: Uuid, action: string) => `${p}profiles/${id}/${action}/`,
  dependents: `${p}dependents/`,
  delegations: `${p}delegations/`,
  accept: `${p}delegations/accept/`,
  revoke: (id: Uuid) => `${p}delegations/${id}/revoke/`,
  insurance: (id: Uuid, action?: string) =>
    `${p}insurance-profiles/${id}/${action ? `${action}/` : ""}`,
  claims: `${p}record-claims/`,
  claim: (id: Uuid, action?: string) => `${p}record-claims/${id}/${action ? `${action}/` : ""}`,
  consents: `${p}consents/`,
};

export function createProfileApi(client: ApiClient) {
  return {
    profiles: () => client.get<{ results: ProfileSummary[] }>(profilePaths.profiles),
    get: (id: Uuid) => client.get<PatientProfileDetail>(profilePaths.profile(id)),
    update: (id: Uuid, body: ProfileUpdateInput) =>
      client.request<PatientProfileDetail>("PATCH", profilePaths.profile(id), { body }),

    identifiers: (id: Uuid) =>
      client.get<{ results: Identifier[] }>(profilePaths.profileAction(id, "identifiers")),
    addIdentifier: (id: Uuid, body: IdentifierInput) =>
      client.post<Identifier>(profilePaths.profileAction(id, "identifiers"), body),
    revealIdentifier: (id: Uuid, identifier: Uuid) =>
      client.post<{ value: string }>(
        `${profilePaths.profileAction(id, "identifiers")}${identifier}/reveal/`,
      ),

    addDependent: (body: DependentInput, idempotencyKey?: string) =>
      client.post<ProfileSummary>(
        profilePaths.dependents,
        body,
        idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {},
      ),
    delegations: () => client.get<Delegations>(profilePaths.delegations),
    createInvite: (body: { patient_id: Uuid; current_password: string; consent_version: string }) =>
      client.post<Invite>(profilePaths.delegations, body),
    acceptInvite: (code: string) => client.post<ProfileSummary>(profilePaths.accept, { code }),
    revoke: (id: Uuid) => client.post<void>(profilePaths.revoke(id)),

    insurance: (id: Uuid) =>
      client.get<{ results: InsuranceProfile[] }>(
        profilePaths.profileAction(id, "insurance-profiles"),
      ),
    addInsurance: (id: Uuid, body: InsuranceInput) =>
      client.post<InsuranceProfile>(profilePaths.profileAction(id, "insurance-profiles"), body),
    updateInsurance: (profile: Uuid, body: Partial<InsuranceInput> & { version: number }) =>
      client.request<InsuranceProfile>("PATCH", profilePaths.insurance(profile), { body }),
    deactivateInsurance: (profile: Uuid) =>
      client.post<InsuranceProfile>(profilePaths.insurance(profile, "deactivate")),
    uploadCard: (profile: Uuid, side: "front" | "back", file: Blob) =>
      uploadFile<InsuranceProfile>(client, {
        path: profilePaths.insurance(profile, "card-images"),
        file,
        filename: `card-${side}.jpg`,
        fields: { side },
      }),
    cardLink: (profile: Uuid, side: "front" | "back") =>
      client.post<DownloadLink>(
        `${profilePaths.insurance(profile, "card-images")}${side}/download-links/`,
      ),

    healthProfile: (id: Uuid) =>
      client.get<HealthProfile>(profilePaths.profileAction(id, "health-profile")),
    addHealthItem: (id: Uuid, kind: HealthKind, body: HealthItemInput) =>
      client.post<HealthItem>(profilePaths.profileAction(id, kind), body),
    removeHealthItem: (id: Uuid, kind: HealthKind, item: Uuid) =>
      client.post<HealthItem>(`${profilePaths.profileAction(id, kind)}${item}/entered-in-error/`),

    requestClaim: (body: { lookup: ClaimLookup; date_of_birth: string }) =>
      client.post<RecordClaim>(profilePaths.claims, body),
    claim: (id: Uuid) => client.get<RecordClaim>(profilePaths.claim(id)),
    verifyClaim: (id: Uuid, code: string) =>
      client.post<{ claim: RecordClaim; profile: ProfileSummary }>(
        profilePaths.claim(id, "verify"),
        {
          code,
        },
      ),

    consents: () => client.get<ConsentState>(profilePaths.consents),
    giveConsent: (body: {
      kind: string;
      version: string;
      granted: boolean;
      patient_id?: Uuid | null;
    }) => client.post<ConsentRecord>(profilePaths.consents, body),
    accessHistory: (id: Uuid, page = 1) =>
      client.get<Page<AccessHistoryItem>>(
        profilePaths.profileAction(id, "access-history") + query({ page }),
      ),
  };
}

export type ProfileApi = ReturnType<typeof createProfileApi>;
