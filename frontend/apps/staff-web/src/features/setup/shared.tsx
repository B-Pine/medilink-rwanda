import { hasPermission, isApiError, type SetupI18n } from "@medilink/api-client";
import { Alert, Button, LoadingState } from "@medilink/ui";
import { ArrowClockwise } from "@phosphor-icons/react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../../auth/queries";
import { NotFoundContent } from "../../pages/NotFoundPage";
import { isStepUpCancelled } from "../lock";

export const setupKeys = {
  facility: ["setup", "facility"] as const,
  checklist: ["setup", "checklist"] as const,
  settings: ["setup", "settings"] as const,
  departments: ["setup", "departments"] as const,
  services: ["setup", "services"] as const,
  points: ["setup", "points"] as const,
  hours: (serviceId: string | null) => ["setup", "hours", serviceId ?? "facility"] as const,
  events: ["setup", "events"] as const,
  calendar: (from: string, serviceId: string | null) =>
    ["setup", "calendar", from, serviceId ?? "facility"] as const,
  overview: (from: string) => ["setup", "overview", from] as const,
  exceptions: ["setup", "exceptions"] as const,
  tariffs: ["setup", "tariffs"] as const,
  rules: ["setup", "rules"] as const,
  members: ["setup", "members"] as const,
  invitations: ["setup", "invitations"] as const,
  changes: (entity: string, page: number) => ["setup", "changes", entity, page] as const,
};

export function useCan(...codes: string[]): boolean {
  const { data: me } = useStaffMe();
  return codes.some((code) => hasPermission(me, code));
}

/** Pages behind a permission: everyone else gets the shell's "not found" (no greyed screens). */
export function SetupGate({ codes, children }: { codes: string[]; children: ReactNode }) {
  return useCan(...codes) ? <>{children}</> : <NotFoundContent />;
}

export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? i18n.language ?? "en";
}

/** The name in the UI language, falling back to English then any language. */
export function useLocalName() {
  const locale = useLocale() as keyof SetupI18n;
  return (names: Partial<SetupI18n> | undefined) =>
    names?.[locale] || names?.en || Object.values(names ?? {}).find(Boolean) || "—";
}

/** Monday-first day names ("Monday" … "Sunday"), and their short forms. */
export function useDayNames(): { long: string[]; short: string[] } {
  const locale = useLocale();
  const monday = Date.UTC(2026, 0, 5);
  const names = (weekday: "long" | "short") =>
    Array.from({ length: 7 }, (_, i) => {
      try {
        return new Intl.DateTimeFormat(locale, { weekday, timeZone: "UTC" }).format(
          new Date(monday + i * 86_400_000),
        );
      } catch {
        return new Intl.DateTimeFormat("en", { weekday, timeZone: "UTC" }).format(
          new Date(monday + i * 86_400_000),
        );
      }
    });
  return { long: names("long"), short: names("short") };
}

export function formatDate(value: string | null | undefined, locale: string, withTime = false) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  const options: Intl.DateTimeFormatOptions = withTime
    ? { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kigali" }
    : { dateStyle: "medium", timeZone: value.length === 10 ? "UTC" : "Africa/Kigali" };
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(date);
  }
}

export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export const todayIso = () => isoDate(new Date());
/** Monday of the week containing `date` (UTC dates). */
export function mondayOf(date: Date): Date {
  const d = new Date(`${isoDate(date)}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
}
export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Error text for a failed action; undefined when the user cancelled the step-up. */
export function errorText(error: unknown, fallback: string): string | undefined {
  if (isStepUpCancelled(error)) return undefined;
  if (isApiError(error)) return error.message || fallback;
  return fallback;
}

/** First message per field of an API error (field-level errors land on the fields). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  return Object.fromEntries(
    Object.entries(error.fields).map(([field, messages]) => [field, messages[0] ?? ""]),
  );
}

export const isConflict = (error: unknown) => isApiError(error) && error.status === 409;

/** Loading, error (with retry) and data states for a query, the same on every setup page. */
export function QueryState<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  const { t } = useTranslation();
  if (query.isPending) return <LoadingState />;
  if (query.isError || query.data === undefined)
    return (
      <Alert tone="danger" title={t("setup.loadFailed")}>
        <Button variant="secondary" onClick={() => void query.refetch()} className="mt-2">
          <ArrowClockwise aria-hidden="true" />
          {t("setup.retry")}
        </Button>
      </Alert>
    );
  return <>{children(query.data)}</>;
}

/** The "someone else changed this" notice for a 409, with a reload action. */
export function ConflictNotice({ onReload }: { onReload: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="warning" role="alert" title={t("setup.conflictTitle")}>
      <p className="m-0">{t("setup.conflictBody")}</p>
      <Button variant="secondary" onClick={onReload} className="mt-2">
        <ArrowClockwise aria-hidden="true" />
        {t("setup.reload")}
      </Button>
    </Alert>
  );
}
