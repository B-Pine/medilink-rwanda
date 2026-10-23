import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S1 `platform`: the super admin console (contract §6.1). */
export const platformFeature: FeatureRoutes = {
  shell: [
    { path: "/platform", lazy: lazy(() => import("./OverviewPage"), "OverviewPage") },
    {
      path: "/platform/applications",
      lazy: lazy(() => import("./ApplicationsPage"), "ApplicationsPage"),
    },
    {
      path: "/platform/applications/:id",
      lazy: lazy(() => import("./ApplicationReviewPage"), "ApplicationReviewPage"),
    },
    {
      path: "/platform/facilities",
      lazy: lazy(() => import("./FacilitiesPage"), "FacilitiesPage"),
    },
    {
      path: "/platform/facilities/:id",
      lazy: lazy(() => import("./FacilitiesPage"), "FacilityDetailPage"),
    },
    {
      path: "/platform/master-data",
      lazy: lazy(() => import("./MasterDataPages"), "MasterDataPage"),
    },
    {
      path: "/platform/master-data/:kind",
      lazy: lazy(() => import("./MasterDataPages"), "MasterDataKindPage"),
    },
    {
      path: "/platform/master-data/:kind/imports/:importId",
      lazy: lazy(() => import("./MasterDataPages"), "ImportPage"),
    },
    { path: "/platform/feature-flags", lazy: lazy(() => import("./FlagsPage"), "FlagsPage") },
  ],
};
