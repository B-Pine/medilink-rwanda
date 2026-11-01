import {
  PATIENT_SUPPORT_TOPICS,
  SUPPORT_LIMITS,
  isApiError,
  type SupportRequest,
  type SupportTopic,
} from "@medilink/api-client";
import { ArrowLeft, ChatsCircle, FirstAidKit, LockKey, Tray } from "@phosphor-icons/react";
import {
  Alert,
  Button,
  buttonClassName,
  Card,
  cx,
  EmptyState,
  ErrorSummary,
  Skeleton,
  TextareaField,
  TextField,
} from "@medilink/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { errorText, fieldErrors, helpKeys, StatusBadge, useWhen } from "./shared";

function Back({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="inline-flex min-h-target items-center gap-2 font-semibold">
      <ArrowLeft aria-hidden="true" />
      {label}
    </Link>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert tone="danger" role="alert" title={errorText(error, t("help.loadFailed"))}>
      <Button variant="secondary" onClick={onRetry}>
        {t("help.retry")}
      </Button>
    </Alert>
  );
}

/** /support/requests: my requests, newest activity first (S10-F4). */
export function RequestsPage() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const list = useQuery({
    queryKey: helpKeys.requests(""),
    queryFn: () => api.help.patient.requests(),
  });
  const rows = list.data?.results ?? [];
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4">
      <Back to="/support" label={t("help.article.back")} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeading title={t("help.requests.title")}>{t("help.requests.title")}</PageHeading>
        {rows.length > 0 && (
          <Link to="/support/requests/new" className={buttonClassName({})}>
            {t("help.requests.new")}
          </Link>
        )}
      </div>
      {list.isPending ? (
        <Skeleton height="6rem" className="rounded-lg" />
      ) : list.isError ? (
        <LoadError error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tray}
          title={t("help.requests.empty")}
          description={t("help.requests.emptyBody")}
          action={
            <Link to="/support/requests/new" className={buttonClassName({})}>
              {t("help.requests.new")}
            </Link>
          }
        />
      ) : (
        <ul aria-label={t("help.requests.title")} className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={`/support/requests/${r.id}`}
                className="flex min-h-target flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-fg no-underline hover:bg-subtle"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-body-sm text-fg-secondary">{r.reference}</span>
                  <StatusBadge status={r.status} />
                </span>
                <span className="text-[1.125rem] font-semibold">{r.subject}</span>
                <span className="text-body-sm text-fg-muted">
                  {t("help.requests.lastActivity", { time: when(r.last_message_at) })} ·{" "}
                  {t("help.requests.messages", { count: r.message_count })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Choice = SupportTopic | "health";

/** /support/requests/new: topic first; health questions go to the facility (S10-F3). */
export function NewRequestPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const from = (location.state as { from?: string } | null)?.from ?? "/support";
  const send = useMutation({
    mutationFn: () =>
      api.help.patient.create({
        topic: choice as SupportTopic,
        subject: subject.trim(),
        body: body.trim(),
        client_path: /^\/[A-Za-z0-9/_-]*$/.test(from) ? from : "/support",
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: helpKeys.all });
      queryClient.setQueryData(helpKeys.request(created.id), created);
      void navigate(`/support/requests/${created.id}`, {
        replace: true,
        state: { notice: t("help.new.sent", { reference: created.reference }) },
      });
    },
  });
  const errors = fieldErrors(send.error);
  const summary = Object.entries(errors).map(([field, message]) => ({
    fieldId: `support-${field}`,
    message,
  }));
  const rule = isApiError(send.error) && send.error.status === 422 ? send.error.message : null;
  const other =
    send.isError && !summary.length && !rule ? errorText(send.error, t("help.loadFailed")) : null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send.mutate();
  };
  const choices: Choice[] = [...PATIENT_SUPPORT_TOPICS, "health"];

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4">
      <Back to="/support" label={t("help.article.back")} />
      <PageHeading title={t("help.new.title")}>{t("help.new.title")}</PageHeading>
      {step === 1 ? (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-2 text-h3 font-semibold">{t("help.new.step1")}</legend>
          {choices.map((c) => (
            <div
              key={c}
              className={cx(
                "relative flex min-h-target items-start gap-3 rounded-lg border p-4",
                choice === c ? "border-brand bg-brand-subtle" : "border-border bg-surface",
              )}
            >
              <input
                id={`topic-${c}`}
                type="radio"
                name="topic"
                value={c}
                checked={choice === c}
                onChange={() => setChoice(c)}
                aria-describedby={`topic-${c}-hint`}
                className="mt-1 size-5"
              />
              <span className="flex flex-col gap-1">
                {/* the whole card is the click target (after: covers the card) */}
                <label
                  htmlFor={`topic-${c}`}
                  className="cursor-pointer text-[1.125rem] font-semibold after:absolute after:inset-0"
                >
                  {t(`help.topics.${c}`)}
                </label>
                <span id={`topic-${c}-hint`} className="text-body-sm text-fg-secondary">
                  {t(`help.topicHints.${c}`)}
                </span>
              </span>
            </div>
          ))}
          {choice === "health" ? (
            <Alert tone="warning" title={t("help.new.health.title")}>
              <p className="m-0">{t("help.new.health.body")}</p>
              <p className="m-0 font-semibold">{t("help.new.health.emergency")}</p>
              <Link to="/find-care" className={buttonClassName({ variant: "secondary" })}>
                <FirstAidKit aria-hidden="true" />
                {t("help.new.health.findCare")}
              </Link>
            </Alert>
          ) : (
            <Button disabled={!choice} onClick={() => setStep(2)} className="self-start">
              {t("help.new.next")}
            </Button>
          )}
        </fieldset>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <h2 className="m-0 text-h3">{t("help.new.step2")}</h2>
          <p className="m-0 text-fg-secondary">{t(`help.topics.${choice ?? "other"}`)}</p>
          {summary.length > 0 && (
            <ErrorSummary
              items={summary}
              focusKey={send.failureCount}
              title={t("help.new.fixErrors")}
            />
          )}
          {rule && (
            <Alert tone="warning" role="alert">
              {rule}
            </Alert>
          )}
          {other && (
            <Alert tone="danger" role="alert">
              {other}
            </Alert>
          )}
          <TextField
            id="support-subject"
            label={t("help.new.subject")}
            hint={t("help.new.subjectHint")}
            value={subject}
            maxLength={SUPPORT_LIMITS.subject.max}
            required
            error={errors.subject}
            onChange={(e) => setSubject(e.target.value)}
          />
          <TextareaField
            id="support-body"
            label={t("help.new.body")}
            hint={
              <>
                <span className="flex items-center gap-1">
                  <LockKey aria-hidden="true" />
                  {t("help.new.bodyHint")}
                </span>
                <span>
                  {t("help.new.counter", { count: body.length, max: SUPPORT_LIMITS.body.max })}
                </span>
              </>
            }
            value={body}
            rows={6}
            maxLength={SUPPORT_LIMITS.body.max}
            required
            error={errors.body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              loading={send.isPending}
              disabled={
                subject.trim().length < SUPPORT_LIMITS.subject.min ||
                body.trim().length < SUPPORT_LIMITS.body.min
              }
            >
              {t("help.new.send")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              {t("help.new.back")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** /support/requests/:id: the thread, reply and close (S10-F4). */
export function RequestPage() {
  const { t } = useTranslation();
  const api = useApi();
  const when = useWhen();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { id = "" } = useParams();
  const [reply, setReply] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  const request = useQuery({
    queryKey: helpKeys.request(id),
    queryFn: () => api.help.patient.get(id),
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 2,
  });
  const update = (next: SupportRequest, message: string) => {
    queryClient.setQueryData(helpKeys.request(id), next);
    void queryClient.invalidateQueries({ queryKey: ["help", "requests"] });
    setNotice(message);
  };
  const send = useMutation({
    mutationFn: () => api.help.patient.reply(id, reply.trim()),
    onSuccess: (next) => {
      setReply("");
      update(next, t("help.thread.replySent"));
    },
  });
  const close = useMutation({
    mutationFn: () => api.help.patient.close(id),
    onSuccess: (next) => {
      setConfirming(false);
      update(next, t("help.thread.closedNotice"));
    },
  });

  if (request.isPending)
    return <Skeleton height="16rem" className="mx-auto w-full max-w-[40rem] rounded-lg" />;
  if (request.isError) {
    return (
      <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4">
        <Back to="/support/requests" label={t("help.requests.title")} />
        {isApiError(request.error) && request.error.status === 404 ? (
          <>
            <PageHeading title={t("help.thread.notFound")}>{t("help.thread.notFound")}</PageHeading>
            <EmptyState icon={Tray} title={t("help.thread.notFound")} />
          </>
        ) : (
          <LoadError error={request.error} onRetry={() => void request.refetch()} />
        )}
      </div>
    );
  }
  const r = request.data;
  const closed = r.status === "closed";
  const replyError =
    fieldErrors(send.error).body ??
    (send.isError ? errorText(send.error, t("help.loadFailed")) : undefined);
  const title = t("help.thread.title", { reference: r.reference });

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-4">
      <Back to="/support/requests" label={t("help.requests.title")} />
      <div className="flex flex-col gap-2">
        <PageHeading title={title}>{r.subject}</PageHeading>
        <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm text-fg-secondary">
          <span className="font-mono">{r.reference}</span>
          <StatusBadge status={r.status} />
          <span>{t("help.thread.topic", { topic: t(`help.topics.${r.topic}`) })}</span>
        </p>
      </div>
      <p role="status" aria-live="polite" className="m-0 text-body-sm text-success">
        {notice ?? ""}
      </p>
      <ol aria-label={title} className="m-0 flex list-none flex-col gap-3 p-0">
        {r.messages.map((m) => {
          const mine = m.author_kind === "requester";
          return (
            <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "flex max-w-[85%] flex-col gap-1 rounded-lg p-3 text-[1.125rem]",
                  mine ? "bg-brand-subtle" : "border border-border bg-surface",
                )}
              >
                <span className="flex items-center gap-2 text-body-sm font-semibold text-fg-secondary">
                  {!mine && <ChatsCircle aria-hidden="true" />}
                  {mine ? t("help.thread.you") : m.author_name}
                  <span className="font-normal text-fg-muted">· {when(m.created_at)}</span>
                </span>
                <p className="m-0 whitespace-pre-wrap">{m.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {closed ? (
        <Alert tone="success" title={t("help.thread.closedTitle")}>
          <p className="m-0">{t("help.thread.closedBody")}</p>
          <Link to="/support/requests/new" className={buttonClassName({})}>
            {t("help.thread.openNew")}
          </Link>
        </Alert>
      ) : (
        <Card className="flex flex-col gap-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
            className="flex flex-col gap-3"
          >
            <TextareaField
              label={t("help.thread.reply")}
              hint={t("help.new.bodyHint")}
              value={reply}
              rows={4}
              maxLength={SUPPORT_LIMITS.reply.max}
              error={replyError}
              onChange={(e) => setReply(e.target.value)}
            />
            <Button
              type="submit"
              loading={send.isPending}
              disabled={!reply.trim()}
              className="self-start"
            >
              {t("help.thread.send")}
            </Button>
          </form>
          {confirming ? (
            <div
              role="group"
              aria-label={t("help.thread.close")}
              className="flex flex-col gap-2 rounded-md border border-border p-3"
            >
              <p className="m-0">{t("help.thread.closeConfirm")}</p>
              {close.isError && (
                <Alert tone="danger" role="alert">
                  {errorText(close.error, t("help.loadFailed"))}
                </Alert>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" loading={close.isPending} onClick={() => close.mutate()}>
                  {t("help.thread.closeYes")}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  {t("help.thread.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)} className="self-start">
              {t("help.thread.close")}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
