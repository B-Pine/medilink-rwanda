import { buttonClassName, TicketNumber } from "@medilink/ui";
import { CaretRight, ClockCountdown, UsersThree } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { queueKeys, usePollInterval } from "./live";
import { useCan, useServiceNames } from "./shared";

/** Today card (design 04 §3.4 "live operations"): queue length and wait per service. */
export function OnSiteTodayCard() {
  const { t } = useTranslation();
  const api = useApi();
  const serviceName = useServiceNames();
  const allowed = useCan("queue.operate", "queue.call");
  const refetchInterval = usePollInterval();
  const board = useQuery({
    queryKey: queueKeys.board,
    queryFn: () => api.queue.board(),
    enabled: allowed,
    refetchInterval,
  });
  if (!allowed || !board.data) return null;
  const queues = board.data.queues;
  const waiting = queues.reduce((n, q) => n + q.waiting.length, 0);
  const serving = queues.flatMap((q) => [...q.called, ...q.in_service]);
  return (
    <section
      aria-labelledby="today-onsite"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 lg:col-span-2"
    >
      <div className="flex items-center gap-4">
        <span className="inline-flex size-11 items-center justify-center rounded-md bg-brand-subtle text-on-brand-subtle">
          <UsersThree aria-hidden="true" weight="duotone" className="size-6" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="today-onsite" className="m-0 font-heading text-h3">
            {t("queue.today.title")}
          </h2>
          <p className="m-0 text-body-sm text-fg-secondary tabular-nums">
            {t("queue.today.summary", { waiting, serving: serving.length })}
          </p>
        </div>
        <Link to="/queue" className={buttonClassName({ variant: "secondary" })}>
          {t("queue.today.open")}
          <CaretRight aria-hidden="true" />
        </Link>
      </div>
      {queues.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
          {queues.map((q) => (
            <li
              key={`${q.service_id}-${q.stage}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{serviceName(q.service_id)}</span>
                <span className="inline-flex items-center gap-1 text-caption text-fg-secondary tabular-nums">
                  <ClockCountdown aria-hidden="true" className="size-3.5" />
                  {q.estimate_next.status
                    ? t(`queue.status.${q.estimate_next.status}`)
                    : t("queue.board.newArrivalWait", {
                        min: q.estimate_next.min,
                        max: q.estimate_next.max,
                      })}
                </span>
              </span>
              <span className="flex items-baseline gap-1">
                <TicketNumber number={String(q.waiting.length)} size="md" />
                <span className="text-caption text-fg-secondary">{t("queue.today.waiting")}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
