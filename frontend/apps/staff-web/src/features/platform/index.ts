import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S1 `platform`: the super admin console (contract §6.1). */
export const platformFeature: FeatureRoutes = {
  shell: [
    // upgrade 2026-11-02: the command centre replaces the S1 overview
    {
      path: "/platform",
      lazy: lazy(() => import("../console/CommandCenter"), "CommandCenterPage"),
    },
    { path: "/platform/users", lazy: lazy(() => import("../console/UsersPage"), "UsersPage") },
    {
      path: "/platform/security-log",
      lazy: lazy(() => import("../console/LogsPage"), "SecurityLogPage"),
    },
    {
      path: "/platform/access-log",
      lazy: lazy(() => import("../console/LogsPage"), "AccessLogPage"),
    },
    {
      path: "/platform/break-glass",
      lazy: lazy(() => import("../console/BreakGlassPage"), "BreakGlassPage"),
    },
    {
      path: "/platform/applications",
      lazy: lazy(() => import("./ApplicationsPage"), "ApplicationsPage"),
    },
    {
      path: "/platform/applications/new",
      lazy: lazy(() => import("./ApplicationFormPage"), "ApplicationNewPage"),
    },
    {
      path: "/platform/applications/:id",
      lazy: lazy(() => import("./ApplicationReviewPage"), "ApplicationReviewPage"),
    },
    {
      path: "/platform/applications/:id/edit",
      lazy: lazy(() => import("./ApplicationFormPage"), "ApplicationEditPage"),
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
