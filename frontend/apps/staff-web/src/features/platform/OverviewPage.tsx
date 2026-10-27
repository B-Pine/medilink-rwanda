import type { PlatformOverview } from "@medilink/api-client";
import { CaretRight, MapPin } from "@phosphor-icons/react";
import { Alert, cx, LoadingState } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { formatDate, PlatformOnly, useLocale } from "./shared";

/** KPI tile (design 04 §3): the whole tile opens the filtered list; counts that need action
 * get a coloured edge. */
function Tile({
  label,
  value,
  to,
  attention,
}: {
  label: string;
  value: number;
  to: string;
  /** Tone when the count is above zero. */
  attention?: "warning" | "danger";
}) {
  const flagged = attention !== undefined && value > 0;
  return (
    <li className="flex">
      <Link
        to={to}
        className={cx(
          "group flex flex-1 flex-col gap-2 rounded-lg border border-border bg-surface p-4 no-underline",
          "border-l-4 hover:border-border-input hover:bg-raised",
          flagged
            ? attention === "danger"
              ? "border-l-danger"
              : "border-l-warning"
            : "border-l-border",
        )}
      >
        <span className="text-body-sm font-semibold text-fg-secondary group-hover:text-fg">
          {label}
        </span>
        <span
          className={cx(
            "font-heading text-display leading-none font-semibold tabular-nums",
            value === 0 ? "text-fg-muted" : "text-fg",
          )}
        >
          {value}
        </span>
      </Link>
    </li>
  );
}

const PIPELINE = ["submitted", "under_review", "changes_requested", "approved"] as const;
const PIPELINE_TONE: Record<(typeof PIPELINE)[number], string> = {
  submitted: "var(--ml-chart-5)",
  under_review: "var(--ml-chart-2)",
  changes_requested: "var(--ml-chart-3)",
  approved: "var(--ml-chart-1)",
};

/** Applications pipeline (design 04 §3.5): the stages in order, each opening its list. */
function Pipeline({ counts }: { counts: PlatformOverview["applications"] }) {
  const { t } = useTranslation();
  const total = PIPELINE.reduce((sum, s) => sum + counts[s], 0);
  return (
    <section
      aria-labelledby="ov-apps"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="ov-apps" className="m-0 font-heading text-h3">
        {t("platform.overview.applications")}
      </h2>
      <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-subtle">
        {total > 0 &&
          PIPELINE.map((s) =>
            counts[s] > 0 ? (
              <span
                key={s}
                style={{ width: `${(100 * counts[s]) / total}%`, background: PIPELINE_TONE[s] }}
              />
            ) : null,
          )}
      </div>
      <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-4">
        {PIPELINE.map((s, index) => (
          <li key={s} className="flex">
            <Link
              to={`/platform/applications?status=${s}`}
              className="group flex flex-1 flex-col gap-1 rounded-md p-3 no-underline hover:bg-subtle"
            >
              <span className="flex items-center gap-2 text-body-sm font-semibold text-fg-secondary group-hover:text-fg">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: PIPELINE_TONE[s] }}
                />
                {t(`platform.status.application.${s}`)}
                {index < PIPELINE.length - 1 && (
                  <CaretRight
                    aria-hidden="true"
                    className="ml-auto hidden size-4 text-fg-muted sm:block"
                  />
                )}
              </span>
              <span
                className={cx(
                  "mt-auto pt-1 font-heading text-display leading-none font-semibold tabular-nums",
                  counts[s] === 0 ? "text-fg-muted" : "text-fg",
                )}
              >
                {counts[s]}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Network by district (design 04 §3.5): facilities that are not deactivated, as a bar list. */
function Network({ rows }: { rows: PlatformOverview["facilities_by_district"] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map((r) => r.facilities));
  return (
    <section
      aria-labelledby="ov-network"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="ov-network" className="m-0 flex items-center gap-2 font-heading text-h3">
        <MapPin aria-hidden="true" weight="duotone" className="size-6 text-brand" />
        {t("platform.overview.network")}
      </h2>
      {rows.length === 0 ? (
        <p className="m-0 text-fg-secondary">{t("platform.overview.networkEmpty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((r) => (
            <li key={r.district_code} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {r.district}{" "}
                  <span className="text-body-sm font-normal text-fg-muted">{r.province}</span>
                </span>
                <span className="font-semibold tabular-nums">
                  {t("platform.overview.facilityCount", { count: r.facilities })}
                </span>
              </span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-subtle">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${(100 * r.facilities) / max}%`,
                    background: "var(--ml-chart-1)",
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** /platform: what needs the super admin's attention (design 04 §3.5). */
export function OverviewPage() {
  return (
    <PlatformOnly>
      <Overview />
    </PlatformOnly>
  );
}

function Overview() {
  const { t } = useTranslation();
  const api = useApi();
  const locale = useLocale();
  const overview = useQuery({
    queryKey: ["platform", "overview"],
    queryFn: () => api.onboarding.platform.overview(),
  });
  const data = overview.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("platform.overview.title")} />
      {overview.isPending && <LoadingState />}
      {overview.isError && <Alert tone="danger">{t("platform.table.error")}</Alert>}
      {data && (
        <>
          {data.oldest_waiting_application && (
            <Alert tone="info" title={t("platform.overview.oldestTitle")}>
              <Link to={`/platform/applications/${data.oldest_waiting_application.id}`}>
                {t("platform.overview.oldest", {
                  date: formatDate(data.oldest_waiting_application.submitted_at, locale),
                })}
              </Link>
            </Alert>
          )}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Pipeline counts={data.applications} />
            <Network rows={data.facilities_by_district} />
          </div>
          <section aria-labelledby="ov-licences" className="flex flex-col gap-3">
            <h2 id="ov-licences" className="m-0 font-heading text-h3">
              {t("platform.overview.licences")}
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
              <Tile
                label={t("platform.overview.expiring60")}
                value={data.licences.expiring_60}
                to="/platform/facilities?licence_state=expiring"
              />
              <Tile
                label={t("platform.overview.expiring30")}
                value={data.licences.expiring_30}
                attention="warning"
                to="/platform/facilities?licence_state=expiring"
              />
              <Tile
                label={t("platform.overview.expired")}
                value={data.licences.expired}
                attention="danger"
                to="/platform/facilities?licence_state=expired"
              />
            </ul>
          </section>
          <section aria-labelledby="ov-facilities" className="flex flex-col gap-3">
            <h2 id="ov-facilities" className="m-0 font-heading text-h3">
              {t("platform.overview.facilities")}
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-5">
              {(["approved", "setup", "live", "suspended", "deactivated"] as const).map((s) => (
                <Tile
                  key={s}
                  label={t(`platform.status.facility.${s}`)}
                  value={data.facilities[s]}
                  to={`/platform/facilities?status=${s}`}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
