import { Alert, Skeleton, StatTile, Tabs, TabsList, TabsTrigger, TrendChart } from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import {
  CalendarCheck,
  CheckCircle,
  ClockCountdown,
  Hourglass,
  Stethoscope,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, useCan } from "./shared";

/** /clinical/activity (upgrade 05 §3): my own numbers over 7 or 30 days; counts only. */
export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const allowed = useCan("clinical.write");
  const [days, setDays] = useState<7 | 30>(7);
  const activity = useQuery({
    queryKey: ["clinical", "my-activity", days],
    queryFn: () => api.clinical.myActivity(days),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  const lang = i18n.resolvedLanguage ?? "en";
  const label = (iso: string) => {
    try {
      return dateFormat(lang, { day: "numeric", month: "short", timeZone: "UTC" }).format(
        new Date(`${iso}T00:00:00Z`),
      );
    } catch {
      return iso;
    }
  };
  const a = activity.data;
  const maxDx = Math.max(1, ...(a?.top_diagnoses.map((d) => d.count) ?? [1]));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("clinical.activity.title")}
        actions={
          <Tabs value={String(days)} onValueChange={(v) => setDays(v === "30" ? 30 : 7)}>
            <TabsList aria-label={t("clinical.activity.period")}>
              <TabsTrigger value="7">{t("clinical.activity.days", { count: 7 })}</TabsTrigger>
              <TabsTrigger value="30">{t("clinical.activity.days", { count: 30 })}</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
      {activity.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(activity.error, t("errors.generic"))}
        </Alert>
      ) : !a ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height="8rem" className="rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="ml-stagger flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t("clinical.activity.seen")}
              value={a.seen}
              trend={a.trend.map((d) => d.seen)}
              caption={t("clinical.activity.perDay", {
                value: Math.round((a.seen / a.days) * 10) / 10,
              })}
              icon={<Stethoscope aria-hidden="true" className="size-5" />}
            />
            <StatTile
              label={t("clinical.activity.signed")}
              value={a.signed}
              trend={a.trend.map((d) => d.signed)}
              caption={t("clinical.activity.late", { count: a.late_signatures })}
              icon={<CheckCircle aria-hidden="true" className="size-5" />}
            />
            <StatTile
              label={t("clinical.activity.avg")}
              value={a.avg_consult_min ?? "—"}
              unit={a.avg_consult_min !== null ? t("clinical.today.min") : undefined}
              caption={t("clinical.activity.avgCaption")}
              icon={<ClockCountdown aria-hidden="true" className="size-5" />}
            />
            <StatTile
              label={t("clinical.activity.followUps")}
              value={a.follow_ups_set}
              caption={t("clinical.activity.unsignedNow", { count: a.unsigned_now })}
              icon={<CalendarCheck aria-hidden="true" className="size-5" />}
            />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="rounded-2xl bg-surface p-5 shadow-card">
              <TrendChart
                title={t("clinical.activity.chart")}
                labels={a.trend.map((d) => label(d.date))}
                series={[
                  { name: t("clinical.activity.seen"), values: a.trend.map((d) => d.seen) },
                  { name: t("clinical.activity.signed"), values: a.trend.map((d) => d.signed) },
                ]}
              />
            </div>
            <section
              aria-labelledby="top-dx"
              className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card"
            >
              <h2 id="top-dx" className="m-0 font-heading text-h3 tracking-tight">
                {t("clinical.activity.topDiagnoses")}
              </h2>
              {a.top_diagnoses.length === 0 ? (
                <p className="m-0 rounded-xl bg-subtle px-4 py-6 text-center text-fg-muted">
                  {t("clinical.activity.noDiagnoses")}
                </p>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-3 p-0">
                  {a.top_diagnoses.map((d) => (
                    <li key={d.code} className="flex flex-col gap-1.5">
                      <span className="flex items-baseline gap-2 text-body-sm">
                        <span className="rounded-md bg-subtle px-1.5 py-0.5 font-mono font-semibold">
                          {d.code}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{d.display}</span>
                        <span className="text-fg-secondary tabular-nums">{d.count}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-1.5 overflow-hidden rounded-full bg-subtle"
                      >
                        <span
                          className="block h-full rounded-full bg-brand transition-[width] duration-500 ease-out-quint"
                          style={{ width: `${(100 * d.count) / maxDx}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
          <p className="m-0 flex items-center gap-2 text-body-sm text-fg-muted">
            <Hourglass aria-hidden="true" className="size-4" />
            {t("clinical.activity.privacy")}
          </p>
        </div>
      )}
    </div>
  );
}
