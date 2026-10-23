import type { ApiClient } from "../client";
import { ApiError, networkError, parseErrorResponse } from "../errors";
import type { ApiErrorBody, Uuid } from "../types";

/** Upload pipeline v1 (sprint-01 §2.4, §3.6). Same `Upload` shape in every audience. */

export type UploadStatus = "pending" | "clean" | "infected" | "rejected" | "failed";
export type UploadAudience = "staff" | "patient";
export type Disposition = "inline" | "attachment";

export interface Upload {
  id: Uuid;
  purpose: string;
  status: UploadStatus;
  rejection_reason: string | null;
  content_type: string;
  size_bytes: number;
  original_filename: string;
  sha256: string;
  created_at: string;
  scanned_at: string | null;
  is_attached: boolean;
}

export interface DownloadLink {
  url: string;
  expires_at: string;
  disposition: Disposition;
}

export const FINAL_UPLOAD_STATUSES: readonly UploadStatus[] = [
  "clean",
  "infected",
  "rejected",
  "failed",
];

/** Client-side pre-check only (fast feedback); the server sniffs the content and decides. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ACCEPT = "application/pdf,image/jpeg,image/png,image/heic,image/heif";

export const uploadPaths = {
  uploads: (audience: UploadAudience) => `/api/v1/${audience}/uploads/`,
  upload: (audience: UploadAudience, id: Uuid) => `/api/v1/${audience}/uploads/${id}/`,
  downloadLinks: (audience: UploadAudience, id: Uuid) =>
    `/api/v1/${audience}/uploads/${id}/download-links/`,
} as const;

export interface UploadOptions {
  /** Endpoint receiving the multipart body (generic uploads or an owner's own endpoint). */
  path: string;
  file: File | Blob;
  filename?: string;
  /** Extra multipart fields (`purpose`, `kind`, `number`, …). */
  fields?: Record<string, string | null | undefined>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  idempotencyKey?: string;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Multipart upload with progress (XMLHttpRequest: fetch has no upload progress). Uses the
 * client's CSRF token, credentials and Accept-Language, and parses errors into ApiError.
 */
export async function uploadFile<T>(client: ApiClient, options: UploadOptions): Promise<T> {
  const token = await client.ensureCsrfToken();
  const form = new FormData();
  for (const [name, value] of Object.entries(options.fields ?? {})) {
    if (value !== undefined && value !== null && value !== "") form.append(name, value);
  }
  form.append("file", options.file, options.filename ?? (options.file as File).name ?? "file");
  if (typeof XMLHttpRequest === "undefined")
    return uploadWithFetch<T>(client, options, form, token);
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${client.baseUrl}${options.path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Accept-Language", client.language());
    xhr.setRequestHeader("X-CSRFToken", token);
    if (options.idempotencyKey) xhr.setRequestHeader("Idempotency-Key", options.idempotencyKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = undefined;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(1);
        resolve(body as T);
        return;
      }
      const envelope = (body as ApiErrorBody | undefined)?.error;
      if (envelope?.code === "csrf_failed") client.resetCsrfToken();
      reject(
        new ApiError({
          status: xhr.status,
          code: envelope?.code ?? "server_error",
          message: envelope?.message ?? xhr.statusText,
          fields: envelope?.fields ?? {},
          requestId: envelope?.request_id ?? null,
        }),
      );
    };
    xhr.onerror = () => reject(networkError(new Error("Upload failed")));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Fallback without XMLHttpRequest (Node, workers): same request, no progress events. */
async function uploadWithFetch<T>(
  client: ApiClient,
  options: UploadOptions,
  form: FormData,
  token: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": client.language(),
    "X-CSRFToken": token,
  };
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`${client.baseUrl}${options.path}`, {
      method: "POST",
      body: form,
      headers,
      credentials: "include",
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError(error);
  }
  if (!response.ok) {
    const error = await parseErrorResponse(response);
    if (error.code === "csrf_failed") client.resetCsrfToken();
    throw error;
  }
  options.onProgress?.(1);
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function createUploadsApi(client: ApiClient, audience: UploadAudience) {
  return {
    upload: (
      purpose: string,
      file: File | Blob,
      options: Omit<UploadOptions, "path" | "file" | "fields"> & {
        fields?: UploadOptions["fields"];
      } = {},
    ) =>
      uploadFile<Upload>(client, {
        ...options,
        path: uploadPaths.uploads(audience),
        file,
        fields: { purpose, ...options.fields },
      }),
    get: (id: Uuid, signal?: AbortSignal) =>
      client.get<Upload>(uploadPaths.upload(audience, id), signal ? { signal } : {}),
    downloadLink: (id: Uuid, disposition: Disposition = "inline") =>
      client.post<DownloadLink>(uploadPaths.downloadLinks(audience, id), { disposition }),
  };
}

export type UploadsApi = ReturnType<typeof createUploadsApi>;
