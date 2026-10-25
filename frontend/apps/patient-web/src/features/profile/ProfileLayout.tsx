import type { LinkRelationship, ProfileSummary } from "@medilink/api-client";
import { House } from "@phosphor-icons/react";
import {
  buttonClassName,
  LanguageSwitcher,
  LoadingState,
  Logo,
  MAIN_CONTENT_ID,
  ProfileSwitcher,
  SkipLink,
} from "@medilink/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";

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
 * Shell of every S3 patient page: header with the ProfileSwitcher, 18 px body, one task per
 * screen (design 07). Switching keeps the current section for the new profile.
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
  const navigate = useNavigate();
  const location = useLocation();
  const { patientId } = useParams();
  const profiles = useProfiles();
  const label = useRelationshipLabel();
  const list: ProfileSummary[] = profiles.data?.results ?? [];
  if (patientId) rememberProfile(patientId);

  const switchTo = (id: string) => {
    rememberProfile(id);
    if (patientId) void navigate(location.pathname.replace(patientId, id));
    else void navigate(`/profile/${id}`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-page text-[1.125rem]">
      <SkipLink />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[40rem] flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
          <Link to="/home" className="inline-flex min-h-12 items-center rounded-sm no-underline">
            <Logo className="h-10" />
          </Link>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {list.length > 0 && (
              <ProfileSwitcher
                label={t("profile.switch")}
                currentId={patientId ?? null}
                onSelect={switchTo}
                profiles={list.map((p) => ({
                  id: p.patient_id,
                  name: p.display_name,
                  relationship: label(p.relationship),
                }))}
              />
            )}
            <LanguageSwitcher compact />
          </div>
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col gap-5 px-4 py-6 sm:px-6"
      >
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
      </main>
    </div>
  );
}
