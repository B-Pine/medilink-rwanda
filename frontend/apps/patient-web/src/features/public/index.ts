import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const info = () => import("./InfoPages");

/** Public pages and the symptom checker (contract public-pages-and-triage §3). */
export const publicFeature: FeatureRoutes = {
  public: [
    {
      path: "/check-symptoms",
      lazy: lazy(() => import("./SymptomCheckerPage"), "SymptomCheckerPage"),
    },
    { path: "/about", lazy: lazy(info, "AboutPage") },
    { path: "/emergency", lazy: lazy(info, "EmergencyPage") },
    { path: "/privacy", lazy: lazy(info, "PrivacyPage") },
    { path: "/terms", lazy: lazy(info, "TermsPage") },
  ],
};
