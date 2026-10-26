import { buttonClassName } from "@medilink/ui";
import { AirplaneTilt, CaretRight } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { formatDate, setupKeys, useCan, useLocale } from "./shared";

/** "Needs your attention" (design 04 §3.4): leave requests waiting for a decision. */
export function LeaveTodayCard() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const allowed = useCan("schedule.manage");
  const pending = useQuery({
    queryKey: [...setupKeys.exceptions, "requested"],
    queryFn: () => api.setup.exceptions({ status: "requested" }),
    enabled: allowed,
  });
  const rows = pending.data?.results ?? [];
  if (!allowed || rows.length === 0) return null;
  return (
    <section
      aria-labelledby="today-leave"
      className="flex flex-col gap-3 rounded-lg border border-border border-l-4 border-l-warning bg-surface p-5"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-md bg-warning-bg text-warning">
          <AirplaneTilt aria-hidden="true" weight="duotone" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="today-leave" className="m-0 font-heading text-h3">
            {t("setup.today.leaveTitle")}
          </h2>
          <p className="m-0 text-body-sm text-fg-secondary tabular-nums">
            {t("setup.today.leaveCount", { count: rows.length })}
          </p>
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.slice(0, 3).map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 text-body-sm">
            <span className="font-semibold">{e.member_name}</span>
            <span className="text-fg-secondary tabular-nums">
              {formatDate(e.starts_at, locale)}
            </span>
          </li>
        ))}
      </ul>
      <Link to="/settings/schedules" className={buttonClassName({ variant: "secondary" })}>
        {t("setup.today.review")}
        <CaretRight aria-hidden="true" />
      </Link>
    </section>
  );
}
