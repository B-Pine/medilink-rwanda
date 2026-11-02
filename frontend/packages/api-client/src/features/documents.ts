/**
 * S7b documents (contract sprint-07 §3.3): letters and requests written in the consultation
 * (CR1), generated documents with versions and download links (D1-D4), printing at reception
 * (D3), patient share links (D5) and the public verification page (V1).
 *
 * No response carries the PDF's clinical text except the public details after a date-of-birth
 * match.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

declare module "../types" {
  interface PermissionCodes {
    "documents.print": true;
  }
}

export type ClinicalDocumentKind = "prescription" | "referral" | "lab_request" | "sick_note";
export const DOCUMENT_KINDS: ClinicalDocumentKind[] = [
  "prescription",
  "referral",
  "lab_request",
  "sick_note",
];
export type DocumentVerificationStatus = "active" | "dispensed" | "cancelled" | "expired";
export type ReferralUrgency = "routine" | "urgent" | "emergency";
export const REFERRAL_URGENCIES: ReferralUrgency[] = ["routine", "urgent", "emergency"];

interface SourceBase {
  id: Uuid;
  author_name: string;
  /** Null while the consultation is a draft: signed with it. */
  signed_at: string | null;
  document_id: Uuid | null;
}

export interface Referral extends SourceBase {
  to_facility_name: string;
  specialty: string;
  reason: string;
  urgency: ReferralUrgency;
}

export interface LabTest {
  code: string;
  name: string;
}

export interface LabRequest extends SourceBase {
  tests: LabTest[];
  reason: string;
}

export interface SickNote extends SourceBase {
  rest_from: string;
  rest_to: string;
  show_diagnosis: boolean;
}

export interface ReferralInput {
  to_facility_name: string;
  specialty: string;
  reason: string;
  urgency: ReferralUrgency;
}

export interface LabRequestInput {
  tests: LabTest[];
  reason: string;
}

export interface SickNoteInput {
  rest_from: string;
  rest_to: string;
  show_diagnosis: boolean;
}

export interface DocumentRow {
  id: Uuid;
  kind: ClinicalDocumentKind;
  number: string;
  document_date: string;
  patient_id: Uuid;
  facility_name: string;
  author_name: string;
  status: DocumentVerificationStatus;
  /** 0 while the first version is rendering. */
  version_no: number;
  released_at: string | null;
}

export interface DocumentVersion {
  version_no: number;
  created_at: string;
  superseded_at: string | null;
  size_bytes: number;
}

export interface ShareLink {
  id: Uuid;
  expires_at: string;
  revoked_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
}

export interface NewShareLink extends ShareLink {
  /** Shown once. */
  token: string;
  url: string;
}

export interface DocumentDetail extends DocumentRow {
  verification_code: string;
  versions: DocumentVersion[];
}

export interface PatientDocument extends DocumentDetail {
  share_links: ShareLink[];
}

export interface DocumentLink {
  url: string;
  expires_at: string;
}

export interface DocumentVerification {
  code: string;
  kind: ClinicalDocumentKind;
  number: string;
  status: DocumentVerificationStatus;
  issued_at: string;
  valid_until: string | null;
  facility_name: string;
  author_name: string;
  author_licence: string;
  version_no: number;
}

export interface DocumentVerificationDetails extends DocumentVerification {
  patient_name: string;
  sections: { heading: string; lines: string[] }[];
}

export interface SharedDocument {
  kind: ClinicalDocumentKind;
  number: string;
  document_date: string;
  facility_name: string;
  expires_at: string;
  download: DocumentLink;
}

const STF = "/api/v1/staff";
const PAT = "/api/v1/patient/documents";
const PUB = "/api/v1/public";

export const documentsPaths = {
  referrals: (consultationId: Uuid) => `${STF}/consultations/${consultationId}/referrals/`,
  labRequests: (consultationId: Uuid) => `${STF}/consultations/${consultationId}/lab-requests/`,
  sickNotes: (consultationId: Uuid) => `${STF}/consultations/${consultationId}/sick-notes/`,
  list: `${STF}/documents/`,
  one: (id: Uuid) => `${STF}/documents/${id}/`,
  downloadLink: (id: Uuid) => `${STF}/documents/${id}/download-link/`,
  print: (id: Uuid) => `${STF}/documents/${id}/print/`,
  patientList: `${PAT}/`,
  patientArchive: `${PAT}/archive/`,
  patientOne: (id: Uuid) => `${PAT}/${id}/`,
  patientDownloadLink: (id: Uuid) => `${PAT}/${id}/download-link/`,
  shareLinks: (id: Uuid) => `${PAT}/${id}/share-links/`,
  shareLink: (id: Uuid, linkId: Uuid) => `${PAT}/${id}/share-links/${linkId}/`,
  verify: (code: string) => `${PUB}/verify/${encodeURIComponent(code)}/`,
  verifyDetails: (code: string) => `${PUB}/verify/${encodeURIComponent(code)}/details/`,
  shared: (token: string) => `${PUB}/shared-documents/${encodeURIComponent(token)}/`,
};

function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createDocumentsApi(client: ApiClient) {
  return {
    referrals: (consultationId: Uuid) =>
      client.get<Referral[]>(documentsPaths.referrals(consultationId)),
    addReferral: (consultationId: Uuid, body: ReferralInput) =>
      client.post<Referral>(documentsPaths.referrals(consultationId), body),
    labRequests: (consultationId: Uuid) =>
      client.get<LabRequest[]>(documentsPaths.labRequests(consultationId)),
    addLabRequest: (consultationId: Uuid, body: LabRequestInput) =>
      client.post<LabRequest>(documentsPaths.labRequests(consultationId), body),
    sickNotes: (consultationId: Uuid) =>
      client.get<SickNote[]>(documentsPaths.sickNotes(consultationId)),
    addSickNote: (consultationId: Uuid, body: SickNoteInput) =>
      client.post<SickNote>(documentsPaths.sickNotes(consultationId), body),
    /** D1: give `facility_patient_id` or `visit_id`. */
    list: (params: {
      facility_patient_id?: Uuid;
      visit_id?: Uuid;
      kind?: ClinicalDocumentKind;
      page?: number;
    }) => client.get<Paginated<DocumentRow>>(documentsPaths.list + query(params)),
    get: (id: Uuid) => client.get<DocumentDetail>(documentsPaths.one(id)),
    downloadLink: (id: Uuid) => client.post<DocumentLink>(documentsPaths.downloadLink(id), {}),
    print: (id: Uuid) => client.post<DocumentLink>(documentsPaths.print(id), {}),
    patient: {
      list: (params: { patient_id?: Uuid; kind?: ClinicalDocumentKind; page?: number } = {}) =>
        client.get<Paginated<DocumentRow>>(documentsPaths.patientList + query(params)),
      get: (id: Uuid) => client.get<PatientDocument>(documentsPaths.patientOne(id)),
      downloadLink: (id: Uuid) =>
        client.post<DocumentLink>(documentsPaths.patientDownloadLink(id), {}),
      /** A ZIP of every document (100 at most), as a 5-minute link. */
      archive: (patientId?: Uuid) =>
        client.post<DocumentLink>(
          documentsPaths.patientArchive + query({ patient_id: patientId }),
          {},
        ),
      share: (id: Uuid, expiresInDays: number) =>
        client.post<NewShareLink>(documentsPaths.shareLinks(id), {
          expires_in_days: expiresInDays,
        }),
      revokeShare: (id: Uuid, linkId: Uuid) =>
        client.request<void>("DELETE", documentsPaths.shareLink(id, linkId)),
    },
    public: {
      verify: (code: string) => client.get<DocumentVerification>(documentsPaths.verify(code)),
      details: (code: string, dateOfBirth: string) =>
        client.post<DocumentVerificationDetails>(documentsPaths.verifyDetails(code), {
          date_of_birth: dateOfBirth,
        }),
      shared: (token: string) => client.get<SharedDocument>(documentsPaths.shared(token)),
    },
  };
}

export type DocumentsApi = ReturnType<typeof createDocumentsApi>;
