import {
  DISPUTE_LIMITS,
  isApiError,
  outcomesFor,
  type DisputeMessage,
  type DisputeOutcome,
  type DisputeStatus,
  type StaffDispute,
  type StaffDisputeRow,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  LoadingState,
  SelectField,
  TextareaField,
  type BadgeTone,
} from "@medilink/ui";
import { dateFormat } from "@medilink/ui/i18n";
import { Flag, Scales } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { useStaffMe } from "../../auth/queries";
import { PageHeader } from "../../components/PageHeader";
import { useStepUp } from "../lock/StepUp";
import { PlatformOnly } from "../platform/shared";

/**
 * S10b-F2 disputes (contract sprint-10b §5): the facility queue (Open, Overdue, All) and a dispute
 * with its evidence, thread, internal notes and comment requests; the platform's escalated cases
 * and final decision (step-up).
 */
export const disputesKeys = {
  all: ["disputes"] as const,
  queue: (tab: string) => ["disputes", "queue", tab] as const,
  one: (scope: Scope, id: string) => ["disputes", scope, id] as const,
  platform: ["disputes", "platform"] as const,
};

type Scope = "staff" | "platform";

const STATUS_TONE: Record<DisputeStatus, BadgeTone> = {
  open: "warning",
  acknowledged: "info",
  under_review: "info",
  info_requested: "neutral",
  resolved: "success",
  escalated: "danger",
  final_decision: "success",
  closed: "neutral",
  reopened: "warning",
};

const errorText = (error: unknown, fallback: string) =>
  isApiError(error) ? error.message : fallback;
const fieldError = (error: unknown, field: string) =>
  isApiError(error) ? error.fields[field]?.[0] : undefined;

function useWhen() {
  const { i18n } = useTranslation();
  return (iso: string) =>
    dateFormat(i18n.resolvedLanguage ?? "rw", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Kigali",
    }).format(new Date(iso));
}

function useSubjectLabel() {
  const { t } = useTranslation();
  return (row: Pick<StaffDisputeRow, "subject_type" | "subject_snapshot">) => {
    const s = row.subject_snapshot;
    const ref = s.number ?? s.booking_code ?? s.ticket_number;
    return [t(`disputes.subject.${row.subject_type}`), ref].filter(Boolean).join(" ");
  };
}

function StatusBadge({ status }: { status: DisputeStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`disputes.status.${status}`)}</Badge>;
}

/** The deadline that applies now: answer by (open), decide by (in review), none after. */
function deadline(row: StaffDisputeRow): ["answerBy" | "decideBy", string] | null {
  if (row.status === "open" || row.status === "reopened") return ["answerBy", row.acknowledge_by];
  if (
    row.decide_by &&
    (row.status === "acknowledged" ||
      row.status === "under_review" ||
      row.status === "info_requested")
  )
    return ["decideBy", row.decide_by];
  return null;
}

function Rows({ rows, base }: { rows: StaffDisputeRow[]; base: string }) {
  const { t } = useTranslation();
  const when = useWhen();
  const label = useSubjectLabel();
  return (
    <ul
      aria-label={t("disputes.title")}
      className="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-2xl bg-surface p-0 shadow-card"
    >
      {rows.map((row) => {
        const due = deadline(row);
        return (
          <li key={row.id}>
            <Link
              to={`${base}/${row.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 text-fg no-underline hover:bg-subtle/70"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {row.patient_display_name}
                  {row.flagged && (
                    <Badge tone="warning">
                      <Flag aria-hidden="true" className="size-3.5" />
                      {t("disputes.flagged")}
                    </Badge>
                  )}
                </span>
                <span className="text-body-sm text-fg-secondary">
                  {[label(row), row.facility_name, when(row.created_at)].join(" · ")}
                </span>
              </span>
              {due && (
                <span
                  className={cx(
                    "text-body-sm tabular-nums",
                    row.is_overdue ? "font-semibold text-danger" : "text-fg-secondary",
                  )}
                >
                  {row.is_overdue
                    ? t("disputes.overdue")
                    : t(`disputes.facts.${due[0]}`) + " " + when(due[1])}
                </span>
              )}
              <StatusBadge status={row.status} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const TABS = ["open", "overdue", "all"] as const;

/** /disputes: the facility's disputes, oldest deadline first. */
export function DisputesQueuePage() {
  const { t } = useTranslation();
  const api = useApi();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get("tab") ?? "")
    ? (params.get("tab") as (typeof TABS)[number])
    : "open";
  const list = useQuery({
    queryKey: disputesKeys.queue(tab),
    queryFn: () =>
      api.disputes.staff.list(
        tab === "open" ? { status: "open" } : tab === "overdue" ? { overdue: true } : {},
      ),
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("disputes.title")} />
      <div role="group" aria-label={t("disputes.tabs.label")} className="flex flex-wrap gap-2">
        {TABS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setParams(key === "open" ? {} : { tab: key }, { replace: true })}
            className="inline-flex min-h-target cursor-pointer items-center rounded-full border border-border-input bg-surface px-4 text-body-sm font-semibold text-fg hover:bg-subtle aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
          >
            {t(`disputes.tabs.${key}`)}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <Alert tone="danger" role="alert" title={errorText(list.error, t("disputes.failed"))}>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t("disputes.retry")}
          </Button>
        </Alert>
      ) : list.data.results.length ? (
        <Rows rows={list.data.results} base="/disputes" />
      ) : (
        <EmptyState icon={Scales} title={t(`disputes.empty.${tab}`)} />
      )}
    </div>
  );
}

/** /platform/disputes: escalated and platform-level disputes. */
export function PlatformDisputesPage() {
  return (
    <PlatformOnly>
      <PlatformQueue />
    </PlatformOnly>
  );
}

function PlatformQueue() {
  const { t } = useTranslation();
  const api = useApi();
  const list = useQuery({
    queryKey: disputesKeys.platform,
    queryFn: () => api.disputes.platform.list(),
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("disputes.platformTitle")} />
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <Alert tone="danger" role="alert" title={errorText(list.error, t("disputes.failed"))}>
          <Button variant="secondary" onClick={() => void list.refetch()}>
            {t("disputes.retry")}
          </Button>
        </Alert>
      ) : list.data.results.length ? (
        <Rows rows={list.data.results} base="/platform/disputes" />
      ) : (
        <EmptyState icon={Scales} title={t("disputes.empty.platform")} />
      )}
    </div>
  );
}

export function DisputePage() {
  return <Dispute scope="staff" />;
}

export function PlatformDisputePage() {
  return (
    <PlatformOnly>
      <Dispute scope="platform" />
    </PlatformOnly>
  );
}

function Dispute({ scope }: { scope: Scope }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const label = useSubjectLabel();
  const when = useWhen();
  const { disputeId = "" } = useParams();
  const [notice, setNotice] = useState<string | null>(null);
  const dispute = useQuery({
    queryKey: disputesKeys.one(scope, disputeId),
    queryFn: () =>
      scope === "platform"
        ? api.disputes.platform.get(disputeId)
        : api.disputes.staff.get(disputeId),
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 2,
  });
  const back =
    scope === "platform"
      ? { to: "/platform/disputes", label: t("disputes.platformTitle") }
      : { to: "/disputes", label: t("disputes.title") };
  if (dispute.isPending) return <LoadingState />;
  if (dispute.isError)
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title={t("disputes.notFound")} back={back} />
        <EmptyState icon={Scales} title={t("disputes.notFound")} />
      </div>
    );
  const d = dispute.data;
  const store = (next: StaffDispute, message: string) => {
    queryClient.setQueryData(disputesKeys.one(scope, disputeId), next);
    void queryClient.invalidateQueries({ queryKey: ["disputes", "queue"] });
    void queryClient.invalidateQueries({ queryKey: disputesKeys.platform });
    setNotice(message);
  };
  const reload = () =>
    void queryClient.invalidateQueries({ queryKey: disputesKeys.one(scope, disputeId) });
  const due = deadline(d);
  const facts: [string, ReactNode][] = [
    [t("disputes.facts.patient"), d.patient_display_name],
    [t("disputes.facts.facility"), d.facility_name],
    [t("disputes.facts.channel"), t(`disputes.channel.${d.channel}`)],
    [t("disputes.facts.raised"), when(d.created_at)],
    ...(due ? [[t(`disputes.facts.${due[0]}`), when(due[1])] as [string, string]] : []),
    ...Object.entries(d.subject_snapshot)
      .filter(([k, v]) => v !== null && v !== "" && k !== "consultation_id")
      .map(
        ([k, v]) =>
          [t(`disputes.snapshot.${k}`, { defaultValue: k }), String(v)] as [string, string],
      ),
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={label(d)}
        back={back}
        badges={
          <>
            <StatusBadge status={d.status} />
            {d.is_overdue && <Badge tone="danger">{t("disputes.overdue")}</Badge>}
            {d.flagged && <Badge tone="warning">{t("disputes.flagged")}</Badge>}
          </>
        }
      />
      <p role="status" aria-live="polite" className="m-0 text-body-sm font-semibold text-success">
        {notice ?? ""}
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card as="section" aria-labelledby="dispute-what" className="flex flex-col gap-2">
            <h2 id="dispute-what" className="m-0 text-h3">
              {t("disputes.facts.what")}
            </h2>
            <p className="m-0 whitespace-pre-wrap">{d.description}</p>
          </Card>
          {d.outcome && (
            <Card as="section" aria-labelledby="dispute-decision" className="flex flex-col gap-2">
              <h2 id="dispute-decision" className="m-0 text-h3">
                {t(`disputes.outcome.${d.outcome}`)}
              </h2>
              {d.decision_reason && <p className="m-0 whitespace-pre-wrap">{d.decision_reason}</p>}
              {d.actions.map((a) => (
                <p key={a.id} className="m-0 text-body-sm text-fg-secondary">
                  {t(`disputes.action.${a.status}`, { what: t(`disputes.outcome.${a.outcome}`) })}
                </p>
              ))}
              {d.statement && (
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  <span className="text-caption font-semibold text-fg-muted">
                    {t("disputes.statement")}
                  </span>
                  <p className="m-0 whitespace-pre-wrap">{d.statement}</p>
                </div>
              )}
            </Card>
          )}
          <Thread messages={d.messages} />
          {scope === "staff" ? (
            <StaffActions dispute={d} onDone={store} onStale={reload} />
          ) : (
            <PlatformActions dispute={d} onDone={store} onStale={reload} />
          )}
        </div>
        <aside className="flex flex-col gap-5">
          <Card as="section" aria-labelledby="dispute-facts" className="flex flex-col gap-3">
            <h2 id="dispute-facts" className="m-0 text-h3">
              {t("disputes.facts.title")}
            </h2>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-secondary">{k}</dt>
                  <dd className="m-0 font-semibold break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {d.evidence.length > 0 && (
            <Card as="section" aria-labelledby="dispute-evidence" className="flex flex-col gap-3">
              <h2 id="dispute-evidence" className="m-0 text-h3">
                {t("disputes.evidence")}
              </h2>
              <ol className="m-0 flex list-none flex-col gap-2 p-0 text-body-sm">
                {d.evidence.map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex flex-col">
                    <span className="font-mono text-caption">{e.action}</span>
                    <span className="text-fg-secondary">
                      {[when(e.at), e.actor_name].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          <Card as="section" aria-labelledby="dispute-history" className="flex flex-col gap-3">
            <h2 id="dispute-history" className="m-0 text-h3">
              {t("disputes.history")}
            </h2>
            <ol className="m-0 flex list-none flex-col gap-2 p-0 text-body-sm">
              {d.events.map((e, i) => (
                <li key={`${e.occurred_at}-${i}`} className="flex flex-col">
                  <span className="font-semibold">{t(`disputes.status.${e.to_status}`)}</span>
                  <span className="text-fg-secondary">
                    {[when(e.occurred_at), e.actor_name || t("disputes.system"), e.reason]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}

const MESSAGE_STYLE: Record<DisputeMessage["visibility"], string> = {
  thread: "border border-border bg-surface",
  internal: "border border-dashed border-attention bg-attention-bg",
  staff_comment: "border border-border bg-subtle",
};

function Thread({ messages }: { messages: DisputeMessage[] }) {
  const { t } = useTranslation();
  const when = useWhen();
  return (
    <section aria-labelledby="dispute-thread" className="flex flex-col gap-3">
      <h2 id="dispute-thread" className="m-0 text-h3">
        {t("disputes.thread")}
      </h2>
      {messages.length ? (
        <ol aria-label={t("disputes.thread")} className="m-0 flex list-none flex-col gap-3 p-0">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cx(
                "flex flex-col gap-1 rounded-2xl p-3",
                m.author_role === "patient" ? "bg-brand-subtle" : MESSAGE_STYLE[m.visibility],
              )}
            >
              <span className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-fg-secondary">
                {m.author_name}
                {m.visibility !== "thread" && (
                  <Badge tone={m.visibility === "internal" ? "warning" : "neutral"}>
                    {t(`disputes.visibility.${m.visibility}`)}
                  </Badge>
                )}
                <span className="font-normal text-fg-muted">· {when(m.created_at)}</span>
              </span>
              <p className="m-0 whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-fg-secondary">{t("disputes.noMessages")}</p>
      )}
    </section>
  );
}

interface ActionProps {
  dispute: StaffDispute;
  onDone: (next: StaffDispute, message: string) => void;
  onStale: () => void;
}

/** Acknowledge, reply or note, ask the patient, ask a colleague, comment, resolve. */
function StaffActions({ dispute: d, onDone, onStale }: ActionProps) {
  const { t } = useTranslation();
  const api = useApi();
  const { data: me } = useStaffMe();
  const handles = Boolean(me?.permissions.includes("disputes.handle"));
  const myRequest = d.comment_requests.find(
    (r) => !r.responded_at && r.member_name === me?.full_name,
  );
  const failed = (error: unknown) => {
    if (isApiError(error) && error.status === 409) onStale();
  };
  const acknowledge = useMutation({
    mutationFn: () => api.disputes.staff.acknowledge(d.id, d.version),
    onSuccess: (next) => onDone(next, t("disputes.done.acknowledged")),
    onError: failed,
  });
  if (d.status === "closed" || d.status === "final_decision")
    return <Alert tone="info">{t("disputes.closedNote")}</Alert>;
  return (
    <div className="flex flex-col gap-4">
      {myRequest && <CommentForm dispute={d} onDone={onDone} />}
      {handles && (
        <>
          {!d.can_decide && <Alert tone="warning">{t("disputes.involved")}</Alert>}
          {(d.status === "open" || d.status === "reopened") && d.can_decide && (
            <Card className="flex flex-col gap-3">
              <p className="m-0">{t("disputes.acknowledgeHint")}</p>
              {acknowledge.isError && (
                <Alert tone="danger" role="alert">
                  {errorText(acknowledge.error, t("disputes.failed"))}
                </Alert>
              )}
              <Button
                loading={acknowledge.isPending}
                onClick={() => acknowledge.mutate()}
                className="self-start"
              >
                {t("disputes.acknowledge")}
              </Button>
            </Card>
          )}
          <MessageForm dispute={d} onDone={onDone} onStale={onStale} />
          <AskColleague dispute={d} onDone={onDone} />
          {d.can_decide && (d.status === "under_review" || d.status === "info_requested") && (
            <DecisionForm dispute={d} onDone={onDone} onStale={onStale} final={false} />
          )}
        </>
      )}
    </div>
  );
}

function PlatformActions({ dispute: d, onDone, onStale }: ActionProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => api.disputes.platform.message(d.id, text.trim()),
    onSuccess: (next) => {
      setText("");
      onDone(next, t("disputes.done.message"));
    },
  });
  if (d.status === "closed" || d.status === "final_decision")
    return <Alert tone="info">{t("disputes.closedNote")}</Alert>;
  return (
    <div className="flex flex-col gap-4">
      <Card
        as="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim().length >= 2 && !send.isPending) send.mutate();
        }}
        className="flex flex-col gap-3"
      >
        <TextareaField
          label={t("disputes.toPatient")}
          value={text}
          rows={3}
          maxLength={DISPUTE_LIMITS.message[1]}
          error={
            fieldError(send.error, "body") ??
            (send.isError ? errorText(send.error, t("disputes.failed")) : undefined)
          }
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          type="submit"
          loading={send.isPending}
          disabled={text.trim().length < 2}
          className="self-start"
        >
          {t("disputes.send")}
        </Button>
      </Card>
      {d.status === "escalated" && (
        <DecisionForm dispute={d} onDone={onDone} onStale={onStale} final />
      )}
    </div>
  );
}

function MessageForm({ dispute: d, onDone, onStale }: ActionProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"thread" | "internal" | "ask">("thread");
  const canAsk = d.status === "under_review" || d.status === "escalated";
  const send = useMutation({
    mutationFn: () =>
      kind === "ask"
        ? api.disputes.staff.requestInfo(d.id, d.version, text.trim())
        : api.disputes.staff.message(d.id, text.trim(), kind),
    onSuccess: (next) => {
      setText("");
      onDone(next, t(kind === "ask" ? "disputes.done.asked" : "disputes.done.message"));
    },
    onError: (error) => {
      if (isApiError(error) && error.status === 409) onStale();
    },
  });
  return (
    <Card
      as="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim().length >= 2 && !send.isPending) send.mutate();
      }}
      className="flex flex-col gap-3"
    >
      <SelectField
        label={t("disputes.messageKind.label")}
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
      >
        <option value="thread">{t("disputes.messageKind.thread")}</option>
        <option value="internal">{t("disputes.messageKind.internal")}</option>
        {canAsk && <option value="ask">{t("disputes.messageKind.ask")}</option>}
      </SelectField>
      <TextareaField
        label={t("disputes.message")}
        hint={kind === "internal" ? t("disputes.internalHint") : undefined}
        value={text}
        rows={3}
        maxLength={DISPUTE_LIMITS.message[1]}
        error={
          fieldError(send.error, "body") ??
          (send.isError ? errorText(send.error, t("disputes.failed")) : undefined)
        }
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        type="submit"
        loading={send.isPending}
        disabled={text.trim().length < 2}
        className="self-start"
      >
        {t("disputes.send")}
      </Button>
    </Card>
  );
}

function AskColleague({ dispute: d, onDone }: Omit<ActionProps, "onStale">) {
  const { t } = useTranslation();
  const api = useApi();
  const [member, setMember] = useState("");
  const members = useQuery({
    queryKey: ["setup", "members", "disputes"],
    queryFn: () => api.setup.memberships(),
    retry: false,
  });
  const ask = useMutation({
    mutationFn: () => api.disputes.staff.askComment(d.id, member),
    onSuccess: (next) => {
      setMember("");
      onDone(next, t("disputes.done.commentAsked"));
    },
  });
  const people = (members.data?.results ?? []).filter((m) => m.is_active);
  return (
    <Card as="section" aria-labelledby="dispute-colleague" className="flex flex-col gap-3">
      <h2 id="dispute-colleague" className="m-0 text-h3">
        {t("disputes.colleague.title")}
      </h2>
      {d.comment_requests.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
          {d.comment_requests.map((r) => (
            <li key={r.id}>
              {r.member_name} ·{" "}
              {r.responded_at ? t("disputes.colleague.answered") : t("disputes.colleague.waiting")}
            </li>
          ))}
        </ul>
      )}
      {people.length > 0 && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (member && !ask.isPending) ask.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <SelectField
            label={t("disputes.colleague.who")}
            value={member}
            onChange={(e) => setMember(e.target.value)}
            className="min-w-56"
          >
            <option value="">{t("disputes.colleague.choose")}</option>
            {people.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </SelectField>
          <Button type="submit" variant="secondary" loading={ask.isPending} disabled={!member}>
            {t("disputes.colleague.ask")}
          </Button>
        </form>
      )}
      {ask.isError && (
        <Alert tone="danger" role="alert">
          {errorText(ask.error, t("disputes.failed"))}
        </Alert>
      )}
    </Card>
  );
}

function CommentForm({ dispute: d, onDone }: Omit<ActionProps, "onStale">) {
  const { t } = useTranslation();
  const api = useApi();
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => api.disputes.staff.comment(d.id, text.trim()),
    onSuccess: (next) => {
      setText("");
      onDone(next, t("disputes.done.commented"));
    },
  });
  return (
    <Card
      as="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim().length >= 2 && !send.isPending) send.mutate();
      }}
      className="flex flex-col gap-3 border border-attention"
    >
      <TextareaField
        label={t("disputes.colleague.yourComment")}
        hint={t("disputes.colleague.commentHint")}
        value={text}
        rows={3}
        maxLength={DISPUTE_LIMITS.message[1]}
        error={
          fieldError(send.error, "body") ??
          (send.isError ? errorText(send.error, t("disputes.failed")) : undefined)
        }
        onChange={(e) => setText(e.target.value)}
      />
      <Button
        type="submit"
        loading={send.isPending}
        disabled={text.trim().length < 2}
        className="self-start"
      >
        {t("disputes.send")}
      </Button>
    </Card>
  );
}

/** Resolve (facility) or the final decision (platform, step-up): outcome and a reason. */
function DecisionForm({ dispute: d, onDone, onStale, final }: ActionProps & { final: boolean }) {
  const { t } = useTranslation();
  const api = useApi();
  const { withStepUp } = useStepUp();
  const outcomes = outcomesFor(d.subject_type, Boolean(d.subject_snapshot.consultation_id));
  const [outcome, setOutcome] = useState<DisputeOutcome | "">("");
  const [reason, setReason] = useState("");
  const decide = useMutation({
    mutationFn: () => {
      const body = {
        version: d.version,
        outcome: outcome as DisputeOutcome,
        reason: reason.trim(),
      };
      return final
        ? withStepUp(() => api.disputes.platform.finalDecision(d.id, body))
        : api.disputes.staff.resolve(d.id, body);
    },
    onSuccess: (next) => onDone(next, t("disputes.done.decided")),
    onError: (error) => {
      if (isApiError(error) && error.status === 409) onStale();
    },
  });
  const ready = Boolean(outcome) && reason.trim().length >= DISPUTE_LIMITS.reason[0]!;
  return (
    <Card
      as="form"
      noValidate
      aria-labelledby="dispute-decide"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !decide.isPending) decide.mutate();
      }}
      className="flex flex-col gap-3"
    >
      <h2 id="dispute-decide" className="m-0 text-h3">
        {final ? t("disputes.decide.finalTitle") : t("disputes.decide.title")}
      </h2>
      <SelectField
        label={t("disputes.decide.outcome")}
        value={outcome}
        onChange={(e) => setOutcome(e.target.value as DisputeOutcome)}
      >
        <option value="">{t("disputes.decide.choose")}</option>
        {outcomes.map((o) => (
          <option key={o} value={o}>
            {t(`disputes.outcome.${o}`)}
          </option>
        ))}
      </SelectField>
      <TextareaField
        label={t("disputes.decide.reason")}
        hint={t("disputes.decide.reasonHint")}
        value={reason}
        rows={3}
        maxLength={DISPUTE_LIMITS.reason[1]}
        error={fieldError(decide.error, "reason")}
        onChange={(e) => setReason(e.target.value)}
      />
      {decide.isError && !fieldError(decide.error, "reason") && (
        <Alert tone="danger" role="alert">
          {errorText(decide.error, t("disputes.failed"))}
        </Alert>
      )}
      <Button type="submit" loading={decide.isPending} disabled={!ready} className="self-start">
        {final ? t("disputes.decide.finalSubmit") : t("disputes.decide.submit")}
      </Button>
    </Card>
  );
}
