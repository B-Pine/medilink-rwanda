import { Alert, EmptyState, LoadingState, TextField } from "@medilink/ui";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { errorText, useCan, useWhen } from "../clinical/shared";
import { Pager } from "../pharmacy/shared";

/**
 * /audit (S10c-F2, FR-SEC-07): who did what and when at this facility, newest first. Entries hold
 * IDs only, never clinical text. /platform/audit is the whole log for super admins.
 */
export function AuditPage({ scope = "facility" }: { scope?: "facility" | "platform" }) {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const { data: me } = useStaffMe();
  const canView = useCan("audit.view");
  const allowed = scope === "platform" ? Boolean(me?.is_platform_admin) : canView;
  const [action, setAction] = useState("");
  const filter = useDeferredValue(action.trim());
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["audit", scope, filter, page],
    queryFn: () =>
      scope === "platform"
        ? api.reports.platform.audit({ action: filter, page })
        : api.reports.audit({ action: filter, page }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  if (!allowed) return <NoAccessContent />;
  const rows = list.data?.results ?? [];
  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader
        title={t(scope === "platform" ? "reports.audit.platformTitle" : "reports.audit.title")}
        description={t("reports.audit.description")}
      />
      <TextField
        type="search"
        label={t("reports.audit.filter")}
        hint={t("reports.audit.filterHint")}
        value={action}
        onChange={(e) => {
          setPage(1);
          setAction(e.target.value);
        }}
        className="sm:w-80"
      />
      {list.isPending ? (
        <LoadingState label={t("reports.loading")} />
      ) : list.isError ? (
        <Alert tone="danger" role="alert">
          {errorText(list.error, t("errors.generic"))}
        </Alert>
      ) : rows.length ? (
        <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
          <table className="w-full border-collapse text-body-sm">
            <caption className="sr-only">{t("reports.audit.title")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-fg-muted">
                <th scope="col" className="p-3 font-semibold">
                  {t("reports.audit.when")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("reports.audit.who")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("reports.audit.action")}
                </th>
                <th scope="col" className="p-3 font-semibold">
                  {t("reports.audit.object")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-3 whitespace-nowrap">{when.dateTime(r.occurred_at)}</td>
                  <td className="p-3">
                    {r.actor_name || t("reports.audit.system")}
                    {r.actor_role && <span className="block text-fg-muted">{r.actor_role}</span>}
                  </td>
                  <td className="p-3 font-mono">{r.action}</td>
                  <td className="p-3">
                    <span className="block">{r.object_type}</span>
                    <span className="block font-mono text-fg-muted">{r.object_id.slice(0, 8)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-3">
            <Pager
              page={page}
              hasPrevious={Boolean(list.data?.previous)}
              hasNext={Boolean(list.data?.next)}
              onPage={setPage}
            />
          </div>
        </div>
      ) : (
        <EmptyState icon={ClockCounterClockwise} title={t("reports.audit.none")} />
      )}
    </div>
  );
}

export function PlatformAuditPage() {
  return <AuditPage scope="platform" />;
}
