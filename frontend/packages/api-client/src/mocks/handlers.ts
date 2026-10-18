import { delay, http, HttpResponse, type HttpHandler } from "msw";

import type {
  ApiErrorBody,
  ApiErrorCode,
  LanguageCode,
  MfaConfirmResponse,
  MfaSetupResponse,
  PatientMe,
  StaffAuthenticatedResult,
  StaffLoginResult,
  StaffMe,
} from "../types";
import {
  MOCK_MAX_FAILURES,
  MOCK_PASSWORD,
  MOCK_RATE_LIMITED_EMAIL,
  MOCK_RECOVERY_CODE,
  MOCK_RESET_TOKEN,
  MOCK_RETRY_AFTER_SECONDS,
  MOCK_TOTP_CODE,
  PATIENTS,
  STAFF_USERS,
  toStaffMe,
  type MockPatientRecord,
  type MockStaffUser,
} from "./data";
import { FEATURE_MOCKS } from "./features";
import { languageFrom, message, type MessageKey } from "./messages";
import { createMemoryStore, type MockSessionStore } from "./session-store";

/**
 * MSW handlers implementing docs/architecture/03-sprint-0-contract.md §2 (Sprint 0).
 * Paths use a `*` origin so they match whatever VITE_API_BASE_URL is.
 *
 * Behaviour mirrors the contract and the API conventions:
 *  - CSRF enforced on unsafe methods (403 csrf_failed), token rotated on login/session changes
 *  - generic 401 for wrong credentials, 429 after repeated failures (with Retry-After)
 *  - validation_error with `fields` for invalid input
 */

type StaffStage = "mfa_setup" | "mfa_verify" | "authenticated";

interface StaffSession {
  email: string;
  stage: StaffStage;
  activeFacilityId: string | null;
}

interface PatientSession {
  /** Copy of the patient so a session made by a mock sign-up survives a reload. */
  me: PatientMe;
}

export interface MockHandlerOptions {
  /** Where sessions live. Default: in memory. The browser worker passes a cookie store. */
  store?: MockSessionStore;
  /** Artificial latency in ms (browser only; keep 0 in tests). */
  latencyMs?: number;
}

/**
 * What feature mock handlers get from the core mock API, so every feature enforces the same
 * contract rules (CSRF, sessions, error envelope, latency) as Sprint 0.
 */
export interface MockContext {
  /** Prefix matching any API origin: `${context.api}/staff/patients/`. */
  api: string;
  settle: () => Promise<void>;
  languageFrom: (request: Request) => LanguageCode;
  message: typeof message;
  errorResponse: typeof errorResponse;
  readJson: typeof readJson;
  /** 403 `csrf_failed` response when the X-CSRFToken header is missing or wrong, else null. */
  csrfFailure: (request: Request, lang: LanguageCode) => Response | null;
  validationError: (lang: LanguageCode, fields: Record<string, MessageKey | string[]>) => Response;
  /** The fully authenticated staff user (with active facility), or a 401 response. */
  authenticatedStaff: (lang: LanguageCode) => { me: StaffMe } | { error: Response };
  /** The logged-in patient account, or a 401 response. */
  authenticatedPatient: (lang: LanguageCode) => { me: PatientMe } | { error: Response };
}

export interface MockApi {
  handlers: HttpHandler[];
  /** Reset counters, registered patients, enrolments and sessions (between tests). */
  reset(): void;
}

const API = "*/api/v1";
const STAFF_PASSWORD_MIN = 12;
const PATIENT_PASSWORD_MIN = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function randomId(): string {
  return crypto.randomUUID();
}

function randomBase32(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % 32]).join("");
}

function randomRecoveryCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function errorResponse(
  status: number,
  code: ApiErrorCode,
  text: string,
  options: { fields?: Record<string, string[]>; headers?: Record<string, string> } = {},
) {
  const requestId = randomId();
  const body: ApiErrorBody = { error: { code, message: text, request_id: requestId } };
  if (options.fields) body.error.fields = options.fields;
  return HttpResponse.json(body, {
    status,
    headers: { "X-Request-ID": requestId, ...options.headers },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const normaliseEmail = (value: unknown) => asString(value).trim().toLowerCase();

export function createMockApi(options: MockHandlerOptions = {}): MockApi {
  const store = options.store ?? createMemoryStore();
  const latency = options.latencyMs ?? 0;

  // "Server" state that does not need to survive a reload.
  let csrfToken: string | null = null;
  const failures = new Map<string, number>();
  const enrolled = new Set<string>();
  const usedRecoveryCodes = new Set<string>();
  const registered: MockPatientRecord[] = [];

  const staffSession = () => store.read<StaffSession>("staff");
  const setStaffSession = (s: StaffSession | null) => store.write("staff", s);
  const patientSession = () => store.read<PatientSession>("patient");
  const setPatientSession = (s: PatientSession | null) => store.write("patient", s);

  const findStaff = (email: string) => STAFF_USERS.find((u) => u.email === email);
  const findPatient = (email: string) =>
    [...PATIENTS, ...registered].find((p) => p.me.email === email);
  const mfaEnabled = (user: MockStaffUser) => user.mfa_enabled || enrolled.has(user.email);
  const isStaff = (user: MockStaffUser) => user.is_platform_admin || user.memberships.length > 0;

  function staffMe(session: StaffSession): StaffMe | null {
    const user = findStaff(session.email);
    return user ? toStaffMe(user, session.activeFacilityId, mfaEnabled(user)) : null;
  }

  /** Session rotation: the CSRF secret changes, the client must fetch a new token. */
  function rotate() {
    csrfToken = null;
  }

  function settle() {
    return latency > 0 ? delay(latency) : Promise.resolve();
  }

  function csrfFailure(request: Request, lang: LanguageCode) {
    const header = request.headers.get("X-CSRFToken");
    if (!csrfToken || header !== csrfToken) {
      return errorResponse(403, "csrf_failed", message("csrfFailed", lang));
    }
    return null;
  }

  function rateLimited(lang: LanguageCode) {
    return errorResponse(
      429,
      "rate_limited",
      message("rateLimited", lang, { seconds: MOCK_RETRY_AFTER_SECONDS }),
      { headers: { "Retry-After": String(MOCK_RETRY_AFTER_SECONDS) } },
    );
  }

  function tooManyFailures(key: string) {
    return (failures.get(key) ?? 0) >= MOCK_MAX_FAILURES;
  }

  function recordFailure(key: string) {
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }

  function validationError(lang: LanguageCode, fields: Record<string, MessageKey | string[]>) {
    const resolved: Record<string, string[]> = {};
    for (const [field, value] of Object.entries(fields)) {
      resolved[field] = Array.isArray(value) ? value : [message(value, lang)];
    }
    return errorResponse(400, "validation_error", message("validation", lang), {
      fields: resolved,
    });
  }

  function credentialErrors(body: Record<string, unknown>) {
    const fields: Record<string, MessageKey> = {};
    const email = normaliseEmail(body.email);
    if (!email) fields.email = "required";
    else if (!EMAIL_PATTERN.test(email)) fields.email = "invalidEmail";
    if (!asString(body.password)) fields.password = "required";
    return fields;
  }

  function authenticatedStaff(lang: LanguageCode) {
    const session = staffSession();
    if (!session)
      return { error: errorResponse(401, "not_authenticated", message("notAuthenticated", lang)) };
    if (session.stage !== "authenticated") {
      return { error: errorResponse(401, "mfa_required", message("mfaRequired", lang)) };
    }
    const me = staffMe(session);
    if (!me)
      return { error: errorResponse(401, "not_authenticated", message("notAuthenticated", lang)) };
    return { session, me };
  }

  const context: MockContext = {
    api: API,
    settle,
    languageFrom,
    message,
    errorResponse,
    readJson,
    csrfFailure,
    validationError,
    authenticatedStaff: (lang) => {
      const result = authenticatedStaff(lang);
      return result.error ? { error: result.error } : { me: result.me };
    },
    authenticatedPatient: (lang) => {
      const session = patientSession();
      return session
        ? { me: session.me }
        : { error: errorResponse(401, "not_authenticated", message("notAuthenticated", lang)) };
    },
  };
  const features = FEATURE_MOCKS.map((create) => create(context));

  const handlers: HttpHandler[] = [
    http.get(`${API}/health/`, async () => {
      await settle();
      return HttpResponse.json({ status: "ok", version: "0.1.0" });
    }),

    http.get(`${API}/csrf/`, async () => {
      await settle();
      csrfToken ??= `mock-csrf-${randomBase32(24)}`;
      return HttpResponse.json({ csrf_token: csrfToken });
    }),

    // ---------------------------------------------------------------- staff auth
    http.post(`${API}/staff/auth/login/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await readJson(request);
      const fields = credentialErrors(body);
      if (Object.keys(fields).length > 0) return validationError(lang, fields);

      const email = normaliseEmail(body.email);
      const key = `staff:${email}`;
      if (email === MOCK_RATE_LIMITED_EMAIL || tooManyFailures(key)) return rateLimited(lang);

      const user = findStaff(email);
      if (!user || !isStaff(user) || asString(body.password) !== MOCK_PASSWORD) {
        recordFailure(key);
        return errorResponse(401, "not_authenticated", message("invalidCredentials", lang));
      }
      failures.delete(key);
      rotate();
      const activeFacilityId =
        user.memberships.length === 1 ? user.memberships[0]!.facility.id : null;
      const stage: StaffStage = mfaEnabled(user) ? "mfa_verify" : "mfa_setup";
      setStaffSession({ email, stage, activeFacilityId });
      const result: StaffLoginResult = {
        status: stage === "mfa_verify" ? "mfa_required" : "mfa_setup_required",
        user: null,
      };
      return HttpResponse.json(result);
    }),

    http.post(`${API}/staff/auth/mfa/setup/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const session = staffSession();
      if (!session || session.stage !== "mfa_setup") {
        return errorResponse(401, "not_authenticated", message("notAuthenticated", lang));
      }
      const secret = randomBase32(32);
      const label = encodeURIComponent(`MediLink Rwanda:${session.email}`);
      const body: MfaSetupResponse = {
        otpauth_uri: `otpauth://totp/${label}?secret=${secret}&issuer=MediLink%20Rwanda&algorithm=SHA1&digits=6&period=30`,
        secret,
      };
      return HttpResponse.json(body);
    }),

    http.post(`${API}/staff/auth/mfa/confirm/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const session = staffSession();
      if (!session || session.stage !== "mfa_setup") {
        return errorResponse(401, "not_authenticated", message("notAuthenticated", lang));
      }
      const body = await readJson(request);
      const code = asString(body.code).replace(/\s+/g, "");
      if (!code) return validationError(lang, { code: "required" });
      if (code !== MOCK_TOTP_CODE) return validationError(lang, { code: "invalidCode" });

      enrolled.add(session.email);
      rotate();
      const next: StaffSession = { ...session, stage: "authenticated" };
      setStaffSession(next);
      const user = staffMe(next)!;
      const response: MfaConfirmResponse = {
        status: "authenticated",
        user,
        recovery_codes: Array.from({ length: 10 }, randomRecoveryCode),
      };
      return HttpResponse.json(response);
    }),

    http.post(`${API}/staff/auth/mfa/verify/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const session = staffSession();
      if (!session || session.stage !== "mfa_verify") {
        return errorResponse(401, "not_authenticated", message("notAuthenticated", lang));
      }
      const key = `mfa:${session.email}`;
      if (tooManyFailures(key)) return rateLimited(lang);

      const body = await readJson(request);
      const code = asString(body.code).replace(/\s+/g, "");
      const recovery = asString(body.recovery_code).trim().toLowerCase();
      if (!code && !recovery) return validationError(lang, { code: "required" });

      const ok = code
        ? code === MOCK_TOTP_CODE
        : recovery === MOCK_RECOVERY_CODE && !usedRecoveryCodes.has(`${session.email}:${recovery}`);
      if (!ok) {
        recordFailure(key);
        return code
          ? validationError(lang, { code: "invalidCode" })
          : validationError(lang, { recovery_code: "invalidRecoveryCode" });
      }
      if (recovery) usedRecoveryCodes.add(`${session.email}:${recovery}`);
      failures.delete(key);
      rotate();
      const next: StaffSession = { ...session, stage: "authenticated" };
      setStaffSession(next);
      const result: StaffAuthenticatedResult = { status: "authenticated", user: staffMe(next)! };
      return HttpResponse.json(result);
    }),

    http.post(`${API}/staff/auth/logout/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      setStaffSession(null);
      rotate();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${API}/staff/auth/me/`, async ({ request }) => {
      await settle();
      const result = authenticatedStaff(languageFrom(request));
      if ("error" in result) return result.error;
      return HttpResponse.json(result.me);
    }),

    http.post(`${API}/staff/auth/active-facility/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const result = authenticatedStaff(lang);
      if ("error" in result) return result.error;
      const body = await readJson(request);
      const facilityId = asString(body.facility_id);
      if (!facilityId) return validationError(lang, { facility_id: "required" });
      if (!result.me.memberships.some((m) => m.facility.id === facilityId)) {
        return errorResponse(404, "not_found", message("notFound", lang));
      }
      rotate();
      const next: StaffSession = { ...result.session, activeFacilityId: facilityId };
      setStaffSession(next);
      return HttpResponse.json(staffMe(next));
    }),

    // ---------------------------------------------------------------- patient auth
    http.post(`${API}/patient/auth/register/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await readJson(request);
      const fields: Record<string, MessageKey | string[]> = {};
      const fullName = asString(body.full_name).trim();
      const email = normaliseEmail(body.email);
      const password = asString(body.password);
      const language = asString(body.preferred_language);
      if (!fullName) fields.full_name = "required";
      if (!email) fields.email = "required";
      else if (!EMAIL_PATTERN.test(email)) fields.email = "invalidEmail";
      else if (findPatient(email)) fields.email = "emailTaken";
      if (password.length < PATIENT_PASSWORD_MIN) {
        fields.password = [message("passwordTooShort", lang, { min: PATIENT_PASSWORD_MIN })];
      }
      if (!["rw", "en", "fr"].includes(language)) fields.preferred_language = "required";
      if (!asString(body.accepted_terms_version)) fields.accepted_terms_version = "required";
      if (!asString(body.accepted_privacy_version)) fields.accepted_privacy_version = "required";
      if (typeof body.research_consent !== "boolean") fields.research_consent = "required";
      if (Object.keys(fields).length > 0) return validationError(lang, fields);

      const me: PatientMe = {
        id: randomId(),
        email,
        full_name: fullName,
        preferred_language: language as LanguageCode,
        email_verified: false,
        profiles: [{ patient_id: randomId(), display_name: fullName, relationship: "self" }],
      };
      registered.push({ me, password });
      rotate();
      setPatientSession({ me });
      return HttpResponse.json(me, { status: 201 });
    }),

    http.post(`${API}/patient/auth/login/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await readJson(request);
      const fields = credentialErrors(body);
      if (Object.keys(fields).length > 0) return validationError(lang, fields);

      const email = normaliseEmail(body.email);
      const key = `patient:${email}`;
      if (email === MOCK_RATE_LIMITED_EMAIL || tooManyFailures(key)) return rateLimited(lang);
      const patient = findPatient(email);
      if (!patient || asString(body.password) !== patient.password) {
        recordFailure(key);
        return errorResponse(401, "not_authenticated", message("invalidCredentials", lang));
      }
      failures.delete(key);
      rotate();
      setPatientSession({ me: patient.me });
      return HttpResponse.json(patient.me);
    }),

    http.post(`${API}/patient/auth/logout/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      setPatientSession(null);
      rotate();
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(`${API}/patient/auth/me/`, async ({ request }) => {
      await settle();
      const session = patientSession();
      if (!session) {
        return errorResponse(
          401,
          "not_authenticated",
          message("notAuthenticated", languageFrom(request)),
        );
      }
      return HttpResponse.json(session.me);
    }),

    // ---------------------------------------------------------------- password reset
    http.post(`${API}/auth/password-reset/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await readJson(request);
      const email = normaliseEmail(body.email);
      if (!email) return validationError(lang, { email: "required" });
      if (email === MOCK_RATE_LIMITED_EMAIL) return rateLimited(lang);
      // Always 202, whether or not the account exists (no enumeration).
      return new HttpResponse(null, { status: 202 });
    }),

    http.post(`${API}/auth/password-reset/confirm/`, async ({ request }) => {
      await settle();
      const lang = languageFrom(request);
      const csrf = csrfFailure(request, lang);
      if (csrf) return csrf;
      const body = await readJson(request);
      const fields: Record<string, MessageKey | string[]> = {};
      if (!asString(body.uid) || asString(body.token) !== MOCK_RESET_TOKEN)
        fields.token = "invalidResetLink";
      if (asString(body.new_password).length < STAFF_PASSWORD_MIN) {
        fields.new_password = [message("passwordTooShort", lang, { min: STAFF_PASSWORD_MIN })];
      }
      if (Object.keys(fields).length > 0) return validationError(lang, fields);
      // Revokes all sessions of that user.
      setStaffSession(null);
      setPatientSession(null);
      rotate();
      return new HttpResponse(null, { status: 204 });
    }),
  ];

  handlers.push(...features.flatMap((feature) => feature.handlers));

  return {
    handlers,
    reset() {
      for (const feature of features) feature.reset?.();
      csrfToken = null;
      failures.clear();
      enrolled.clear();
      usedRecoveryCodes.clear();
      registered.length = 0;
      setStaffSession(null);
      setPatientSession(null);
    },
  };
}
