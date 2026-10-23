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
// [/S3]
// [S9]
// [/S9]
