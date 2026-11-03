import { hasPermission, isApiError } from "@medilink/api-client";
import { Alert, Button, formatKigaliTime, Skeleton } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { CloudSlash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../../auth/queries";
import { describeApiError } from "../../forms/api-errors";

export function useCan(code: string): boolean {
  const { data: me } = useStaffMe();
  return hasPermission(me, code);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Date and 24-hour time in Africa/Kigali, in the UI language. */
export function useFormatWhen(): (iso: string) => string {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (iso) => formatKigaliTime(iso, lang);
}

/** A calendar date ("2026-11-06") in the UI language, without a time-zone shift. */
export function useFormatDay(): (day: string | null) => string {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "rw";
  return (day) =>
    day
      ? dateFormat(lang, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${day}T00:00:00Z`))
      : "";
}

export function OfflineNotice() {
  const { t } = useTranslation();
  const online = useOnline();
  if (online) return null;
  return (
    <Alert tone="warning" role="status">
      <span className="inline-flex items-center gap-2">
        <CloudSlash aria-hidden="true" className="size-5" />
        {t("notifications.offline")}
      </span>
    </Alert>
  );
}

/** Error with a retry button (design 01 §3 states). */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger" title={t("notifications.loadError")}>
      <p className="m-0">{describeApiError(error, t)}</p>
      <Button variant="secondary" className="mt-3" onClick={onRetry}>
        {t("notifications.retry")}
      </Button>
    </Alert>
  );
}

/** Skeleton rows matching a list of cards. */
export function ListSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-2xl bg-surface shadow-card p-4">
          <Skeleton width="40%" height="1.1em" />
          <Skeleton width="85%" />
          <Skeleton width="25%" height="0.8em" />
        </div>
      ))}
    </div>
  );
}

export const isConflict = (error: unknown) => isApiError(error) && error.status === 409;
