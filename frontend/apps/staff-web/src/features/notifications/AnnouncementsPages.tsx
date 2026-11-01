import {
  ANNOUNCEMENT_LIMITS,
  isApiError,
  type Announcement,
  type AnnouncementAudience,
  type AnnouncementInput,
  type AnnouncementPriority,
  type AnnouncementStatus,
  type AnnouncementText,
  type LanguageCode,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  buttonClassName,
  Card,
  cx,
  EmptyState,
  ErrorSummary,
  SelectField,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextareaField,
  TextField,
  type BadgeTone,
} from "@medilink/ui";
import { Megaphone, Plus, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { describeApiError } from "../../forms/api-errors";
import { NotFoundContent } from "../../pages/NotFoundPage";
import { notificationKeys } from "./live";
import {
  isConflict,
  ListSkeleton,
  LoadError,
  OfflineNotice,
  useCan,
  useFormatDay,
  useFormatWhen,
} from "./shared";

export type AnnouncementScope = "facility" | "platform";
const LANGS: LanguageCode[] = ["rw", "en", "fr"];
const STATUS_TONES: Record<AnnouncementStatus, BadgeTone> = {
  draft: "neutral",
  published: "success",
  withdrawn: "warning",
};

const basePath = (scope: AnnouncementScope) =>
  scope === "platform" ? "/platform/announcements" : "/announcements";

function useAnnouncementsApi(scope: AnnouncementScope) {
  const api = useApi();
  return scope === "platform"
    ? api.notifications.platform.announcements
    : api.notifications.staff.announcements;
}

/** Facility pages need `announcements.manage`; platform pages a platform admin. */
function Guard({ scope, children }: { scope: AnnouncementScope; children: ReactNode }) {
  const { data: me } = useStaffMe();
  const canManage = useCan("announcements.manage");
  const allowed = scope === "platform" ? Boolean(me?.is_platform_admin) : canManage;
  return allowed ? <>{children}</> : <NotFoundContent />;
}

function textIn(texts: AnnouncementText, lang: string): string {
  return texts[lang as LanguageCode] || texts.rw || texts.en || texts.fr || "";
}

export function StatusBadge({ status }: { status: AnnouncementStatus }) {
  const { t } = useTranslation();
  return (
    <Badge tone={STATUS_TONES[status]}>{t(`notifications.announcements.status.${status}`)}</Badge>
  );
}

function AnnouncementsList({ scope }: { scope: AnnouncementScope }) {
  const { t, i18n } = useTranslation();
  const ann = useAnnouncementsApi(scope);
  const when = useFormatWhen();
  const day = useFormatDay();
  const [status, setStatus] = useState<AnnouncementStatus | "">("");
  const list = useQuery({
    queryKey: [...notificationKeys.announcements(scope), status],
    queryFn: () => ann.list(status ? { status } : {}),
  });
  const rows = list.data?.results ?? [];
  const base = basePath(scope);
  const lang = i18n.resolvedLanguage ?? "rw";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t(`notifications.announcements.${scope}Title`)}
        description={t(`notifications.announcements.${scope}Intro`)}
        actions={
          <Link to={`${base}/new`} className={buttonClassName({ variant: "primary" })}>
            <Plus aria-hidden="true" className="size-icon" />
            {t("notifications.announcements.new")}
          </Link>
        }
      />
      <OfflineNotice />
      <SelectField
        label={t("notifications.announcements.filterStatus")}
        value={status}
        onChange={(event) => setStatus(event.target.value as AnnouncementStatus | "")}
        className="max-w-xs"
      >
        <option value="">{t("notifications.announcements.allStatuses")}</option>
        {(["draft", "published", "withdrawn"] as const).map((s) => (
          <option key={s} value={s}>
            {t(`notifications.announcements.status.${s}`)}
          </option>
        ))}
      </SelectField>
      {list.isPending ? (
        <ListSkeleton label={t("notifications.loading")} />
      ) : list.isError ? (
        <LoadError error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={t("notifications.announcements.emptyTitle")}
          description={t("notifications.announcements.empty")}
          action={
            <Link to={`${base}/new`} className={buttonClassName({ variant: "primary" })}>
              {t("notifications.announcements.new")}
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t(`notifications.announcements.${scope}Title`)}</caption>
            <thead className="bg-subtle text-body-sm text-fg-secondary">
              <tr>
                {["title", "audience", "priority", "status", "updated"].map((column) => (
                  <th key={column} scope="col" className="px-4 py-2.5 font-semibold">
                    {t(`notifications.announcements.columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link to={`${base}/${row.id}`} className="font-semibold text-link">
                      {textIn(row.title_i18n, lang)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">
                    {t(`notifications.announcements.audience.${row.audience}`)}
                    {row.range_starts_on && (
                      <span className="block text-body-sm text-fg-muted">
                        {day(row.range_starts_on)}
                        {row.range_ends_on && row.range_ends_on !== row.range_starts_on
                          ? ` – ${day(row.range_ends_on)}`
                          : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{t(`notifications.priority.${row.priority}`)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-body-sm text-fg-muted">
                    {when(row.published_at ?? row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface Draft {
  audience: AnnouncementAudience;
  range_starts_on: string;
  range_ends_on: string;
  priority: AnnouncementPriority;
  title_i18n: Record<LanguageCode, string>;
  body_i18n: Record<LanguageCode, string>;
}

function draftFrom(row: Announcement | null, scope: AnnouncementScope): Draft {
  const texts = (value: AnnouncementText | undefined) => ({
    rw: value?.rw ?? "",
    en: value?.en ?? "",
    fr: value?.fr ?? "",
  });
  return {
    audience: row?.audience ?? (scope === "platform" ? "all_facilities" : "patients_in_range"),
    range_starts_on: row?.range_starts_on ?? "",
    range_ends_on: row?.range_ends_on ?? "",
    priority: row?.priority ?? "routine",
    title_i18n: texts(row?.title_i18n),
    body_i18n: texts(row?.body_i18n),
  };
}

function toInput(draft: Draft): AnnouncementInput {
  const trimmed = (texts: Record<LanguageCode, string>) =>
    Object.fromEntries(LANGS.map((l) => [l, texts[l].trim()]));
  const inRange = draft.audience === "patients_in_range";
  return {
    audience: draft.audience,
    priority: draft.priority,
    range_starts_on: inRange ? draft.range_starts_on || null : null,
    range_ends_on: inRange ? draft.range_ends_on || null : null,
    title_i18n: trimmed(draft.title_i18n),
    body_i18n: trimmed(draft.body_i18n),
  };
}

/** The id of the input a server field error points to. */
function fieldId(field: string): string {
  return `announcement-${field.replace(/[._]/g, "-")}`;
}

function Counter({ value, max }: { value: string; max: number }) {
  const { t } = useTranslation();
  const over = value.length > max;
  return (
    <span className={cx("text-body-sm", over ? "font-semibold text-danger" : "text-fg-muted")}>
      {t("notifications.announcements.counter", { count: value.length, max })}
    </span>
  );
}

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  disabled,
  error,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  error?: string | undefined;
}) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset
      className="m-0 flex flex-col gap-2 border-0 p-0"
      aria-describedby={errorId}
      id={fieldId(name)}
      tabIndex={-1}
    >
      <legend className="mb-1 font-semibold text-fg">{legend}</legend>
      {error && (
        <p id={errorId} className="m-0 text-body-sm font-semibold text-danger">
          {error}
        </p>
      )}
      {options.map((option) => (
        <label
          key={option.value}
          className={cx(
            "flex min-h-target cursor-pointer items-start gap-3 rounded-md border border-border p-3",
            value === option.value && "border-primary bg-brand-subtle/40",
            disabled && "cursor-not-allowed opacity-70",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            className="mt-1 size-4 accent-[var(--color-primary)]"
          />
          <span className="flex flex-col">
            <span className="font-semibold">{option.label}</span>
            {option.hint && <span className="text-body-sm text-fg-secondary">{option.hint}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Composer({ scope, row }: { scope: AnnouncementScope; row: Announcement | null }) {
  const { t, i18n } = useTranslation();
  const ann = useAnnouncementsApi(scope);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const day = useFormatDay();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(row, scope));
  const [current, setCurrent] = useState<Announcement | null>(row);
  const [tab, setTab] = useState<LanguageCode>(
    () => LANGS.find((l) => row?.title_i18n[l]?.trim()) ?? "rw",
  );
  const [preview, setPreview] = useState<LanguageCode>(
    (i18n.resolvedLanguage as LanguageCode | undefined) ?? "rw",
  );
  const [confirm, setConfirm] = useState<"publish" | "withdraw" | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [failCount, setFailCount] = useState(0);
  // A new draft moves to its own URL; the notice travels in the navigation state.
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const editable = !current || current.status === "draft";
  const base = basePath(scope);

  const handleError = (error: unknown) => {
    setFailCount((n) => n + 1);
    if (isApiError(error) && error.fields) {
      const next: Record<string, string> = {};
      for (const [field, messages] of Object.entries(error.fields)) next[field] = messages[0] ?? "";
      setFieldErrors(next);
      const lang = Object.keys(next)
        .map((field) => field.split(".")[1])
        .find((code): code is LanguageCode => LANGS.includes(code as LanguageCode));
      if (lang) setTab(lang);
    } else {
      setFieldErrors({});
    }
  };
  const settled = (next: Announcement, message: string) => {
    setCurrent(next);
    setDraft(draftFrom(next, scope));
    setFieldErrors({});
    setNotice(message);
    setConfirm(null);
    void queryClient.invalidateQueries({ queryKey: notificationKeys.announcements(scope) });
  };

  /** A new announcement moves to its own URL. The detail query is seeded so that page renders at
   * once, and the notice shows only there, so nothing is clicked on the page being replaced. */
  const moveTo = (next: Announcement, message: string) => {
    queryClient.setQueryData(notificationKeys.announcement(scope, next.id), next);
    void queryClient.invalidateQueries({ queryKey: notificationKeys.announcements(scope) });
    void navigate(`${base}/${next.id}`, { replace: true, state: { notice: message } });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = toInput(draft);
      return current
        ? ann.update(current.id, { ...body, version: current.version })
        : ann.create(body);
    },
    onSuccess: (next) => {
      if (current) settled(next, t("notifications.announcements.savedDraft"));
      else moveTo(next, t("notifications.announcements.savedDraft"));
    },
    onError: handleError,
  });
  const publish = useMutation({
    mutationFn: async () => {
      // Save pending edits first, so what is published is what the user sees.
      const saved = current
        ? await ann.update(current.id, { ...toInput(draft), version: current.version })
        : await ann.create(toInput(draft));
      setCurrent(saved);
      return ann.publish(saved.id);
    },
    onSuccess: (next) => {
      if (row) settled(next, t("notifications.announcements.publishedNotice"));
      else moveTo(next, t("notifications.announcements.publishedNotice"));
    },
    onError: (error) => {
      setConfirm(null);
      handleError(error);
    },
  });
  const withdraw = useMutation({
    mutationFn: () => ann.withdraw(current!.id),
    onSuccess: (next) => settled(next, t("notifications.announcements.withdrawnNotice")),
    onError: (error) => {
      setConfirm(null);
      handleError(error);
    },
  });
  const failed = save.error ?? publish.error ?? withdraw.error;

  const update = (patch: Partial<Draft>) => {
    setNotice(null);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const setText = (kind: "title_i18n" | "body_i18n", lang: LanguageCode, value: string) => {
    setNotice(null);
    setDraft((d) => ({ ...d, [kind]: { ...d[kind], [lang]: value } }));
  };
  const written = LANGS.filter((l) => draft.title_i18n[l].trim() && draft.body_i18n[l].trim());
  const missing = LANGS.filter((l) => !written.includes(l));
  const fallbackLang = written[0];
  const err = (field: string) => fieldErrors[field];
  const summary = Object.entries(fieldErrors).map(([field, message]) => ({
    fieldId: fieldId(field),
    message,
  }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const audiences: { value: AnnouncementAudience; label: string; hint: string }[] =
    scope === "platform"
      ? [
          {
            value: "all_facilities",
            label: t("notifications.announcements.audience.all_facilities"),
            hint: t("notifications.announcements.audienceHint.all_facilities"),
          },
        ]
      : [
          {
            value: "patients_in_range",
            label: t("notifications.announcements.audience.patients_in_range"),
            hint: t("notifications.announcements.audienceHint.patients_in_range"),
          },
          {
            value: "display",
            label: t("notifications.announcements.audience.display"),
            hint: t("notifications.announcements.audienceHint.display"),
          },
        ];
  const previewTitle =
    draft.title_i18n[preview].trim() || (fallbackLang ? draft.title_i18n[fallbackLang] : "");
  const previewBody =
    draft.body_i18n[preview].trim() || (fallbackLang ? draft.body_i18n[fallbackLang] : "");
  const busy = save.isPending || publish.isPending || withdraw.isPending;
  const titleText = current
    ? textIn(current.title_i18n, i18n.resolvedLanguage ?? "rw") ||
      t("notifications.announcements.untitled")
    : t("notifications.announcements.new");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={titleText}
        back={{ to: base, label: t(`notifications.announcements.${scope}Title`) }}
        badges={current && <StatusBadge status={current.status} />}
        description={
          current?.status === "published"
            ? t("notifications.announcements.recipients", { count: current.recipient_count ?? 0 })
            : t("notifications.announcements.composerIntro")
        }
      />
      <OfflineNotice />
      {notice && (
        <Alert tone="success" role="status">
          {notice}
        </Alert>
      )}
      <ErrorSummary
        items={summary}
        focusKey={failCount}
        title={t("notifications.announcements.fixErrors")}
      />
      {failed && !summary.length && (
        <Alert tone={isConflict(failed) ? "warning" : "danger"} role="alert">
          {isConflict(failed)
            ? t("notifications.announcements.conflict")
            : describeApiError(failed, t)}
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <RadioGroup
              legend={t("notifications.announcements.audienceLabel")}
              name="audience"
              value={draft.audience}
              options={audiences}
              onChange={(audience) => update({ audience })}
              disabled={!editable}
              error={err("audience")}
            />
            {scope === "platform" && (
              <p className="m-0 text-body-sm text-fg-muted">
                {t("notifications.announcements.selectedLater")}
              </p>
            )}
            {draft.audience === "patients_in_range" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id={fieldId("range_starts_on")}
                  type="date"
                  label={t("notifications.announcements.from")}
                  value={draft.range_starts_on}
                  disabled={!editable}
                  error={err("range_starts_on")}
                  onChange={(event) => update({ range_starts_on: event.target.value })}
                />
                <TextField
                  id={fieldId("range_ends_on")}
                  type="date"
                  label={t("notifications.announcements.to")}
                  value={draft.range_ends_on}
                  min={draft.range_starts_on || undefined}
                  disabled={!editable}
                  error={err("range_ends_on")}
                  onChange={(event) => update({ range_ends_on: event.target.value })}
                />
              </div>
            )}
            <RadioGroup
              legend={t("notifications.announcements.priorityLabel")}
              name="priority"
              value={draft.priority}
              options={[
                {
                  value: "routine",
                  label: t("notifications.priority.routine"),
                  hint: t("notifications.announcements.priorityHint.routine"),
                },
                {
                  value: "important",
                  label: t("notifications.priority.important"),
                  hint: t("notifications.announcements.priorityHint.important"),
                },
              ]}
              onChange={(priority) => update({ priority })}
              disabled={!editable}
              error={err("priority")}
            />
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="m-0 text-h3">{t("notifications.announcements.textTitle")}</h2>
            <p className="m-0 text-body-sm text-fg-secondary">
              {t("notifications.announcements.textHint")}
            </p>
            {err("title_i18n") && (
              <p id={fieldId("title_i18n")} tabIndex={-1} className="m-0 font-semibold text-danger">
                {err("title_i18n")}
              </p>
            )}
            {missing.length > 0 && written.length > 0 && (
              <Alert tone="warning" title={t("notifications.announcements.missingTitle")}>
                {t("notifications.announcements.missing", {
                  languages: missing.map((l) => t(`notifications.languages.${l}`)).join(", "),
                  fallback: t(`notifications.languages.${fallbackLang}`),
                })}
              </Alert>
            )}
            <Tabs value={tab} onValueChange={(value) => setTab(value as LanguageCode)}>
              <TabsList aria-label={t("notifications.announcements.languagesLabel")}>
                {LANGS.map((lang) => {
                  const hasError = Boolean(err(`title_i18n.${lang}`) || err(`body_i18n.${lang}`));
                  const isMissing = !written.includes(lang);
                  return (
                    <TabsTrigger
                      key={lang}
                      value={lang}
                      className="inline-flex items-center gap-1.5"
                    >
                      {t(`notifications.languages.${lang}`)}
                      {(hasError || isMissing) && (
                        <>
                          <Warning
                            aria-hidden="true"
                            weight="bold"
                            className={cx("size-4", hasError ? "text-danger" : "text-warning")}
                          />
                          <span className="sr-only">
                            {" "}
                            {hasError
                              ? t("notifications.announcements.tabError")
                              : t("notifications.announcements.tabMissing")}
                          </span>
                        </>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {LANGS.map((lang) => (
                <TabsContent key={lang} value={lang} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <TextField
                      id={fieldId(`title_i18n.${lang}`)}
                      label={t("notifications.announcements.titleField", {
                        language: t(`notifications.languages.${lang}`),
                      })}
                      value={draft.title_i18n[lang]}
                      maxLength={ANNOUNCEMENT_LIMITS.title}
                      lang={lang}
                      disabled={!editable}
                      error={err(`title_i18n.${lang}`)}
                      onChange={(event) => setText("title_i18n", lang, event.target.value)}
                    />
                    <Counter value={draft.title_i18n[lang]} max={ANNOUNCEMENT_LIMITS.title} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <TextareaField
                      id={fieldId(`body_i18n.${lang}`)}
                      label={t("notifications.announcements.bodyField", {
                        language: t(`notifications.languages.${lang}`),
                      })}
                      hint={t("notifications.announcements.bodyHint")}
                      value={draft.body_i18n[lang]}
                      rows={5}
                      maxLength={ANNOUNCEMENT_LIMITS.body}
                      lang={lang}
                      disabled={!editable}
                      error={err(`body_i18n.${lang}`)}
                      onChange={(event) => setText("body_i18n", lang, event.target.value)}
                    />
                    <Counter value={draft.body_i18n[lang]} max={ANNOUNCEMENT_LIMITS.body} />
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </Card>
          <div className="flex flex-wrap items-center gap-3">
            {editable && (
              <>
                <Button
                  type="submit"
                  variant="secondary"
                  loading={save.isPending}
                  disabled={busy && !save.isPending}
                >
                  {t("notifications.announcements.saveDraft")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy || confirm === "publish"}
                  onClick={() => setConfirm("publish")}
                >
                  {t("notifications.announcements.publish")}
                </Button>
              </>
            )}
            {current?.status === "published" && (
              <Button
                type="button"
                variant="danger"
                disabled={busy || confirm === "withdraw"}
                onClick={() => setConfirm("withdraw")}
              >
                {t("notifications.announcements.withdraw")}
              </Button>
            )}
          </div>
          {confirm && (
            <div
              role="group"
              aria-labelledby="announcement-confirm-title"
              className="flex flex-col gap-3 rounded-lg border border-warning bg-warning-bg p-4"
            >
              <p id="announcement-confirm-title" className="m-0 font-semibold text-fg">
                {confirm === "publish"
                  ? t(`notifications.announcements.confirmPublish.${scope}`)
                  : t("notifications.announcements.confirmWithdraw")}
              </p>
              <p className="m-0 text-body-sm text-fg-secondary">
                {confirm === "publish"
                  ? t("notifications.announcements.confirmPublishBody")
                  : t("notifications.announcements.confirmWithdrawBody")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={confirm === "publish" ? "primary" : "danger"}
                  loading={publish.isPending || withdraw.isPending}
                  onClick={() => (confirm === "publish" ? publish.mutate() : withdraw.mutate())}
                >
                  {confirm === "publish"
                    ? t("notifications.announcements.confirmPublishAction")
                    : t("notifications.announcements.confirmWithdrawAction")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>
                  {t("notifications.announcements.cancel")}
                </Button>
              </div>
            </div>
          )}
        </form>
        <aside aria-labelledby="announcement-preview" className="flex flex-col gap-3">
          <h2 id="announcement-preview" className="m-0 text-h3">
            {t("notifications.announcements.preview")}
          </h2>
          <SelectField
            label={t("notifications.announcements.previewLanguage")}
            value={preview}
            onChange={(event) => setPreview(event.target.value as LanguageCode)}
          >
            {LANGS.map((lang) => (
              <option key={lang} value={lang}>
                {t(`notifications.languages.${lang}`)}
              </option>
            ))}
          </SelectField>
          <Card className="flex flex-col gap-2" lang={preview}>
            {previewTitle ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {draft.priority === "important" && (
                    <Badge tone="warning">{t("notifications.priority.important")}</Badge>
                  )}
                </div>
                <p className="m-0 font-bold text-fg">{previewTitle}</p>
                <p className="m-0 whitespace-pre-line text-fg-secondary">{previewBody}</p>
                {draft.audience === "patients_in_range" && draft.range_starts_on && (
                  <p className="m-0 text-body-sm text-fg-muted">
                    {t("notifications.announcements.previewRange", {
                      from: day(draft.range_starts_on),
                      to: day(draft.range_ends_on || draft.range_starts_on),
                    })}
                  </p>
                )}
              </>
            ) : (
              <p className="m-0 text-fg-muted">{t("notifications.announcements.previewEmpty")}</p>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ComposerRoute({ scope }: { scope: AnnouncementScope }) {
  const { t } = useTranslation();
  const ann = useAnnouncementsApi(scope);
  const { id } = useParams();
  const row = useQuery({
    queryKey: notificationKeys.announcement(scope, id ?? "new"),
    queryFn: () => ann.get(id!),
    enabled: Boolean(id),
  });
  if (!id) return <Composer scope={scope} row={null} />;
  if (row.isError && isApiError(row.error) && row.error.status === 404) return <NotFoundContent />;
  if (row.data) return <Composer key={row.data.id} scope={scope} row={row.data} />;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("notifications.announcements.loadingTitle")}
        back={{ to: basePath(scope), label: t(`notifications.announcements.${scope}Title`) }}
      />
      {row.isError ? (
        <LoadError error={row.error} onRetry={() => void row.refetch()} />
      ) : (
        <ListSkeleton rows={2} label={t("notifications.loading")} />
      )}
    </div>
  );
}

export function FacilityAnnouncementsPage() {
  return (
    <Guard scope="facility">
      <AnnouncementsList scope="facility" />
    </Guard>
  );
}
export function FacilityAnnouncementPage() {
  return (
    <Guard scope="facility">
      <ComposerRoute scope="facility" />
    </Guard>
  );
}
export function PlatformAnnouncementsPage() {
  return (
    <Guard scope="platform">
      <AnnouncementsList scope="platform" />
    </Guard>
  );
}
export function PlatformAnnouncementPage() {
  return (
    <Guard scope="platform">
      <ComposerRoute scope="platform" />
    </Guard>
  );
}
