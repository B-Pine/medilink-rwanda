import {
  isApiError,
  type ChannelsByPriority,
  type NotificationChannel,
  type PatientNotificationPreferences,
} from "@medilink/api-client";
import { Alert, Button, Card, SelectField, Skeleton, SwitchField, TextField } from "@medilink/ui";
import { formatKigaliTime } from "@medilink/ui";
import { isLanguage, SUPPORTED_LANGUAGES, type Language } from "@medilink/ui/i18n";
import { LockSimple, Trash } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { notificationKeys, usePreferences, usePush } from "./api";
import { PushOptIn } from "./PushOptIn";

const LEVELS = ["critical", "important", "routine"] as const;
type Level = (typeof LEVELS)[number];

interface Draft {
  language: Language;
  channels: ChannelsByPriority;
  quiet: { is_enabled: boolean; start: string; end: string };
  dependents: Record<string, boolean>;
}

const draftFrom = (p: PatientNotificationPreferences): Draft => ({
  language: p.language,
  channels: {
    critical: [...p.channels.critical],
    important: [...p.channels.important],
    routine: [...p.channels.routine],
  },
  quiet: { ...p.quiet_hours },
  dependents: Object.fromEntries(p.dependents.map((d) => [d.patient_id, d.receive_alerts])),
});

function OtherBrowsers() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const rows = useQuery({
    queryKey: notificationKeys.subscriptions,
    queryFn: () => api.notifications.patient.pushSubscriptions(),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.notifications.patient.removePushSubscription(id),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: notificationKeys.subscriptions }),
  });
  const list = rows.data ?? [];
  return (
    <Card as="section" aria-labelledby="push-browsers" className="flex flex-col gap-3">
      <h2 id="push-browsers" className="m-0 text-h3">
        {t("notifications.settings.browsers")}
      </h2>
      {rows.isPending ? (
        <Skeleton height="3rem" />
      ) : rows.isError ? (
        <Alert tone="danger" role="alert">
          <Button variant="secondary" onClick={() => void rows.refetch()}>
            {t("common.retry")}
          </Button>
        </Alert>
      ) : list.length === 0 ? (
        <p className="m-0 text-fg-secondary">{t("notifications.settings.noBrowsers")}</p>
      ) : (
        <ul
          className="m-0 flex list-none flex-col gap-2 p-0"
          aria-label={t("notifications.settings.browsers")}
        >
          {list.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <span className="flex flex-col">
                <span className="font-semibold">{row.label}</span>
                <span className="text-body-sm text-fg-muted">
                  {t("notifications.settings.since", {
                    when: formatKigaliTime(row.created_at, i18n.resolvedLanguage ?? "rw"),
                  })}
                </span>
              </span>
              <Button
                variant="secondary"
                loading={remove.isPending && remove.variables === row.id}
                onClick={() => remove.mutate(row.id)}
                iconStart={<Trash aria-hidden="true" className="size-icon" />}
                aria-label={t("notifications.settings.removeBrowser", { name: row.label })}
              >
                {t("notifications.settings.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PreferencesForm({ saved }: { saved: PatientNotificationPreferences }) {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(saved));
  const [version, setVersion] = useState(saved.version);
  const [done, setDone] = useState(false);
  const channels = saved.available_channels;

  const save = useMutation({
    mutationFn: () =>
      api.notifications.patient.updatePreferences({
        version,
        language: draft.language,
        channels: draft.channels,
        quiet_hours: draft.quiet,
        dependents: Object.entries(draft.dependents).map(([patient_id, receive_alerts]) => ({
          patient_id,
          receive_alerts,
        })),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(notificationKeys.preferences, next);
      setVersion(next.version);
      setDone(true);
      if (draft.language !== saved.language && isLanguage(next.language))
        void i18n.changeLanguage(next.language);
    },
  });
  const reload = useMutation({
    mutationFn: () => api.notifications.patient.preferences(),
    onSuccess: (latest) => {
      setVersion(latest.version);
      save.reset();
    },
  });
  const conflict = isApiError(save.error) && save.error.status === 409;
  const lockedError =
    isApiError(save.error) && save.error.status === 422 ? save.error.message : undefined;

  const change = (patch: Partial<Draft>) => {
    setDone(false);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const toggle = (level: Level, channel: NotificationChannel, on: boolean) => {
    const current = draft.channels[level];
    change({
      channels: {
        ...draft.channels,
        [level]: on ? [...current, channel] : current.filter((c) => c !== channel),
      },
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {conflict && (
        <Alert tone="warning" role="alert" title={t("notifications.settings.conflictTitle")}>
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
      )}
      {save.isError && !conflict && !lockedError && (
        <Alert tone="danger" role="alert">
          {t("notifications.settings.saveFailed")}
        </Alert>
      )}
      {done && (
        <Alert tone="success" role="status">
          {t("notifications.settings.saved")}
        </Alert>
      )}

      <Card as="section" aria-labelledby="prefs-language" className="flex flex-col gap-3">
        <h2 id="prefs-language" className="m-0 text-h3">
          {t("notifications.settings.languageTitle")}
        </h2>
        <SelectField
          label={t("notifications.settings.language")}
          hint={t("notifications.settings.languageHint")}
          value={draft.language}
          onChange={(event) => change({ language: event.target.value as Language })}
        >
          {SUPPORTED_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`notifications.languages.${code}`)}
            </option>
          ))}
        </SelectField>
      </Card>

      <Card as="section" aria-labelledby="prefs-channels" className="flex flex-col gap-3">
        <h2 id="prefs-channels" className="m-0 text-h3">
          {t("notifications.settings.channelsTitle")}
        </h2>
        <p className="m-0 text-fg-secondary">{t("notifications.settings.channelsHint")}</p>
        {saved.is_critical_locked && (
          <Alert tone="info" title={t("notifications.settings.lockedTitle")}>
            {t("notifications.settings.locked")}
          </Alert>
        )}
        {lockedError && (
          <Alert tone="danger" role="alert">
            {lockedError}
          </Alert>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t("notifications.settings.channelsTitle")}</caption>
            <thead>
              <tr className="text-body-sm text-fg-secondary">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  {t("notifications.settings.level")}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("notifications.channels.in_app")}
                </th>
                {channels.map((channel) => (
                  <th key={channel} scope="col" className="px-3 py-2 font-semibold">
                    {t(`notifications.channels.${channel}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((level) => (
                <tr key={level} className="border-t border-border">
                  <th scope="row" className="py-3 pr-3 text-left font-semibold">
                    {t(`notifications.priority.${level}`)}
                    <span className="block text-body-sm font-normal text-fg-muted">
                      {t(`notifications.settings.levelHint.${level}`)}
                    </span>
                  </th>
                  <td className="px-3 py-3">
                    <label className="inline-flex min-h-target min-w-target items-center gap-2">
                      <input type="checkbox" checked disabled className="size-6" />
                      <span className="sr-only">
                        {t("notifications.settings.cell", {
                          level: t(`notifications.priority.${level}`),
                          channel: t("notifications.channels.in_app"),
                        })}
                      </span>
                      <LockSimple aria-hidden="true" className="size-4 text-fg-muted" />
                      <span className="text-body-sm text-fg-muted">
                        {t("notifications.settings.alwaysOn")}
                      </span>
                    </label>
                  </td>
                  {channels.map((channel) => {
                    const checked = draft.channels[level].includes(channel);
                    const locked =
                      level === "critical" &&
                      saved.is_critical_locked &&
                      checked &&
                      draft.channels.critical.length === 1;
                    return (
                      <td key={channel} className="px-3 py-3">
                        <label className="inline-flex min-h-target min-w-target items-center">
                          <input
                            type="checkbox"
                            className="size-6 accent-[var(--color-primary)]"
                            checked={checked}
                            disabled={locked}
                            onChange={(event) => toggle(level, channel, event.target.checked)}
                          />
                          <span className="sr-only">
                            {t("notifications.settings.cell", {
                              level: t(`notifications.priority.${level}`),
                              channel: t(`notifications.channels.${channel}`),
                            })}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card as="section" aria-labelledby="prefs-quiet" className="flex flex-col gap-3">
        <h2 id="prefs-quiet" className="m-0 text-h3">
          {t("notifications.settings.quietTitle")}
        </h2>
        <SwitchField
          label={t("notifications.settings.quiet")}
          hint={t("notifications.settings.quietHint")}
          checked={draft.quiet.is_enabled}
          onCheckedChange={(is_enabled) => change({ quiet: { ...draft.quiet, is_enabled } })}
          stateLabel={draft.quiet.is_enabled ? t("notifications.on") : t("notifications.off")}
        />
        {draft.quiet.is_enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              type="time"
              label={t("notifications.settings.quietStart")}
              value={draft.quiet.start}
              step={60}
              onChange={(event) => change({ quiet: { ...draft.quiet, start: event.target.value } })}
            />
            <TextField
              type="time"
              label={t("notifications.settings.quietEnd")}
              value={draft.quiet.end}
              step={60}
              onChange={(event) => change({ quiet: { ...draft.quiet, end: event.target.value } })}
            />
          </div>
        )}
      </Card>

      {saved.dependents.length > 0 && (
        <Card as="section" aria-labelledby="prefs-family" className="flex flex-col gap-4">
          <h2 id="prefs-family" className="m-0 text-h3">
            {t("notifications.settings.familyTitle")}
          </h2>
          {saved.dependents.map((d) => (
            <SwitchField
              key={d.patient_id}
              label={t("notifications.settings.familyAlerts", { name: d.display_name })}
              hint={t(
                `notifications.settings.relationship.${d.relationship === "delegate" ? "delegate" : "guardian"}`,
              )}
              checked={draft.dependents[d.patient_id] ?? true}
              onCheckedChange={(on) =>
                change({ dependents: { ...draft.dependents, [d.patient_id]: on } })
              }
              stateLabel={
                (draft.dependents[d.patient_id] ?? true)
                  ? t("notifications.on")
                  : t("notifications.off")
              }
            />
          ))}
        </Card>
      )}

      <div>
        <Button type="submit" size="lg" loading={save.isPending}>
          {t("notifications.settings.save")}
        </Button>
      </div>
    </form>
  );
}

/** /notifications/settings (contract §6.2, FR-NOT-05, 06, 08). */
export function SettingsPage() {
  const { t } = useTranslation();
  const prefs = usePreferences();
  // Hidden while the server has push off (no VAPID keys): there is nothing to turn on.
  const pushAvailable = usePush().state !== "disabled";
  return (
    <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-5">
      <Link to={paths.notifications} className="self-start font-semibold text-link">
        {t("notifications.inbox.back")}
      </Link>
      <PageHeading title={t("notifications.settings.title")}>
        {t("notifications.settings.title")}
      </PageHeading>
      {pushAvailable && (
        <section aria-labelledby="push-this-browser" className="flex flex-col gap-3">
          <h2 id="push-this-browser" className="m-0 text-h3">
            {t("notifications.settings.thisBrowser")}
          </h2>
          <PushOptIn />
        </section>
      )}
      <OtherBrowsers />
      {prefs.data ? (
        <PreferencesForm saved={prefs.data} />
      ) : prefs.isError ? (
        <Alert tone="danger" role="alert" title={t("notifications.loadError")}>
          <Button variant="secondary" onClick={() => void prefs.refetch()}>
            {t("common.retry")}
          </Button>
        </Alert>
      ) : (
        <div
          role="status"
          aria-busy="true"
          aria-label={t("notifications.loading")}
          className="flex flex-col gap-3"
        >
          <Skeleton height="8rem" className="rounded-lg" />
          <Skeleton height="12rem" className="rounded-lg" />
        </div>
      )}
    </div>
  );
}
