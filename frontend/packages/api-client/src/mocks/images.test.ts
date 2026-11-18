import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import { ImageUploadError } from "../features/images";
import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "./data";
import { MOCK_FACILITY_ADMIN_EMAIL } from "./features/setup";
import { createMockServer } from "./node";

/** Cloudinary signed uploads, through the client against the mocks (sign, upload, attach). */

const BASE = "http://localhost:8000";
const { server, reset } = createMockServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => reset());
afterAll(() => server.close());

let api: MediLinkApi;
beforeEach(() => {
  api = createMediLinkApi(createApiClient({ baseUrl: BASE, getLanguage: () => "en" }));
});

const png = (name = "front.png", bytes = 64) =>
  new File([new Uint8Array(bytes)], name, { type: "image/png" });

async function staff(email: string) {
  await api.staffAuth.login({ email, password: MOCK_PASSWORD });
  await api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
}

describe("images (Cloudinary)", () => {
  it("signs, uploads and attaches a facility photo and logo", async () => {
    await staff(MOCK_FACILITY_ADMIN_EMAIL);
    const signature = await api.images.staff.signature("facility_photo");
    expect(signature.asset_folder).toBe("medilink/facilities");
    expect(signature.upload_url).toMatch(/^https:\/\/api\.cloudinary\.com\/v1_1\//);

    const progress: number[] = [];
    const photo = await api.images.staff.upload(png(), "facility_photo", (p) => progress.push(p));
    expect(photo.public_id).toMatch(/^medilink\/facilities\//);
    const logo = await api.images.staff.upload(png("logo.png"), "facility_logo");

    const before = await api.setup.facility();
    const saved = await api.setup.updateFacility({
      version: before.version,
      photo_public_ids: [photo.public_id],
      logo_public_id: logo.public_id,
    });
    expect(saved.photo_public_ids).toEqual([photo.public_id]);
    expect(saved.photo_images[0]!.url).toMatch(/^data:image\/png;base64,/);
    expect(saved.logo_url).toMatch(/^data:image\/png/);

    // a photo id used as the logo, or an invented id, is refused
    const wrong = await api.setup
      .updateFacility({ version: saved.version, logo_public_id: photo.public_id })
      .catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(ApiError);
  });

  it("checks type and size before asking for a signature", async () => {
    await staff(MOCK_FACILITY_ADMIN_EMAIL);
    const pdf = new File(["%PDF"], "x.pdf", { type: "application/pdf" });
    await expect(api.images.staff.upload(pdf, "facility_photo")).rejects.toBeInstanceOf(
      ImageUploadError,
    );
    const huge = png("big.png", 8 * 1024 * 1024 + 1);
    await expect(api.images.staff.upload(huge, "facility_photo")).rejects.toMatchObject({
      code: "size",
    });
  });

  it("keeps facility images to who can configure the facility", async () => {
    await staff("reception@medilink.test");
    const refused = await api.images.staff.signature("facility_photo").catch((e: unknown) => e);
    expect((refused as ApiError).status).toBe(403);
    const own = await api.images.staff.signature("provider_avatar");
    expect(own.asset_folder).toBe("medilink/providers/avatars");
  });
});
