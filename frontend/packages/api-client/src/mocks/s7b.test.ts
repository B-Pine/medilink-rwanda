import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import { FACILITIES, MOCK_PASSWORD, MOCK_TOTP_CODE } from "./data";
import { MOCK_CLINICAL_FP } from "./features/clinical";
import {
  MOCK_DOCUMENT_RX,
  MOCK_SHARE_TOKEN,
  MOCK_VERIFY_CODE,
  MOCK_VERIFY_DOB,
} from "./features/documents";
import { createMockServer } from "./node";

/** S7-F7: the S7b mocks follow the contract (sprint-07 §3.3), exercised through the client. */

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

async function staff(email: string) {
  await api.staffAuth.login({ email, password: MOCK_PASSWORD });
  const me = await api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
  // doctors work at two facilities: choose Kigali Clinic
  if (!me.user.active_facility_id)
    await api.staffAuth.setActiveFacility(FACILITIES.kigaliClinic.id);
}

describe("staff documents (D1-D3)", () => {
  it("reception lists and prints; printing needs documents.print", async () => {
    await staff("reception@medilink.test");
    const list = await api.documents.list({ facility_patient_id: MOCK_CLINICAL_FP });
    expect(list.results.map((d) => d.kind)).toEqual(["prescription", "sick_note"]);
    expect((await api.documents.print(MOCK_DOCUMENT_RX)).url).toMatch(/RX-2026-000106\.pdf$/);
    expect((await failure(api.documents.list({}))).status).toBe(400);

    await api.staffAuth.logout();
    await staff("doctor@medilink.test");
    expect((await failure(api.documents.print(MOCK_DOCUMENT_RX))).status).toBe(403);
    expect((await api.documents.downloadLink(MOCK_DOCUMENT_RX)).url).toContain("RX-2026-000106");
  });
});

describe("public verification and share links (V1, D5)", () => {
  it("shows the projection, the details after the date of birth, and shared documents", async () => {
    const found = await api.documents.public.verify(MOCK_VERIFY_CODE.toLowerCase());
    expect(found).toMatchObject({ number: "RX-2026-000106", status: "active", version_no: 2 });
    expect(found).not.toHaveProperty("patient_name");
    const wrong = await failure(api.documents.public.details(MOCK_VERIFY_CODE, "2000-01-01"));
    expect(wrong.status).toBe(422);
    const details = await api.documents.public.details(MOCK_VERIFY_CODE, MOCK_VERIFY_DOB);
    expect(details.sections[0]?.lines[0]).toMatch(/Amlodipine/);
    expect((await failure(api.documents.public.verify("NOPE000000"))).status).toBe(404);

    const shared = await api.documents.public.shared(MOCK_SHARE_TOKEN);
    expect(shared.number).toBe("RX-2026-000106");
  });

  it("the patient makes a share link and revokes it", async () => {
    await api.patientAuth.login({ email: "patient@medilink.test", password: MOCK_PASSWORD });
    const rows = await api.documents.patient.list();
    expect(rows.results).toHaveLength(2);
    expect((await failure(api.documents.patient.share(MOCK_DOCUMENT_RX, 31))).status).toBe(400);
    const made = await api.documents.patient.share(MOCK_DOCUMENT_RX, 7);
    expect(made.token).toBeTruthy();
    expect((await api.documents.public.shared(made.token)).number).toBe("RX-2026-000106");
    await api.documents.patient.revokeShare(MOCK_DOCUMENT_RX, made.id);
    expect((await failure(api.documents.public.shared(made.token))).status).toBe(404);
    expect((await api.documents.patient.archive()).url).toMatch(/\.pdf$/);
  });
});
