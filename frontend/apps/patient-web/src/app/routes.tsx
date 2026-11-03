import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

import { RequirePatient } from "../auth/RequirePatient";
import { PatientShell } from "../layout/PatientShell";
import { RouteSkeleton } from "../layout/RouteSkeleton";
import { FEATURES } from "./features";
import { legacyRoutes, paths } from "./paths";

// Pages are code-split per route: the landing page stays small on 3G (design 06 H4).
const page =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** Route table, shared by the browser router (main.tsx) and the memory router (tests). */
export const routes: RouteObject[] = [
  {
    HydrateFallback: RouteSkeleton,
    children: [
      { path: "/", lazy: page(() => import("../pages/LandingPage"), "LandingPage") },
      { path: "/login", lazy: page(() => import("../pages/LoginPage"), "LoginPage") },
      { path: "/signup", lazy: page(() => import("../pages/SignUpPage"), "SignUpPage") },
      {
        path: "/forgot-password",
        lazy: page(() => import("../pages/ForgotPasswordPage"), "ForgotPasswordPage"),
      },
      {
        path: "/reset-password",
        lazy: page(() => import("../pages/ResetPasswordPage"), "ResetPasswordPage"),
      },
      {
        path: "/verify-email",
        lazy: page(() => import("../pages/VerifyEmailPage"), "VerifyEmailPage"),
      },
      // /verify is the S7b documents feature's public page
      {
        element: <RequirePatient />,
        children: [
          {
            // Sidebar, top bar, phone tab bar and the offline banner (upgrade 12 §2)
            element: <PatientShell />,
            children: [
              { path: paths.overview, lazy: page(() => import("../pages/HomePage"), "HomePage") },
              { path: paths.help, lazy: page(() => import("../pages/SupportPage"), "SupportPage") },
              {
                path: paths.settings,
                lazy: page(() => import("../pages/SettingsPage"), "SettingsPage"),
              },
              ...FEATURES.flatMap((feature) => feature.patient ?? []),
            ],
          },
        ],
      },
      // design 07 addresses, still in emails, push messages and bookmarks
      ...legacyRoutes,
      ...FEATURES.flatMap((feature) => feature.public ?? []),
      { path: "*", lazy: page(() => import("../pages/NotFoundPage"), "NotFoundPage") },
    ],
  },
];
