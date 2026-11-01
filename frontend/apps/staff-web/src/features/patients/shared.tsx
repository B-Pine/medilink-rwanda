import { hasPermission, isApiError, type InsuranceStatus } from "@medilink/api-client";
import { Badge, type BadgeTone } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../../auth/queries";
import { PageHeading } from "../../components/PageHeading";
import { isStepUpCancelled } from "../lock";

/** Whether the signed-in staff member holds any of these codes in the active facility. */
export function useCan(...codes: string[]): boolean {
  const { data: me } = useStaffMe();
  return codes.some((code) => hasPermission(me, code));
}

/** Pages behind a permission: everyone else sees "not found" (no greyed-out screens). */
export function Gate({ codes, children }: { codes: string[]; children: ReactNode }) {
  const { t } = useTranslation();
  const allowed = useCan(...codes);
  if (!allowed)
    return <PageHeading title={t("patients.notFound")}>{t("patients.notFound")}</PageHeading>;
  return <>{children}</>;
}

const INSURANCE_TONES: Record<InsuranceStatus, BadgeTone> = {
  unverified: "warning",
  verified: "success",
  rejected: "danger",
};

export function InsuranceBadge({
  status,
  expired,
}: {
  status: InsuranceStatus;
  expired?: boolean;
}) {
  const { t } = useTranslation();
  if (expired) return <Badge tone="danger">{t("patients.insurance.expired")}</Badge>;
  return <Badge tone={INSURANCE_TONES[status]}>{t(`patients.insurance.status.${status}`)}</Badge>;
}

export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? i18n.language;
}

export function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  try {
    return dateFormat(locale, {
      dateStyle: "medium",
      timeZone: "Africa/Kigali",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "Africa/Kigali" }).format(
      date,
    );
  }
}

/** "42 y" or "~42 y" for an estimated birth date. */
export function useAge() {
  const { t } = useTranslation();
  return (years: number | null, estimated: boolean) =>
    years === null
      ? "—"
      : t(estimated ? "patients.ageEstimated" : "patients.age", { count: years });
}

/** Error text for a failed action, or undefined when the user cancelled the step-up. */
export function actionError(error: unknown, fallback: string): string | undefined {
  if (isStepUpCancelled(error)) return undefined;
  if (isApiError(error)) {
    const fields = Object.values(error.fields).flat();
    return fields.length && !fields.includes(error.message)
      ? `${error.message} ${fields.join(" ")}`
      : error.message;
  }
  return fallback;
}

/** Field errors of an ApiError keyed by field (first message each). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!isApiError(error)) return {};
  return Object.fromEntries(
    Object.entries(error.fields).map(([field, messages]) => [field, messages[0] ?? ""]),
  );
}

export const CONSENT_VERSION = "2026-10";
