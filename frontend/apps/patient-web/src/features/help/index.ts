import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

export { HelpCenter } from "./HelpCenter";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const requests = () => import("./RequestPages");

/** S10 `help`: articles and support requests (contract sprint-10 §6.1). The Help page itself is
 * the core `/dashboard/help` page, whose [S10] block mounts `HelpCenter`. */
export const helpFeature: FeatureRoutes = {
  patient: [
    {
      path: `${paths.help}/articles/:slug`,
      lazy: lazy(() => import("./ArticlePage"), "ArticlePage"),
    },
    { path: paths.requests, lazy: lazy(requests, "RequestsPage") },
    { path: paths.newRequest, lazy: lazy(requests, "NewRequestPage") },
    { path: `${paths.requests}/:id`, lazy: lazy(requests, "RequestPage") },
  ],
};
