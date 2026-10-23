import type { ApiClient } from "../client";
import type { LanguageCode, Uuid } from "../types";
import { uploadFile, type Upload } from "./uploads";

/** Master data (sprint-01 §2.2, §3.2, §3.3, §3.5; paths S1-D11). */

export type MasterDataKind =
  | "locations"
  | "facility-types"
  | "service-catalogue-items"
  | "insurers"
  | "drugs"
  | "diagnosis-codes"
  | "symptoms"
  | "public-holidays"
  | "reason-codes";

export const MASTER_DATA_KINDS: readonly MasterDataKind[] = [
  "locations",
  "facility-types",
  "service-catalogue-items",
  "insurers",
  "drugs",
  "diagnosis-codes",
  "symptoms",
  "public-holidays",
  "reason-codes",
];
export const PUBLIC_MASTER_DATA_KINDS: readonly MasterDataKind[] = [
  "locations",
  "facility-types",
  "service-catalogue-items",
  "insurers",
  "public-holidays",
];
export const IMPORTABLE_KINDS: readonly MasterDataKind[] = [
  "locations",
  "drugs",
  "diagnosis-codes",
  "symptoms",
];
/** Kinds shown to patients need rw, en and fr. */
export const ALL_LANGUAGE_KINDS: readonly MasterDataKind[] = [
  "facility-types",
  "service-catalogue-items",
  "symptoms",
  "public-holidays",
  "reason-codes",
];

export type I18nText = Partial<Record<LanguageCode, string>>;
export type LocationLevel = "province" | "district" | "sector" | "cell" | "village";

/** Public and staff views: localised `name`/`title`/`label`, plus the kind's own columns. */
export interface LocalisedItem {
  id: Uuid;
  is_active: boolean;
  version: number;
  code?: string;
  name?: string;
  [column: string]: unknown;
}

export interface LocationItem extends LocalisedItem {
  code: string;
  level: LocationLevel;
  name: string;
  parent_code: string | null;
  has_children: boolean;
}

/** Platform view: raw `*_i18n` objects and `missing_languages`. */
export interface PlatformItem {
  id: Uuid;
  is_active: boolean;
  sort_order: number;
  version: number;
  missing_languages: LanguageCode[];
  created_at: string;
  updated_at: string;
  [column: string]: unknown;
}

export interface MasterDataChange {
  id: Uuid;
  row_version: number;
  action: "create" | "update" | "retire" | "restore" | "import";
  old: Record<string, unknown> | null;
  new: Record<string, unknown>;
  actor: { id: Uuid; full_name: string } | null;
  changed_at: string;
}

export type ImportStatus =
  "validating" | "previewed" | "invalid" | "applying" | "applied" | "failed" | "expired";
export type ImportMode = "upsert" | "upsert_and_retire_missing";

export interface MasterDataImport {
  id: Uuid;
  kind: MasterDataKind;
  mode: ImportMode;
  status: ImportStatus;
  upload: Upload;
  expires_at: string;
  confirmed_at: string | null;
  applied_at: string | null;
  summary: {
    rows: number;
    create: number;
    update: number;
    retire: number;
    unchanged: number;
    errors: number;
  };
  errors: { line: number; field: string; message: string }[];
  sample_changes: { code: string; action: string; changes: Record<string, unknown> }[];
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type ListParams = Record<string, string | number | boolean | undefined | null>;

export function query(params: ListParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const masterDataPaths = {
  public: (kind: MasterDataKind) => `/api/v1/public/master-data/${kind}/`,
  staff: (kind: MasterDataKind) => `/api/v1/staff/master-data/${kind}/`,
  platform: (kind: MasterDataKind) => `/api/v1/platform/master-data/${kind}/`,
  platformItem: (kind: MasterDataKind, id: Uuid) => `/api/v1/platform/master-data/${kind}/${id}/`,
  changes: (kind: MasterDataKind, id: Uuid) =>
    `/api/v1/platform/master-data/${kind}/${id}/changes/`,
  imports: (kind: MasterDataKind) => `/api/v1/platform/master-data/${kind}/imports/`,
  import: (kind: MasterDataKind, id: Uuid) => `/api/v1/platform/master-data/${kind}/imports/${id}/`,
  confirm: (kind: MasterDataKind, id: Uuid) =>
    `/api/v1/platform/master-data/${kind}/imports/${id}/confirm/`,
} as const;

export function createMasterDataApi(client: ApiClient) {
  return {
    publicList: <T extends LocalisedItem = LocalisedItem>(
      kind: MasterDataKind,
      params?: ListParams,
    ) => client.get<Page<T>>(masterDataPaths.public(kind) + query(params)),
    staffList: <T extends LocalisedItem = LocalisedItem>(
      kind: MasterDataKind,
      params?: ListParams,
    ) => client.get<Page<T>>(masterDataPaths.staff(kind) + query(params)),
    platform: {
      list: (kind: MasterDataKind, params?: ListParams) =>
        client.get<Page<PlatformItem>>(masterDataPaths.platform(kind) + query(params)),
      get: (kind: MasterDataKind, id: Uuid) =>
        client.get<PlatformItem>(masterDataPaths.platformItem(kind, id)),
      create: (kind: MasterDataKind, body: Record<string, unknown>) =>
        client.post<PlatformItem>(masterDataPaths.platform(kind), body),
      /** `is_active: false` retires, `true` restores; `code` is immutable. */
      update: (
        kind: MasterDataKind,
        id: Uuid,
        body: Record<string, unknown> & { version: number },
      ) => client.request<PlatformItem>("PATCH", masterDataPaths.platformItem(kind, id), { body }),
      changes: (kind: MasterDataKind, id: Uuid) =>
        client.get<Page<MasterDataChange>>(masterDataPaths.changes(kind, id)),
      startImport: (
        kind: MasterDataKind,
        file: File | Blob,
        mode: ImportMode,
        onProgress?: (fraction: number) => void,
      ) =>
        uploadFile<MasterDataImport>(client, {
          path: masterDataPaths.imports(kind),
          file,
          fields: { mode },
          ...(onProgress ? { onProgress } : {}),
        }),
      getImport: (kind: MasterDataKind, id: Uuid) =>
        client.get<MasterDataImport>(masterDataPaths.import(kind, id)),
      confirmImport: (kind: MasterDataKind, id: Uuid, idempotencyKey: string) =>
        client.post<MasterDataImport>(masterDataPaths.confirm(kind, id), undefined, {
          headers: { "Idempotency-Key": idempotencyKey },
        }),
    },
  };
}

export type MasterDataApi = ReturnType<typeof createMasterDataApi>;
