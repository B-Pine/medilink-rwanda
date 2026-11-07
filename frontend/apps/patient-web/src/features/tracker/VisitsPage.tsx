import { ClockCounterClockwise, Info, MagnifyingGlass, Ticket } from "@phosphor-icons/react";
import { buttonClassName, EmptyState, Skeleton } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { ErrorBlock, PageHeader, RowIcon, RowLink, RowList, Section } from "../dashboard/kit";
import { QueueTicketCard } from "../dashboard/visits";
import { useActiveVisits } from "./TrackerPage";

/**
 * My queue (upgrade 12 §8): today's live tickets, each one tap from the live view, then a link to
 * earlier visits. Earlier visits have no ticket history endpoint yet; their signed records are in
 * Medical records. Labels and data only, like the patient app (2026-11-05).
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

      <Section id="queue-active" title={t("dashboard.queue.today")}>
        {visits.isPending ? (
          <Skeleton height="13rem" className="rounded-[20px]" />
        ) : visits.isError ? (
          <ErrorBlock message={t("dashboard.queue.failed")} onRetry={() => void visits.refetch()} />
        ) : active.length ? (
          <div className="flex flex-col gap-4">
            {active.map((visit) => (
              <QueueTicketCard key={visit.visit_id} visit={visit} />
            ))}
            {remote && (
              // decision 2026-10: "I'm here" is intent only; reception confirms the arrival
              <p className="m-0 flex items-center gap-2 rounded-xl bg-info-bg px-4 py-3 text-body-sm text-fg">
                <Info aria-hidden="true" className="size-5 shrink-0 text-info" />
                {t("dashboard.queue.remoteNote")}
              </p>
            )}
          </div>
        ) : (
          <EmptyState
            icon={Ticket}
            title={t("dashboard.queue.none")}
            action={
              <Link to={paths.findCare} className={buttonClassName({})}>
                <MagnifyingGlass aria-hidden="true" className="size-icon" />
                {t("dashboard.findCare")}
              </Link>
            }
          />
        )}
      </Section>

      <RowList label={t("dashboard.queue.previous")}>
        <RowLink
          to={paths.records}
          leading={<RowIcon icon={ClockCounterClockwise} tone="neutral" />}
          title={t("dashboard.queue.previous")}
          meta={t("dashboard.nav.records")}
        />
      </RowList>
    </div>
  );
}
