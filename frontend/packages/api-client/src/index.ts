export { createApiClient, CSRF_PATH } from "./client";
export type { ApiClient, ApiClientOptions, HttpMethod, RequestOptions } from "./client";
export { ApiError, isApiError, parseErrorResponse } from "./errors";
export type { ApiErrorInit } from "./errors";
export { createMediLinkApi, paths } from "./endpoints";
export type { MediLinkApi } from "./endpoints";
export * from "./types";

// ---- Feature modules (src/features/<feature>.ts): exports ONLY between the sprint's markers ----
// [S1]
export * from "./features/masterdata";
export * from "./features/onboarding";
export * from "./features/security";
export * from "./features/uploads";
// [/S1]
// [S3]
export * from "./features/patients";
export * from "./features/profile";
// [/S3]
// [S9]
export * from "./features/notifications";
// [/S9]
// [S2]
export * from "./features/setup";
// [/S2]
// [S10]
export * from "./features/help";
// [/S10]
// [PT]
export * from "./features/triage";
// [/PT]
// [S4]
export * from "./features/queue";
export * from "./realtime";
// [/S4]
// [S5]
export * from "./features/booking";
// [/S5]
// [S6]
export * from "./features/clinical";
// [/S6]
