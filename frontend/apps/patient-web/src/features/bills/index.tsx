import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./BillsPages");

/** S8 `bills`: My bills (contract sprint-08 §6.2, S8-F6). */
export const billsFeature: FeatureRoutes = {
  patient: [
    { path: paths.bills, lazy: lazy(pages, "BillsPage") },
    { path: `${paths.bills}/:billId`, lazy: lazy(pages, "BillDetailPage") },
  ],
};
