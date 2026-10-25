import { IdentificationCard, UsersThree } from "@phosphor-icons/react";
import { buttonClassName } from "@medilink/ui";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { FeatureRoutes } from "../../app/features";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./ProfilePages");

function ProfileHomeLinks() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("profile.homeLinks")} className="grid gap-3 sm:grid-cols-2">
      <Link
        to="/profile"
        className={buttonClassName({ variant: "secondary", size: "lg", fullWidth: true })}
      >
        <IdentificationCard aria-hidden="true" className="size-icon" />
        {t("profile.myProfile")}
      </Link>
      <Link
        to="/family"
        className={buttonClassName({ variant: "secondary", size: "lg", fullWidth: true })}
      >
        <UsersThree aria-hidden="true" className="size-icon" />
        {t("profile.family.title")}
      </Link>
    </nav>
  );
}

/** S3 `profile`: the patient's profiles, family, privacy and record claims (contract §6.2). */
export const profileFeature: FeatureRoutes = {
  patient: [
    { path: "/profile", lazy: lazy(pages, "ProfileRedirect") },
    { path: "/profile/:patientId", lazy: lazy(pages, "ProfileHubPage") },
    { path: "/profile/:patientId/details", lazy: lazy(pages, "DetailsPage") },
    { path: "/profile/:patientId/identifiers", lazy: lazy(pages, "IdentifiersPage") },
    { path: "/profile/:patientId/insurance", lazy: lazy(pages, "InsurancePage") },
    { path: "/profile/:patientId/health", lazy: lazy(pages, "HealthPage") },
    { path: "/profile/:patientId/access-history", lazy: lazy(pages, "AccessHistoryPage") },
    { path: "/family", lazy: lazy(() => import("./FamilyPage"), "FamilyPage") },
    { path: "/privacy/settings", lazy: lazy(() => import("./PrivacyPage"), "PrivacyPage") },
    { path: "/claim", lazy: lazy(() => import("./ClaimPage"), "ClaimPage") },
  ],
  homeCards: [ProfileHomeLinks],
};
