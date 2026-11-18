import type { ApiClient } from "../client";

/**
 * Images on Cloudinary (signed direct upload): the API signs, the browser posts the file straight
 * to Cloudinary, then the owning resource gets the returned `public_id` (the server checks it and
 * stores only that). Facility photos and logos, clinician and patient avatars; identity documents
 * stay in the scanned upload pipeline (`uploads`).
 */

export type ImageKind = "facility_photo" | "facility_logo" | "provider_avatar" | "patient_avatar";
export type ImageAudience = "staff" | "patient";

export interface UploadSignature {
  timestamp: number;
  upload_preset: string;
  asset_folder: string;
  tags: string;
  signature: string;
  api_key: string;
  cloud_name: string;
  upload_url: string;
}

export interface CloudinaryImage {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
}

/** A Cloudinary image as the API returns it on a resource. */
export interface StoredImage {
  public_id: string;
  url: string | null;
  thumb_url: string | null;
}

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;
export const IMAGE_ACCEPT = IMAGE_TYPES.join(",");

export type ImageUploadErrorCode = "type" | "size" | "upload" | "network";

/** Raised before or during the Cloudinary leg; `code` picks the message to show. */
export class ImageUploadError extends Error {
  constructor(readonly code: ImageUploadErrorCode) {
    super(`Image upload failed: ${code}`);
    this.name = "ImageUploadError";
  }
}

export function isImageUploadError(error: unknown): error is ImageUploadError {
  return error instanceof ImageUploadError;
}

export const imagePaths = {
  signature: (audience: ImageAudience) => `/api/v1/${audience}/uploads/signature/`,
} as const;

/** Check type and size before asking for a signature (Cloudinary's preset checks again). */
export function checkImage(file: File): void {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new ImageUploadError("type");
  if (file.size > IMAGE_MAX_BYTES) throw new ImageUploadError("size");
}

/** Post the file with exactly the signed parameters. XHR, not fetch: upload progress on slow
 * mobile networks. */
export function sendToCloudinary(
  file: File,
  sig: UploadSignature,
  onProgress?: (percent: number) => void,
): Promise<CloudinaryImage> {
  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sig.api_key);
  form.append("timestamp", String(sig.timestamp));
  form.append("signature", sig.signature);
  form.append("upload_preset", sig.upload_preset);
  form.append("asset_folder", sig.asset_folder);
  form.append("tags", sig.tags);
  if (typeof XMLHttpRequest === "undefined") {
    // no XHR (server-side code, tests): fetch, without progress
    return fetch(sig.upload_url, { method: "POST", body: form }).then(
      async (response) => {
        if (!response.ok) throw new ImageUploadError("upload");
        return (await response.json()) as CloudinaryImage;
      },
      () => {
        throw new ImageUploadError("network");
      },
    );
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", sig.upload_url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 300) {
        reject(new ImageUploadError("upload"));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as CloudinaryImage);
      } catch {
        reject(new ImageUploadError("upload"));
      }
    };
    xhr.onerror = () => reject(new ImageUploadError("network"));
    xhr.send(form);
  });
}

export function createImagesApi(client: ApiClient, audience: ImageAudience) {
  const signature = (kind: ImageKind) =>
    client.post<UploadSignature>(imagePaths.signature(audience), { kind });
  return {
    signature,
    /** Check, sign, upload; resolves with Cloudinary's answer (send its `public_id` on). A 503
     * `uploads_unavailable` ApiError means the server has no Cloudinary account set up. */
    upload: async (file: File, kind: ImageKind, onProgress?: (percent: number) => void) => {
      checkImage(file);
      return sendToCloudinary(file, await signature(kind), onProgress);
    },
  };
}

export type ImagesApi = ReturnType<typeof createImagesApi>;
