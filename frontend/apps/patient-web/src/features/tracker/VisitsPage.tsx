import { ClockCounterClockwise, Info, MagnifyingGlass, Ticket } from "@phosphor-icons/react";
import { buttonClassName, EmptyState, Skeleton } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { EmptyRow, ErrorBlock, PageHeader, Section } from "../dashboard/kit";
import { QueueTicketCard } from "../dashboard/visits";
import { useActiveVisits } from "./TrackerPage";

/**
 * My queue (upgrade 12 §8): today's live tickets first, each one tap from the live view. Earlier
 * visits have no ticket history endpoint yet; their signed records are in Medical records.
 */
export function QueuePage() {
  const { t } = useTranslation();
  const visits = useActiveVisits();
  const active = visits.data?.results ?? [];
  const remote = active.some((v) => v.is_remote && !v.remote_arrival_confirmed_at);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("dashboard.queue.title")}
        subtitle={t("dashboard.queue.subtitle")}
        actions={
          <Link to={`${paths.findCare}?remote=1`} className={buttonClassName({})}>
            <MagnifyingGlass aria-hidden="true" className="size-icon" />
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
              <p className="m-0 flex items-start gap-2 text-body-sm text-fg-secondary">
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

      <Section id="queue-previous" title={t("dashboard.queue.previous")}>
        <EmptyRow
          icon={ClockCounterClockwise}
          title={t("dashboard.queue.previousTitle")}
          body={t("dashboard.queue.previousBody")}
          action={
            <Link to={paths.records} className={buttonClassName({ variant: "secondary" })}>
              {t("dashboard.nav.records")}
            </Link>
          }
        />
      </Section>
    </div>
  );
}
