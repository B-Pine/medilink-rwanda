import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { ActiveVisitCard } from "./TrackerPage";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S4 `tracker`: the live queue tracker and its home card (contract §6.2). */
export const trackerFeature: FeatureRoutes = {
  patient: [
    { path: "/visits", lazy: lazy(() => import("./VisitsPage"), "VisitsPage") },
    { path: "/visits/:visitId", lazy: lazy(() => import("./TrackerPage"), "TrackerPage") },
  ],
  // design 07 §3.1: an active visit fills the top of the home page
  homeTop: [ActiveVisitCard],
};
