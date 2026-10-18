import { LoadingState } from "@medilink/ui";
import type { ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router";

import { RequireStaff } from "../auth/RequireStaff";
import { AppShell } from "../layout/AppShell";
import { NAV_ITEMS } from "../layout/navigation";
import { FEATURES } from "./features";

const featurePublic = FEATURES.flatMap((feature) => feature.public ?? []);
const featureShell = FEATURES.flatMap((feature) => feature.shell ?? []);
const featurePaths = new Set(featureShell.map((route) => route.path));

// Pages are code-split per route (roadmap principle 4: small bundles on weak networks).
const page =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** Route table, shared by the browser router (main.tsx) and the memory router (tests). */
export const routes: RouteObject[] = [
  {
    HydrateFallback: () => <LoadingState className="min-h-dvh" />,
    children: [
      { path: "/login", lazy: page(() => import("../pages/LoginPage"), "LoginPage") },
      {
        path: "/login/mfa/setup",
        lazy: page(() => import("../pages/MfaSetupPage"), "MfaSetupPage"),
      },
      {
        path: "/login/mfa/verify",
        lazy: page(() => import("../pages/MfaVerifyPage"), "MfaVerifyPage"),
      },
      {
        path: "/forgot-password",
        lazy: page(() => import("../pages/ForgotPasswordPage"), "ForgotPasswordPage"),
      },
      {
        path: "/reset-password",
        lazy: page(() => import("../pages/ResetPasswordPage"), "ResetPasswordPage"),
      },
      {
        element: <RequireStaff requireFacility={false} />,
        children: [
          {
            path: "/select-facility",
            lazy: page(() => import("../pages/FacilityPickerPage"), "FacilityPickerPage"),
          },
        ],
      },
      {
        element: <RequireStaff />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/today" replace /> },
              { path: "/today", lazy: page(() => import("../pages/TodayPage"), "TodayPage") },
              ...featureShell,
              // Placeholders for sections whose feature has not been built yet.
              ...NAV_ITEMS.filter(
                (item) => item.key !== "today" && !featurePaths.has(item.path),
              ).map((item): RouteObject => ({
                path: item.path,
                lazy: async () => {
                  const { PlaceholderPage } = await import("../pages/PlaceholderPage");
                  return { element: <PlaceholderPage section={item.key} /> };
                },
              })),
            ],
          },
        ],
      },
      ...featurePublic,
      { path: "*", lazy: page(() => import("../pages/NotFoundPage"), "NotFoundPage") },
    ],
  },
];
