import { afterAll, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import type { LocationItem } from "../features/masterdata";
import { cookieJarFetch, latestMail, shape, shapeDiff, totp } from "./http";

/**
 * Sprint 1 integration checks against the REAL API (contract §9, S1-I1..I3). Skipped unless
 * MEDILINK_IT_BASE_URL is set; run with scripts/s1-integration.sh, which starts from a fresh
 * platform admin without a second factor (the test enrols TOTP itself).
 *
 *   S1-I1  applicant start → resume email → wizard → uploads scanned → submit → request changes
 *          → resubmit → approve → facility approved → start setup → go-live
 *   S1-I2  the shape of each real response matches the MSW mock's response
 *   S1-I3  lock → session_locked → PIN unlock; five wrong PINs → login again
 *          (the idle timer itself is covered by backend B14 and the IdleLock unit test)
 */

const BASE = process.env.MEDILINK_IT_BASE_URL ?? "";
const MAILPIT = process.env.MEDILINK_IT_MAILPIT ?? "http://127.0.0.1:8025";
const ADMIN_EMAIL = process.env.MEDILINK_IT_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.MEDILINK_IT_ADMIN_PASSWORD ?? "";

const run = Boolean(BASE && ADMIN_EMAIL && ADMIN_PASSWORD);
const realFetch = globalThis.fetch;

/** Responses kept for the shape comparison with the mocks (S1-I2). */
const real: Record<string, unknown> = {};

function apiWithJar(): MediLinkApi {
  const jar = cookieJarFetch(realFetch);
  // Uploads without XHR use the global fetch: route it through the same jar.
  globalThis.fetch = jar;
  return createMediLinkApi(createApiClient({ baseUrl: BASE, getLanguage: () => "en", fetch: jar }));
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

/** A minimal valid one-page PDF (the backend parses PDFs and refuses broken ones). */
function minimalPdf(): string {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return body;
}

const pdf = (name: string) => new File([minimalPdf()], name, { type: "application/pdf" });

let adminSecret = "";

async function signInAdmin(api: MediLinkApi) {
  const login = await api.staffAuth.login({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (login.status === "mfa_setup_required") {
    const setup = await api.staffAuth.mfaSetup();
    adminSecret = setup.secret;
    await api.staffAuth.mfaConfirm(totp(adminSecret));
  } else {
    expect(
      adminSecret,
      "the admin must start without TOTP (use scripts/s1-integration.sh)",
    ).not.toBe("");
    // TOTP codes are single use: wait for the next 30 s step if this one was just used.
    await new Promise((resolve) =>
      setTimeout(resolve, (30 - (Math.floor(Date.now() / 1000) % 30) + 1) * 1000),
    );
    await api.staffAuth.mfaVerify({ code: totp(adminSecret) });
  }
}

/** Depth-first walk of the public location cascade (as the wizard does) to the first village. */
async function firstVillage(api: MediLinkApi, parent?: string): Promise<string | null> {
  const page = await api.masterData.publicList<LocationItem>(
    "locations",
    parent ? { parent, page_size: 100 } : { page_size: 100 },
  );
  if (!parent) real.publicLocations = page;
  const village = page.results.find((l) => l.level === "village");
  if (village) return village.code;
  for (const location of page.results.filter((l) => l.has_children)) {
    const found = await firstVillage(api, location.code);
    if (found) return found;
  }
  return null;
}

describe.skipIf(!run)("S1 integration against the real API", () => {
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it("S1-I1: application to go-live", { timeout: 120_000 }, async () => {
    const applicant = apiWithJar();
    const email = `it-${Date.now()}@example.test`;
    const started = await applicant.onboarding.applicant.start({
      applicant: {
        name: "Integration Applicant",
        email,
        phone: "+250788000111",
        position: "Director",
      },
      facility_name: `Integration Clinic ${Date.now()}`,
      preferred_language: "en",
    });
    real.applicantApplication = started;
    expect(started.status).toBe("draft");

    // The resume link arrives by email; a new browser exchanges it for an applicant session.
    const text = await latestMail(MAILPIT, email, "Continue your MediLink application");
    const token = /token=([A-Za-z0-9_-]+)/.exec(text)?.[1];
    expect(token).toBeTruthy();
    const browser = apiWithJar();
    const resumed = await browser.onboarding.applicant.resume(token!);
    expect(resumed.id).toBe(started.id);

    const village = await firstVillage(browser);
    if (!village) {
      throw new Error(
        "No village: run `manage.py seed_masterdata_dev` (DEBUG) or import NISR locations",
      );
    }
    await browser.onboarding.applicant.update(started.id, {
      version: resumed.version,
      facility: {
        facility_type: "private_clinic",
        ownership: "private",
        organization_name: "Integration Ltd",
        phone: "+250788123456",
        email: "clinic@example.test",
      },
      location: { village_code: village, address: "KG 1 Ave" },
      proposed_admin: {
        name: "Integration Admin",
        email: "admin.it@example.test",
        phone: "+250788000222",
      },
    });
    expect(
      (await failure(browser.onboarding.applicant.update(started.id, { version: 1 }))).code,
    ).toBe("conflict");

    for (const [kind, extra] of [
      ["moh_licence", { number: `MOH/IT/${Date.now()}`, expires_on: "2030-12-31" }],
      ["rdb_registration", {}],
      ["tin_certificate", {}],
    ] as const) {
      const document = await browser.onboarding.applicant.uploadDocument(
        started.id,
        pdf(`${kind}.pdf`),
        { kind, ...extra },
      );
      real.applicationDocument = document;
    }
    let app = await browser.onboarding.applicant.get(started.id);
    expect(app.documents.map((d) => d.upload.status)).toEqual(["clean", "clean", "clean"]);
    expect(app.missing_for_submit).toEqual([]);
    app = await browser.onboarding.applicant.submit(
      started.id,
      app.version,
      `it-submit-${Date.now()}`,
    );
    expect(app.status).toBe("submitted");

    // Super admin: review, ask for a change, applicant resubmits, approve.
    const admin = apiWithJar();
    await signInAdmin(admin);
    real.overview = await admin.onboarding.platform.overview();
    real.applications = await admin.onboarding.platform.applications({ status: "submitted" });
    let review = await admin.onboarding.platform.startReview(started.id, app.version);
    review = await admin.onboarding.platform.requestChanges(
      started.id,
      {
        version: review.version,
        general_comment: "",
        items: [{ target: "location.address", comment: "Add the plot number." }],
      },
      `it-rc-${Date.now()}`,
    );
    expect(review.status).toBe("changes_requested");

    app = await browser.onboarding.applicant.get(started.id);
    expect(app.feedback.items[0]?.target).toBe("location.address");
    app = await browser.onboarding.applicant.update(started.id, {
      version: app.version,
      location: { address: "KG 1 Ave, plot 12" },
    });
    app = await browser.onboarding.applicant.submit(
      started.id,
      app.version,
      `it-resubmit-${Date.now()}`,
    );
    expect(app.status).toBe("submitted");

    review = await admin.onboarding.platform.startReview(started.id, app.version);
    for (const document of review.documents) {
      await admin.onboarding.platform.reviewDocument(started.id, document.id, "accepted");
    }
    review = await admin.onboarding.platform.application(started.id);
    real.platformApplication = review;
    const moh = review.documents.find((d) => d.kind === "moh_licence")!;
    const approved = await admin.onboarding.platform.approve(
      started.id,
      {
        version: review.version,
        slug: `integration-clinic-${Date.now()}`,
        organization_name: "Integration Ltd",
        facility_type: "private_clinic",
        ownership: "private",
        licences: [
          {
            document_id: moh.id,
            kind: "moh_operating",
            number: moh.number,
            expires_on: moh.expires_on!,
          },
        ],
      },
      `it-approve-${Date.now()}`,
    );
    expect(approved.facility.status).toBe("approved");

    const facilityId = approved.facility.id;
    const setup = await admin.onboarding.platform.facilityAction(
      facilityId,
      "start-setup",
      { version: approved.facility.version },
      `it-setup-${Date.now()}`,
    );
    const live = await admin.onboarding.platform.facilityAction(
      facilityId,
      "go-live",
      { version: setup.version },
      `it-live-${Date.now()}`,
    );
    expect(live.status).toBe("live");
    real.facility = await admin.onboarding.platform.facility(facilityId);
    real.facilityFlags = await admin.onboarding.platform.facilityFlags(facilityId);
    real.flags = await admin.onboarding.platform.flags();
    real.staffMe = await admin.staffAuth.me();
  });

  it("S1-I3: lock, PIN unlock, five wrong PINs end the session", { timeout: 90_000 }, async () => {
    const admin = apiWithJar();
    await signInAdmin(admin);
    await admin.security.setPin("4826");
    await admin.security.lock();
    expect((await failure(admin.staffAuth.me())).code).toBe("session_locked");
    const state = await admin.security.lockState();
    real.lockState = state;
    expect(state.unlock_methods).toContain("pin");
    await admin.security.unlock({ pin: "4826" });
    await expect(admin.staffAuth.me()).resolves.toMatchObject({ email: ADMIN_EMAIL });

    await admin.security.lock();
    for (let i = 0; i < 4; i += 1) {
      expect(
        (await failure(admin.security.unlock({ pin: "9999" }))).fieldError("pin"),
      ).toBeTruthy();
    }
    expect((await failure(admin.security.unlock({ pin: "9999" }))).code).toBe("not_authenticated");
    expect((await failure(admin.staffAuth.me())).code).toBe("not_authenticated");
  });

  it(
    "S1-I2: mock responses have the same shape as the real ones",
    { timeout: 60_000 },
    async () => {
      globalThis.fetch = realFetch;
      const { createMockServer } = await import("../mocks/node");
      const { MOCK_PASSWORD, MOCK_TOTP_CODE } = await import("../mocks/data");
      const { server } = createMockServer();
      server.listen({ onUnhandledRequest: "bypass" });
      try {
        const mock = createMediLinkApi(
          createApiClient({ baseUrl: "http://mock.test", getLanguage: () => "en" }),
        );
        const mocked: Record<string, unknown> = {};
        const applicant = await mock.onboarding.applicant.start({
          applicant: { name: "Mock", email: "mock@example.test" },
          facility_name: "Mock Clinic",
          preferred_language: "en",
        });
        mocked.applicantApplication = applicant;
        mocked.applicationDocument = await mock.onboarding.applicant.uploadDocument(
          applicant.id,
          pdf("x.pdf"),
          { kind: "moh_licence" },
        );
        mocked.publicLocations = await mock.masterData.publicList("locations");
        await mock.staffAuth.login({ email: "admin@medilink.test", password: MOCK_PASSWORD });
        await mock.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
        mocked.staffMe = await mock.staffAuth.me();
        mocked.overview = await mock.onboarding.platform.overview();
        mocked.applications = await mock.onboarding.platform.applications({ status: "submitted" });
        const appId = (mocked.applications as { results: { id: string }[] }).results[0]!.id;
        mocked.platformApplication = await mock.onboarding.platform.application(appId);
        const facilities = await mock.onboarding.platform.facilities();
        mocked.facility = await mock.onboarding.platform.facility(facilities.results[0]!.id);
        mocked.facilityFlags = await mock.onboarding.platform.facilityFlags(
          facilities.results[0]!.id,
        );
        mocked.flags = await mock.onboarding.platform.flags();
        mocked.lockState = await mock.security.lockState();

        const report: string[] = [];
        for (const [name, value] of Object.entries(real)) {
          for (const diff of shapeDiff(shape(value), shape(mocked[name])))
            report.push(`${name}: ${diff}`);
        }
        expect(report).toEqual([]);
      } finally {
        server.close();
      }
    },
  );
});
