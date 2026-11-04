import { hasPermission } from "@medilink/api-client";
import { buttonClassName, Skeleton, TicketNumber } from "@medilink/ui";
import { CaretRight, Stethoscope } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { queueKeys } from "./live";
import { minutesSince } from "./shared";

/**
 * Triage nurse Today (upgrade 06 §2, #200): how many wait for triage and who is next. Only for
 * people who triage without running the desk or seeing patients as a doctor.
 */
export function TriageTodayCard() {
  const { t } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const show =
    hasPermission(me, "triage.operate") &&
    !hasPermission(me, "queue.operate") &&
    !hasPermission(me, "queue.call");
  const mine = useQuery({
    queryKey: [...queueKeys.mine, "triage"],
    queryFn: () => api.queue.mine("triage"),
    enabled: show,
    refetchInterval: 30_000,
  });
  if (!show) return null;
  const waiting = mine.data?.waiting ?? [];
  const longest = Math.max(0, ...waiting.map((w) => minutesSince(w.arrival_at)));

  return (
    <section aria-labelledby="triage-today" className="flex flex-col gap-4 lg:col-span-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="triage-today" className="m-0 font-heading text-h2 tracking-tight">
          {t("queue.triage.title")}
        </h2>
        <Link to="/triage" className={buttonClassName({ pill: true })}>
          {t("queue.triage.open")}
          <CaretRight aria-hidden="true" weight="bold" />
        </Link>
      </div>
      {mine.isPending ? (
        <Skeleton height="6rem" className="rounded-2xl" />
      ) : (
        <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-surface p-5 shadow-card">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-subtle text-on-brand-subtle">
            <Stethoscope aria-hidden="true" className="size-6" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="m-0 font-heading text-h3 tabular-nums">
              {t("queue.triage.waitingCount", { count: waiting.length })}
            </p>
            <p className="m-0 text-body-sm text-fg-secondary">
              {waiting.length
                ? t("queue.triage.longest", { count: longest })
                : t("queue.triage.nobody")}
            </p>
          </div>
          {waiting[0] && (
            <span className="flex items-center gap-2 text-body-sm">
              <span className="text-fg-secondary">{t("queue.mine.nextUp")}</span>
              <TicketNumber number={waiting[0].number} size="sm" stub tone="attention" />
              <span className="font-semibold">{waiting[0].display_name}</span>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
