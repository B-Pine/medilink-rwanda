import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";
import { paths } from "../../app/paths";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./ProfilePages");
const profile = `${paths.profile}/:patientId`;

/** S3 `profile`: the patient's profiles, family, privacy and record claims (contract §6.2). */
export const profileFeature: FeatureRoutes = {
  patient: [
    { path: paths.profile, lazy: lazy(pages, "ProfileRedirect") },
    { path: profile, lazy: lazy(pages, "ProfileHubPage") },
    { path: `${profile}/details`, lazy: lazy(pages, "DetailsPage") },
    { path: `${profile}/identifiers`, lazy: lazy(pages, "IdentifiersPage") },
    { path: `${profile}/insurance`, lazy: lazy(pages, "InsurancePage") },
    { path: `${profile}/health`, lazy: lazy(pages, "HealthPage") },
    { path: `${profile}/access-history`, lazy: lazy(pages, "AccessHistoryPage") },
    { path: paths.family, lazy: lazy(() => import("./FamilyPage"), "FamilyPage") },
    // upgrade 12 §9: a family member's page is their profile hub
    { path: `${paths.family}/:patientId`, lazy: lazy(pages, "ProfileHubPage") },
    { path: paths.privacy, lazy: lazy(() => import("./PrivacyPage"), "PrivacyPage") },
    { path: paths.claim, lazy: lazy(() => import("./ClaimPage"), "ClaimPage") },
  ],
};
