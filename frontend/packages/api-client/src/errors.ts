import type { ApiErrorBody, ApiErrorCode } from "./types";

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string[]>;
  requestId?: string | null;
  retryAfter?: number | null;
}

/**
 * Typed error for every failed API call (docs/architecture/02-api-conventions.md §4).
 * `message` is already localised by the API (Accept-Language); `code` is stable.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields: Record<string, string[]>;
  readonly requestId: string | null;
  /** Seconds from the `Retry-After` header (429). */
  readonly retryAfter: number | null;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? {};
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }

  get isValidationError(): boolean {
    return this.code === "validation_error";
  }

  /** First message for a field, if the API sent one. */
  fieldError(field: string): string | undefined {
    return this.fields[field]?.[0];
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

const FALLBACK_CODES: Record<number, ApiErrorCode> = {
  400: "bad_request",
  401: "not_authenticated",
  403: "permission_denied",
  404: "not_found",
  409: "conflict",
  422: "business_rule_violation",
  429: "rate_limited",
};

function fallbackCode(status: number): ApiErrorCode {
  return FALLBACK_CODES[status] ?? (status >= 500 ? "server_error" : "bad_request");
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error: unknown = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds));
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, Math.round((date - Date.now()) / 1000));
}

function normaliseFields(fields: unknown): Record<string, string[]> {
  if (typeof fields !== "object" || fields === null) return {};
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    if (Array.isArray(value)) result[key] = value.map(String);
    else if (typeof value === "string") result[key] = [value];
  }
  return result;
}

/** Build an ApiError from a non-2xx response, whatever its body looks like. */
export async function parseErrorResponse(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = null;
  }
  const headerRequestId = response.headers.get("X-Request-ID");
  const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));

  if (isErrorBody(body)) {
    return new ApiError({
      status: response.status,
      code: body.error.code,
      message: body.error.message,
      fields: normaliseFields(body.error.fields),
      requestId: body.error.request_id ?? headerRequestId,
      retryAfter,
    });
  }
  return new ApiError({
    status: response.status,
    code: fallbackCode(response.status),
    message: response.statusText || `Request failed with status ${response.status}`,
    requestId: headerRequestId,
    retryAfter,
  });
}

export function networkError(cause: unknown): ApiError {
  const error = new ApiError({
    status: 0,
    code: "network_error",
    message: cause instanceof Error ? cause.message : "Network request failed",
  });
  return error;
}
