import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** Public pages and the symptom checker (contract public-pages-and-triage §3). */
export const publicFeature: FeatureRoutes = {
  public: [
    {
      path: "/check-symptoms",
      lazy: lazy(() => import("./SymptomCheckerPage"), "SymptomCheckerPage"),
    },
    // about, emergency, privacy and terms moved to the `site` feature (upgrade 11 §5)
  ],
};
