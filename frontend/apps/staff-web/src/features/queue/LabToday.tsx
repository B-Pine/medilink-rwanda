import { hasPermission } from "@medilink/api-client";
import { buttonClassName, Skeleton } from "@medilink/ui";
import { CaretRight, TestTube } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { labKeys } from "../clinical/LabShared";

/**
 * Lab technician Today (upgrade 06 §3, #201): patients waiting for a sample, results to enter,
 * done today. Only for people who run the lab without the desk or a doctor's queue.
 */
export function LabTodayCard() {
  const { t } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const show =
    hasPermission(me, "lab.operate") &&
    !hasPermission(me, "queue.operate") &&
    !hasPermission(me, "queue.call");
  const queue = useQuery({
    queryKey: labKeys.queue,
    queryFn: () => api.clinical.lab.queue(),
    enabled: show,
    refetchInterval: 30_000,
  });
  if (!show) return null;
  const results = (queue.data?.in_progress ?? []).reduce(
    (n, v) => n + v.orders.filter((o) => o.state === "sample_taken").length,
    0,
  );
  const stats = [
    { key: "waiting", value: queue.data?.waiting.length ?? 0 },
    { key: "results", value: results },
    { key: "done", value: queue.data?.done_today.length ?? 0 },
  ] as const;

  return (
    <section aria-labelledby="lab-today" className="flex flex-col gap-4 lg:col-span-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="lab-today" className="m-0 font-heading text-h2 tracking-tight">
          {t("queue.lab.title")}
        </h2>
        <Link to="/lab" className={buttonClassName({ pill: true })}>
          {t("queue.lab.open")}
          <CaretRight aria-hidden="true" weight="bold" />
        </Link>
      </div>
      {queue.isPending ? (
        <Skeleton height="6rem" className="rounded-2xl" />
      ) : (
        <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-surface p-5 shadow-card">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-subtle text-on-brand-subtle">
            <TestTube aria-hidden="true" className="size-6" />
          </span>
          <dl className="m-0 grid min-w-0 flex-1 grid-cols-3 gap-4">
            {stats.map(({ key, value }) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-body-sm text-fg-secondary">{t(`queue.lab.today.${key}`)}</dt>
                <dd className="m-0 font-heading text-h3 tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
