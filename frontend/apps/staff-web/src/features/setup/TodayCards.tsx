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
  const first = rows[0]!;
  // one quiet line on Today, like the setup notice (audit 2026-11-16)
  return (
    <section
      aria-labelledby="today-leave"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-surface px-4 py-3 shadow-card lg:col-span-3"
    >
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-attention-bg text-attention">
        <AirplaneTilt aria-hidden="true" weight="duotone" className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 id="today-leave" className="m-0 text-body font-semibold">
          {t("setup.today.leaveTitle")}
        </h2>
        <p className="m-0 truncate text-body-sm text-fg-secondary tabular-nums">
          <span>{t("setup.today.leaveCount", { count: rows.length })}</span>
          <span>
            {" · "}
            {first.member_name}, {formatDate(first.starts_at, locale)}
          </span>
        </p>
      </div>
      <Link
        to="/settings/schedules"
        className={buttonClassName({ variant: "secondary", size: "sm" })}
      >
        {t("setup.today.review")}
        <CaretRight aria-hidden="true" />
      </Link>
    </section>
  );
}
