import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./DisputesPages");

/** S10b `disputes` (contract sprint-10b §5): the facility queue and the platform's cases. */
export const disputesFeature: FeatureRoutes = {
  shell: [
    { path: "/disputes", lazy: lazy(pages, "DisputesQueuePage") },
    { path: "/disputes/:disputeId", lazy: lazy(pages, "DisputePage") },
    { path: "/platform/disputes", lazy: lazy(pages, "PlatformDisputesPage") },
    { path: "/platform/disputes/:disputeId", lazy: lazy(pages, "PlatformDisputePage") },
  ],
};
