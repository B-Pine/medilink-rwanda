/**
 * S6b legacy register import (contract sprint-06 §3.3 L1, FR-PAT-10): upload a CSV register,
 * map its columns, preview each row's problems and likely duplicates, confirm (step-up), and roll
 * back within 7 days while no imported patient has a visit. Nothing is created before confirm.
 */
import type { ApiClient } from "../client";
import type { Uuid } from "../types";
import type { Paginated } from "./clinical";

export const PATIENT_IMPORT_FIELDS = [
  "full_name",
  "sex",
  "date_of_birth",
  "phone",
  "file_number",
  "national_id",
] as const;
export type PatientImportField = (typeof PATIENT_IMPORT_FIELDS)[number];
export const PATIENT_IMPORT_REQUIRED: readonly PatientImportField[] = ["full_name", "sex"];
/** The upload purpose (S1 pipeline): CSV, at most 5 MB and 5,000 rows. */
export const PATIENT_IMPORT_PURPOSE = "patient_import";

export type PatientImportStatus = "uploaded" | "previewed" | "confirmed" | "rolled_back" | "failed";
export type PatientImportRowStatus =
  "pending" | "valid" | "error" | "duplicate" | "created" | "rolled_back";

/** Field → the file's column header ("" when not mapped). */
export type PatientImportMapping = Partial<Record<PatientImportField, string>>;

export interface PatientImportBatch {
  id: Uuid;
  status: PatientImportStatus;
  file_name: string;
  headers: string[];
  column_mapping: PatientImportMapping;
  row_count: number;
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  created_count: number;
  created_by_name: string;
  created_at: string;
  confirmed_at: string | null;
  rollback_until: string | null;
  can_roll_back: boolean;
  rolled_back_at: string | null;
  version: number;
}

export interface PatientImportRow {
  row_number: number;
  status: PatientImportRowStatus;
  full_name: string;
  sex: string | null;
  date_of_birth: string | null;
  file_number: string | null;
  /** National IDs never leave the server in a preview (C3). */
  has_national_id: boolean;
  /** `required`, `invalid`, `out_of_range`, `taken` per field. */
  problems: { field: PatientImportField; code: string }[];
  matched_patient_id: Uuid | null;
  created_facility_patient_id: Uuid | null;
}

const S = "/api/v1/staff/patient-imports";

export const patientImportPaths = {
  list: `${S}/`,
  one: (id: Uuid) => `${S}/${id}/`,
  mapping: (id: Uuid) => `${S}/${id}/mapping/`,
  rows: (id: Uuid) => `${S}/${id}/rows/`,
  confirm: (id: Uuid) => `${S}/${id}/confirm/`,
  rollback: (id: Uuid) => `${S}/${id}/rollback/`,
};

function query(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function createPatientImportsApi(client: ApiClient) {
  return {
    list: (params: { page?: number } = {}) =>
      client.get<Paginated<PatientImportBatch>>(patientImportPaths.list + query(params)),
    /** From a clean `patient_import` upload; `422` when not a CSV, empty, or over 5,000 rows. */
    start: (uploadId: Uuid) =>
      client.post<PatientImportBatch>(patientImportPaths.list, { upload_id: uploadId }),
    get: (id: Uuid) => client.get<PatientImportBatch>(patientImportPaths.one(id)),
    /** Map the columns and check every row (preview); `full_name` and `sex` are required. */
    map: (id: Uuid, version: number, mapping: PatientImportMapping) =>
      client.request<PatientImportBatch>("PUT", patientImportPaths.mapping(id), {
        body: { version, mapping },
      }),
    rows: (id: Uuid, params: { status?: PatientImportRowStatus; page?: number } = {}) =>
      client.get<Paginated<PatientImportRow>>(patientImportPaths.rows(id) + query(params)),
    /** Step-up. Creates the valid rows' patients in one transaction. */
    confirm: (id: Uuid, version: number) =>
      client.post<PatientImportBatch>(patientImportPaths.confirm(id), { version }),
    /** Step-up. Within 7 days, while no imported patient has a visit. */
    rollback: (id: Uuid, version: number) =>
      client.post<PatientImportBatch>(patientImportPaths.rollback(id), { version }),
  };
}

export type PatientImportsApi = ReturnType<typeof createPatientImportsApi>;
