import { isApiError } from "@medilink/api-client";
import { dateFormat } from "@medilink/ui/i18n";
import { useTranslation } from "react-i18next";

export const CONSENT_VERSION = "2026-10";

export function errorText(error: unknown, fallback: string): string {
  if (isApiError(error)) return error.message;
  return fallback;
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  return Object.fromEntries(
    Object.entries(error.fields).map(([field, messages]) => [field, messages[0] ?? ""]),
  );
}

export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? i18n.language;
}

/** "12 Oct 2026 10:14" in Africa/Kigali. */
export function formatDateTime(value: string, locale: string, withTime = true): string {
  const options: Intl.DateTimeFormatOptions = withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }
    : { dateStyle: "medium", timeZone: "Africa/Kigali" };
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  try {
    return dateFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(date);
  }
}
