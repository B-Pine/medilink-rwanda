import {
  isApiError,
  type DisputeStatus,
  type DisputeSubjectType,
  type PatientDispute,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
  TextareaField,
  type BadgeTone,
} from "@medilink/ui";
import { ArrowLeft, CaretRight, Scales } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { useDate } from "../records/RecordsPages";

export const disputesKeys = {
  list: ["disputes", "list"] as const,
  one: (id: string) => ["disputes", "one", id] as const,
};

const TONE: Record<DisputeStatus, BadgeTone> = {
  open: "warning",
  acknowledged: "info",
  under_review: "info",
  info_requested: "warning",
  resolved: "brand",
  escalated: "info",
  final_decision: "brand",
  closed: "neutral",
  reopened: "warning",
};

const SUBJECTS: DisputeSubjectType[] = [
  "visit",
  "ticket",
  "booking",
  "no_show_strike",
  "prescription",
  "bill",
  "document",
];

/** /disputes (S10b-F1, FR-DSP-01, 03): my disputes and where each one stands. */
export function DisputesPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const list = useQuery({
    queryKey: disputesKeys.list,
    queryFn: () => api.disputes.patient.list(),
  });
  const rows = list.data?.results ?? [];
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <PageHeading title={t("disputes.title")}>{t("disputes.title")}</PageHeading>
      <p className="m-0 text-fg-secondary">{t("disputes.intro")}</p>
      {list.isPending ? (
        <Skeleton height="5rem" className="rounded-lg" />
      ) : list.isError ? (
        <Alert tone="danger">{t("disputes.failed")}</Alert>
      ) : rows.length ? (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/disputes/${row.id}`}
                className="flex items-center gap-4 rounded-xl bg-surface p-4 text-fg no-underline shadow-card hover:shadow-raised"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-subtle text-on-brand-subtle">
                  <Scales aria-hidden="true" weight="duotone" className="size-6" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">
                      {t(`disputes.subject.${row.subject_type}`)}
                    </span>
                    <Badge tone={TONE[row.status]}>{t(`disputes.status.${row.status}`)}</Badge>
                  </span>
                  <span className="text-body-sm text-fg-muted">
                    {row.facility_name} · {date(row.created_at)}
                  </span>
                </span>
                <CaretRight aria-hidden="true" className="size-icon text-fg-muted" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Scales}
          title={t("disputes.empty")}
          description={t("disputes.emptyBody")}
        />
      )}
    </div>
  );
}

/** /disputes/new?subject_type=&subject_id=&patient_id= (S10b-F1): what went wrong, in words. */
export function NewDisputePage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const subjectType = params.get("subject_type") as DisputeSubjectType | null;
  const subjectId = params.get("subject_id") ?? "";
  const patientId = params.get("patient_id") ?? "";
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const raise = useMutation({
    mutationFn: () =>
      api.disputes.patient.raise({
        patient_id: patientId,
        subject_type: subjectType!,
        subject_id: subjectId,
        description: text.trim(),
      }),
    onSuccess: async (d) => {
      await queryClient.invalidateQueries({ queryKey: disputesKeys.list });
      void navigate(`/disputes/${d.id}`);
    },
  });
  const valid = subjectType && SUBJECTS.includes(subjectType) && subjectId && patientId;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (text.trim().length >= 10) raise.mutate();
  };
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <Link to="/disputes" className="inline-flex items-center gap-2 self-start font-semibold">
        <ArrowLeft aria-hidden="true" className="size-icon" />
        {t("disputes.back")}
      </Link>
      <PageHeading title={t("disputes.newTitle")}>{t("disputes.newTitle")}</PageHeading>
      {!valid ? (
        <Alert tone="warning">{t("disputes.fromItem")}</Alert>
      ) : (
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <p className="m-0 text-fg-secondary">
            {t("disputes.about", { what: t(`disputes.subject.${subjectType}`) })}
          </p>
          <TextareaField
            label={t("disputes.whatWrong")}
            hint={t("disputes.whatWrongHint")}
            rows={5}
            maxLength={3000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={tried && text.trim().length < 10 ? t("disputes.tooShort") : undefined}
          />
          <Alert tone="info">{t("disputes.clinicalNote")}</Alert>
          {raise.isError && (
            <Alert tone="danger" role="alert">
              {isApiError(raise.error) ? raise.error.message : t("disputes.failed")}
            </Alert>
          )}
          <Button type="submit" className="self-start" loading={raise.isPending}>
            {t("disputes.send")}
          </Button>
        </form>
      )}
    </div>
  );
}

/** /disputes/:id (S10b-F1): the thread, deadlines, and what I can do now. */
export function DisputeDetailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const date = useDate();
  const queryClient = useQueryClient();
  const { disputeId = "" } = useParams();
  const [text, setText] = useState("");
  const [statement, setStatement] = useState("");
  const key = disputesKeys.one(disputeId);
  const dispute = useQuery({ queryKey: key, queryFn: () => api.disputes.patient.get(disputeId) });
  const set = (data: PatientDispute) => {
    queryClient.setQueryData(key, data);
    void queryClient.invalidateQueries({ queryKey: disputesKeys.list });
  };
  const act = useMutation({
    mutationFn: (step: "message" | "accept" | "escalate" | "reopen" | "statement") => {
      const d = dispute.data!;
      const p = api.disputes.patient;
      if (step === "message") return p.message(d.id, text.trim());
      if (step === "statement") return p.statement(d.id, statement.trim());
      return p[step](d.id, d.version);
    },
    onSuccess: (data, step) => {
      set(data);
      if (step === "message") setText("");
    },
  });
  if (dispute.isPending) return <Skeleton height="10rem" className="rounded-lg" />;
  if (dispute.isError) return <Alert tone="danger">{t("disputes.notFound")}</Alert>;
  const d = dispute.data;
  const closed = d.status === "closed" || d.status === "final_decision";
  const send = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length >= 2) act.mutate("message");
  };
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-6">
      <Link to="/disputes" className="inline-flex items-center gap-2 self-start font-semibold">
        <ArrowLeft aria-hidden="true" className="size-icon" />
        {t("disputes.back")}
      </Link>
      <div className="flex flex-col gap-2">
        <PageHeading title={t(`disputes.subject.${d.subject_type}`)}>
          {t(`disputes.subject.${d.subject_type}`)}
        </PageHeading>
        <p className="m-0 flex flex-wrap items-center gap-2 text-fg-secondary">
          <Badge tone={TONE[d.status]}>{t(`disputes.status.${d.status}`)}</Badge>
          <span>
            {d.facility_name} · {date(d.created_at)}
          </span>
        </p>
        <p className="m-0 text-body-sm text-fg-muted">{t(`disputes.next.${d.status}`)}</p>
      </div>
      <Card className="flex flex-col gap-2">
        <span className="text-caption font-semibold tracking-wide text-fg-muted uppercase">
          {t("disputes.youSaid")}
        </span>
        <p className="m-0 whitespace-pre-wrap">{d.description}</p>
      </Card>
      {d.decision_reason && (
        <Alert tone="info" title={t(`disputes.outcome.${d.outcome || "rejected"}`)}>
          {d.decision_reason}
        </Alert>
      )}
      {act.isError && (
        <Alert tone="danger" role="alert">
          {isApiError(act.error) ? act.error.message : t("disputes.failed")}
        </Alert>
      )}
      {(d.can_accept || d.can_escalate || d.can_reopen) && (
        <div className="flex flex-wrap gap-2">
          {d.can_accept && (
            <Button loading={act.isPending} onClick={() => act.mutate("accept")}>
              {t("disputes.accept")}
            </Button>
          )}
          {d.can_escalate && (
            <Button variant="secondary" onClick={() => act.mutate("escalate")}>
              {t("disputes.escalate")}
            </Button>
          )}
          {d.can_reopen && (
            <Button variant="secondary" onClick={() => act.mutate("reopen")}>
              {t("disputes.reopen")}
            </Button>
          )}
        </div>
      )}
      {d.can_add_statement && (
        <Card className="flex flex-col gap-3">
          <TextareaField
            label={t("disputes.statement")}
            hint={t("disputes.statementHint")}
            rows={4}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
          <Button
            className="self-start"
            variant="secondary"
            disabled={statement.trim().length < 10}
            onClick={() => act.mutate("statement")}
          >
            {t("disputes.addStatement")}
          </Button>
        </Card>
      )}
      {d.statement && (
        <Alert tone="info" title={t("disputes.statementAdded")}>
          {d.statement}
        </Alert>
      )}
      <section aria-labelledby="thread-title" className="flex flex-col gap-3">
        <h2 id="thread-title" className="m-0 text-h3">
          {t("disputes.thread")}
        </h2>
        {d.messages.length ? (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {d.messages.map((m) => (
              <li
                key={m.id}
                className={
                  m.author_role === "patient"
                    ? "ml-8 rounded-lg bg-brand-subtle p-3"
                    : "mr-8 rounded-lg bg-surface p-3 shadow-card"
                }
              >
                <p className="m-0 text-body-sm text-fg-muted">
                  {m.author_name} · {date(m.created_at, true)}
                </p>
                <p className="m-0 mt-1 whitespace-pre-wrap">{m.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-fg-muted">{t("disputes.noMessages")}</p>
        )}
        {!closed && (
          <form noValidate onSubmit={send} className="flex flex-col gap-2">
            <TextareaField
              label={t("disputes.reply")}
              rows={3}
              maxLength={3000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              className="self-start"
              loading={act.isPending}
            >
              {t("disputes.sendReply")}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

/** "Report a problem" link for an item page (S10b-F1, FR-DSP-01). */
export function ReportProblemLink({
  subjectType,
  subjectId,
  patientId,
}: {
  subjectType: DisputeSubjectType;
  subjectId: string;
  patientId: string;
}) {
  const { t } = useTranslation();
  const q = new URLSearchParams({
    subject_type: subjectType,
    subject_id: subjectId,
    patient_id: patientId,
  });
  return (
    <Link to={`/disputes/new?${q.toString()}`} className="self-start text-body-sm font-semibold">
      {t("disputes.report")}
    </Link>
  );
}
