import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S6b `imports`: the legacy register import wizard (contract sprint-06 §6, S6-F7). */
export const importsFeature: FeatureRoutes = {
  shell: [
    {
      path: "/settings/patient-import",
      lazy: lazy(() => import("./ImportPages"), "PatientImportPage"),
    },
  ],
};
