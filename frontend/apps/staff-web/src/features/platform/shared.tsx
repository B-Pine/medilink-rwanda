import { isApiError, newIdempotencyKey } from "@medilink/api-client";
import { Badge, LoadingState, type BadgeTone, type DataTableLabels } from "@medilink/ui";
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../../auth/queries";
import { PageHeading } from "../../components/PageHeading";
import { isStepUpCancelled } from "../lock";

/** Platform pages exist only for platform admins; everyone else sees "not found" (§6.1). */
export function PlatformOnly({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useStaffMe();
  if (isPending) return <LoadingState />;
  if (!me?.is_platform_admin) return <NotPlatformAdmin />;
  return <>{children}</>;
}

function NotPlatformAdmin() {
  const { t } = useTranslation();
  return <PageHeading title={t("platform.notFound")}>{t("platform.notFound")}</PageHeading>;
}

export function useTableLabels(noun: string): DataTableLabels {
  const { t } = useTranslation();
  return {
    search: t("platform.table.search"),
    clearAll: t("platform.table.clearAll"),
    removeFilter: t("platform.table.removeFilter"),
    results: (count) => t("platform.table.results", { count }),
    rowsPerPage: t("platform.table.rowsPerPage"),
    previous: t("platform.table.previous"),
    next: t("platform.table.next"),
    page: (page, pages) => t("platform.table.page", { page, pages }),
    density: t("platform.table.density"),
    densities: {
      compact: t("platform.table.compact"),
      default: t("platform.table.default"),
      comfortable: t("platform.table.comfortable"),
    },
    actions: t("platform.table.open"),
    empty: t("platform.table.empty", { noun }),
    noResults: t("platform.table.noResults"),
    error: t("platform.table.error"),
    retry: t("platform.table.retry"),
  };
}

const APPLICATION_TONES: Record<string, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  under_review: "brand",
  changes_requested: "warning",
  approved: "success",
  rejected: "danger",
};
const FACILITY_TONES: Record<string, BadgeTone> = {
  approved: "info",
  setup: "brand",
  live: "success",
  suspended: "warning",
  deactivated: "neutral",
};
const LICENCE_TONES: Record<string, BadgeTone> = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  missing: "danger",
};

export function StatusBadge({
  kind,
  value,
}: {
  kind: "application" | "facility" | "licence";
  value: string;
}) {
  const { t } = useTranslation();
  const tones =
    kind === "application"
      ? APPLICATION_TONES
      : kind === "facility"
        ? FACILITY_TONES
        : LICENCE_TONES;
  return <Badge tone={tones[value] ?? "neutral"}>{t(`platform.status.${kind}.${value}`)}</Badge>;
}

export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage ?? i18n.language;
}

export function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "Africa/Kigali",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "Africa/Kigali" }).format(
      date,
    );
  }
}

/** Error text for a failed action, or undefined when the user cancelled the step-up. */
export function actionError(error: unknown, fallback: string): string | undefined {
  if (isStepUpCancelled(error)) return undefined;
  if (isApiError(error)) {
    const fields = Object.values(error.fields).flat();
    return fields.length ? `${error.message} ${fields.join(" ")}` : error.message;
  }
  return fallback;
}

/** One Idempotency-Key per dialog opening: retries (step-up, double click) reuse it. */
export function useIdempotencyKey() {
  const key = useRef(newIdempotencyKey());
  return {
    current: () => key.current,
    renew: () => {
      key.current = newIdempotencyKey();
    },
  };
}
