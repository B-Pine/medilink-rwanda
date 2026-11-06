import type { ComingUpItem } from "@medilink/api-client";
import { cx } from "@medilink/ui";
import { ArrowRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { useProfiles } from "../profile/ProfileLayout";
import { DateBlock, ErrorBlock, panelClass, RowsSkeleton } from "./kit";

/**
 * W7 (upgrade 13): dates a clinic planned and that are not a booking yet: vaccinations, antenatal
 * visits and the return visit a doctor asked for. The patient gets a reminder the day before and
 * on the morning (generic text, nothing about what the visit is for).
 */
export const comingUpKey = ["booking", "coming-up"] as const;

export function useComingUp() {
  const api = useApi();
  return useQuery({ queryKey: comingUpKey, queryFn: () => api.booking.comingUp() });
}

function ComingUpRow({ item, who }: { item: ComingUpItem; who: string | null }) {
  const { t } = useTranslation();
  return (
    <li className="flex min-h-16 items-center gap-4 px-4 py-3 sm:px-5">
      <DateBlock iso={item.due_on} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold text-fg">
          {t(`dashboard.comingUp.types.${item.type}`)}
        </span>
        <span className="truncate text-body-sm text-fg-secondary">
          {[item.note || null, item.facility_name, who].filter(Boolean).join(" · ")}
        </span>
      </span>
      {item.type === "follow_up" && (
        <Link
          to={`${paths.findCare}?mode=booking`}
          className="inline-flex min-h-target shrink-0 items-center gap-1 text-body-sm font-semibold text-link"
        >
          {t("dashboard.comingUp.book")}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </li>
  );
}

/** The list itself (inside a card); nothing when there is nothing planned. */
export function ComingUpList({ items }: { items: ComingUpItem[] }) {
  const { t } = useTranslation();
  const profiles = useProfiles();
  const people = profiles.data?.results ?? [];
  const nameOf = (id: string) =>
    people.length > 1 ? (people.find((p) => p.patient_id === id)?.display_name ?? null) : null;
  return (
    <ul
      aria-label={t("dashboard.comingUp.title")}
      className="m-0 flex list-none flex-col divide-y divide-border p-0"
    >
      {items.map((item) => (
        <ComingUpRow key={`${item.type}-${item.id}`} item={item} who={nameOf(item.patient_id)} />
      ))}
    </ul>
  );
}

/** For the Appointments page: the planned dates, under their own heading, only when there are any. */
export function ComingUpSection({ className }: { className?: string }) {
  const { t } = useTranslation();
  const coming = useComingUp();
  if (coming.isPending) return <RowsSkeleton rows={1} />;
  if (coming.isError)
    return (
      <ErrorBlock message={t("dashboard.comingUp.failed")} onRetry={() => void coming.refetch()} />
    );
  const items = coming.data.results;
  if (!items.length) return null;
  return (
    <section aria-labelledby="coming-up" className={className}>
      <h2 id="coming-up" className="m-0 mb-3 font-heading text-h3 tracking-tight">
        {t("dashboard.comingUp.title")}
      </h2>
      <div className={cx(panelClass, "overflow-hidden")}>
        <ComingUpList items={items} />
      </div>
    </section>
  );
}
