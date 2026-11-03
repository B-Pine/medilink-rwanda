import type { LinkRelationship } from "@medilink/api-client";
import { LoadingState } from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeader } from "../dashboard/kit";

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
 * Frame of every S3 patient page inside the PatientShell (which owns the sidebar, breadcrumb,
 * profile switcher and <main>): a way back, the page title and one task per screen (design 07).
 */
export function ProfileLayout({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: { to: string; label: string };
}) {
  const { patientId } = useParams();
  const profiles = useProfiles();
  if (patientId) rememberProfile(patientId);

  return (
    <div className="flex w-full max-w-[48rem] flex-col gap-6">
      <PageHeader title={title} subtitle={subtitle} back={back} />
      {profiles.isPending ? <LoadingState /> : children}
    </div>
  );
}
