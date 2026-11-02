import type { ComponentType } from "react";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const directory = () => import("./DirectoryPages");
const info = () => import("./InfoSitePages");

/** Public website (upgrade 11 §5): directories, information, help, contact and legal pages. */
export const siteFeature: FeatureRoutes = {
  public: [
    { path: "/facilities", lazy: lazy(directory, "FacilitiesPage") },
    { path: "/doctors", lazy: lazy(directory, "DoctorsPage") },
    { path: "/doctors/:slug", lazy: lazy(directory, "DoctorPage") },
    { path: "/services", lazy: lazy(directory, "ServicesPage") },
    { path: "/services/:slug", lazy: lazy(directory, "ServicePage") },
    { path: "/how-it-works", lazy: lazy(info, "HowItWorksPage") },
    { path: "/emergency", lazy: lazy(info, "EmergencyPage") },
    { path: "/help", lazy: lazy(info, "HelpPage") },
    { path: "/about", lazy: lazy(info, "AboutPage") },
    { path: "/contact", lazy: lazy(info, "ContactPage") },
    { path: "/accessibility", lazy: lazy(info, "AccessibilityPage") },
    { path: "/privacy", lazy: lazy(info, "PrivacyPage") },
    { path: "/terms", lazy: lazy(info, "TermsPage") },
  ],
};
