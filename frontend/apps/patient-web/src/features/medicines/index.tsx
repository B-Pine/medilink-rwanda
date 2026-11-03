import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./MedicinesPages");

/** S7a `medicines`: My medications (contract sprint-07 §6.2, M1, M2). */
export const medicinesFeature: FeatureRoutes = {
  patient: [
    { path: paths.medications, lazy: lazy(pages, "MedicinesPage") },
    { path: `${paths.medications}/:prescriptionId`, lazy: lazy(pages, "MedicineDetailPage") },
  ],
};
