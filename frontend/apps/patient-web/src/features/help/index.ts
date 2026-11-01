import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

export { HelpCenter } from "./HelpCenter";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const requests = () => import("./RequestPages");

/** S10 `help`: articles and support requests (contract sprint-10 §6.1). The Help tab itself is
 * the core `/support` page, whose [S10] block mounts `HelpCenter`. */
export const helpFeature: FeatureRoutes = {
  patient: [
    {
      path: "/support/articles/:slug",
      lazy: lazy(() => import("./ArticlePage"), "ArticlePage"),
    },
    { path: "/support/requests", lazy: lazy(requests, "RequestsPage") },
    { path: "/support/requests/new", lazy: lazy(requests, "NewRequestPage") },
    { path: "/support/requests/:id", lazy: lazy(requests, "RequestPage") },
  ],
};
