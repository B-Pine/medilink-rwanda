import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S4 `tracker`: My queue and the live queue tracker (contract §6.2, upgrade 12 §8). */
export const trackerFeature: FeatureRoutes = {
  patient: [
    { path: paths.queue, lazy: lazy(() => import("./VisitsPage"), "QueuePage") },
    { path: `${paths.queue}/:visitId`, lazy: lazy(() => import("./TrackerPage"), "TrackerPage") },
  ],
};
