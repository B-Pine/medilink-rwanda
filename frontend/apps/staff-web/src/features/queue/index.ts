import { hasPermission } from "@medilink/api-client";
import { MegaphoneSimple } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { QueueHeaderLive } from "./LiveIndicator";
import { OperationsTodayCard } from "./Operations";
import { ReceptionTodayCard } from "./ReceptionToday";
import { OnSiteTodayCard } from "./TodayCard";
import { LabTodayCard } from "./LabToday";
import { TriageTodayCard } from "./TriageToday";

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
    // upgrade 06 §2 (#200): the triage nurse's station
    { path: "/triage", lazy: lazy(() => import("./TriagePage"), "TriagePage") },
    // upgrade 06 §3 (#201): the laboratory technician's station
    { path: "/lab", lazy: lazy(() => import("./LabPage"), "LabPage") },
    // upgrade 08 §3: thermal prints for patients without a phone
    {
      path: "/queue/visits/:visitId/slip",
      lazy: lazy(() => import("./PrintPages"), "TicketSlipPage"),
    },
    {
      path: "/queue/visits/:visitId/card",
      lazy: lazy(() => import("./PrintPages"), "NextVisitCardPage"),
    },
    {
      path: "/bookings/card/:code",
      lazy: lazy(() => import("./PrintPages"), "AppointmentCardPage"),
    },
    { path: "/queue/reorders", lazy: lazy(admin, "ReordersPage") },
    { path: "/reports", lazy: lazy(() => import("./ReportsPage"), "ReportsPage") },
    { path: "/settings/displays", lazy: lazy(admin, "DisplaysPage") },
  ],
  headerItems: [QueueHeaderLive],
  todayCards: [
    OperationsTodayCard,
    ReceptionTodayCard,
    OnSiteTodayCard,
    TriageTodayCard,
    LabTodayCard,
  ],
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
