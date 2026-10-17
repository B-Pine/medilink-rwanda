import { isApiError, type ApiError, type ApiErrorCode } from "@medilink/api-client";
import { SERVER_ERROR_TYPE } from "@medilink/ui";
import type { TFunction } from "i18next";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/**
 * Text for a failed API call, in the UI language. Codes are stable; the API's own message
 * (already localised via Accept-Language) is used for codes without a specific UI text.
 */
export function describeApiError(
  error: unknown,
  t: TFunction,
  overrides: Partial<Record<ApiErrorCode, string>> = {},
): string {
  if (!isApiError(error)) return t("errors.generic");
  const override = overrides[error.code];
  if (override) return override;
  switch (error.code) {
    case "network_error":
      return t("errors.network");
    case "rate_limited":
      return error.retryAfter
        ? t("errors.rateLimited", { seconds: error.retryAfter })
        : t("errors.rateLimitedNoTime");
    case "server_error":
      return t("errors.generic");
    default:
      return error.message || t("errors.generic");
  }
}

/**
 * Put validation_error.fields on the matching form fields (inline errors + summary links).
 * Returns true when at least one field error was applied.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: ApiError,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  let applied = false;
  for (const field of fields) {
    const message = error.fieldError(field);
    if (message) {
      setError(field, { type: SERVER_ERROR_TYPE, message });
      applied = true;
    }
  }
  return applied;
}

/** Translate helper with a plain `(key) => string` signature for the ui helpers. */
export function translator(t: TFunction): (key: string) => string {
  return (key) => t(key);
}
