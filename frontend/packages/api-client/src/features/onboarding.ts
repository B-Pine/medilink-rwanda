import type { ApiClient } from "../client";
import type { FacilityType, LanguageCode, Uuid } from "../types";
import { query, type ListParams, type Page } from "./masterdata";
import { uploadFile, type DownloadLink, type Disposition, type Upload } from "./uploads";

/** Facility onboarding (sprint-01 §2.3, §3.1, §3.2, §3.5). */

export type ApplicationStatus =
  "draft" | "submitted" | "under_review" | "changes_requested" | "approved" | "rejected";
export type Ownership = "public" | "private" | "faith_based" | "ngo";
export type DocumentKind =
  | "moh_licence"
  | "rdb_registration"
  | "tin_certificate"
  | "accreditation"
  | "insurer_contract"
  | "other";
export type ReviewStatus = "pending" | "accepted" | "needs_change";
export type FacilityStatus = "approved" | "setup" | "live" | "suspended" | "deactivated";
export type LicenceKind =
  "moh_operating" | "pharmacy" | "rdb_registration" | "accreditation" | "other";
export type LicenceState = "valid" | "expiring" | "expired" | "missing";
export type NoteKind = "call" | "visit" | "document_check" | "other";

export interface Person {
  id: Uuid;
  full_name: string;
}

export interface ApplicationDocument {
  id: Uuid;
  kind: DocumentKind;
  insurer_code: string | null;
  number: string;
  issued_on: string | null;
  expires_on: string | null;
  review_status: ReviewStatus;
  review_comment: string;
  upload: Upload;
}

export interface ItemComment {
  target: string;
  comment: string;
}

export interface ApplicantApplication {
  id: Uuid;
  status: ApplicationStatus;
  version: number;
  facility: {
    name: string;
    facility_type: FacilityType | "";
    level_of_care: string;
    ownership: Ownership | "";
    organization_name: string;
    phone: string;
    email: string;
  };
  location: {
    village_code: string | null;
    address: string;
    latitude: number | null;
    longitude: number | null;
    path: { level: string; code: string; name: string }[];
  };
  applicant: { name: string; email: string; phone: string; position: string };
  proposed_admin: { name: string; email: string; phone: string };
  claimed_insurer_codes: string[];
  documents: ApplicationDocument[];
  agreements: {
    accepted_terms_version: string | null;
    accepted_dpa_version: string | null;
    ncsa_registration_confirmed: boolean;
  };
  feedback: {
    general_comment: string;
    items: ItemComment[];
    rejection: { reason_code: string; reason_label: string; reason_text: string } | null;
  };
  missing_for_submit: string[];
  preferred_language: LanguageCode;
  submitted_at: string | null;
  updated_at: string;
}

export interface DuplicateHint {
  kind: "same_licence_number" | "same_applicant_email" | "same_name_in_district";
  application_id: Uuid | null;
  facility_id: Uuid | null;
}

export interface PlatformApplication extends ApplicantApplication {
  created_by_platform: boolean;
  reviewer: Person | null;
  facility_id: Uuid | null;
  suggested_slug: string;
  last_activity_at: string | null;
  duplicate_hints: DuplicateHint[];
}

export interface ApplicationSummary {
  id: Uuid;
  status: ApplicationStatus;
  facility_name: string;
  facility_type: string;
  district_code: string;
  applicant_name: string;
  created_by_platform: boolean;
  submitted_at: string | null;
  last_activity_at: string | null;
  reviewer: Person | null;
}

export interface ApplicationEvent {
  id: Uuid;
  kind:
    "status_change" | "note" | "item_comments" | "document_review" | "link_sent" | "platform_edit";
  from_status: string;
  to_status: string;
  actor_kind: "applicant" | "platform_admin" | "system";
  actor: Person | null;
  note_kind: string;
  note: string;
  reason_code: string;
  item_comments: ItemComment[];
  metadata: Record<string, unknown>;
  occurred_at: string;
  occurred_on: string | null;
}

export interface PlatformFacility {
  id: Uuid;
  name: string;
  slug: string;
  facility_type: string;
  level_of_care: string;
  ownership: string;
  status: FacilityStatus;
  district: { code: string; name: string } | null;
  application_id: Uuid | null;
  licence_state: LicenceState;
  next_licence_expiry: string | null;
  created_at: string;
  version: number;
}

export interface Licence {
  id: Uuid;
  kind: LicenceKind;
  number: string;
  issued_on: string | null;
  expires_on: string;
  state: LicenceState;
  upload_id: Uuid | null;
  verified_by: Person | null;
  verified_at: string | null;
  superseded_at: string | null;
  version: number;
}

export interface PlatformFacilityDetail extends PlatformFacility {
  application: ApplicationSummary | null;
  licences: Licence[];
}

export interface StatusEvent {
  id: Uuid;
  from_status: string;
  to_status: string;
  reason_code: string;
  reason_label: string;
  reason_text: string;
  actor: Person | null;
  occurred_at: string;
}

export interface FeatureFlag {
  code: string;
  description: string;
  default_enabled: boolean;
  is_active: boolean;
  override_count: number;
  version: number;
}

export interface FacilityFeatureFlag {
  code: string;
  is_enabled: boolean;
  source: "override" | "default";
  note: string;
  set_by: Person | null;
  updated_at: string | null;
}

export interface PlatformOverview {
  applications: { submitted: number; under_review: number; changes_requested: number };
  licences: { expiring_60: number; expiring_30: number; expired: number };
  facilities: Record<FacilityStatus, number>;
  oldest_waiting_application: { id: Uuid; submitted_at: string } | null;
}

export interface ApplicationPatch {
  version: number;
  facility?: Partial<ApplicantApplication["facility"]>;
  location?: {
    village_code?: string;
    address?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  applicant?: Partial<ApplicantApplication["applicant"]>;
  proposed_admin?: Partial<ApplicantApplication["proposed_admin"]>;
  claimed_insurer_codes?: string[];
}

export interface DocumentFields {
  kind: DocumentKind;
  insurer_code?: string;
  number?: string;
  issued_on?: string;
  expires_on?: string;
}

export interface ApproveRequest {
  version: number;
  slug: string;
  organization_name: string;
  facility_type: string;
  ownership: Ownership;
  licences: {
    document_id?: Uuid;
    kind: LicenceKind;
    number: string;
    issued_on?: string;
    expires_on: string;
  }[];
}

export interface ReasonRequest {
  version: number;
  reason_code: string;
  reason_text?: string;
}

export type FacilityAction = "start-setup" | "go-live" | "suspend" | "reactivate" | "deactivate";

export const TERMS_VERSION = "2026-10";
export const DPA_VERSION = "2026-10";

const PUBLIC = "/api/v1/public/facility-applications/";
const PLATFORM = "/api/v1/platform/facility-applications/";
const FACILITIES = "/api/v1/platform/facilities/";

export const onboardingPaths = {
  publicApplications: PUBLIC,
  resumeLinks: `${PUBLIC}resume-links/`,
  resume: `${PUBLIC}resume/`,
  publicApplication: (id: Uuid) => `${PUBLIC}${id}/`,
  publicDocuments: (id: Uuid) => `${PUBLIC}${id}/documents/`,
  publicDocument: (id: Uuid, doc: Uuid) => `${PUBLIC}${id}/documents/${doc}/`,
  submit: (id: Uuid) => `${PUBLIC}${id}/submit/`,
  endSession: (id: Uuid) => `${PUBLIC}${id}/end-session/`,
  overview: "/api/v1/platform/overview/",
  applications: PLATFORM,
  application: (id: Uuid) => `${PLATFORM}${id}/`,
  applicationAction: (id: Uuid, action: string) => `${PLATFORM}${id}/${action}/`,
  documents: (id: Uuid) => `${PLATFORM}${id}/documents/`,
  documentAction: (id: Uuid, doc: Uuid, action: string) =>
    `${PLATFORM}${id}/documents/${doc}/${action}/`,
  facilities: FACILITIES,
  facility: (id: Uuid) => `${FACILITIES}${id}/`,
  facilityAction: (id: Uuid, action: string) => `${FACILITIES}${id}/${action}/`,
  licence: (id: Uuid, licence: Uuid) => `${FACILITIES}${id}/licences/${licence}/`,
  facilityFlag: (id: Uuid, code: string) => `${FACILITIES}${id}/feature-flags/${code}/`,
  flags: "/api/v1/platform/feature-flags/",
  flag: (code: string) => `/api/v1/platform/feature-flags/${code}/`,
} as const;

const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : {});
const applicantCall = { skipUnauthorizedHook: true } as const;

export function createOnboardingApi(client: ApiClient) {
  return {
    applicant: {
      start: (body: {
        applicant: { name: string; email: string; phone?: string; position?: string };
        facility_name: string;
        preferred_language: LanguageCode;
        website?: string;
      }) =>
        client.post<ApplicantApplication>(onboardingPaths.publicApplications, body, applicantCall),
      requestResumeLinks: (email: string) =>
        client.post<void>(onboardingPaths.resumeLinks, { email }, applicantCall),
      resume: (token: string) =>
        client.post<ApplicantApplication>(onboardingPaths.resume, { token }, applicantCall),
      get: (id: Uuid, signal?: AbortSignal) =>
        client.get<ApplicantApplication>(
          onboardingPaths.publicApplication(id),
          signal ? { signal, ...applicantCall } : applicantCall,
        ),
      update: (id: Uuid, body: ApplicationPatch) =>
        client.request<ApplicantApplication>("PATCH", onboardingPaths.publicApplication(id), {
          body,
          ...applicantCall,
        }),
      uploadDocument: (
        id: Uuid,
        file: File | Blob,
        fields: DocumentFields,
        options: {
          onProgress?: (f: number) => void;
          signal?: AbortSignal;
          idempotencyKey?: string;
        } = {},
      ) =>
        uploadFile<ApplicationDocument>(client, {
          path: onboardingPaths.publicDocuments(id),
          file,
          fields: { ...fields },
          ...options,
        }),
      updateDocument: (id: Uuid, doc: Uuid, body: Partial<DocumentFields>) =>
        client.request<ApplicationDocument>("PATCH", onboardingPaths.publicDocument(id, doc), {
          body,
          ...applicantCall,
        }),
      deleteDocument: (id: Uuid, doc: Uuid) =>
        client.request<void>("DELETE", onboardingPaths.publicDocument(id, doc), applicantCall),
      submit: (id: Uuid, version: number, idempotencyKey: string) =>
        client.post<ApplicantApplication>(
          onboardingPaths.submit(id),
          {
            version,
            accepted_terms_version: TERMS_VERSION,
            accepted_dpa_version: DPA_VERSION,
            ncsa_registration_confirmed: true,
          },
          { ...applicantCall, ...idem(idempotencyKey) },
        ),
      endSession: (id: Uuid) =>
        client.post<void>(onboardingPaths.endSession(id), undefined, applicantCall),
    },

    platform: {
      overview: () => client.get<PlatformOverview>(onboardingPaths.overview),
      applications: (params?: ListParams & { status?: string }) =>
        client.get<Page<ApplicationSummary>>(onboardingPaths.applications + query(params)),
      create: (body: {
        applicant: { name: string; email: string; phone?: string; position?: string };
        facility: { name: string };
        send_link: boolean;
      }) => client.post<PlatformApplication>(onboardingPaths.applications, body),
      application: (id: Uuid) => client.get<PlatformApplication>(onboardingPaths.application(id)),
      update: (id: Uuid, body: ApplicationPatch) =>
        client.request<PlatformApplication>("PATCH", onboardingPaths.application(id), { body }),
      uploadDocument: (
        id: Uuid,
        file: File | Blob,
        fields: DocumentFields,
        onProgress?: (f: number) => void,
      ) =>
        uploadFile<ApplicationDocument>(client, {
          path: onboardingPaths.documents(id),
          file,
          fields: { ...fields },
          ...(onProgress ? { onProgress } : {}),
        }),
      sendResumeLink: (id: Uuid) =>
        client.post<void>(onboardingPaths.applicationAction(id, "send-resume-link")),
      startReview: (id: Uuid, version: number) =>
        client.post<PlatformApplication>(onboardingPaths.applicationAction(id, "start-review"), {
          version,
        }),
      reviewDocument: (
        id: Uuid,
        doc: Uuid,
        review_status: "accepted" | "needs_change",
        comment = "",
      ) =>
        client.post<ApplicationDocument>(onboardingPaths.documentAction(id, doc, "review"), {
          review_status,
          comment,
        }),
      documentLink: (id: Uuid, doc: Uuid, disposition: Disposition = "inline") =>
        client.post<DownloadLink>(onboardingPaths.documentAction(id, doc, "download-links"), {
          disposition,
        }),
      requestChanges: (
        id: Uuid,
        body: { version: number; general_comment: string; items: ItemComment[] },
        idempotencyKey: string,
      ) =>
        client.post<PlatformApplication>(
          onboardingPaths.applicationAction(id, "request-changes"),
          body,
          idem(idempotencyKey),
        ),
      approve: (id: Uuid, body: ApproveRequest, idempotencyKey: string) =>
        client.post<{ application: PlatformApplication; facility: PlatformFacility }>(
          onboardingPaths.applicationAction(id, "approve"),
          body,
          idem(idempotencyKey),
        ),
      reject: (id: Uuid, body: ReasonRequest, idempotencyKey: string) =>
        client.post<PlatformApplication>(
          onboardingPaths.applicationAction(id, "reject"),
          body,
          idem(idempotencyKey),
        ),
      notes: (id: Uuid) =>
        client.get<ApplicationEvent[]>(onboardingPaths.applicationAction(id, "notes")),
      addNote: (id: Uuid, body: { note_kind: NoteKind; text: string; occurred_on?: string }) =>
        client.post<ApplicationEvent>(onboardingPaths.applicationAction(id, "notes"), body),
      events: (id: Uuid) =>
        client.get<ApplicationEvent[]>(onboardingPaths.applicationAction(id, "events")),

      facilities: (params?: ListParams) =>
        client.get<Page<PlatformFacility>>(onboardingPaths.facilities + query(params)),
      facility: (id: Uuid) => client.get<PlatformFacilityDetail>(onboardingPaths.facility(id)),
      statusEvents: (id: Uuid) =>
        client.get<StatusEvent[]>(onboardingPaths.facilityAction(id, "status-events")),
      facilityAction: (
        id: Uuid,
        action: FacilityAction,
        body: {
          version: number;
          reason_code?: string;
          reason_text?: string;
          confirm_slug?: string;
        },
        idempotencyKey: string,
      ) =>
        client.post<PlatformFacility>(
          onboardingPaths.facilityAction(id, action),
          body,
          idem(idempotencyKey),
        ),
      licences: (id: Uuid) => client.get<Licence[]>(onboardingPaths.facilityAction(id, "licences")),
      addLicence: (
        id: Uuid,
        body: {
          kind: LicenceKind;
          number: string;
          issued_on?: string;
          expires_on: string;
          upload_id?: Uuid;
          renews_licence_id?: Uuid;
        },
      ) => client.post<Licence>(onboardingPaths.facilityAction(id, "licences"), body),
      correctLicence: (
        id: Uuid,
        licence: Uuid,
        body: { version: number; number?: string; issued_on?: string; expires_on?: string },
      ) => client.request<Licence>("PATCH", onboardingPaths.licence(id, licence), { body }),
      facilityFlags: (id: Uuid) =>
        client.get<FacilityFeatureFlag[]>(onboardingPaths.facilityAction(id, "feature-flags")),
      setFacilityFlag: (id: Uuid, code: string, body: { is_enabled: boolean; note?: string }) =>
        client.request<FacilityFeatureFlag>("PUT", onboardingPaths.facilityFlag(id, code), {
          body,
        }),
      clearFacilityFlag: (id: Uuid, code: string) =>
        client.request<void>("DELETE", onboardingPaths.facilityFlag(id, code)),
      flags: () => client.get<FeatureFlag[]>(onboardingPaths.flags),
      updateFlag: (
        code: string,
        body: { version: number; default_enabled?: boolean; description?: string },
      ) => client.request<FeatureFlag>("PATCH", onboardingPaths.flag(code), { body }),
    },
  };
}

export type OnboardingApi = ReturnType<typeof createOnboardingApi>;
