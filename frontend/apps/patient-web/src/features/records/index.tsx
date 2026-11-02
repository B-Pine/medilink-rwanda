import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./RecordsPages");

/** S6 `records`: my and my dependants' signed records (contract sprint-06 §6.2, PR1, PR2). */
export const recordsFeature: FeatureRoutes = {
  patient: [
    { path: paths.records, lazy: lazy(pages, "RecordsPage") },
    { path: `${paths.records}/:recordId`, lazy: lazy(pages, "RecordDetailPage") },
  ],
};
