import { Card, Skeleton } from "@medilink/ui";
import { CaretRight, FileText } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { FeatureRoutes } from "../../app/features";
import { useApi } from "../../app/services";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./DocumentsPages");
const verify = () => import("./VerifyPages");

/** Home card: the newest document, one tap from the list. */
function DocumentsHomeCard() {
  const { t } = useTranslation();
  const api = useApi();
  const list = useQuery({
    queryKey: ["documents", "list", ""],
    queryFn: () => api.documents.patient.list({}),
  });
  const latest = list.data?.results[0];
  return (
    <Card as="section" aria-labelledby="home-documents" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-documents" className="m-0 flex items-center gap-2 text-h3">
          <FileText aria-hidden="true" weight="duotone" className="size-6 text-brand" />
          {t("documents.title")}
        </h2>
        <Link to="/documents" className="font-semibold underline-offset-4 hover:underline">
          {t("documents.seeAll")}
        </Link>
      </div>
      {list.isPending ? (
        <Skeleton height="3rem" className="rounded-md" />
      ) : latest ? (
        <Link
          to={`/documents/${latest.id}`}
          className="flex min-h-target items-center gap-3 rounded-md p-2 text-fg no-underline hover:bg-subtle"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold">{t(`documents.kind.${latest.kind}`)}</span>
            <span className="truncate text-body-sm text-fg-muted">{latest.facility_name}</span>
          </span>
          <CaretRight aria-hidden="true" className="size-icon text-fg-muted" />
        </Link>
      ) : (
        <p className="m-0 text-fg-muted">{t("documents.empty")}</p>
      )}
    </Card>
  );
}

/** S7b `documents` (contract sprint-07 §3.3, S7-F7): my documents, verification, share links. */
export const documentsFeature: FeatureRoutes = {
  public: [
    { path: "/verify", lazy: lazy(verify, "VerifyPage") },
    { path: "/verify/:code", lazy: lazy(verify, "VerifyPage") },
    { path: "/shared/:token", lazy: lazy(verify, "SharedDocumentPage") },
  ],
  patient: [
    { path: "/documents", lazy: lazy(pages, "DocumentsPage") },
    { path: "/documents/:documentId", lazy: lazy(pages, "DocumentDetailPage") },
  ],
  homeCards: [DocumentsHomeCard],
};
