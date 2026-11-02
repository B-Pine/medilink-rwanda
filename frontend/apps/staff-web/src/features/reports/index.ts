import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S10 part 2b `reports` (contract sprint-10c §4): period report, audit log, platform figures. */
export const reportsFeature: FeatureRoutes = {
  shell: [
    // /reports is the live operations board (S4); the period report sits beside it
    { path: "/reports/period", lazy: lazy(() => import("./ReportsPage"), "ReportsPage") },
    { path: "/audit", lazy: lazy(() => import("./AuditPage"), "AuditPage") },
    { path: "/platform/audit", lazy: lazy(() => import("./AuditPage"), "PlatformAuditPage") },
    {
      path: "/platform/reports",
      lazy: lazy(() => import("./PlatformReportsPage"), "PlatformReportsPage"),
    },
  ],
};
