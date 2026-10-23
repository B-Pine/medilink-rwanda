import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

/** S1 `facilityApplication`: the public "For facilities" page and the application wizard. */
export const facilityApplicationFeature: FeatureRoutes = {
  public: [
    { path: "/for-facilities", lazy: lazy(() => import("./PublicPages"), "ForFacilitiesPage") },
    { path: "/for-facilities/apply", lazy: lazy(() => import("./PublicPages"), "StartPage") },
    {
      path: "/for-facilities/apply/resume",
      lazy: lazy(() => import("./PublicPages"), "ResumePage"),
    },
    {
      path: "/for-facilities/apply/:id/submitted",
      lazy: lazy(() => import("./PublicPages"), "SubmittedPage"),
    },
    {
      path: "/for-facilities/apply/:id/:step",
      lazy: lazy(() => import("./WizardPage"), "WizardPage"),
    },
  ],
};
