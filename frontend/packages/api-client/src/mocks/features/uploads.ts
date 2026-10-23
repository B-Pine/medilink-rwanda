import { http, HttpResponse } from "msw";

import type { Upload, UploadAudience } from "../../features/uploads";
import type { LanguageCode } from "../../types";
import type { FeatureMockFactory } from "../features";
import type { MockContext } from "../handlers";
import { fieldError, id, now, rule, s1, str } from "./s1-common";

/**
 * Upload pipeline mocks (sprint-01 §3.3, §3.4, §6.3): uploads turn `clean` after two polls, a
 * filename containing `eicar` turns `infected`, files over 10 MB get 400. Downloads are served
 * from memory at `<api>/mock-files/<id>/`.
 */
export const MOCK_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const POLLS_UNTIL_SCANNED = 2;
const ACCEPTED = /\.(pdf|jpe?g|png|heic|heif|csv)$/i;

interface StoredUpload {
  upload: Upload;
  owner: string; // "staff:<email>" | "patient:<email>" | "application:<id>" | "platform:<email>"
  polls: number;
  bytes: ArrayBuffer;
}

/** In-memory upload store shared by the upload, onboarding and master data mocks. */
export interface MockUploadStore {
  receive(
    file: File,
    purpose: string,
    owner: string,
    lang: LanguageCode,
  ): Promise<{ upload: Upload } | { error: Response }>;
  /** The upload, advancing its mock scan by one poll. */
  poll(uploadId: string): Upload | null;
  /** Finish the scan now (owner endpoints that return documents). */
  settleScan(uploadId: string): Upload | null;
  get(uploadId: string): StoredUpload | null;
  link(
    uploadId: string,
    disposition: string,
  ): { url: string; expires_at: string; disposition: string };
  reset(): void;
}

const stores = new WeakMap<MockContext, MockUploadStore>();

export function uploadStore(context: MockContext): MockUploadStore {
  const existing = stores.get(context);
  if (existing) return existing;
  const items = new Map<string, StoredUpload>();

  function finalise(item: StoredUpload) {
    if (item.upload.status !== "pending") return;
    item.upload.status = /eicar/i.test(item.upload.original_filename) ? "infected" : "clean";
    if (item.upload.status === "infected") item.upload.rejection_reason = "infected";
    item.upload.scanned_at = now();
  }

  const store: MockUploadStore = {
    async receive(file, purpose, owner, lang) {
      const csvOnly = purpose === "masterdata_import";
      if (file.size > MOCK_UPLOAD_MAX_BYTES) {
        return { error: fieldError(context, lang, { file: s1("fileSize", lang) }) };
      }
      if (!ACCEPTED.test(file.name) || csvOnly !== /\.csv$/i.test(file.name)) {
        return { error: fieldError(context, lang, { file: s1("fileType", lang) }) };
      }
      const upload: Upload = {
        id: id(),
        purpose,
        status: "pending",
        rejection_reason: null,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        original_filename: file.name,
        sha256: "0".repeat(64),
        created_at: now(),
        scanned_at: null,
        is_attached: false,
      };
      items.set(upload.id, { upload, owner, polls: 0, bytes: await file.arrayBuffer() });
      return { upload: { ...upload } };
    },
    poll(uploadId) {
      const item = items.get(uploadId);
      if (!item) return null;
      item.polls += 1;
      if (item.polls >= POLLS_UNTIL_SCANNED) finalise(item);
      return { ...item.upload };
    },
    settleScan(uploadId) {
      const item = items.get(uploadId);
      if (!item) return null;
      finalise(item);
      return { ...item.upload };
    },
    get: (uploadId) => items.get(uploadId) ?? null,
    link(uploadId, disposition) {
      return {
        url: `${globalThis.location?.origin ?? "http://localhost"}/api/v1/mock-files/${uploadId}/`,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        disposition,
      };
    },
    reset: () => items.clear(),
  };
  stores.set(context, store);
  return store;
}

export const uploadsMocks: FeatureMockFactory = (context) => {
  const { api } = context;
  const store = uploadStore(context);

  function caller(audience: UploadAudience, lang: LanguageCode) {
    if (audience === "staff") {
      const result = context.authenticatedStaff(lang);
      return "error" in result ? result : { owner: `staff:${result.me.email}` };
    }
    const result = context.authenticatedPatient(lang);
    return "error" in result ? result : { owner: `patient:${result.me.email}` };
  }

  const handlers = (["staff", "patient"] as const).flatMap((audience) => [
    http.post(`${api}/${audience}/uploads/`, async ({ request }) => {
      await context.settle();
      const lang = context.languageFrom(request);
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const who = caller(audience, lang);
      if ("error" in who) return who.error;
      const form = await request.formData();
      const file = form.get("file");
      const purpose = str(form.get("purpose") ?? "");
      if (!(file instanceof File)) return fieldError(context, lang, { file: s1("required", lang) });
      if (
        !purpose ||
        purpose === "masterdata_import" ||
        purpose === "facility_application_document"
      ) {
        return fieldError(context, lang, { purpose: s1("fileType", lang) });
      }
      const result = await store.receive(file, purpose, who.owner, lang);
      if ("error" in result) return result.error;
      return HttpResponse.json(result.upload, { status: 201 });
    }),

    http.get(`${api}/${audience}/uploads/:id/`, async ({ request, params }) => {
      await context.settle();
      const lang = context.languageFrom(request);
      const who = caller(audience, lang);
      if ("error" in who) return who.error;
      const item = store.get(str(params.id));
      if (!item || item.owner !== who.owner) {
        return context.errorResponse(404, "not_found", context.message("notFound", lang));
      }
      return HttpResponse.json(store.poll(item.upload.id));
    }),

    http.post(`${api}/${audience}/uploads/:id/download-links/`, async ({ request, params }) => {
      await context.settle();
      const lang = context.languageFrom(request);
      const csrf = context.csrfFailure(request, lang);
      if (csrf) return csrf;
      const who = caller(audience, lang);
      if ("error" in who) return who.error;
      const item = store.get(str(params.id));
      if (!item || item.owner !== who.owner) {
        return context.errorResponse(404, "not_found", context.message("notFound", lang));
      }
      if (item.upload.status !== "clean") return rule(context, lang, "notClean");
      const body = await context.readJson(request);
      return HttpResponse.json(store.link(item.upload.id, str(body.disposition ?? "inline")));
    }),
  ]);

  handlers.push(
    http.get("*/api/v1/mock-files/:id/", ({ params }) => {
      const item = store.get(str(params.id));
      if (!item || item.upload.status !== "clean") return new HttpResponse(null, { status: 404 });
      return new HttpResponse(item.bytes, {
        headers: {
          "Content-Type": item.upload.content_type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }),
  );

  return { handlers, reset: () => store.reset() };
};
