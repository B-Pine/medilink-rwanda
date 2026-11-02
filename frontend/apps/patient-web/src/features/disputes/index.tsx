import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

export { ReportProblemLink } from "./DisputesPages";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./DisputesPages");

/** S10 part 2a `disputes` (contract sprint-10b §5): raise, follow, accept or disagree. */
export const disputesFeature: FeatureRoutes = {
  patient: [
    { path: "/disputes", lazy: lazy(pages, "DisputesPage") },
    { path: "/disputes/new", lazy: lazy(pages, "NewDisputePage") },
    { path: "/disputes/:disputeId", lazy: lazy(pages, "DisputeDetailPage") },
  ],
};
