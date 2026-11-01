import { Lifebuoy } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const support = () => import("./SupportPages");
const platformSupport = () => import("./PlatformSupport");
const platformArticles = () => import("./PlatformArticles");

/** S10 `help`: guides and support requests, the platform queue and article editor (§6.2). */
export const helpFeature: FeatureRoutes = {
  shell: [
    { path: "/support", lazy: lazy(support, "SupportPage") },
    { path: "/support/articles/:slug", lazy: lazy(support, "ArticlePage") },
    { path: "/support/requests/new", lazy: lazy(support, "NewRequestPage") },
    { path: "/support/requests/:id", lazy: lazy(support, "RequestPage") },
    { path: "/platform/support", lazy: lazy(platformSupport, "PlatformSupportPage") },
    { path: "/platform/support/:id", lazy: lazy(platformSupport, "PlatformRequestPage") },
    { path: "/platform/help-articles", lazy: lazy(platformArticles, "PlatformArticlesPage") },
    { path: "/platform/help-articles/new", lazy: lazy(platformArticles, "PlatformArticlePage") },
    { path: "/platform/help-articles/:id", lazy: lazy(platformArticles, "PlatformArticlePage") },
  ],
  commands: [
    {
      actions: (me, t) =>
        me.active_facility_id
          ? [
              {
                id: "help:contact",
                label: t("help.support.new"),
                icon: Lifebuoy,
                to: "/support/requests/new",
              },
            ]
          : [],
    },
  ],
};
