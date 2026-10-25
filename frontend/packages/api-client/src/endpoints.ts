import type { ApiClient } from "./client";
import type {
  Credentials,
  CsrfResponse,
  HealthResponse,
  MfaConfirmResponse,
  MfaSetupResponse,
  MfaVerifyRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  PatientMe,
  PatientRegisterRequest,
  StaffAuthenticatedResult,
  StaffLoginResult,
  StaffMe,
  Uuid,
} from "./types";

// ---- Feature imports: ONLY between the sprint's markers (shared-file protocol) ----
// [S1 imports]
import { createMasterDataApi } from "./features/masterdata";
import { createOnboardingApi } from "./features/onboarding";
import { createSecurityApi } from "./features/security";
import { createUploadsApi } from "./features/uploads";
// [/S1 imports]
// [S3 imports]
import { createPatientsApi } from "./features/patients";
import { createProfileApi } from "./features/profile";
// [/S3 imports]
// [S9 imports]
// [/S9 imports]
// [S2 imports]
// [/S2 imports]
// [S10 imports]
// [/S10 imports]

/** Every Sprint 0 endpoint (docs/architecture/03-sprint-0-contract.md §2), typed. */
export const paths = {
  health: "/api/v1/health/",
  csrf: "/api/v1/csrf/",
  staffLogin: "/api/v1/staff/auth/login/",
  staffMfaSetup: "/api/v1/staff/auth/mfa/setup/",
  staffMfaConfirm: "/api/v1/staff/auth/mfa/confirm/",
  staffMfaVerify: "/api/v1/staff/auth/mfa/verify/",
  staffLogout: "/api/v1/staff/auth/logout/",
  staffMe: "/api/v1/staff/auth/me/",
  staffActiveFacility: "/api/v1/staff/auth/active-facility/",
  patientRegister: "/api/v1/patient/auth/register/",
  patientLogin: "/api/v1/patient/auth/login/",
  patientLogout: "/api/v1/patient/auth/logout/",
  patientMe: "/api/v1/patient/auth/me/",
  passwordReset: "/api/v1/auth/password-reset/",
  passwordResetConfirm: "/api/v1/auth/password-reset/confirm/",
  schema: "/api/v1/schema/",
} as const;

// Auth calls answer 401 as part of the normal flow (wrong password, second factor pending),
// so they never trigger the global "session expired" hook.
const authCall = { skipUnauthorizedHook: true } as const;
const sessionChange = { skipUnauthorizedHook: true, rotatesSession: true } as const;

export function createMediLinkApi(client: ApiClient) {
  return {
    client,

    health: () => client.get<HealthResponse>(paths.health),
    csrf: () => client.get<CsrfResponse>(paths.csrf),

    staffAuth: {
      login: (body: Credentials) =>
        client.post<StaffLoginResult>(paths.staffLogin, body, sessionChange),
      mfaSetup: () => client.post<MfaSetupResponse>(paths.staffMfaSetup, undefined, authCall),
      mfaConfirm: (code: string) =>
        client.post<MfaConfirmResponse>(paths.staffMfaConfirm, { code }, sessionChange),
      mfaVerify: (body: MfaVerifyRequest) =>
        client.post<StaffAuthenticatedResult>(paths.staffMfaVerify, body, sessionChange),
      logout: () => client.post<void>(paths.staffLogout, undefined, sessionChange),
      /**
       * Throws ApiError 401 `not_authenticated` or `mfa_required` when there is no full session.
       * Skips the 401 hook: the route guard that calls it handles 401 itself.
       */
      me: (signal?: AbortSignal) =>
        client.get<StaffMe>(paths.staffMe, signal ? { signal, ...authCall } : authCall),
      setActiveFacility: (facilityId: Uuid) =>
        client.post<StaffMe>(
          paths.staffActiveFacility,
          { facility_id: facilityId },
          { rotatesSession: true },
        ),
    },

    patientAuth: {
      register: (body: PatientRegisterRequest) =>
        client.post<PatientMe>(paths.patientRegister, body, sessionChange),
      login: (body: Credentials) => client.post<PatientMe>(paths.patientLogin, body, sessionChange),
      logout: () => client.post<void>(paths.patientLogout, undefined, sessionChange),
      /** 401 when not logged in (handled by the caller, not the global hook). */
      me: (signal?: AbortSignal) =>
        client.get<PatientMe>(paths.patientMe, signal ? { signal, ...authCall } : authCall),
    },

    passwordReset: {
      /** Always 202, even for unknown emails (no account enumeration). */
      request: (body: PasswordResetRequest) =>
        client.post<void>(paths.passwordReset, body, authCall),
      confirm: (body: PasswordResetConfirmRequest) =>
        client.post<void>(paths.passwordResetConfirm, body, sessionChange),
    },

    // ---- Feature APIs: `<feature>: create<Feature>Api(client),` ONLY between the markers ----
    // [S1]
    masterData: createMasterDataApi(client),
    onboarding: createOnboardingApi(client),
    security: createSecurityApi(client),
    uploads: {
      staff: createUploadsApi(client, "staff"),
      patient: createUploadsApi(client, "patient"),
    },
    // [/S1]
    // [S3]
    patients: createPatientsApi(client),
    profile: createProfileApi(client),
    // [/S3]
    // [S9]
    // [/S9]
    // [S2]
    // [/S2]
    // [S10]
    // [/S10]
  };
}

export type MediLinkApi = ReturnType<typeof createMediLinkApi>;
