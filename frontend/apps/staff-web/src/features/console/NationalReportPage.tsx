import {
  consolePaths,
  type NationalReport,
  type NationalTable,
  type ReportQuery,
  type SuppressedCount,
  type WaitFigures,
} from "@medilink/api-client";
import { Badge, Button, cx, StatTile, TrendChart } from "@medilink/ui";
import {
  Buildings,
  ClockCountdown,
  DownloadSimple,
  MapTrifold,
  Pill,
  Stethoscope,
  UsersThree,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useStaffMe } from "../../auth/queries";
import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { env } from "../../env";
import { NoAccessContent } from "../../pages/NotFoundPage";
import {
  BarList,
  DASH,
  Figures,
  PANEL,
  PeriodControls,
  ReportSkeleton,
  SimpleTable,
  useDate,
  usePeriod,
} from "../queue/ReportsPage";

/**
 * /platform/reports (#208, upgrade 13 W9): the national aggregate report for the platform team.
 * Load by facility and district, the wait trend, top diagnoses by district and stock-outs. Groups
 * of fewer than 10 patients or visits (and figures they could be worked back from) read "Hidden".
 * Every table downloads as CSV (audit-logged).
 */
export function NationalReportPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const allowed = Boolean(me?.is_platform_admin);
  const period = usePeriod();
  const report = useQuery({
    queryKey: ["console", "national-report", period.query] as const,
    queryFn: () => api.console.nationalReport(period.query),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  if (!allowed) return <NoAccessContent />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("console.national.title")}
        description={t("console.national.intro")}
        badges={<Badge tone="neutral">{t("console.national.smallGroups")}</Badge>}
      />
      <PeriodControls {...period} fetching={report.isFetching && !report.isPending} />
      {report.isError ? (
        <p role="alert" className={cx(PANEL, "m-0 text-danger")}>
          {t("console.national.failed")}
        </p>
      ) : !report.data ? (
        <ReportSkeleton />
      ) : (
        <NationalBody data={report.data} query={period.query} />
      )}
    </div>
  );
}

function useFigures() {
  const { t } = useTranslation();
  const hidden = t("console.national.hidden");
  return {
    count: (c: SuppressedCount): string | number => (c.suppressed ? hidden : (c.value ?? DASH)),
    wait: (w: WaitFigures, key: "median_min" | "p90_min" = "median_min"): string =>
      w.suppressed
        ? hidden
        : w[key] === null
          ? DASH
          : t("console.national.minutes", { count: w[key] }),
  };
}

function NationalBody({ data, query }: { data: NationalReport; query: ReportQuery }) {
  const { t } = useTranslation();
  const date = useDate();
  const f = useFigures();
  const label = (start: string) =>
    data.group === "month"
      ? date(start, { month: "short", year: "2-digit" })
      : data.group === "week"
        ? t("queue.report.weekOf", { date: date(start) })
        : date(start);
  const district = (name: string) => name || t("console.national.unknownDistrict");
  const shownTrend = data.wait_trend.filter((r) => r.median_min !== null);
  return (
    <div className="ml-stagger flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t("console.national.kpi.visits")}
          value={f.count(data.totals.visits)}
          icon={<UsersThree aria-hidden="true" weight="bold" />}
          caption={t("console.national.kpi.facilities", {
            count: data.totals.facilities,
            districts: data.totals.districts,
          })}
        />
        <StatTile
          label={t("console.national.kpi.wait")}
          value={f.wait(data.totals.wait)}
          icon={<ClockCountdown aria-hidden="true" weight="bold" />}
          caption={
            data.totals.wait.p90_min === null
              ? undefined
              : t("queue.report.kpi.p90", { minutes: data.totals.wait.p90_min })
          }
        />
        <StatTile
          label={t("console.national.kpi.districts")}
          value={data.totals.districts}
          icon={<MapTrifold aria-hidden="true" weight="bold" />}
        />
        <StatTile
          label={t("console.national.kpi.stockouts")}
          value={data.totals.facilities_with_stockouts}
          icon={<Pill aria-hidden="true" weight="bold" />}
          caption={t("console.national.kpi.medicines", { count: data.stockouts.length })}
        />
      </div>

      <Section
        title={t("console.national.districts.title")}
        description={t("console.national.districts.intro")}
        table="districts"
        query={query}
        icon={<MapTrifold aria-hidden="true" weight="bold" />}
      >
        <SimpleTable
          caption={t("console.national.districts.title")}
          head={[
            t("console.national.district"),
            t("console.national.facilities"),
            t("console.national.visits"),
            t("console.national.median"),
            t("console.national.p90"),
            t("console.national.medicinesOut"),
          ]}
          rows={data.districts.map((r) => [
            district(r.district),
            r.facilities,
            <Count key="v" cell={r.visits} text={f.count(r.visits)} />,
            f.wait(r.wait),
            f.wait(r.wait, "p90_min"),
            r.medicines_out,
          ])}
        />
      </Section>

      <Section
        title={t("console.national.facilitiesTable.title")}
        description={t("console.national.facilitiesTable.intro")}
        table="facilities"
        query={query}
        icon={<Buildings aria-hidden="true" weight="bold" />}
      >
        <SimpleTable
          caption={t("console.national.facilitiesTable.title")}
          head={[
            t("console.national.facility"),
            t("console.national.district"),
            t("console.national.visits"),
            t("console.national.median"),
            t("console.national.medicinesOut"),
          ]}
          rows={data.facilities.map((r) => [
            r.name,
            district(r.district),
            <Count key="v" cell={r.visits} text={f.count(r.visits)} />,
            f.wait(r.wait),
            r.medicines_out,
          ])}
        />
      </Section>

      <Section
        title={t("console.national.trend.title")}
        description={t("console.national.trend.intro")}
        table="waits"
        query={query}
        icon={<ClockCountdown aria-hidden="true" weight="bold" />}
      >
        {shownTrend.length ? (
          <TrendChart
            title={t("console.national.trend.title")}
            labels={shownTrend.map((r) => label(r.start))}
            series={[
              {
                name: t("console.national.median"),
                values: shownTrend.map((r) => r.median_min ?? 0),
              },
              { name: t("console.national.p90"), values: shownTrend.map((r) => r.p90_min ?? 0) },
            ]}
          />
        ) : (
          <p className="m-0 text-body-sm text-fg-muted">{t("queue.report.empty")}</p>
        )}
        {data.wait_trend.some((r) => r.suppressed) && (
          <p className="m-0 text-body-sm text-fg-secondary">
            {t("console.national.trend.hiddenPeriods", {
              count: data.wait_trend.filter((r) => r.suppressed).length,
            })}
          </p>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title={t("console.national.diagnoses.title")}
          description={t("console.national.diagnoses.intro")}
          table="diagnoses"
          query={query}
          icon={<Stethoscope aria-hidden="true" weight="bold" />}
        >
          {data.diagnoses.length === 0 ? (
            <p className="m-0 text-body-sm text-fg-muted">{t("queue.report.empty")}</p>
          ) : (
            data.diagnoses.map((d) => (
              <BarList
                key={d.district_code || "none"}
                heading
                label={district(d.district)}
                rows={d.top.map((r) => ({
                  key: r.code,
                  label: r.display,
                  tag: r.code,
                  value: r.count,
                }))}
              />
            ))
          )}
        </Section>
        <Section
          title={t("console.national.stockouts.title")}
          description={t("console.national.stockouts.intro")}
          table="stockouts"
          query={query}
          icon={<Pill aria-hidden="true" weight="bold" />}
        >
          <Figures
            items={[
              [t("console.national.stockouts.facilities"), data.totals.facilities_with_stockouts],
              [t("console.national.stockouts.medicines"), data.stockouts.length],
            ]}
          />
          <SimpleTable
            caption={t("console.national.stockouts.title")}
            head={[
              t("console.national.stockouts.medicine"),
              t("console.national.facilities"),
              t("console.national.stockouts.where"),
            ]}
            rows={data.stockouts.map((r) => [
              r.medicine,
              r.facilities,
              r.districts.join(", ") || DASH,
            ])}
          />
        </Section>
      </div>
    </div>
  );
}

/** A count, or "Hidden" with the reason for screen readers and on hover. */
function Count({ cell, text }: { cell: SuppressedCount; text: string | number }) {
  const { t } = useTranslation();
  if (!cell.suppressed) return <>{text}</>;
  return (
    <span className="text-fg-muted" title={t("console.national.hiddenWhy")}>
      {text}
      <span className="sr-only"> {t("console.national.hiddenWhy")}</span>
    </span>
  );
}

function Section({
  title,
  description,
  table,
  query,
  icon,
  children,
}: {
  title: string;
  description?: string;
  table: NationalTable;
  query: ReportQuery;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cx(PANEL, "flex min-w-0 flex-col gap-5")} aria-label={title}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-subtle text-on-brand-subtle">
              {icon}
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="m-0 font-heading text-h3 tracking-tight">{title}</h2>
            {description && <p className="m-0 text-body-sm text-fg-secondary">{description}</p>}
          </div>
        </div>
        <DownloadCsv table={table} query={query} title={title} />
      </header>
      {children}
    </section>
  );
}

/** One table as a file, with the session cookie (audit-logged on the server). */
function DownloadCsv({
  table,
  query,
  title,
}: {
  table: NationalTable;
  query: ReportQuery;
  title: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function download() {
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch(
        `${env.apiBaseUrl}${consolePaths.nationalExport(table, query)}`,
        {
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `national-${table}-${query.from}-${query.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        pill
        loading={busy}
        onClick={() => void download()}
        aria-label={t("queue.report.downloadNamed", { name: title })}
      >
        <DownloadSimple aria-hidden="true" weight="bold" />
        {t("queue.report.download")}
      </Button>
      {failed && (
        <span role="alert" className="text-body-sm text-danger">
          {t("queue.report.downloadFailed")}
        </span>
      )}
    </div>
  );
}
