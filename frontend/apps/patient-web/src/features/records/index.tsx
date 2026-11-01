import { CaretRight, FileText } from "@phosphor-icons/react";
import { Card, Skeleton } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { FeatureRoutes } from "../../app/features";
import { useApi } from "../../app/services";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./RecordsPages");

/** Home card: the latest signed record, one tap from the full list. */
function RecordsHomeCard() {
  const { t } = useTranslation();
  const api = useApi();
  const list = useQuery({
    queryKey: ["records", "list", ""],
    queryFn: () => api.clinical.patient.records(),
  });
  const latest = list.data?.results[0];
  return (
    <Card as="section" aria-labelledby="home-records" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-records" className="m-0 flex items-center gap-2 text-h3">
          <FileText aria-hidden="true" weight="duotone" className="size-6 text-brand" />
          {t("records.homeTitle")}
        </h2>
        <Link to="/records" className="font-semibold underline-offset-4 hover:underline">
          {t("records.seeAll")}
        </Link>
      </div>
      {list.isPending ? (
        <Skeleton height="3rem" className="rounded-md" />
      ) : latest ? (
        <Link
          to={`/records/${latest.id}`}
          className="flex min-h-target items-center gap-3 rounded-md p-2 text-fg no-underline hover:bg-subtle"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">
              {latest.diagnoses[0]?.plain_language ||
                latest.diagnoses[0]?.display ||
                latest.facility_name}
            </span>
            <span className="text-body-sm text-fg-muted">{latest.facility_name}</span>
          </span>
          <CaretRight aria-hidden="true" className="size-icon text-fg-muted" />
        </Link>
      ) : (
        <p className="m-0 text-fg-muted">{t("records.empty")}</p>
      )}
    </Card>
  );
}

/** S6 `records`: my and my dependants' signed records (contract sprint-06 §6.2, PR1, PR2). */
export const recordsFeature: FeatureRoutes = {
  patient: [
    { path: "/records", lazy: lazy(pages, "RecordsPage") },
    { path: "/records/:recordId", lazy: lazy(pages, "RecordDetailPage") },
  ],
  homeCards: [RecordsHomeCard],
};
