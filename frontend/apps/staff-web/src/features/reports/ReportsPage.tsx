import { saveFile, type FacilityPeriodReport } from "@medilink/api-client";
import { Alert, Button, LoadingState, StatTile, TextField, TrendChart } from "@medilink/ui";
import { DownloadSimple } from "@phosphor-icons/react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, useCan } from "../clinical/shared";
import { useStepUp } from "../lock";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));
const rwf = (n: number) => new Intl.NumberFormat("en-RW").format(n);

/**
 * /reports (S10c-F1, FR-RPT-01, 03, 04): one period at a glance. Visits and waits lead, then
 * bookings, doctors, money and disputes. Export gives the same figures as a CSV (step-up).
 */
export function ReportsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { withStepUp } = useStepUp();
  const allowed = useCan("reports.view");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));
  const report = useQuery({
    queryKey: ["reports", "period", from, to],
    queryFn: () => api.reports.period({ from, to }),
    enabled: allowed && Boolean(from && to) && from <= to,
    placeholderData: keepPreviousData,
  });
  const exportCsv = useMutation({
    mutationFn: () => withStepUp(() => api.reports.exportPeriod({ from, to })),
    onSuccess: saveFile,
  });
  if (!allowed) return <NoAccessContent />;
  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader
        title={t("reports.title")}
        description={t("reports.description")}
        actions={
          <Button
            variant="secondary"
            loading={exportCsv.isPending}
            disabled={!report.data}
            onClick={() => exportCsv.mutate()}
          >
            <DownloadSimple aria-hidden="true" className="size-icon" />
            {t("reports.export")}
          </Button>
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          type="date"
          label={t("reports.from")}
          value={from}
          max={to}
          onChange={(e) => setFrom(e.target.value)}
          className="w-44"
        />
        <TextField
          type="date"
          label={t("reports.to")}
          value={to}
          min={from}
          onChange={(e) => setTo(e.target.value)}
          className="w-44"
        />
      </div>
      {exportCsv.isError && (
        <Alert tone="danger" role="alert">
          {errorText(exportCsv.error, t("errors.generic"))}
        </Alert>
      )}
      {report.isPending ? (
        <LoadingState label={t("reports.loading")} />
      ) : report.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(report.error, t("errors.generic"))}
        </Alert>
      ) : (
        <Figures r={report.data} />
      )}
    </div>
  );
}

function Figures({ r }: { r: FacilityPeriodReport }) {
  const { t } = useTranslation();
  const labels = r.days.map((d) => d.date.slice(5));
  const noShowPct = r.bookings.booked
    ? Math.round((100 * r.bookings.no_show) / r.bookings.booked)
    : null;
  const collectedPct = r.finance.patient
    ? Math.round((100 * r.finance.paid) / r.finance.patient)
    : null;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("reports.patients")}
          value={r.totals.patients}
          trend={r.days.map((d) => d.patients)}
        />
        <StatTile
          label={t("reports.medianWait")}
          value={r.totals.median_wait_min ?? "—"}
          unit={t("reports.minutes")}
          lowerIsBetter
          trend={r.days.map((d) => d.median_wait_min)}
        />
        <StatTile
          label={t("reports.noShows")}
          value={noShowPct === null ? "—" : `${noShowPct}%`}
          note={t("reports.ofBooked", { count: r.bookings.booked })}
        />
        <StatTile
          label={t("reports.collected")}
          value={collectedPct === null ? "—" : `${collectedPct}%`}
          note={t("reports.ofPatientShare", { amount: rwf(r.finance.patient) })}
        />
      </div>
      <section className="rounded-lg bg-surface p-4 shadow-card">
        <TrendChart
          title={t("reports.waitTrend")}
          labels={labels}
          unit={t("reports.minutes")}
          series={[
            { name: t("reports.median"), values: r.days.map((d) => d.median_wait_min) },
            { name: t("reports.p90"), values: r.days.map((d) => d.p90_wait_min) },
          ]}
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Table
          caption={t("reports.money")}
          head={[t("reports.item"), t("reports.amount")]}
          rows={(
            ["billed", "insurer", "patient", "paid", "exempted", "refunded", "balance"] as const
          ).map((k) => [t(`reports.finance.${k}`), rwf(r.finance[k])])}
          numeric
        />
        <Table
          caption={t("reports.bookingsTitle")}
          head={[t("reports.item"), t("reports.count")]}
          rows={(["booked", "checked_in", "no_show", "cancelled", "late_cancelled"] as const).map(
            (k) => [t(`reports.bookings.${k}`), String(r.bookings[k])],
          )}
          numeric
        />
        <Table
          caption={t("reports.doctorsTitle")}
          head={[
            t("reports.doctor"),
            t("reports.signed"),
            t("reports.unsigned"),
            t("reports.late"),
          ]}
          rows={r.doctors.map((d) => [
            d.name,
            String(d.signed),
            String(d.unsigned),
            String(d.late),
          ])}
          numeric
          empty={t("reports.noDoctors")}
        />
        <Table
          caption={t("reports.disputesTitle")}
          head={[t("reports.item"), t("reports.count")]}
          rows={[
            [t("reports.disputes.raised"), String(r.disputes.raised)],
            [t("reports.disputes.open"), String(r.disputes.open)],
            [t("reports.disputes.overdue"), String(r.disputes.overdue)],
          ]}
          numeric
        />
      </div>
    </>
  );
}

function Table({
  caption,
  head,
  rows,
  numeric,
  empty,
}: {
  caption: string;
  head: string[];
  rows: string[][];
  numeric?: boolean;
  empty?: string;
}) {
  return (
    <section className="overflow-x-auto rounded-lg bg-surface p-4 shadow-card">
      <table className="w-full border-collapse text-body-sm">
        <caption className="mb-2 text-left font-heading text-h3 font-bold">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-fg-muted">
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`py-2 font-semibold ${i > 0 && numeric ? "text-right" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.join("|")} className="border-b border-border last:border-0">
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="py-2 text-left font-normal">
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className="py-2 text-right font-mono tabular-nums">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={head.length} className="py-3 text-fg-muted">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
