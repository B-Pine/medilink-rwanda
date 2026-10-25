import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import { MOCK_PASSWORD, MOCK_TOTP_CODE } from "./data";
import {
  CHILD_PATIENT_ID,
  MOCK_CLAIM_CODE,
  MOCK_CLAIM_REFERENCE,
  PARENT_PATIENT_ID,
  SELF_PATIENT_ID,
} from "./features/patients-store";
import { createMockServer } from "./node";

/** S3-F1: the S3 mocks follow the contract (sprint-03 §3), exercised through the client. */

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

async function staff(email = "reception@medilink.test") {
  await api.staffAuth.login({ email, password: MOCK_PASSWORD });
  return api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE });
}

const walkIn = {
  full_name: "Ishimwe Nadine",
  sex: "female" as const,
  date_of_birth: "2000-02-02",
  phone_e164: "0722 555 666",
  care_consent: { version: "2026-10", granted: true },
};

describe("staff patients", () => {
  it("receptionists hold the S3 codes; search modes and masking", async () => {
    const { user } = await staff();
    expect(user.permissions).toEqual(
      expect.arrayContaining(["patients.view", "patients.merge_request"]),
    );
    const byName = await api.patients.search({ query: "mukamana" });
    expect(byName.results.map((r) => r.full_name)).toEqual(
      expect.arrayContaining(["Mukamana Jeanne", "Jeanne Mukamana"]),
    );
    const first = byName.results.find((r) => r.full_name === "Mukamana Jeanne")!;
    expect(first.national_id_masked).toBe("••••5678");
    expect(first.phone_masked).toMatch(/^\+250 7•• ••• \d{3}$/);
    const byNumber = await api.patients.search({ query: first.medilink_number! });
    expect(byNumber.results[0]?.facility_patient_id).toBe(first.facility_patient_id);
    expect((await api.patients.search({ query: "KC-0001" })).results).toHaveLength(1);
  });

  it("walk-in registration, duplicate conflict and reveal", async () => {
    await staff();
    const created = await api.patients.register(walkIn);
    expect(created.medilink_number).toMatch(/^ML-/);
    expect(created.has_care_consent).toBe(true);
    const dup = await failure(
      api.patients.register({
        ...walkIn,
        full_name: "Jeanne Mukamana",
        date_of_birth: "1984-01-01",
      }),
    );
    expect(dup.status).toBe(409);
    expect(dup.fieldError("non_field_errors")).toBeTruthy();
    const ok = await api.patients.register({
      ...walkIn,
      full_name: "Jeanne Mukamana",
      date_of_birth: "1984-01-01",
      confirm_not_duplicate: true,
    });
    const id = await api.patients.addIdentifier(ok.facility_patient_id, {
      kind: "passport",
      issuing_country: "ug",
      value: "b1234567",
      seen_document: true,
    });
    expect(id.masked_value).toBe("••••4567");
    const shown = await api.patients.reveal(ok.facility_patient_id, {
      field: "identifier",
      identifier_id: id.id,
      reason_code: "identity_check",
    });
    expect(shown.value).toBe("B1234567");
  });

  it("other facility: 404 on the record, external match on an exact identifier", async () => {
    await staff();
    const [record] = (await api.patients.search({ query: "mukamana" })).results;
    await api.staffAuth.logout();
    await staff("doctor@medilink.test");
    await api.staffAuth.setActiveFacility("4f0c1d2e-5b6a-4c7d-8e9f-0a1b2c3d4e03");
    expect((await failure(api.patients.get(record!.facility_patient_id))).status).toBe(404);
    const found = await api.patients.search({ query: "1198470012345678" });
    expect(found.results).toEqual([]);
    expect(found.external_match?.birth_year).toBe(1984);
  });

  it("merge request, escalation and platform approval", async () => {
    await staff();
    const results = (await api.patients.search({ query: "mukamana" })).results;
    const a = results.find((r) => r.full_name === "Mukamana Jeanne")!;
    const b = results.find((r) => r.full_name === "Jeanne Mukamana")!;
    const merge = await api.patients.requestMerge({
      surviving_facility_patient_id: a.facility_patient_id,
      merged_facility_patient_id: b.facility_patient_id,
      reason: "Registered twice",
    });
    expect(merge.preview).not.toBeNull();
    expect((await failure(api.patients.approveMerge(merge.id, { version: 1 }))).status).toBe(403);
    const escalated = await api.patients.escalateMerge(merge.id);
    expect(escalated.is_escalated).toBe(true);
    await api.staffAuth.logout();
    await staff("admin@medilink.test");
    const listed = await api.patients.platform.merges();
    expect(listed.results.map((m) => m.id)).toContain(merge.id);
    const done = await api.patients.platform.approve(merge.id, { version: escalated.version });
    expect(done.status).toBe("executed");
    const undone = await api.patients.platform.undo(merge.id, {
      version: done.version,
      reason: "Mistake",
    });
    expect(undone.merge.status).toBe("undone");
  });

  it("reception confirms an open claim", async () => {
    await staff();
    const [paul] = (await api.patients.search({ query: "Ntwari Paul" })).results;
    const detail = await api.patients.get(paul!.facility_patient_id);
    expect(detail.open_claim_reference).toBe(MOCK_CLAIM_REFERENCE);
    const claim = await api.patients.confirmClaim(paul!.facility_patient_id, {
      claim_reference: MOCK_CLAIM_REFERENCE,
      document_kind: "national_id",
      document_matches: true,
    });
    expect(claim.status).toBe("completed");
  });
});

describe("patient profile", () => {
  beforeEach(async () => {
    await api.patientAuth.login({ email: "patient@medilink.test", password: MOCK_PASSWORD });
  });

  it("profiles: self first, then child and delegated parent; link rights", async () => {
    const { results } = await api.profile.profiles();
    expect(results.map((r) => r.relationship)).toEqual(["self", "guardian", "delegate"]);
    expect(results.map((r) => r.patient_id)).toEqual([
      SELF_PATIENT_ID,
      CHILD_PATIENT_ID,
      PARENT_PATIENT_ID,
    ]);
    const parent = await api.profile.get(PARENT_PATIENT_ID);
    const denied = await failure(
      api.profile.update(PARENT_PATIENT_ID, { version: parent.version, full_name: "X" }),
    );
    expect(denied.status).toBe(403);
    expect((await failure(api.profile.accessHistory(PARENT_PATIENT_ID))).status).toBe(403);
    const history = await api.profile.accessHistory(SELF_PATIENT_ID);
    expect(history.results[0]?.action).toBe("patients.record.viewed");
  });

  it("delegation invite needs the password and is accepted once", async () => {
    const wrong = await failure(
      api.profile.createInvite({
        patient_id: SELF_PATIENT_ID,
        current_password: "nope",
        consent_version: "2026-10",
      }),
    );
    expect(wrong.fieldError("current_password")).toBeTruthy();
    const invite = await api.profile.createInvite({
      patient_id: SELF_PATIENT_ID,
      current_password: MOCK_PASSWORD,
      consent_version: "2026-10",
    });
    expect(invite.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect((await failure(api.profile.acceptInvite(invite.code))).status).toBe(422);
    expect((await api.profile.delegations()).pending_invites).toHaveLength(1);
  });

  it("health items, insurance and consents", async () => {
    const item = await api.profile.addHealthItem(SELF_PATIENT_ID, "allergies", {
      category: "food",
      substance_text: "Peanuts",
    });
    expect(item.verification_status).toBe("unverified");
    await api.profile.removeHealthItem(SELF_PATIENT_ID, "allergies", item.id);
    expect((await api.profile.healthProfile(SELF_PATIENT_ID)).allergies).toEqual([]);
    const card = await api.profile.addInsurance(SELF_PATIENT_ID, {
      insurer_code: "mutuelle",
      member_number: "77/01",
    });
    expect(card.status).toBe("unverified");
    expect(
      (
        await failure(
          api.profile.giveConsent({ kind: "terms", version: "2026-10", granted: false }),
        )
      ).status,
    ).toBe(422);
    await api.profile.giveConsent({
      kind: "care",
      version: "2026-10",
      granted: true,
      patient_id: SELF_PATIENT_ID,
    });
    expect((await api.profile.get(SELF_PATIENT_ID)).has_care_consent).toBe(true);
  });

  it("claim by code: wrong code, then the right one moves the self link", async () => {
    const claim = await api.profile
      .requestClaim({
        lookup: { medilink_number: "" },
        date_of_birth: "1995-07-07",
      })
      .catch((e: unknown) => e);
    expect(claim).toBeInstanceOf(ApiError);
    await api.patientAuth.logout();
    await staff();
    const [aline] = (await api.patients.search({ query: "Uwase Aline" })).results;
    await api.staffAuth.logout();
    await api.patientAuth.login({ email: "patient@medilink.test", password: MOCK_PASSWORD });
    const started = await api.profile.requestClaim({
      lookup: { medilink_number: aline!.medilink_number! },
      date_of_birth: "1995-07-07",
    });
    expect(started.method).toBe("contact_code");
    expect(
      (await failure(api.profile.verifyClaim(started.id, "000000"))).fieldError("code"),
    ).toBeTruthy();
    const done = await api.profile.verifyClaim(started.id, MOCK_CLAIM_CODE);
    expect(done.claim.status).toBe("completed");
    expect(done.profile.patient_id).toBe(aline!.patient_id);
  });
});
