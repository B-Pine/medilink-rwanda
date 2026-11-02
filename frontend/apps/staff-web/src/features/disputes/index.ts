import { hasPermission } from "@medilink/api-client";
import { Scales } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const list = () => import("./DisputesPage");
const detail = () => import("./DisputePage");

/** S10 part 2a `disputes` (contract sprint-10b §5): facility queue and detail; platform cases. */
export const disputesFeature: FeatureRoutes = {
  shell: [
    { path: "/disputes", lazy: lazy(list, "DisputesPage") },
    { path: "/disputes/:disputeId", lazy: lazy(detail, "DisputePage") },
    { path: "/platform/disputes", lazy: lazy(list, "PlatformDisputesPage") },
    { path: "/platform/disputes/:disputeId", lazy: lazy(detail, "PlatformDisputePage") },
  ],
  commands: [
    {
      actions: (me, t) =>
        hasPermission(me, "disputes.handle")
          ? [
              {
                id: "disputes:queue",
                label: t("disputes.nav.disputes"),
                icon: Scales,
                to: "/disputes",
              },
            ]
          : [],
    },
  ],
};
