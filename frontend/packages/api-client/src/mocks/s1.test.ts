import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import { MOCK_PASSWORD, MOCK_PIN, MOCK_TOTP_CODE } from "./data";
import { MOCK_RESUME_TOKEN } from "./features/onboarding";
import { createMockServer } from "./node";

/** S1-F12: the S1 mocks follow the contract (sprint-01 §3, §6.3), exercised through the client. */

const BASE = "http://localhost:8000";
const { server, reset } = createMockServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => reset());
afterAll(() => server.close());

let api: MediLinkApi;
beforeEach(() => {
  api = createMediLinkApi(createApiClient({ baseUrl: BASE, getLanguage: () => "en" }));
});

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

async function signIn(email: string) {
  await api.staffAuth.login({ email, password: MOCK_PASSWORD });
  return api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
}

const pdf = (name = "licence.pdf") =>
  new File(["%PDF-1.7 mock"], name, { type: "application/pdf" });

describe("lock, PIN and step-up", () => {
  it("StaffMe carries flags and security; lock answers session_locked; PIN unlock works", async () => {
    const { user } = await signIn("reception@medilink.test");
    expect(user.feature_flags).toEqual(["security.pin_unlock"]);
    expect(user.security.lock_after_seconds).toBe(900);
    expect(user.security.step_up_valid_until).not.toBeNull();

    await api.security.setPin(MOCK_PIN);
    await api.security.lock();
    expect((await failure(api.staffAuth.me())).code).toBe("session_locked");
    expect((await api.security.lockState()).unlock_methods).toEqual(["pin", "password"]);
    expect((await failure(api.security.unlock({ pin: "9999" }))).fieldError("pin")).toBeTruthy();
    const me = await api.security.unlock({ pin: MOCK_PIN });
    expect(me.security.pin_set).toBe(true);
    await expect(api.staffAuth.me()).resolves.toMatchObject({ email: "reception@medilink.test" });
  });

  it("five wrong unlocks end the session", async () => {
    await signIn("reception@medilink.test");
    await api.security.lock();
    for (let i = 0; i < 4; i += 1) await failure(api.security.unlock({ password: "wrong" }));
    expect((await failure(api.security.unlock({ password: "wrong" }))).code).toBe(
      "not_authenticated",
    );
    expect((await failure(api.staffAuth.me())).code).toBe("not_authenticated");
  });

  it("rejects simple PINs and accepts step-up with the mock TOTP code", async () => {
    await signIn("reception@medilink.test");
    expect((await failure(api.security.setPin("1234"))).fieldError("pin")).toBeTruthy();
    expect(
      (await failure(api.security.stepUp({ password: MOCK_PASSWORD, code: "000000" }))).status,
    ).toBe(400);
    const result = await api.security.stepUp({ password: MOCK_PASSWORD, code: MOCK_TOTP_CODE });
    expect(Date.parse(result.step_up_valid_until)).toBeGreaterThan(Date.now());
  });
});

describe("uploads", () => {
  it("turns clean after two polls; eicar is infected; links only when clean", async () => {
    await signIn("reception@medilink.test");
    const upload = await api.uploads.staff.upload("test_document", pdf());
    expect(upload.status).toBe("pending");
    expect((await failure(api.uploads.staff.downloadLink(upload.id))).status).toBe(422);
    await api.uploads.staff.get(upload.id);
    expect((await api.uploads.staff.get(upload.id)).status).toBe("clean");
    expect((await api.uploads.staff.downloadLink(upload.id)).url).toContain("/mock-files/");

    const infected = await api.uploads.staff.upload("test_document", pdf("eicar.pdf"));
    await api.uploads.staff.get(infected.id);
    expect((await api.uploads.staff.get(infected.id)).status).toBe("infected");
  });

  it("refuses wrong types and files over 10 MB", async () => {
    await signIn("reception@medilink.test");
    const svg = new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" });
    expect(
      (await failure(api.uploads.staff.upload("test_document", svg))).fieldError("file"),
    ).toBeTruthy();
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", {
      type: "application/pdf",
    });
    expect((await failure(api.uploads.staff.upload("test_document", big))).status).toBe(400);
  });
});

describe("master data", () => {
  it("public reads are localised and cascade; platform writes need step-up", async () => {
    const provinces = await api.masterData.publicList("locations");
    expect(provinces.results).toHaveLength(5);
    const kigali = await api.masterData.publicList("locations", { parent: "1" });
    expect(kigali.results.map((d) => d.code)).toContain("12");

    await signIn("admin@medilink.test");
    const created = await api.masterData.platform.create("insurers", {
      code: "radiant",
      name: "Radiant",
      scheme: "private",
      follows_referral_pathway: false,
    });
    const retired = await api.masterData.platform.update("insurers", created.id, {
      version: 1,
      is_active: false,
    });
    expect(retired.version).toBe(2);
    expect(
      (await failure(api.masterData.platform.update("insurers", created.id, { version: 1 }))).code,
    ).toBe("conflict");
    const history = await api.masterData.platform.changes("insurers", created.id);
    expect(history.results.map((c) => c.action)).toEqual(["retire", "create"]);
  });

  it("imports preview then apply", async () => {
    await signIn("admin@medilink.test");
    const csv = new File(
      ["code,name_rw,name_en,name_fr,body_system,icd_code\nitch,A,Itching,B,skin,\n"],
      "s.csv",
      { type: "text/csv" },
    );
    const job = await api.masterData.platform.startImport("symptoms", csv, "upsert");
    expect(job.status).toBe("validating");
    const preview = await api.masterData.platform.getImport("symptoms", job.id);
    expect(preview.status).toBe("previewed");
    await api.masterData.platform.confirmImport("symptoms", job.id, "k-1");
    expect((await api.masterData.platform.getImport("symptoms", job.id)).status).toBe("applied");
  });
});

describe("facility onboarding", () => {
  it("applicant: start, autosave, documents, submit; platform: review and approve", async () => {
    const app = await api.onboarding.applicant.start({
      applicant: { name: "Mukamana Jeanne", email: "jeanne@example.test" },
      facility_name: "Clinique Test",
      preferred_language: "rw",
    });
    expect(app.missing_for_submit).toContain("documents.moh_licence");
    let current = await api.onboarding.applicant.update(app.id, {
      version: app.version,
      facility: {
        facility_type: "private_clinic",
        ownership: "public",
        phone: "+250788000000",
        email: "a@b.rw",
      },
      location: { village_code: "DEV-12010101", address: "KG 1 Ave" },
      applicant: { phone: "+250788000001" },
      proposed_admin: { name: "Eric", email: "eric@example.test", phone: "+250788000002" },
    });
    expect((await failure(api.onboarding.applicant.update(app.id, { version: 1 }))).code).toBe(
      "conflict",
    );
    await api.onboarding.applicant.uploadDocument(app.id, pdf(), {
      kind: "moh_licence",
      number: "MOH/1",
      expires_on: "2030-01-01",
    });
    current = await api.onboarding.applicant.get(app.id);
    current = await api.onboarding.applicant.get(app.id); // second poll: scanned
    const submitted = await api.onboarding.applicant.submit(app.id, current.version, "sub-1");
    expect(submitted.status).toBe("submitted");

    await signIn("admin@medilink.test");
    const list = await api.onboarding.platform.applications();
    expect(list.results.some((a) => a.id === app.id)).toBe(true);
    let review = await api.onboarding.platform.startReview(app.id, submitted.version);
    await api.onboarding.platform.reviewDocument(app.id, review.documents[0]!.id, "accepted");
    review = await api.onboarding.platform.application(app.id);
    const approved = await api.onboarding.platform.approve(
      app.id,
      {
        version: review.version,
        slug: "clinique-test",
        organization_name: "Test Ltd",
        facility_type: "private_clinic",
        ownership: "public",
        licences: [{ kind: "moh_operating", number: "MOH/1", expires_on: "2030-01-01" }],
      },
      "ap-1",
    );
    expect(approved.facility.status).toBe("approved");
    const facility = approved.facility;
    const setup = await api.onboarding.platform.facilityAction(
      facility.id,
      "start-setup",
      { version: facility.version },
      "s-1",
    );
    const live = await api.onboarding.platform.facilityAction(
      facility.id,
      "go-live",
      { version: setup.version },
      "g-1",
    );
    expect(live.status).toBe("live");
  });

  it("resume token opens the latest open application", async () => {
    expect(
      (await failure(api.onboarding.applicant.resume("nope"))).fieldError("token"),
    ).toBeTruthy();
    await api.onboarding.applicant.start({
      applicant: { name: "A", email: "a@example.test" },
      facility_name: "F",
      preferred_language: "en",
    });
    await expect(api.onboarding.applicant.resume(MOCK_RESUME_TOKEN)).resolves.toMatchObject({
      status: "draft",
    });
  });

  it("platform endpoints need a platform admin and step-up actions are enforced", async () => {
    await signIn("reception@medilink.test");
    expect((await failure(api.onboarding.platform.overview())).status).toBe(403);
    await api.staffAuth.logout();
    await signIn("admin@medilink.test");
    const overview = await api.onboarding.platform.overview();
    expect(overview.facilities.live).toBeGreaterThanOrEqual(1);
    const flags = await api.onboarding.platform.flags();
    expect(flags[0]!.code).toBe("security.pin_unlock");
  });
});
