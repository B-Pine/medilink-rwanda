import { CaretRight, Pill } from "@phosphor-icons/react";
import { Badge, Card, Skeleton } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { FeatureRoutes } from "../../app/features";
import { useApi } from "../../app/services";
import { medicinesKeys, STATUS_TONE } from "./shared";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./MedicinesPages");

/** Home card: the newest active prescription and its state, one tap from the list. */
function MedicinesHomeCard() {
  const { t } = useTranslation();
  const api = useApi();
  const list = useQuery({
    queryKey: medicinesKeys.list("", "active"),
    queryFn: () => api.pharmacy.patient.list({ status: "active" }),
  });
  const latest = list.data?.results[0];
  return (
    <Card as="section" aria-labelledby="home-medicines" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-medicines" className="m-0 flex items-center gap-2 text-h3">
          <Pill aria-hidden="true" weight="duotone" className="size-6 text-brand" />
          {t("medicines.title")}
        </h2>
        <Link to="/medicines" className="font-semibold underline-offset-4 hover:underline">
          {t("medicines.seeAll")}
        </Link>
      </div>
      {list.isPending ? (
        <Skeleton height="3rem" className="rounded-md" />
      ) : latest ? (
        <Link
          to={`/medicines/${latest.id}`}
          className="flex min-h-target items-center gap-3 rounded-md p-2 text-fg no-underline hover:bg-subtle"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate font-semibold">{latest.facility_name}</span>
            <span>
              <Badge tone={STATUS_TONE[latest.status]}>
                {t(`medicines.status.${latest.status}`)}
              </Badge>
            </span>
          </span>
          <CaretRight aria-hidden="true" className="size-icon text-fg-muted" />
        </Link>
      ) : (
        <p className="m-0 text-fg-muted">{t("medicines.empty.active")}</p>
      )}
    </Card>
  );
}

/** S7a `medicines`: My medicines (contract sprint-07 §6.2, M1, M2). */
export const medicinesFeature: FeatureRoutes = {
  patient: [
    { path: "/medicines", lazy: lazy(pages, "MedicinesPage") },
    { path: "/medicines/:prescriptionId", lazy: lazy(pages, "MedicineDetailPage") },
  ],
  homeCards: [MedicinesHomeCard],
};
