import { Eye, ShieldCheck } from "@phosphor-icons/react";
import { Alert, LoadingState, SwitchField } from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { Avatar, PageHeader, RowIcon, RowLink, RowList, WidgetCard } from "../dashboard/kit";
import { can, useProfiles, useRelationshipLabel } from "./ProfileLayout";
import { CONSENT_VERSION, errorText } from "./shared";

/** Account-level switches (PA23): research and, since R2, notifications and location. */
const ACCOUNT_SWITCHES = ["research", "notifications", "location"] as const;

/**
 * /privacy/settings: consent switches (research off by default) and care consent per profile.
 * Redesign 2026-11-02: the account switches and care consent in two cards, one row per switch;
 * who opened my record beside.
 */
export function PrivacyPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const label = useRelationshipLabel();
  const profiles = useProfiles();
  const state = useQuery({
    queryKey: ["profile", "consents"],
    queryFn: () => api.profile.consents(),
  });
  const give = useMutation({
    mutationFn: (body: { kind: string; granted: boolean; patient_id?: string | null }) =>
      api.profile.giveConsent({
        ...body,
        version: state.data?.current_versions[body.kind] ?? CONSENT_VERSION,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["profile"] }),
  });
  const current = (kind: string, patientId: string | null) =>
    state.data?.consents.find((c) => c.kind === kind && c.patient_id === patientId)?.granted ??
    false;
  const managed = (profiles.data?.results ?? []).filter((p) => can.history(p.relationship));
  const self = managed.find((p) => p.relationship === "self");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("profile.privacy.title")} />
      {state.isPending && <LoadingState />}
      {give.isError && (
        <Alert tone="danger" role="alert">
          {errorText(give.error, t("profile.error"))}
        </Alert>
      )}
      {state.data && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <WidgetCard id="privacy-account" title={t("profile.privacy.account")}>
              <div className="flex flex-col divide-y divide-border">
                {ACCOUNT_SWITCHES.filter((kind) => kind in state.data.current_versions).map(
                  (kind) => (
                    <div key={kind} className="px-5 py-4">
                      <SwitchField
                        label={t(`profile.privacy.${kind}`)}
                        hint={t(`profile.privacy.${kind}Hint`)}
                        checked={current(kind, null)}
                        stateLabel={
                          current(kind, null) ? t("profile.privacy.on") : t("profile.privacy.off")
                        }
                        onCheckedChange={(on) => give.mutate({ kind, granted: on })}
                      />
                    </div>
                  ),
                )}
              </div>
            </WidgetCard>

            <WidgetCard id="care" title={t("profile.privacy.care")}>
              <p className="m-0 border-b border-border px-5 py-3 text-body-sm text-fg-secondary">
                {t("profile.privacy.careHint")}
              </p>
              <div className="flex flex-col divide-y divide-border">
                {managed.map((p) => (
                  <div key={p.patient_id} className="flex items-center gap-4 px-5 py-4">
                    <Avatar name={p.display_name} />
                    <div className="min-w-0 flex-1">
                      <SwitchField
                        label={`${p.display_name} (${label(p.relationship)})`}
                        checked={current("care", p.patient_id)}
                        stateLabel={
                          current("care", p.patient_id)
                            ? t("profile.privacy.on")
                            : t("profile.privacy.off")
                        }
                        onCheckedChange={(on) =>
                          give.mutate({ kind: "care", granted: on, patient_id: p.patient_id })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </WidgetCard>
          </div>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-24">
            <div className="flex items-start gap-3 rounded-2xl border border-brand/25 bg-brand-subtle p-5">
              <RowIcon icon={ShieldCheck} />
              <p className="m-0 text-body-sm text-on-brand-subtle">{t("authAside.trust")}</p>
            </div>
            {self && (
              <RowList label={t("profile.privacy.history")}>
                <RowLink
                  to={`${paths.profileOf(self.patient_id)}/access-history`}
                  leading={<RowIcon icon={Eye} tone="neutral" />}
                  title={t("profile.privacy.history")}
                />
              </RowList>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
