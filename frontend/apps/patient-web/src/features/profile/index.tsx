import { CaretRight, Plus, UsersThree } from "@phosphor-icons/react";
import { buttonClassName, Card, Skeleton } from "@medilink/ui";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { FeatureRoutes } from "../../app/features";
import { useProfiles, useRelationshipLabel } from "./ProfileLayout";

const lazy =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

const pages = () => import("./ProfilePages");

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

/** Home card (design 07 §3.1): the people this account cares for, each one tap from their profile. */
function FamilyHomeCard() {
  const { t } = useTranslation();
  const profiles = useProfiles();
  const label = useRelationshipLabel();
  const list = profiles.data?.results ?? [];
  return (
    <Card as="section" aria-labelledby="home-family" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-family" className="m-0 flex items-center gap-2 text-h3">
          <UsersThree aria-hidden="true" weight="duotone" className="size-6 text-brand" />
          {t("profile.homeFamily.title")}
        </h2>
        <Link to="/family" className="font-semibold underline-offset-4 hover:underline">
          {t("profile.homeFamily.manage")}
        </Link>
      </div>
      {profiles.isPending ? (
        <Skeleton height="4rem" className="rounded-md" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {list.map((p) => (
            <li key={p.patient_id}>
              <Link
                to={`/profile/${p.patient_id}`}
                className="flex min-h-target items-center gap-3 rounded-md p-2 text-fg no-underline hover:bg-subtle"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle font-heading font-bold text-on-brand-subtle"
                >
                  {initials(p.display_name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{p.display_name}</span>
                  <span className="text-body-sm text-fg-muted">{label(p.relationship)}</span>
                </span>
                <CaretRight aria-hidden="true" className="size-5 text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!profiles.isPending && list.length < 2 && (
        <p className="m-0 text-fg-secondary">{t("profile.homeFamily.empty")}</p>
      )}
      <Link to="/family" className={buttonClassName({ variant: "secondary", fullWidth: true })}>
        <Plus aria-hidden="true" className="size-icon" />
        {t("profile.homeFamily.add")}
      </Link>
    </Card>
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
  homeCards: [FamilyHomeCard],
};
