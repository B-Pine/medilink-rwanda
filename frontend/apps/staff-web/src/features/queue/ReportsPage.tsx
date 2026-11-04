import {
  queuePaths,
  type FacilityReport,
  type ReportGroup,
  type ReportQuery,
  type ReportTable,
} from "@medilink/api-client";
import {
  Badge,
  Button,
  cx,
  SelectField,
  Skeleton,
  StatTile,
  TextField,
  TrendChart,
} from "@medilink/ui";
import { dateFormat, formatMoney } from "@medilink/ui/i18n";
import {
  ArrowsClockwise,
  ClockCountdown,
  DownloadSimple,
  Flask,
  Pill,
  Stethoscope,
  UsersThree,
  Wallet,
  WarningCircle,
} from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { env } from "../../env";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { queueKeys } from "./live";
import { ArrivalsPanel } from "./Operations";
import { useCan } from "./shared";

/**
 * /reports (#205, upgrade 13 W6): how the facility ran over a period, by day, week or month.
 * Aggregates only, never a patient name; every table downloads as CSV (audit-logged).
 */

const GROUPS: readonly ReportGroup[] = ["day", "week", "month"];
type Preset = "7" | "30" | "90" | "thisMonth" | "lastMonth" | "custom";
const PRESETS: readonly Preset[] = ["7", "30", "90", "thisMonth", "lastMonth", "custom"];
export const PANEL = "rounded-2xl bg-surface shadow-card p-5";
export const DASH = "—";

function kigaliToday(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kigali" }).format(new Date());
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: Preset, today: string): { from: string; to: string } | null {
  if (preset === "7" || preset === "30" || preset === "90")
    return { from: shift(today, 1 - Number(preset)), to: today };
  if (preset === "thisMonth") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === "lastMonth") {
    const firstThis = `${today.slice(0, 7)}-01`;
    const lastPrev = shift(firstThis, -1);
    return { from: `${lastPrev.slice(0, 7)}-01`, to: lastPrev };
  }
  return null;
}

/** The period in the URL, so a report can be shared and reloaded. */
export function usePeriod() {
  const [params, setParams] = useSearchParams();
  const today = kigaliToday();
  const preset = PRESETS.find((p) => p === params.get("range")) ?? "30";
  const custom = { from: params.get("from") ?? shift(today, -29), to: params.get("to") ?? today };
  const range = presetRange(preset, today) ?? custom;
  const group = GROUPS.find((g) => g === params.get("group")) ?? "day";
  const update = (next: Record<string, string>) =>
    setParams(
      (prev) => {
        const merged = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) merged.set(k, v);
        return merged;
      },
      { replace: true },
    );
  return { preset, group, query: { ...range, group } satisfies ReportQuery, update, today };
}

export function ReportsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const allowed = useCan("reports.view");
  const { preset, group, query, update, today } = usePeriod();
  const report = useQuery({
    queryKey: [...queueKeys.all, "facility-report", query] as const,
    queryFn: () => api.queue.report(query),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  if (!allowed) return <NoAccessContent />;
  const data = report.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("queue.reports.title")}
        description={t("queue.report.intro")}
        badges={<Badge tone="neutral">{t("queue.report.noNames")}</Badge>}
      />
      <PeriodControls
        preset={preset}
        group={group}
        query={query}
        update={update}
        today={today}
        fetching={report.isFetching && !report.isPending}
      />
      {report.isError ? (
        <p role="alert" className={cx(PANEL, "m-0 text-danger")}>
          {t("queue.report.failed")}
        </p>
      ) : !data ? (
        <ReportSkeleton />
      ) : (
        <ReportBody data={data} query={query} />
      )}
      <ArrivalsPanel />
    </div>
  );
}

/** Range, dates and grouping, kept in the URL (also the national report, W9). */
export function PeriodControls({
  preset,
  group,
  query,
  update,
  today,
  fetching,
}: ReturnType<typeof usePeriod> & { fetching: boolean }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("queue.report.periodLabel")}
      className={cx(PANEL, "flex flex-wrap items-end gap-4")}
    >
      <SelectField
        label={t("queue.report.range")}
        value={preset}
        onChange={(e) => {
          const next = e.target.value as Preset;
          update(
            next === "custom" ? { range: next, from: query.from, to: query.to } : { range: next },
          );
        }}
        className="w-full sm:w-52"
      >
        {PRESETS.map((p) => (
          <option key={p} value={p}>
            {t(`queue.report.presets.${p}`)}
          </option>
        ))}
      </SelectField>
      {preset === "custom" && (
        <>
          <TextField
            type="date"
            label={t("queue.report.from")}
            value={query.from}
            max={query.to}
            onChange={(e) => e.target.value && update({ from: e.target.value })}
            className="w-full sm:w-44"
          />
          <TextField
            type="date"
            label={t("queue.report.to")}
            value={query.to}
            min={query.from}
            max={today}
            onChange={(e) => e.target.value && update({ to: e.target.value })}
            className="w-full sm:w-44"
          />
        </>
      )}
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-body-sm font-semibold">
          {t("queue.report.groupBy")}
        </legend>
        <div className="inline-flex rounded-full bg-subtle p-1">
          {GROUPS.map((g) => (
            <label
              key={g}
              className={cx(
                "inline-flex min-h-target cursor-pointer items-center rounded-full px-4 text-body-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                g === group ? "bg-surface text-fg shadow-card" : "text-fg-secondary",
              )}
            >
              <input
                type="radio"
                name="report-group"
                value={g}
                checked={g === group}
                onChange={() => update({ group: g })}
                className="sr-only"
              />
              {t(`queue.report.groups.${g}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="m-0 ml-auto self-center text-body-sm text-fg-secondary tabular-nums">
        {fetching ? (
          <span className="inline-flex items-center gap-1.5">
            <ArrowsClockwise aria-hidden="true" className="size-4 animate-spin" />
            {t("queue.report.updating")}
          </span>
        ) : (
          <PeriodText from={query.from} to={query.to} />
        )}
      </p>
    </section>
  );
}

export function useDate() {
  const { i18n } = useTranslation();
  return (iso: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
    dateFormat(i18n.resolvedLanguage ?? "en", { ...options, timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
}

export function PeriodText({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const date = useDate();
  const full = { day: "numeric", month: "short", year: "numeric" } as const;
  return <>{t("queue.report.periodText", { from: date(from, full), to: date(to, full) })}</>;
}

export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height="8.5rem" className="rounded-2xl" />
        ))}
      </div>
      <Skeleton height="18rem" className="rounded-2xl" />
    </div>
  );
}

function ReportBody({ data, query }: { data: FacilityReport; query: ReportQuery }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? "en";
  const date = useDate();
  const v = data.visits;
  const consult = data.waits.find((w) => w.stage === "consultation");
  const periodLabel = (start: string) =>
    data.group === "month"
      ? date(start, { month: "short", year: "2-digit" })
      : data.group === "week"
        ? t("queue.report.weekOf", { date: date(start) })
        : date(start);
  const min = (value: number | null) =>
    value === null ? DASH : t("queue.report.minutes", { count: value });
  return (
    <div className="ml-stagger flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={t("queue.report.kpi.patients")}
          value={v.totals.patients}
          icon={<UsersThree aria-hidden="true" weight="bold" />}
          trend={v.periods.map((p) => p.patients)}
          caption={t("queue.report.kpi.completed", { count: v.totals.completed })}
        />
        <StatTile
          label={t("queue.report.kpi.consultWait")}
          value={consult?.median_wait_min ?? DASH}
          unit={consult?.median_wait_min === null || !consult ? undefined : t("queue.ops.min")}
          icon={<ClockCountdown aria-hidden="true" weight="bold" />}
          caption={
            consult?.p90_wait_min === null || !consult
              ? undefined
              : t("queue.report.kpi.p90", { minutes: consult.p90_wait_min })
          }
        />
        <StatTile
          label={t("queue.report.kpi.collected")}
          value={formatMoney(data.money.collected_rwf, lang)}
          icon={<Wallet aria-hidden="true" weight="bold" />}
          caption={t("queue.report.kpi.billed", {
            amount: formatMoney(data.money.billed_rwf, lang),
          })}
        />
        <StatTile
          label={t("queue.report.kpi.noShows")}
          value={v.totals.no_show_rate_pct === null ? DASH : `${v.totals.no_show_rate_pct}%`}
          icon={<WarningCircle aria-hidden="true" weight="bold" />}
          caption={t("queue.report.kpi.noShowCount", {
            count: v.totals.no_shows,
            expected: v.totals.bookings_expected,
          })}
        />
      </div>

      <Section
        title={t("queue.report.visits.title")}
        tables={["visits"]}
        query={query}
        icon={<UsersThree aria-hidden="true" weight="bold" />}
      >
        <TrendChart
          title={t("queue.report.visits.chart")}
          labels={v.periods.map((p) => periodLabel(p.start))}
          series={[
            { name: t("queue.report.visits.patients"), values: v.periods.map((p) => p.patients) },
            {
              name: t("queue.report.visits.completed"),
              values: v.periods.map((p) => p.completed),
            },
            {
              name: t("queue.report.visits.left"),
              values: v.periods.map((p) => p.left_without_service),
            },
          ]}
        />
        <Figures
          items={[
            [t("queue.report.visits.emergencies"), v.totals.emergencies],
            [t("queue.report.visits.left"), v.totals.left_without_service],
            [t("queue.report.visits.expected"), v.totals.bookings_expected],
            [t("queue.report.visits.noShows"), v.totals.no_shows],
          ]}
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title={t("queue.report.sources.title")} tables={["sources"]} query={query}>
          <BarList
            label={t("queue.report.sources.title")}
            rows={v.by_source.map((r) => ({
              key: r.source,
              label: t(`queue.report.source.${r.source}`, { defaultValue: r.source }),
              value: r.count,
            }))}
          />
        </Section>
        <Section title={t("queue.report.services.title")} tables={["services"]} query={query}>
          <BarList
            label={t("queue.report.services.title")}
            rows={v.by_service.map((r) => ({
              key: r.service_id,
              label: r.name_i18n[lang as "en"] ?? r.name_i18n.en ?? DASH,
              value: r.count,
            }))}
          />
        </Section>
      </div>

      <Section
        title={t("queue.report.waits.title")}
        description={t("queue.report.waits.intro")}
        tables={["waits"]}
        query={query}
        icon={<ClockCountdown aria-hidden="true" weight="bold" />}
      >
        <WaitTable data={data} min={min} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title={t("queue.report.diagnoses.title")}
          description={t("queue.report.diagnoses.intro", {
            count: data.diagnoses.signed_with_diagnosis,
          })}
          tables={["diagnoses"]}
          query={query}
          icon={<Stethoscope aria-hidden="true" weight="bold" />}
        >
          <BarList
            label={t("queue.report.diagnoses.title")}
            rows={data.diagnoses.top.map((r) => ({
              key: r.code,
              label: r.display,
              tag: r.code,
              value: r.count,
            }))}
          />
          <Figures
            items={[
              [t("queue.report.diagnoses.referrals"), data.diagnoses.referrals_out],
              [t("queue.report.diagnoses.sensitive"), data.diagnoses.sensitive_count],
            ]}
          />
          {data.diagnoses.referrals_by_specialty.length > 0 && (
            <p className="m-0 text-body-sm text-fg-secondary">
              {t("queue.report.diagnoses.referredTo", {
                list: data.diagnoses.referrals_by_specialty
                  .map((r) => `${r.specialty} (${r.count})`)
                  .join(", "),
              })}
            </p>
          )}
        </Section>
        <Section
          title={t("queue.report.lab.title")}
          tables={["lab"]}
          query={query}
          icon={<Flask aria-hidden="true" weight="bold" />}
        >
          <Figures
            items={[
              [t("queue.report.lab.resulted"), data.lab.resulted],
              [t("queue.report.lab.waiting"), data.lab.waiting],
              [t("queue.report.lab.turnaround"), min(data.lab.median_turnaround_min)],
              [t("queue.report.lab.turnaroundP90"), min(data.lab.p90_turnaround_min)],
            ]}
          />
          <SimpleTable
            caption={t("queue.report.lab.byTest")}
            head={[
              t("queue.report.lab.test"),
              t("queue.report.lab.count"),
              t("queue.report.lab.abnormal"),
              t("queue.report.lab.median"),
            ]}
            rows={data.lab.by_test.map((r) => [
              r.name,
              r.count,
              r.abnormal,
              min(r.median_turnaround_min),
            ])}
          />
        </Section>
      </div>

      <Section
        title={t("queue.report.money.title")}
        tables={["money"]}
        query={query}
        icon={<Wallet aria-hidden="true" weight="bold" />}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <BarList
            label={t("queue.report.money.byMethod")}
            heading
            rows={data.money.by_method.map((r) => ({
              key: r.method,
              label: t(`billing.method.${r.method}`, { defaultValue: r.method }),
              value: r.amount_rwf,
              display: formatMoney(r.amount_rwf, lang),
              tag: t("queue.report.money.payments", { count: r.count }),
            }))}
          />
          <SimpleTable
            caption={t("queue.report.money.byInsurer")}
            visibleCaption
            head={[
              t("queue.report.money.insurer"),
              t("queue.report.money.bills"),
              t("queue.report.money.insurerShare"),
              t("queue.report.money.patientShare"),
            ]}
            rows={data.money.by_insurer.map((r) => [
              r.insurer_name,
              r.bills,
              formatMoney(r.insurer_share_rwf, lang),
              formatMoney(r.patient_share_rwf, lang),
            ])}
          />
        </div>
        <Figures
          items={[
            [
              t("queue.report.money.exemptions"),
              formatMoney(
                data.money.exemptions.reduce((n, r) => n + r.amount_rwf, 0),
                lang,
              ),
              data.money.exemptions
                .map(
                  (r) =>
                    `${t(`billing.exemption.${r.reason}`, { defaultValue: r.reason })} ${r.count}`,
                )
                .join(" · "),
            ],
            [
              t("queue.report.money.voidedPayments"),
              data.money.voided_payments.count,
              formatMoney(data.money.voided_payments.amount_rwf, lang),
            ],
            [t("queue.report.money.voidedBills"), data.money.voided_bills],
            [
              t("queue.report.money.refunds"),
              formatMoney(data.money.refunds_paid_rwf, lang),
              t("queue.report.money.creditNotes", { count: data.money.credit_notes.count }),
            ],
          ]}
        />
      </Section>

      <Section
        title={t("queue.report.stock.title")}
        description={t("queue.report.stock.intro")}
        tables={["stock"]}
        query={query}
        icon={<Pill aria-hidden="true" weight="bold" />}
      >
        <Figures
          items={[
            [
              t("queue.report.stock.out"),
              data.stock.out_now,
              data.stock.out_medicines.slice(0, 3).join(", "),
            ],
            [t("queue.report.stock.low"), data.stock.low_now],
            [t("queue.report.stock.received"), data.stock.received_units],
            [t("queue.report.stock.dispensed"), data.stock.dispensed_units],
          ]}
        />
        <SimpleTable
          caption={t("queue.report.stock.expiring", { days: data.stock.expiring_window_days })}
          visibleCaption
          head={[
            t("queue.report.stock.medicine"),
            t("queue.report.stock.batch"),
            t("queue.report.stock.expiry"),
            t("queue.report.stock.units"),
          ]}
          rows={data.stock.expiring.map((r) => [
            r.display,
            r.batch_number,
            <span key="e" className={cx(r.is_expired && "font-semibold text-danger")}>
              {date(r.expiry_date, { day: "numeric", month: "short", year: "numeric" })}
              {r.is_expired ? ` · ${t("queue.report.stock.expired")}` : ""}
            </span>,
            r.quantity_on_hand,
          ])}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  tables,
  query,
  icon,
  children,
}: {
  title: string;
  description?: string;
  tables: ReportTable[];
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
        {tables.map((table) => (
          <DownloadCsv key={table} table={table} query={query} title={title} />
        ))}
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
  table: ReportTable;
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
      const response = await fetch(`${env.apiBaseUrl}${queuePaths.reportExport(table, query)}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `report-${table}-${query.from}-${query.to}.csv`;
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

/** Label and figure pairs, with an optional note under the figure. */
export function Figures({ items }: { items: [string, ReactNode, string?][] }) {
  return (
    <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
      {items.map(([label, value, note]) => (
        <div key={label} className="flex min-w-0 flex-col gap-1 bg-surface p-4">
          <dt className="text-body-sm text-fg-secondary">{label}</dt>
          <dd className="m-0 font-heading text-h2 font-semibold tabular-nums">{value}</dd>
          {note && <dd className="m-0 truncate text-caption text-fg-muted">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}

interface BarRow {
  key: string;
  label: string;
  value: number;
  display?: string;
  tag?: string;
}

/** Ranked horizontal bars; the number is always in the text, the bar only repeats it. */
export function BarList({
  label,
  rows,
  heading,
}: {
  label: string;
  rows: BarRow[];
  heading?: boolean;
}) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {heading && <h3 className="m-0 text-body font-semibold">{label}</h3>}
      {rows.length === 0 ? (
        <p className="m-0 text-body-sm text-fg-muted">{t("queue.report.empty")}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label={label}>
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-3 text-body-sm">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-semibold">{r.label}</span>
                  {r.tag && <span className="shrink-0 text-caption text-fg-muted">{r.tag}</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{r.display ?? r.value}</span>
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-brand"
                  style={{ width: `${(r.value / max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function SimpleTable({
  caption,
  head,
  rows,
  visibleCaption,
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
  visibleCaption?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-body-sm tabular-nums [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:py-2">
        <caption
          className={cx(visibleCaption ? "pb-2 text-left text-body font-semibold" : "sr-only")}
        >
          {caption}
        </caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={cx(
                  "text-caption font-semibold text-fg-secondary",
                  i > 0 && "text-right",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="text-fg-muted">
                {t("queue.report.empty")}
              </td>
            </tr>
          ) : (
            rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) =>
                  ci === 0 ? (
                    <th key={ci} scope="row" className="font-semibold">
                      {cell}
                    </th>
                  ) : (
                    <td key={ci} className="text-right">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function WaitTable({ data, min }: { data: FacilityReport; min: (value: number | null) => string }) {
  const { t } = useTranslation();
  const longest = Math.max(1, ...data.waits.map((w) => w.p90_wait_min ?? 0));
  if (data.waits.length === 0)
    return <p className="m-0 text-body-sm text-fg-muted">{t("queue.report.empty")}</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0">
      {data.waits.map((w) => (
        <li
          key={w.stage}
          className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
        >
          <span className="text-body-sm font-semibold">{t(`queue.stages.${w.stage}`)}</span>
          <span className="relative h-2.5 rounded-full bg-subtle" aria-hidden="true">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-brand-subtle"
              style={{ width: `${((w.p90_wait_min ?? 0) / longest) * 100}%` }}
            />
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-brand"
              style={{ width: `${((w.median_wait_min ?? 0) / longest) * 100}%` }}
            />
          </span>
          <span className="flex flex-wrap gap-x-4 text-body-sm text-fg-secondary tabular-nums sm:justify-end">
            <span>
              {t("queue.report.waits.median")}{" "}
              <strong className="text-fg">{min(w.median_wait_min)}</strong>
            </span>
            <span>
              {t("queue.report.waits.p90")}{" "}
              <strong className="text-fg">{min(w.p90_wait_min)}</strong>
            </span>
            <span>{t("queue.report.waits.tickets", { count: w.tickets })}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
