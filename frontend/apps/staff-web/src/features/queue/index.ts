import { hasPermission } from "@medilink/api-client";
import { MegaphoneSimple } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { QueueHeaderLive } from "./LiveIndicator";
import { OperationsTodayCard } from "./Operations";
import { OnSiteTodayCard } from "./TodayCard";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const admin = () => import("./AdminPages");

/** S4 `queue`: reception board, doctor's queue, reorder reviews, displays (contract §6.1). */
export const queueFeature: FeatureRoutes = {
  public: [{ path: "/display/:token", lazy: lazy(() => import("./DisplayPage"), "DisplayPage") }],
  shell: [
    { path: "/queue", lazy: lazy(() => import("./QueuePage"), "QueuePage") },
    { path: "/queue/mine", lazy: lazy(() => import("./MyQueuePage"), "MyQueuePage") },
    { path: "/queue/reorders", lazy: lazy(admin, "ReordersPage") },
    { path: "/reports", lazy: lazy(() => import("./Operations"), "ReportsPage") },
    { path: "/settings/displays", lazy: lazy(admin, "DisplaysPage") },
  ],
  headerItems: [QueueHeaderLive],
  todayCards: [OperationsTodayCard, OnSiteTodayCard],
  commands: [
    {
      actions: (me, t) =>
        hasPermission(me, "queue.call")
          ? [
              {
                id: "queue:mine",
                label: t("queue.mine.callNext"),
                icon: MegaphoneSimple,
                to: "/queue/mine",
              },
            ]
          : [],
    },
  ],
};
