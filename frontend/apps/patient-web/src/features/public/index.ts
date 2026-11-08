import type { ComponentType } from "react";
import { redirect } from "react-router";

import type { FeatureRoutes } from "../../app/features";
import { env } from "../../env";

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
    // AI symptom assistant (issue #159): when switched off (VITE_PUBLIC_ASSISTANT=false) the
    // address opens the guided questions, so old links keep working
    {
      path: "/assistant",
      loader: () => (env.publicAssistant ? null : redirect("/check-symptoms")),
      lazy: lazy(() => import("./AssistantPage"), "AssistantPage"),
    },
    // about, emergency, privacy and terms moved to the `site` feature (upgrade 11 §5)
  ],
};
