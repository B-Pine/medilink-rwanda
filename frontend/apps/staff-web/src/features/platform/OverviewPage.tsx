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
          <section aria-labelledby="ov-apps" className="flex flex-col gap-3">
            <h2 id="ov-apps" className="m-0 font-heading text-h3">
              {t("platform.overview.applications")}
            </h2>
            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3">
              {(["submitted", "under_review", "changes_requested"] as const).map((s) => (
                <Tile
                  key={s}
                  label={t(`platform.status.application.${s}`)}
                  value={data.applications[s]}
                  to={`/platform/applications?status=${s}`}
                  {...(s === "submitted" ? { attention: "warning" as const } : {})}
                />
              ))}
            </ul>
          </section>
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
