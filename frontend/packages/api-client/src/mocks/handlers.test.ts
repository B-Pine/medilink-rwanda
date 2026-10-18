import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApiClient } from "../client";
import { createMediLinkApi, type MediLinkApi } from "../endpoints";
import { ApiError } from "../errors";
import {
  FACILITIES,
  MOCK_MAX_FAILURES,
  MOCK_PASSWORD,
  MOCK_RATE_LIMITED_EMAIL,
  MOCK_RECOVERY_CODE,
  MOCK_RESET_TOKEN,
  MOCK_TOTP_CODE,
  ROLE_PERMISSIONS,
} from "./data";
import { createMockServer } from "./node";

/** The MSW mocks implement docs/architecture/03-sprint-0-contract.md §2, exercised through the client. */

const BASE = "http://localhost:8000";
const { server, reset } = createMockServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => reset());
afterAll(() => server.close());

let language = "en";
let api: MediLinkApi;
beforeEach(() => {
  language = "en";
  api = createMediLinkApi(createApiClient({ baseUrl: BASE, getLanguage: () => language }));
});

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("public endpoints", () => {
  it("health and csrf", async () => {
    await expect(api.health()).resolves.toEqual({ status: "ok", version: "0.1.0" });
    const { csrf_token } = await api.csrf();
    expect(csrf_token).toMatch(/^mock-csrf-/);
  });

  it("enforces CSRF on unsafe methods", async () => {
    const response = await fetch(`${BASE}/api/v1/staff/auth/login/`, {
      method: "POST",
      body: JSON.stringify({ email: "doctor@medilink.test", password: MOCK_PASSWORD }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("csrf_failed");
  });
});

describe("staff auth", () => {
  it("new user: login → mfa_setup_required → setup → confirm → authenticated with 10 recovery codes", async () => {
    const login = await api.staffAuth.login({
      email: "new.staff@medilink.test",
      password: MOCK_PASSWORD,
    });
    expect(login).toEqual({ status: "mfa_setup_required", user: null });

    expect((await failure(api.staffAuth.me())).code).toBe("mfa_required");
    expect((await failure(api.staffAuth.mfaVerify({ code: MOCK_TOTP_CODE }))).status).toBe(401);

    const setup = await api.staffAuth.mfaSetup();
    expect(setup.otpauth_uri).toMatch(
      /^otpauth:\/\/totp\/MediLink%20Rwanda%3Anew.staff%40medilink.test\?secret=/,
    );
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);

    const wrong = await failure(api.staffAuth.mfaConfirm("000000"));
    expect(wrong.status).toBe(400);
    expect(wrong.code).toBe("validation_error");
    expect(wrong.fields.code).toHaveLength(1);

    const confirmed = await api.staffAuth.mfaConfirm(MOCK_TOTP_CODE);
    expect(confirmed.status).toBe("authenticated");
    expect(confirmed.recovery_codes).toHaveLength(10);
    expect(confirmed.user.mfa_enabled).toBe(true);
    // One membership: the active facility is set automatically.
    expect(confirmed.user.active_facility_id).toBe(FACILITIES.kigaliClinic.id);
    // Receptionist grants mirror the backend seed (authz.catalogue.ROLE_GRANTS).
    expect([...confirmed.user.permissions].sort()).toEqual(
      [...ROLE_PERMISSIONS.receptionist].sort(),
    );

    const me = await api.staffAuth.me();
    expect(me.email).toBe("new.staff@medilink.test");
  });

  it("enrolled user: login → mfa_required → verify → authenticated; facility switch", async () => {
    const login = await api.staffAuth.login({
      email: "Doctor@MediLink.test",
      password: MOCK_PASSWORD,
    });
    expect(login.status).toBe("mfa_required");
    expect((await failure(api.staffAuth.mfaSetup())).status).toBe(401);

    const result = await api.staffAuth.mfaVerify({ code: "123 456" });
    expect(result.status).toBe("authenticated");
    expect(result.user.memberships).toHaveLength(3);
    expect(result.user.active_facility_id).toBeNull();
    expect(result.user.permissions).toEqual([]);

    const switched = await api.staffAuth.setActiveFacility(FACILITIES.remera.id);
    expect(switched.active_facility_id).toBe(FACILITIES.remera.id);
    expect(switched.permissions).toEqual(
      expect.arrayContaining([
        "clinical.write",
        "clinical.sign",
        "facility.configure",
        "audit.view",
      ]),
    );

    const notMember = await failure(
      api.staffAuth.setActiveFacility("00000000-0000-4000-8000-000000000000"),
    );
    expect(notMember.status).toBe(404);
    expect(notMember.code).toBe("not_found");

    await api.staffAuth.logout();
    expect((await failure(api.staffAuth.me())).code).toBe("not_authenticated");
  });

  it("accepts a recovery code once", async () => {
    await api.staffAuth.login({ email: "reception@medilink.test", password: MOCK_PASSWORD });
    await expect(
      api.staffAuth.mfaVerify({ recovery_code: MOCK_RECOVERY_CODE }),
    ).resolves.toMatchObject({
      status: "authenticated",
    });
    await api.staffAuth.logout();
    await api.staffAuth.login({ email: "reception@medilink.test", password: MOCK_PASSWORD });
    const reused = await failure(api.staffAuth.mfaVerify({ recovery_code: MOCK_RECOVERY_CODE }));
    expect(reused.code).toBe("validation_error");
    expect(reused.fields.recovery_code).toBeDefined();
  });

  it("generic 401 for wrong password or unknown email (no enumeration)", async () => {
    const wrongPassword = await failure(
      api.staffAuth.login({ email: "doctor@medilink.test", password: "nope" }),
    );
    const unknown = await failure(
      api.staffAuth.login({ email: "nobody@medilink.test", password: "nope" }),
    );
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.code).toBe("not_authenticated");
    expect(unknown.message).toBe(wrongPassword.message);
  });

  it("patients cannot log in to the staff app", async () => {
    const error = await failure(
      api.staffAuth.login({ email: "patient@medilink.test", password: MOCK_PASSWORD }),
    );
    expect(error.code).toBe("not_authenticated");
  });

  it("validation_error with fields for invalid input", async () => {
    const error = await failure(api.staffAuth.login({ email: "not-an-email", password: "" }));
    expect(error.status).toBe(400);
    expect(Object.keys(error.fields).sort()).toEqual(["email", "password"]);
  });

  it("429 rate_limited with Retry-After after repeated failures", async () => {
    for (let i = 0; i < MOCK_MAX_FAILURES; i++) {
      await failure(api.staffAuth.login({ email: "doctor@medilink.test", password: "wrong" }));
    }
    const limited = await failure(
      api.staffAuth.login({ email: "doctor@medilink.test", password: MOCK_PASSWORD }),
    );
    expect(limited.status).toBe(429);
    expect(limited.code).toBe("rate_limited");
    expect(limited.retryAfter).toBe(60);

    const always = await failure(
      api.staffAuth.login({ email: MOCK_RATE_LIMITED_EMAIL, password: "x" }),
    );
    expect(always.status).toBe(429);
  });

  it("localises messages with Accept-Language", async () => {
    language = "fr";
    const fr = await failure(
      api.staffAuth.login({ email: "doctor@medilink.test", password: "nope" }),
    );
    language = "rw";
    const rw = await failure(
      api.staffAuth.login({ email: "doctor@medilink.test", password: "nope" }),
    );
    expect(fr.message).toMatch(/mot de passe/);
    expect(rw.message).toMatch(/ijambo ry/);
  });
});

describe("patient auth", () => {
  const registration = {
    full_name: "Uwera Diane",
    email: "diane@example.rw",
    password: "a-long-passphrase-2026",
    preferred_language: "rw" as const,
    accepted_terms_version: "2026-10",
    accepted_privacy_version: "2026-10",
    research_consent: false,
  };

  it("register → 201 PatientMe (logged in) → logout → login", async () => {
    const me = await api.patientAuth.register(registration);
    expect(me).toMatchObject({
      email: "diane@example.rw",
      full_name: "Uwera Diane",
      email_verified: false,
    });
    expect(me.profiles[0]).toMatchObject({ relationship: "self", display_name: "Uwera Diane" });
    await expect(api.patientAuth.me()).resolves.toMatchObject({ id: me.id });

    await api.patientAuth.logout();
    expect((await failure(api.patientAuth.me())).status).toBe(401);

    await expect(
      api.patientAuth.login({ email: registration.email, password: registration.password }),
    ).resolves.toMatchObject({ id: me.id });
  });

  it("register validation: password >= 15, consents required", async () => {
    const error = await failure(
      api.patientAuth.register({ ...registration, password: "short", accepted_terms_version: "" }),
    );
    expect(error.code).toBe("validation_error");
    expect(Object.keys(error.fields).sort()).toEqual(["accepted_terms_version", "password"]);
  });

  it("staff and patient sessions are separate", async () => {
    await api.patientAuth.login({ email: "patient@medilink.test", password: MOCK_PASSWORD });
    expect((await failure(api.staffAuth.me())).status).toBe(401);
  });

  it("generic 401 for a wrong password", async () => {
    const error = await failure(
      api.patientAuth.login({ email: "patient@medilink.test", password: "nope" }),
    );
    expect(error.code).toBe("not_authenticated");
  });
});

describe("password reset", () => {
  it("always 202, even for unknown emails", async () => {
    await expect(
      api.passwordReset.request({ email: "unknown@example.rw" }),
    ).resolves.toBeUndefined();
    await expect(
      api.passwordReset.request({ email: "patient@medilink.test" }),
    ).resolves.toBeUndefined();
  });

  it("confirm: 204 with a valid token, 400 otherwise", async () => {
    await expect(
      api.passwordReset.confirm({
        uid: "abc",
        token: MOCK_RESET_TOKEN,
        new_password: "a-new-long-password",
      }),
    ).resolves.toBeUndefined();
    const error = await failure(
      api.passwordReset.confirm({ uid: "abc", token: "bad", new_password: "a-new-long-password" }),
    );
    expect(error.fields.token).toBeDefined();
  });
});
