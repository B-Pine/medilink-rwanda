import { LoadingState } from "@medilink/ui";
import type { ComponentType } from "react";
import type { RouteObject } from "react-router";

import { RequirePatient } from "../auth/RequirePatient";
import type { InfoSection } from "../pages/InfoPage";
import { FEATURES } from "./features";

// Pages are code-split per route: the landing page stays small on 3G (design 06 H4).
const page =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const info = (path: string, section: InfoSection): RouteObject => ({
  path,
  lazy: async () => {
    const { InfoPage } = await import("../pages/InfoPage");
    return { element: <InfoPage section={section} /> };
  },
});

/** Route table, shared by the browser router (main.tsx) and the memory router (tests). */
export const routes: RouteObject[] = [
  {
    HydrateFallback: () => <LoadingState className="min-h-dvh" />,
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
      info("/verify", "verify"),
      info("/terms", "terms"),
      info("/privacy", "privacy"),
      info("/help", "help"),
      {
        element: <RequirePatient />,
        children: [
          { path: "/home", lazy: page(() => import("../pages/HomePage"), "HomePage") },
          ...FEATURES.flatMap((feature) => feature.patient ?? []),
        ],
      },
      ...FEATURES.flatMap((feature) => feature.public ?? []),
      { path: "*", lazy: page(() => import("../pages/NotFoundPage"), "NotFoundPage") },
    ],
  },
];
