import {
  Alert,
  EmptyState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@medilink/ui";
import { Scales } from "@phosphor-icons/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { NoAccessContent } from "../../pages/NotFoundPage";
import { DisputeLine, disputesKeys, errorText, Pager, useCan } from "./shared";

type Tab = "open" | "overdue" | "all";
const TABS: Tab[] = ["open", "overdue", "all"];

/**
 * /disputes (S10b-F2, FR-DSP-02, 03): the facility's disputes, nearest deadline first; overdue ones
 * escalate to MediLink on their own. /platform/disputes is the same list for escalated cases.
 */
export function DisputesPage({ scope = "facility" }: { scope?: "facility" | "platform" }) {
  const { t } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const canHandle = useCan("disputes.handle");
  const allowed = scope === "platform" ? Boolean(me?.is_platform_admin) : canHandle;
  const [tab, setTab] = useState<Tab>("open");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: disputesKeys.list(scope, tab, page),
    queryFn: () =>
      scope === "platform"
        ? api.disputes.platform.list({ page })
        : api.disputes.staff.list({
            status: tab === "open" ? "open" : undefined,
            overdue: tab === "overdue" ? true : undefined,
            page,
          }),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  if (!allowed) return <NoAccessContent />;
  const rows = list.data?.results ?? [];
  const base = scope === "platform" ? "/platform/disputes" : "/disputes";
  const results = list.isPending ? (
    <LoadingState label={t("disputes.loading")} />
  ) : list.isError ? (
    <Alert tone="danger" role="alert">
      {errorText(list.error, t("errors.generic"))}
    </Alert>
  ) : rows.length ? (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <DisputeLine key={row.id} row={row} to={`${base}/${row.id}`} />
      ))}
      <li className="list-none">
        <Pager
          page={page}
          hasPrevious={Boolean(list.data?.previous)}
          hasNext={Boolean(list.data?.next)}
          onPage={setPage}
        />
      </li>
    </ul>
  ) : (
    <EmptyState
      icon={Scales}
      title={t(`disputes.empty.${scope === "platform" ? "platform" : tab}`)}
    />
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title={t(scope === "platform" ? "disputes.platformTitle" : "disputes.title")}
        description={t(
          scope === "platform" ? "disputes.platformDescription" : "disputes.description",
        )}
      />
      {scope === "platform" ? (
        results
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setPage(1);
            setTab(value as Tab);
          }}
        >
          <TabsList aria-label={t("disputes.tabs")}>
            {TABS.map((key) => (
              <TabsTrigger key={key} value={key}>
                {t(`disputes.tab.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((key) => (
            <TabsContent key={key} value={key} className="mt-4">
              {key === tab && results}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

export function PlatformDisputesPage() {
  return <DisputesPage scope="platform" />;
}
