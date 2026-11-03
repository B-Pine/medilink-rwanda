import {
  BellRinging,
  ClockCounterClockwise,
  Info,
  MagnifyingGlass,
  Ticket,
  UsersThree,
  type Icon,
} from "@phosphor-icons/react";
import { buttonClassName, EmptyState, Skeleton } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { ErrorBlock, PageHeader, RowIcon, Section, WidgetCard } from "../dashboard/kit";
import { QueueTicketCard } from "../dashboard/visits";
import { useActiveVisits } from "./TrackerPage";

const HOW: { key: "join" | "follow" | "called"; icon: Icon }[] = [
  { key: "join", icon: Ticket },
  { key: "follow", icon: UsersThree },
  { key: "called", icon: BellRinging },
];

/**
 * My queue (upgrade 12 §8, redesign 2026-11-02): today's live tickets first, each one tap from the
 * live view; beside them how the queue works and where earlier visits are. Earlier visits have no
 * ticket history endpoint yet; their signed records are in Medical records.
 */
export function QueuePage() {
  const { t } = useTranslation();
  const visits = useActiveVisits();
  const active = visits.data?.results ?? [];
  const remote = active.some((v) => v.is_remote && !v.remote_arrival_confirmed_at);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.queue.title")}
        subtitle={t("dashboard.queue.subtitle")}
        actions={
          <Link
            to={`${paths.findCare}?remote=1`}
            className={buttonClassName({ className: "shadow-card" })}
          >
            <MagnifyingGlass aria-hidden="true" weight="bold" className="size-4" />
            {t("dashboard.queue.join")}
          </Link>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section id="queue-active" title={t("dashboard.queue.today")}>
          {visits.isPending ? (
            <Skeleton height="13rem" className="rounded-[20px]" />
          ) : visits.isError ? (
            <ErrorBlock
              message={t("dashboard.queue.failed")}
              onRetry={() => void visits.refetch()}
            />
          ) : active.length ? (
            <div className="flex flex-col gap-4">
              {active.map((visit) => (
                <QueueTicketCard key={visit.visit_id} visit={visit} />
              ))}
              {remote && (
                <p className="m-0 flex items-start gap-2 rounded-xl bg-info-bg px-4 py-3 text-body-sm text-fg">
                  <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-info" />
                  {t("dashboard.queue.remoteNote")}
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={Ticket}
              title={t("dashboard.queue.none")}
              description={t("dashboard.queue.noneBody")}
              action={
                <Link to={paths.findCare} className={buttonClassName({})}>
                  <MagnifyingGlass aria-hidden="true" className="size-icon" />
                  {t("dashboard.findCare")}
                </Link>
              }
            />
          )}
        </Section>

        <aside className="flex flex-col gap-6" aria-label={t("dashboard.queue.how.title")}>
          <WidgetCard id="queue-how" title={t("dashboard.queue.how.title")}>
            <ol className="m-0 flex list-none flex-col gap-4 p-5">
              {HOW.map(({ key, icon }, index) => (
                <li key={key} className="flex items-start gap-3">
                  <span className="relative">
                    <RowIcon icon={icon} />
                    <span
                      aria-hidden="true"
                      className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-primary text-caption font-bold text-on-primary tabular-nums"
                    >
                      {index + 1}
                    </span>
                  </span>
                  <p className="m-0 pt-1 text-body-sm text-pretty text-fg-secondary">
                    {t(`dashboard.queue.how.${key}`)}
                  </p>
                </li>
              ))}
            </ol>
          </WidgetCard>

          <WidgetCard id="queue-previous" title={t("dashboard.queue.previous")}>
            <div className="flex flex-col items-start gap-3 p-5">
              <RowIcon icon={ClockCounterClockwise} tone="neutral" />
              <div className="flex flex-col gap-0.5">
                <p className="m-0 font-semibold text-fg">{t("dashboard.queue.previousTitle")}</p>
                <p className="m-0 text-body-sm text-fg-secondary">
                  {t("dashboard.queue.previousBody")}
                </p>
              </div>
              <Link
                to={paths.records}
                className={buttonClassName({ variant: "secondary", size: "sm" })}
              >
                {t("dashboard.nav.records")}
              </Link>
            </div>
          </WidgetCard>
        </aside>
      </div>
    </div>
  );
}
