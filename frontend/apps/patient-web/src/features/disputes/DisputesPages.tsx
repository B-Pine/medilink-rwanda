import {
  DISPUTE_LIMITS,
  isApiError,
  type DisputeRow,
  type DisputeStatus,
  type DisputeSubjectType,
  type PatientDispute,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  EmptyState,
  Skeleton,
  TextareaField,
  type BadgeTone,
} from "@medilink/ui";
import { ChatsCircle, Scales } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { paths } from "../../app/paths";
import { useApi } from "../../app/services";
import {
  ErrorBlock,
  PageHeader,
  panelClass,
  RowIcon,
  RowLink,
  RowList,
  RowsSkeleton,
} from "../dashboard/kit";
import { useProfiles } from "../profile/ProfileLayout";
import { useDate } from "../records/RecordsPages";
import { disputesKeys, useMyDisputes } from "./shared";

const STATUS_TONE: Record<DisputeStatus, BadgeTone> = {
  open: "info",
  acknowledged: "info",
  under_review: "info",
  info_requested: "warning",
  resolved: "warning",
  escalated: "info",
  final_decision: "warning",
  closed: "neutral",
  reopened: "info",
};

const SUBJECTS: readonly DisputeSubjectType[] = [
  "visit",
  "ticket",
  "booking",
  "no_show_strike",
  "prescription",
  "bill",
  "document",
];
const isSubject = (value: string | null): value is DisputeSubjectType =>
  SUBJECTS.includes(value as DisputeSubjectType);

const errorText = (error: unknown, fallback: string) =>
  isApiError(error) ? error.message : fallback;
const fieldError = (error: unknown, field: string) =>
  isApiError(error) ? error.fields[field]?.[0] : undefined;

/** "Bill · 1,200 RWF", "Booking KC-7Q2M": what the dispute is about, from its frozen facts. */
function useSubjectLabel() {
  const { t } = useTranslation();
  return (row: Pick<DisputeRow, "subject_type" | "subject_snapshot">) => {
    const s = row.subject_snapshot;
    const ref = s.number ?? s.booking_code ?? s.ticket_number;
    return [t(`disputes.subject.${row.subject_type}`), ref].filter(Boolean).join(" ");
  };
}

/** /dashboard/disputes: my and my dependants' disputes, newest first (S10b-F1). */
export function DisputesPage() {
  const { t } = useTranslation();
  const date = useDate();
  const label = useSubjectLabel();
  const profiles = useProfiles();
  const list = useMyDisputes();
  const people = profiles.data?.results ?? [];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("disputes.title")} />
      {list.isPending ? (
        <RowsSkeleton />
      ) : list.isError ? (
        <ErrorBlock message={t("disputes.failed")} onRetry={() => void list.refetch()} />
      ) : list.data.results.length ? (
        <RowList label={t("disputes.title")}>
          {list.data.results.map((row) => (
            <RowLink
              key={row.id}
              to={paths.dispute(row.id)}
              leading={
                <RowIcon icon={Scales} tone={row.status === "closed" ? "neutral" : "brand"} />
              }
              title={label(row)}
              meta={[
                row.facility_name,
                date(row.created_at),
                people.length > 1 ? row.patient_display_name : undefined,
                t(`disputes.status.${row.status}`),
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                <Badge tone={STATUS_TONE[row.status]}>{t(`disputes.status.${row.status}`)}</Badge>
              }
            />
          ))}
        </RowList>
      ) : (
        <EmptyState icon={Scales} title={t("disputes.empty")} />
      )}
    </div>
  );
}

/**
 * /dashboard/disputes/new?subject_type=&subject_id=&patient_id= (S10b-F1): reached from the
 * thing that went wrong ("Report a problem" on a bill, a prescription, a document); the patient
 * says what happened in their own words.
 */
export function NewDisputePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const subjectType = params.get("subject_type");
  const subjectId = params.get("subject_id") ?? "";
  const patientId = params.get("patient_id") ?? "";
  const [text, setText] = useState("");
  const raise = useMutation({
    mutationFn: () =>
      api.disputes.patient.raise({
        patient_id: patientId,
        subject_type: subjectType as DisputeSubjectType,
        subject_id: subjectId,
        description: text.trim(),
      }),
    onSuccess: (created) => {
      queryClient.setQueryData(disputesKeys.detail(created.id), created);
      void queryClient.invalidateQueries({ queryKey: disputesKeys.list });
      void navigate(paths.dispute(created.id), { replace: true });
    },
  });
  const back = { to: paths.disputes, label: t("disputes.title") };
  if (!isSubject(subjectType) || !subjectId || !patientId)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("disputes.new.title")} back={back} />
        <Alert tone="info">{t("disputes.new.fromSubject")}</Alert>
      </div>
    );
  const [min, max] = DISPUTE_LIMITS.description;
  const tooShort = text.trim().length < min!;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!tooShort && !raise.isPending) raise.mutate();
  };
  return (
    <div className="flex max-w-[40rem] flex-col gap-6">
      <PageHeader
        title={t("disputes.new.title")}
        subtitle={t(`disputes.subject.${subjectType}`)}
        back={back}
      />
      <form noValidate onSubmit={submit} className={cx(panelClass, "flex flex-col gap-4 p-5")}>
        <TextareaField
          label={t("disputes.new.what")}
          hint={t("disputes.new.hint", { min })}
          value={text}
          rows={6}
          maxLength={max}
          error={fieldError(raise.error, "description")}
          onChange={(e) => setText(e.target.value)}
        />
        {raise.isError && !fieldError(raise.error, "description") && (
          <Alert tone="danger" role="alert">
            {errorText(raise.error, t("disputes.failed"))}
          </Alert>
        )}
        <Button type="submit" loading={raise.isPending} disabled={tooShort} className="self-start">
          {t("disputes.new.send")}
        </Button>
      </form>
    </div>
  );
}

/** /dashboard/disputes/:id: facts, the facility's answer, the thread and what I can do next. */
export function DisputePage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const label = useSubjectLabel();
  const queryClient = useQueryClient();
  const { disputeId = "" } = useParams();
  const [notice, setNotice] = useState<string | null>(null);
  const dispute = useQuery({
    queryKey: disputesKeys.detail(disputeId),
    queryFn: () => api.disputes.patient.get(disputeId),
    retry: (count, error) => !(isApiError(error) && error.status === 404) && count < 2,
  });
  const store = (next: PatientDispute, message: string) => {
    queryClient.setQueryData(disputesKeys.detail(disputeId), next);
    void queryClient.invalidateQueries({ queryKey: disputesKeys.list });
    setNotice(message);
  };
  const step = useMutation({
    mutationFn: (kind: "accept" | "escalate" | "reopen") =>
      api.disputes.patient[kind](disputeId, dispute.data!.version),
    onSuccess: (next, kind) => store(next, t(`disputes.done.${kind}`)),
    onError: (error) => {
      if (isApiError(error) && error.status === 409)
        void queryClient.invalidateQueries({ queryKey: disputesKeys.detail(disputeId) });
    },
  });
  const back = { to: paths.disputes, label: t("disputes.title") };
  if (dispute.isPending)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton height="2.5rem" width="50%" />
        <Skeleton height="10rem" className="rounded-2xl" />
      </div>
    );
  if (dispute.isError)
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("disputes.notFound")} back={back} />
        <Alert tone="danger">{t("disputes.notFound")}</Alert>
      </div>
    );
  const d = dispute.data;
  const deadline =
    d.status === "open" || d.status === "reopened"
      ? [t("disputes.facts.answerBy"), date(d.acknowledge_by, true)]
      : d.decide_by &&
          (d.status === "acknowledged" ||
            d.status === "under_review" ||
            d.status === "info_requested")
        ? [t("disputes.facts.decisionBy"), date(d.decide_by, true)]
        : null;
  const facts: [string, string][] = [
    [t("disputes.facts.facility"), d.facility_name],
    [t("disputes.facts.raised"), date(d.created_at)],
    ...(deadline ? [deadline as [string, string]] : []),
  ];
  const decided = Boolean(d.outcome);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={label(d)}
        subtitle={d.patient_display_name}
        back={back}
        actions={<Badge tone={STATUS_TONE[d.status]}>{t(`disputes.status.${d.status}`)}</Badge>}
      />
      <p role="status" aria-live="polite" className="m-0 text-body-sm font-semibold text-success">
        {notice ?? ""}
      </p>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {decided && (
            <section
              aria-labelledby="dispute-answer"
              className={cx(panelClass, "flex flex-col gap-3 p-5")}
            >
              <h2 id="dispute-answer" className="m-0 font-heading text-h3 font-bold">
                {t(`disputes.outcome.${d.outcome}`)}
              </h2>
              {d.decision_reason && <p className="m-0 whitespace-pre-wrap">{d.decision_reason}</p>}
              {(d.can_accept || d.can_escalate || d.can_reopen) && (
                <div className="flex flex-wrap gap-2">
                  {d.can_accept && (
                    <Button
                      loading={step.isPending && step.variables === "accept"}
                      disabled={step.isPending}
                      onClick={() => step.mutate("accept")}
                    >
                      {t("disputes.actions.accept")}
                    </Button>
                  )}
                  {d.can_escalate && (
                    <Button
                      variant="secondary"
                      loading={step.isPending && step.variables === "escalate"}
                      disabled={step.isPending}
                      onClick={() => step.mutate("escalate")}
                    >
                      {t("disputes.actions.escalate")}
                    </Button>
                  )}
                  {d.can_reopen && (
                    <Button
                      variant="secondary"
                      loading={step.isPending && step.variables === "reopen"}
                      disabled={step.isPending}
                      onClick={() => step.mutate("reopen")}
                    >
                      {t("disputes.actions.reopen")}
                    </Button>
                  )}
                </div>
              )}
              {step.isError && (
                <Alert tone="danger" role="alert">
                  {errorText(step.error, t("disputes.failed"))}
                </Alert>
              )}
              {d.statement ? (
                <div className="flex flex-col gap-1 border-t border-border pt-3">
                  <span className="text-caption font-semibold text-fg-muted">
                    {t("disputes.statement.yours")}
                  </span>
                  <p className="m-0 whitespace-pre-wrap">{d.statement}</p>
                </div>
              ) : (
                d.can_add_statement && <Statement dispute={d} onDone={store} />
              )}
            </section>
          )}
          <Thread dispute={d} onSent={store} />
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <dl className={cx(panelClass, "m-0 flex flex-col gap-3 p-5")}>
            {facts.map(([k, v]) => (
              <div key={k} className="flex flex-col gap-0.5">
                <dt className="text-caption font-semibold text-fg-muted">{k}</dt>
                <dd className="m-0 font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <section
            aria-labelledby="dispute-what"
            className={cx(panelClass, "flex flex-col gap-2 p-5")}
          >
            <h2 id="dispute-what" className="m-0 text-caption font-semibold text-fg-muted">
              {t("disputes.facts.what")}
            </h2>
            <p className="m-0 whitespace-pre-wrap">{d.description}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** The patient's statement after a refused correction (FR-DSP-07); kept with the record. */
function Statement({
  dispute: d,
  onDone,
}: {
  dispute: PatientDispute;
  onDone: (next: PatientDispute, message: string) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [text, setText] = useState("");
  const save = useMutation({
    mutationFn: () => api.disputes.patient.disagreement(d.id, text.trim()),
    onSuccess: (next) => onDone(next, t("disputes.done.statement")),
  });
  const [min, max] = DISPUTE_LIMITS.description;
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim().length >= min! && !save.isPending) save.mutate();
      }}
      className="flex flex-col gap-3 border-t border-border pt-3"
    >
      <TextareaField
        label={t("disputes.statement.label")}
        hint={t("disputes.statement.hint")}
        value={text}
        rows={4}
        maxLength={max}
        error={fieldError(save.error, "statement")}
        onChange={(e) => setText(e.target.value)}
      />
      {save.isError && !fieldError(save.error, "statement") && (
        <Alert tone="danger" role="alert">
          {errorText(save.error, t("disputes.failed"))}
        </Alert>
      )}
      <Button
        type="submit"
        variant="secondary"
        loading={save.isPending}
        disabled={text.trim().length < min!}
        className="self-start"
      >
        {t("disputes.statement.send")}
      </Button>
    </form>
  );
}

function Thread({
  dispute: d,
  onSent,
}: {
  dispute: PatientDispute;
  onSent: (next: PatientDispute, message: string) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const [reply, setReply] = useState("");
  const send = useMutation({
    mutationFn: () => api.disputes.patient.message(d.id, reply.trim()),
    onSuccess: (next) => {
      setReply("");
      onSent(next, t("disputes.done.message"));
    },
  });
  const open = d.status !== "closed";
  return (
    <section aria-labelledby="dispute-thread" className="flex flex-col gap-3">
      <h2 id="dispute-thread" className="m-0 font-heading text-h3 font-bold">
        {t("disputes.thread.title")}
      </h2>
      {d.status === "info_requested" && (
        <Alert tone="warning">{t("disputes.thread.infoRequested")}</Alert>
      )}
      {d.messages.length > 0 && (
        <ol
          aria-label={t("disputes.thread.title")}
          className="m-0 flex list-none flex-col gap-3 p-0"
        >
          {d.messages.map((m) => {
            const mine = m.author_role === "patient";
            return (
              <li key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "flex max-w-[85%] flex-col gap-1 rounded-2xl p-3",
                    mine ? "bg-brand-subtle" : "border border-border bg-surface",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-x-2 text-body-sm font-semibold text-fg-secondary">
                    {!mine && <ChatsCircle aria-hidden="true" />}
                    {mine ? t("disputes.thread.you") : m.author_name}
                    <span className="font-normal text-fg-muted">· {date(m.created_at, true)}</span>
                  </span>
                  <p className="m-0 whitespace-pre-wrap">{m.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {open && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (reply.trim().length >= 2 && !send.isPending) send.mutate();
          }}
          className={cx(panelClass, "flex flex-col gap-3 p-4")}
        >
          <TextareaField
            label={t("disputes.thread.reply")}
            value={reply}
            rows={3}
            maxLength={DISPUTE_LIMITS.message[1]}
            error={
              fieldError(send.error, "body") ??
              (send.isError ? errorText(send.error, t("disputes.failed")) : undefined)
            }
            onChange={(e) => setReply(e.target.value)}
          />
          <Button
            type="submit"
            loading={send.isPending}
            disabled={reply.trim().length < 2}
            className="self-start"
          >
            {t("disputes.thread.send")}
          </Button>
        </form>
      )}
    </section>
  );
}
