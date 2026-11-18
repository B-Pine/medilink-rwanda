import { http, HttpResponse } from "msw";

import type { UploadSignature } from "../../features/images";
import type { FeatureMockFactory } from "../features";

/**
 * Images on Cloudinary, mocked: the signature endpoints and Cloudinary's upload API. Uploaded
 * files are kept in memory as data URLs (no reload survives), so the screens show the real image.
 * Every public id starts with its folder, as on accounts with fixed folders.
 */

export const MOCK_CLOUD = "mock-cloud";
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${MOCK_CLOUD}/image/upload`;
const FOLDERS: Record<string, string> = {
  facility_photo: "medilink/facilities",
  facility_logo: "medilink/facilities/logos",
  provider_avatar: "medilink/providers/avatars",
  patient_avatar: "medilink/patients/avatars",
};
const STAFF_KINDS = ["facility_photo", "facility_logo", "provider_avatar"];
const PATIENT_KINDS = ["patient_avatar"];

const images = new Map<string, string>(); // public id -> data URL
/** Who holds which image, for the "me" answers: facility id -> logo, staff email -> avatar. */
export const mockFacilityLogos = new Map<string, string>();
export const mockStaffAvatars = new Map<string, string>();
export const mockPatientAvatars = new Map<string, string>(); // patient id -> avatar

/** A delivery URL for a mock public id (the data URL), or null. */
export function mockImageUrl(publicId: string | null | undefined): string | null {
  return publicId ? (images.get(publicId) ?? null) : null;
}

/** True when the id was uploaded through the mock for this kind (the server's Admin API check). */
export function mockImageExists(publicId: string, kind: string): boolean {
  return images.has(publicId) && publicId.startsWith(`${FOLDERS[kind]}/`);
}

async function dataUrl(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${file.type || "image/png"};base64,${btoa(binary)}`;
}

export const imagesMocks: FeatureMockFactory = (context) => {
  const api = "*/api/v1";
  const sign = (kind: string): UploadSignature => ({
    timestamp: Math.floor(Date.now() / 1000),
    upload_preset: "medilink_signed",
    asset_folder: FOLDERS[kind]!,
    tags: `medilink,${kind}`,
    signature: "mock-signature",
    api_key: "mock-key",
    cloud_name: MOCK_CLOUD,
    upload_url: UPLOAD_URL,
  });
  const kindOf = async (request: Request) => {
    const body = (await request.json().catch(() => ({}))) as { kind?: unknown };
    return typeof body.kind === "string" ? body.kind : "";
  };
  return {
    reset() {
      images.clear();
      mockFacilityLogos.clear();
      mockStaffAvatars.clear();
      mockPatientAvatars.clear();
    },
    handlers: [
      http.post(`${api}/staff/uploads/signature/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const result = context.authenticatedStaff(lang);
        if ("error" in result) return result.error;
        const kind = await kindOf(request);
        if (!STAFF_KINDS.includes(kind))
          return context.errorResponse(400, "validation_error", "Choose a valid kind.");
        if (kind.startsWith("facility_") && !result.me.permissions.includes("facility.configure"))
          return context.errorResponse(403, "permission_denied", "Not allowed.");
        return HttpResponse.json(sign(kind));
      }),
      http.post(`${api}/patient/uploads/signature/`, async ({ request }) => {
        await context.settle();
        const lang = context.languageFrom(request);
        const csrf = context.csrfFailure(request, lang);
        if (csrf) return csrf;
        const result = context.authenticatedPatient(lang);
        if ("error" in result) return result.error;
        const kind = await kindOf(request);
        if (!PATIENT_KINDS.includes(kind))
          return context.errorResponse(400, "validation_error", "Choose a valid kind.");
        return HttpResponse.json(sign(kind));
      }),
      http.post(UPLOAD_URL, async ({ request }) => {
        const form = await request.formData();
        const file = form.get("file");
        const rawFolder = form.get("asset_folder");
        const folder = typeof rawFolder === "string" ? rawFolder : "";
        if (!(file instanceof File) || !form.get("signature") || !folder)
          return HttpResponse.json({ error: { message: "Invalid Signature" } }, { status: 401 });
        const publicId = `${folder}/${crypto.randomUUID().slice(0, 12)}`;
        const url = await dataUrl(file);
        images.set(publicId, url);
        return HttpResponse.json({ public_id: publicId, secure_url: url, width: 800, height: 600 });
      }),
    ],
  };
};
