import { CalendarCheck, ClockCounterClockwise, MagnifyingGlass } from "@phosphor-icons/react";
import { Alert, Button, buttonClassName, Card, EmptyState, Skeleton } from "@medilink/ui";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PageHeading } from "../../components/PageHeading";
import { ActiveVisitCard, useActiveVisits } from "./TrackerPage";

/**
 * My visits (design 07 §3.4): today's live visits first; the history timeline with summaries,
 * medicines, documents and receipts fills in as those records arrive.
 */
export function VisitsPage() {
  const { t } = useTranslation();
  const visits = useActiveVisits();
  const active = visits.data?.results ?? [];
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <PageHeading title={t("tracker.visits.title")}>{t("tracker.visits.title")}</PageHeading>

      <section aria-labelledby="visits-today" className="flex flex-col gap-3">
        <h2 id="visits-today" className="m-0 text-h3">
          {t("tracker.visits.today")}
        </h2>
        {visits.isPending ? (
          <Skeleton height="7rem" className="rounded-lg" />
        ) : visits.isError ? (
          <Alert tone="danger" role="alert" title={t("tracker.visits.loadFailed")}>
            <Button variant="secondary" onClick={() => void visits.refetch()}>
              {t("common.retry")}
            </Button>
          </Alert>
        ) : active.length ? (
          <ActiveVisitCard />
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title={t("tracker.visits.noneToday")}
            description={t("tracker.visits.noneTodayBody")}
            action={
              <Link to="/find-care" className={buttonClassName({ size: "lg" })}>
                <MagnifyingGlass aria-hidden="true" className="size-icon" />
                {t("tracker.visits.findCare")}
              </Link>
            }
          />
        )}
      </section>

      <Card as="section" aria-labelledby="visits-history" className="flex flex-col gap-2">
        <h2 id="visits-history" className="m-0 text-h3">
          {t("tracker.visits.history")}
        </h2>
        <EmptyState
          size="inline"
          icon={ClockCounterClockwise}
          title={t("tracker.visits.historyEmpty")}
          description={t("tracker.visits.historyEmptyBody")}
        />
      </Card>
    </div>
  );
}
