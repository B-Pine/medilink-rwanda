import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S3 `patients`: reception search, walk-in, records and merges (contract §6.1). */
export const patientsFeature: FeatureRoutes = {
  shell: [
    { path: "/patients", lazy: lazy(() => import("./SearchPage"), "SearchPage") },
    { path: "/patients/register", lazy: lazy(() => import("./RegisterPage"), "RegisterPage") },
    {
      path: "/patients/merge-requests",
      lazy: lazy(() => import("./MergesPage"), "MergesPage"),
    },
    { path: "/patients/:fpId", lazy: lazy(() => import("./RecordPage"), "RecordPage") },
    {
      path: "/platform/merge-requests",
      lazy: lazy(() => import("./MergesPage"), "PlatformMergesPage"),
    },
  ],
};

export { WalkInForm } from "./WalkInForm";
