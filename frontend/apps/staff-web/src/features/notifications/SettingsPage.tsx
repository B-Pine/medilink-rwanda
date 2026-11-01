import type { ApprovalsDigest, StaffNotificationPreferences } from "@medilink/api-client";
import { Alert, Button, Card, SelectField, SwitchField } from "@medilink/ui";
import { isLanguage, SUPPORTED_LANGUAGES, type Language } from "@medilink/ui/i18n";
import { SpeakerHigh } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { describeApiError } from "../../forms/api-errors";
import { notificationKeys } from "./live";
import { useStaffNotificationPreferences } from "./NotificationBell";
import { isConflict, ListSkeleton, LoadError, OfflineNotice, useCan } from "./shared";
import { playNotificationSound, unlockAudio } from "./sound";

type Draft = Omit<StaffNotificationPreferences, "version">;

function SettingsForm({ saved }: { saved: StaffNotificationPreferences }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const showDigest = useCan("billing.approve");
  const [draft, setDraft] = useState<Draft>({
    language: saved.language,
    sound_enabled: saved.sound_enabled,
    approvals_digest: saved.approvals_digest,
  });
  const [version, setVersion] = useState(saved.version);
  const [done, setDone] = useState(false);
  const [testResult, setTestResult] = useState<"played" | "blocked" | null>(null);

  const save = useMutation({
    mutationFn: () => api.notifications.staff.updatePreferences({ version, ...draft }),
    onSuccess: (next) => {
      queryClient.setQueryData(notificationKeys.preferences, next);
      setVersion(next.version);
      setDone(true);
      if (isLanguage(next.language) && next.language !== i18n.resolvedLanguage)
        void i18n.changeLanguage(next.language);
    },
  });
  // 409: someone (another tab) saved first. Keep the user's input; take the latest version.
  const reload = useMutation({
    mutationFn: () => api.notifications.staff.preferences(),
    onSuccess: (latest) => {
      setVersion(latest.version);
      save.reset();
    },
  });

  const update = (patch: Partial<Draft>) => {
    setDone(false);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };
  const testSound = () => {
    unlockAudio();
    setTestResult(playNotificationSound() ? "played" : "blocked");
  };

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-5" noValidate>
      {save.isError &&
        (isConflict(save.error) ? (
          <Alert tone="warning" title={t("notifications.settings.conflictTitle")} role="alert">
            <p className="m-0">{t("notifications.settings.conflict")}</p>
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              loading={reload.isPending}
              onClick={() => reload.mutate()}
            >
              {t("notifications.settings.reload")}
            </Button>
          </Alert>
        ) : (
          <Alert tone="danger" role="alert">
            {describeApiError(save.error, t)}
          </Alert>
        ))}
      {done && (
        <Alert tone="success" role="status">
          {t("notifications.settings.saved")}
        </Alert>
      )}
      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-h3">{t("notifications.settings.soundTitle")}</h2>
        <SwitchField
          label={t("notifications.settings.sound")}
          hint={t("notifications.settings.soundHint")}
          checked={draft.sound_enabled}
          onCheckedChange={(sound_enabled) => update({ sound_enabled })}
          stateLabel={draft.sound_enabled ? t("notifications.on") : t("notifications.off")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={testSound}
            iconStart={<SpeakerHigh aria-hidden="true" className="size-icon" />}
          >
            {t("notifications.settings.testSound")}
          </Button>
          <span role="status" className="text-body-sm text-fg-secondary">
            {testResult === "played"
              ? t("notifications.settings.testPlayed")
              : testResult === "blocked"
                ? t("notifications.settings.testBlocked")
                : ""}
          </span>
        </div>
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="m-0 text-h3">{t("notifications.settings.generalTitle")}</h2>
        <SelectField
          label={t("notifications.settings.language")}
          hint={t("notifications.settings.languageHint")}
          value={draft.language}
          onChange={(event) => update({ language: event.target.value as Language })}
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`notifications.languages.${code}`)}
            </option>
          ))}
        </SelectField>
        {showDigest && (
          <SelectField
            label={t("notifications.settings.digest")}
            hint={t("notifications.settings.digestHint")}
            value={draft.approvals_digest}
            onChange={(event) =>
              update({ approvals_digest: event.target.value as ApprovalsDigest })
            }
          >
            <option value="immediate">{t("notifications.settings.digestImmediate")}</option>
            <option value="daily">{t("notifications.settings.digestDaily")}</option>
          </SelectField>
        )}
      </Card>
      <div>
        <Button type="submit" variant="primary" loading={save.isPending}>
          {t("notifications.settings.save")}
        </Button>
      </div>
    </form>
  );
}

/** /notifications/settings (contract §6.1): sound, approvals digest, language. */
export function SettingsPage() {
  const { t } = useTranslation();
  const prefs = useStaffNotificationPreferences();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("notifications.settings.title")}
        description={t("notifications.settings.intro")}
        back={{ to: "/notifications", label: t("notifications.inbox.back") }}
      />
      <OfflineNotice />
      {prefs.data ? (
        <SettingsForm saved={prefs.data} />
      ) : prefs.isError ? (
        <LoadError error={prefs.error} onRetry={() => void prefs.refetch()} />
      ) : (
        <ListSkeleton rows={2} label={t("notifications.loading")} />
      )}
    </div>
  );
}
