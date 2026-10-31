import type { DayFigures, Operations } from "@medilink/api-client";
import {
  Badge,
  buttonClassName,
  cx,
  HeatMap,
  LoadMeter,
  Skeleton,
  StatTile,
  TrendChart,
} from "@medilink/ui";
import {
  ArrowsDownUp,
  CaretRight,
  ClockCountdown,
  CurrencyCircleDollar,
  Stethoscope,
  UserMinus,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NotFoundContent } from "../../pages/NotFoundPage";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { LiveBadge } from "./LiveIndicator";
import { useCan } from "./shared";

const operationsKey = [...queueKeys.all, "operations"] as const;

function useOperations(enabled: boolean) {
  const api = useApi();
  const refetchInterval = usePollInterval();
  return useQuery({
    queryKey: operationsKey,
    queryFn: () => api.queue.operations(),
    enabled,
    refetchInterval,
  });
}

const pct = (now: number | null, before: number | null) =>
  now === null || before === null || before === 0
    ? null
    : Math.round(((now - before) / before) * 100);

function useDayLabel() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  return (iso: string, style: "short" | "weekday" = "short") => {
    const date = new Date(`${iso}T00:00:00Z`);
    try {
      return new Intl.DateTimeFormat(
        lang,
        style === "weekday"
          ? { weekday: "long", timeZone: "UTC" }
          : { day: "numeric", month: "short", timeZone: "UTC" },
      ).format(date);
    } catch {
      return iso;
    }
  };
}

/** Four tiles, no more (design 04 §3.4); metrics not measured yet say so (design 06 H6). */
function KpiRow({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const label = useDayLabel();
  const today: DayFigures = data.today;
  const before = data.same_day_last_week;
  const vs = t("queue.ops.vsLast", { day: label(before.date, "weekday") });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label={t("queue.ops.patientsToday")}
        value={today.patients}
        deltaPct={pct(today.patients, before.patients)}
        deltaLabel={vs}
        trend={data.trend.map((d) => d.patients)}
        icon={<UsersThree aria-hidden="true" className="size-5" />}
      />
      <StatTile
        label={t("queue.ops.medianWait")}
        value={today.median_wait_min ?? "—"}
        unit={today.median_wait_min !== null ? t("queue.ops.min") : undefined}
        deltaPct={pct(today.median_wait_min, before.median_wait_min)}
        deltaLabel={vs}
        lowerIsBetter
        trend={data.trend.map((d) => d.median_wait_min)}
        icon={<ClockCountdown aria-hidden="true" className="size-5" />}
      />
      <StatTile
        label={t("queue.ops.noShows")}
        value=""
        note={t("queue.ops.noShowsLater")}
        icon={<UserMinus aria-hidden="true" className="size-5" />}
      />
      <StatTile
        label={t("queue.ops.revenue")}
        value=""
        note={t("queue.ops.revenueLater")}
        icon={<CurrencyCircleDollar aria-hidden="true" className="size-5" />}
      />
    </div>
  );
}

function LiveByService({ data }: { data: Operations }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? "en") as "rw" | "en" | "fr";
  const max = Math.max(8, ...data.services.map((s) => s.waiting));
  return (
    <section
      aria-labelledby="ops-live"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ops-live" className="m-0 font-heading text-h3">
          {t("queue.ops.liveTitle")}
        </h2>
        <span className="text-body-sm text-fg-secondary tabular-nums">
          {t("queue.ops.liveSummary", {
            waiting: data.now.waiting,
            doctors: data.now.doctors_on_duty,
          })}
        </span>
      </div>
      {data.services.length === 0 ? (
        <p className="m-0 text-fg-muted">{t("queue.ops.quiet")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {data.services.map((s) => (
            <li
              key={s.service_id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">
                  {s.name_i18n[lang] || s.name_i18n.en}
                </span>
                <span className="inline-flex items-center gap-1 text-caption text-fg-secondary">
                  <Stethoscope aria-hidden="true" className="size-3.5" />
                  {t("queue.ops.doctors", { count: s.doctors_on_duty })}
                </span>
              </span>
              <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                <LoadMeter
                  load={s.load}
                  value={s.waiting}
                  max={max}
                  label={t(`queue.ops.load.${s.load}`)}
                />
              </span>
              <span className="flex flex-col items-end">
                <span className="font-heading text-h2 leading-none tabular-nums">{s.waiting}</span>
                <span className="text-caption text-fg-secondary tabular-nums">
                  {s.waiting
                    ? t("queue.ops.longest", { min: s.longest_wait_min })
                    : t("queue.ops.waiting")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Attention({ data }: { data: Operations }) {
  const { t } = useTranslation();
  const reorders = data.attention.unreviewed_reorders ?? 0;
  const items = [
    reorders > 0 && {
      to: "/queue/reorders",
      icon: ArrowsDownUp,
      label: t("queue.ops.reordersToReview", { count: reorders }),
    },
    data.now.doctors_on_duty === 0 &&
      data.now.waiting > 0 && {
        to: "/queue",
        icon: WarningCircle,
        label: t("queue.ops.noDoctor", { count: data.now.waiting }),
      },
  ].filter(Boolean) as { to: string; icon: typeof ArrowsDownUp; label: string }[];
  return (
    <section
      aria-labelledby="ops-attention"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="ops-attention" className="m-0 font-heading text-h3">
        {t("queue.ops.attention")}
      </h2>
      {items.length === 0 ? (
        <p className="m-0 text-fg-secondary">{t("queue.ops.allClear")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-target items-center gap-3 rounded-md border border-l-4 border-border border-l-warning px-3 py-2 text-fg no-underline hover:bg-subtle"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0 text-warning" />
                <span className="flex-1 font-semibold">{label}</span>
                <CaretRight aria-hidden="true" className="size-4 text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height="9rem" className="rounded-lg" />
        ))}
      </div>
      <Skeleton height="12rem" className="rounded-lg" />
    </div>
  );
}

/** Today card for facility admins (design 04 §3.4): KPI tiles, live load, needs your attention. */
export function OperationsTodayCard() {
  const { t } = useTranslation();
  const allowed = useCan("reports.view");
  useQueueSocket(allowed);
  const ops = useOperations(allowed);
  if (!allowed) return null;
  return (
    <section aria-labelledby="ops-title" className="flex flex-col gap-4 lg:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="ops-title" className="m-0 flex items-center gap-3 font-heading text-h2">
          {t("queue.ops.title")}
          <LiveBadge />
        </h2>
        <Link to="/reports" className={buttonClassName({ variant: "ghost" })}>
          {t("queue.ops.allReports")}
          <CaretRight aria-hidden="true" />
        </Link>
      </div>
      {!ops.data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <KpiRow data={ops.data} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <LiveByService data={ops.data} />
            <Attention data={ops.data} />
          </div>
        </>
      )}
    </section>
  );
}

/** /reports (analysis 13 §2): trends, waits and arrivals; aggregates only. */
export function ReportsPage() {
  const { t } = useTranslation();
  const allowed = useCan("reports.view");
  const ops = useOperations(allowed);
  const label = useDayLabel();
  if (!allowed) return <NotFoundContent />;
  const data = ops.data;
  const days = data?.trend ?? [];
  const weekdays = Array.from({ length: 6 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, 0, 5 + i)),
    ),
  );
  const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
  const totals = days.reduce(
    (acc, d) => ({
      patients: acc.patients + d.patients,
      emergencies: acc.emergencies + d.emergencies,
    }),
    { patients: 0, emergencies: 0 },
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("queue.reports.title")}
        description={t("queue.reports.intro")}
        badges={<Badge tone="neutral">{t("queue.reports.period")}</Badge>}
      />
      {!data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <KpiRow data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-5">
              <TrendChart
                title={t("queue.reports.patientsPerDay")}
                labels={days.map((d) => label(d.date))}
                series={[
                  { name: t("queue.reports.patients"), values: days.map((d) => d.patients) },
                ]}
              />
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <TrendChart
                title={t("queue.reports.waitToBeSeen")}
                labels={days.map((d) => label(d.date))}
                unit={` ${t("queue.ops.min")}`}
                series={[
                  { name: t("queue.reports.median"), values: days.map((d) => d.median_wait_min) },
                  { name: t("queue.reports.p90"), values: days.map((d) => d.p90_wait_min) },
                ]}
              />
            </div>
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="rounded-lg border border-border bg-surface p-5">
              <HeatMap
                title={t("queue.reports.arrivals")}
                rows={weekdays}
                columns={hours}
                value={(r, c) =>
                  data.arrivals_heatmap.find((x) => x.weekday === r && x.hour === c)?.count ?? 0
                }
                legend={{ less: t("queue.reports.less"), more: t("queue.reports.more") }}
              />
            </div>
            <dl className="m-0 grid grid-cols-2 gap-3 self-start">
              {[
                [t("queue.reports.patients14"), totals.patients],
                [
                  t("queue.reports.avgConsult"),
                  `${data.today.avg_consult_min ?? "—"} ${t("queue.ops.min")}`,
                ],
                [
                  t("queue.reports.leftRate"),
                  data.today.left_rate_pct === null ? "—" : `${data.today.left_rate_pct}%`,
                ],
                [t("queue.reports.emergencies"), totals.emergencies],
              ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className={cx(
                    "flex flex-col gap-1 rounded-lg border border-border bg-surface p-4",
                  )}
                >
                  <dt className="text-body-sm font-semibold text-fg-secondary">{k}</dt>
                  <dd className="m-0 font-heading text-h1 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </>
      )}
    </div>
  );
}
