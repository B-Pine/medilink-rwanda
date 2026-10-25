import { Alert, Card, LoadingState, SwitchField } from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useApi } from "../../app/services";
import { can, ProfileLayout, useProfiles, useRelationshipLabel } from "./ProfileLayout";
import { CONSENT_VERSION, errorText } from "./shared";

/** /privacy/settings: consent switches (research off by default) and care consent per profile. */
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
    <ProfileLayout title={t("profile.privacy.title")}>
      {state.isPending && <LoadingState />}
      {give.isError && (
        <Alert tone="danger" role="alert">
          {errorText(give.error, t("profile.error"))}
        </Alert>
      )}
      {state.data && (
        <>
          <Card padding="md" className="flex flex-col gap-3">
            <SwitchField
              label={t("profile.privacy.research")}
              hint={t("profile.privacy.researchHint")}
              checked={current("research", null)}
              stateLabel={
                current("research", null) ? t("profile.privacy.on") : t("profile.privacy.off")
              }
              onCheckedChange={(on) => give.mutate({ kind: "research", granted: on })}
            />
          </Card>
          <Card as="section" aria-labelledby="care" padding="md" className="flex flex-col gap-3">
            <h2 id="care" className="m-0 text-h3">
              {t("profile.privacy.care")}
            </h2>
            <p className="m-0 text-fg-secondary">{t("profile.privacy.careHint")}</p>
            {managed.map((p) => (
              <SwitchField
                key={p.patient_id}
                label={`${p.display_name} (${label(p.relationship)})`}
                checked={current("care", p.patient_id)}
                stateLabel={
                  current("care", p.patient_id) ? t("profile.privacy.on") : t("profile.privacy.off")
                }
                onCheckedChange={(on) =>
                  give.mutate({ kind: "care", granted: on, patient_id: p.patient_id })
                }
              />
            ))}
          </Card>
          {self && (
            <Link to={`/profile/${self.patient_id}/access-history`}>
              {t("profile.privacy.history")}
            </Link>
          )}
          <p className="m-0 text-fg-muted">{t("profile.privacy.later")}</p>
        </>
      )}
    </ProfileLayout>
  );
}
