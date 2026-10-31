import type { LinkRelationship } from "@medilink/api-client";
import { House } from "@phosphor-icons/react";
import { buttonClassName, LoadingState } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";

/** The profile last chosen in this tab (memory only, contract §6.2). */
let lastProfile: string | null = null;
export const rememberProfile = (id: string) => {
  lastProfile = id;
};
export const rememberedProfile = () => lastProfile;

export function useProfiles() {
  const api = useApi();
  return useQuery({ queryKey: ["profile", "list"], queryFn: () => api.profile.profiles() });
}

export function useRelationshipLabel() {
  const { t } = useTranslation();
  return (relationship: LinkRelationship) => t(`profile.relationship.${relationship}`);
}

/** Link rights per relationship (contract §2.5). */
export const can = {
  editCore: (r: LinkRelationship) => r === "self" || r === "guardian",
  identifiers: (r: LinkRelationship) => r === "self" || r === "guardian",
  history: (r: LinkRelationship) => r === "self" || r === "guardian",
  invite: (r: LinkRelationship) => r === "self" || r === "guardian",
};

/**
 * Frame of every S3 patient page inside the PatientShell (which owns the header, the profile
 * switcher and <main>): a way back, the page title and one task per screen (design 07).
 */
export function ProfileLayout({
  title,
  children,
  back,
}: {
  title: string;
  children: ReactNode;
  back?: { to: string; label: string };
}) {
  const { t } = useTranslation();
  const { patientId } = useParams();
  const profiles = useProfiles();
  if (patientId) rememberProfile(patientId);

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-5">
      <nav aria-label={t("profile.breadcrumb")} className="flex flex-wrap gap-2">
        <Link to="/home" className={buttonClassName({ variant: "ghost" })}>
          <House aria-hidden="true" className="size-icon" />
          {t("profile.home")}
        </Link>
        {back && (
          <Link to={back.to} className={buttonClassName({ variant: "ghost" })}>
            {back.label}
          </Link>
        )}
      </nav>
      <PageHeading title={title}>{title}</PageHeading>
      {profiles.isPending ? <LoadingState /> : children}
    </div>
  );
}
