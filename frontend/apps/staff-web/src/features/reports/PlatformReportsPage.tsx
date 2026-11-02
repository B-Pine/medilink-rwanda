import { Alert, LoadingState, StatTile } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText } from "../clinical/shared";

/** /platform/reports (S10c-F3, FR-RPT-05): adoption and quality across facilities, last 30 days. */
export function PlatformReportsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const allowed = Boolean(me?.is_platform_admin);
  const report = useQuery({
    queryKey: ["reports", "platform"],
    queryFn: () => api.reports.platform.report(),
    enabled: allowed,
  });
  if (!allowed) return <NoAccessContent />;
  if (report.isPending) return <LoadingState label={t("reports.loading")} />;
  if (report.isError)
    return (
      <Alert tone="danger" role="alert">
        {errorText(report.error, t("errors.generic"))}
      </Alert>
    );
  const r = report.data;
  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader
        title={t("reports.platform.title")}
        description={t("reports.platform.description")}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t("reports.platform.live")} value={r.totals.facilities_live} />
        <StatTile label={t("reports.platform.visits")} value={r.totals.visits} />
        <StatTile
          label={t("reports.platform.disputesPer1000")}
          value={r.totals.disputes_per_1000_visits ?? "—"}
          lowerIsBetter
        />
        <StatTile
          label={t("reports.platform.escalation")}
          value={r.totals.escalation_rate_pct === null ? "—" : `${r.totals.escalation_rate_pct}%`}
          lowerIsBetter
        />
      </div>
      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        <table className="w-full border-collapse text-body-sm">
          <caption className="p-3 text-left font-heading text-h3 font-bold">
            {t("reports.platform.byFacility")}
          </caption>
          <thead>
            <tr className="border-b border-border text-fg-muted">
              <th scope="col" className="p-3 text-left font-semibold">
                {t("reports.platform.facility")}
              </th>
              <th scope="col" className="p-3 text-right font-semibold">
                {t("reports.platform.visits")}
              </th>
              <th scope="col" className="p-3 text-right font-semibold">
                {t("reports.platform.bookings")}
              </th>
              <th scope="col" className="p-3 text-right font-semibold">
                {t("reports.platform.disputes")}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.facilities.map((f) => (
              <tr key={f.facility_id} className="border-b border-border last:border-0">
                <th scope="row" className="p-3 text-left font-normal">
                  {f.name}
                  <span className="block text-fg-muted">{f.status}</span>
                </th>
                <td className="p-3 text-right font-mono tabular-nums">{f.visits}</td>
                <td className="p-3 text-right font-mono tabular-nums">{f.bookings}</td>
                <td className="p-3 text-right font-mono tabular-nums">{f.disputes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
