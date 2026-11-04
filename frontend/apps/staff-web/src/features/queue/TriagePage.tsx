import type { PriorityClass, TicketRow, NurseUrgency } from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  cx,
  EmptyState,
  QueueStateBadge,
  SelectField,
  TextareaField,
  TextField,
  TicketNumber,
} from "@medilink/ui";
import {
  ArrowRight,
  MegaphoneSimple,
  Play,
  SpeakerHigh,
  UserMinus,
  UsersThree,
  WarningOctagon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { clinicalKeys } from "../clinical/shared";
import { VitalsPanel } from "../clinical/VitalsPanel";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { LiveBadge } from "./LiveIndicator";
import { actionError, Flags, minutesSince, useServiceNames, useTicketAction } from "./shared";

const URGENCIES: NurseUrgency[] = ["normal", "priority", "emergency"];
const PRIORITY: PriorityClass[] = ["very_sick", "elderly", "pregnant", "disability"];
const mineKey = [...queueKeys.mine, "triage"] as const;

/**
 * /triage (upgrade 06 §2, #200): the triage nurse's station. Call the next patient, take their
 * vitals, decide how urgent they are and send them to the doctor. The nurse sees the patient's
 * words, symptoms and allergies; never diagnoses, notes or bills.
 */
export function TriagePage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  useQueueSocket(true);
  const refetchInterval = usePollInterval();
  const mine = useQuery({
    queryKey: mineKey,
    queryFn: () => api.queue.mine("triage"),
    refetchInterval,
  });
  const act = useTicketAction();
  const [empty, setEmpty] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const data = mine.data;
  const current = data?.current ?? null;
  const next = data?.waiting[0];

  const callNext = useMutation({
    mutationFn: () => api.queue.callNext({ service_id: next!.service_id, stage: "triage" }),
    onSuccess: (ticket) => {
      setEmpty(ticket === null);
      setSent(null);
      void queryClient.invalidateQueries({ queryKey: queueKeys.all });
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <PageHeading title={t("queue.triage.title")}>{t("queue.triage.title")}</PageHeading>
            <LiveBadge />
          </div>
          <p className="m-0 text-fg-muted">{t("queue.triage.lead")}</p>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="triage-current" className="flex min-w-0 flex-col gap-4">
          <h2 id="triage-current" className="sr-only">
            {t("queue.triage.current")}
          </h2>
          {sent && (
            <Alert tone="success" role="status">
              {t("queue.triage.sent", { number: sent })}
            </Alert>
          )}
          {current?.state === "in_service" ? (
            <Workspace
              ticket={current}
              onSent={(number) => {
                setSent(number);
                void queryClient.invalidateQueries({ queryKey: queueKeys.all });
              }}
            />
          ) : current ? (
            <div className="flex flex-col gap-5 rounded-xl bg-attention-bg p-6 shadow-card">
              <PatientLine ticket={current} />
              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
                <Button size="lg" onClick={() => act.mutate({ ticket: current, action: "start" })}>
                  <Play aria-hidden="true" weight="fill" />
                  {t("queue.triage.start")}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => act.mutate({ ticket: current, action: "recall" })}
                >
                  <SpeakerHigh aria-hidden="true" />
                  {t("queue.mine.recall")}
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => act.mutate({ ticket: current, action: "no-response" })}
                >
                  <UserMinus aria-hidden="true" />
                  {t("queue.mine.noResponse")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4 rounded-xl bg-surface p-6 shadow-card">
              {next ? (
                <p className="m-0 flex flex-wrap items-center gap-2 text-fg-secondary">
                  <span className="font-semibold text-fg">{t("queue.mine.nextUp")}</span>
                  <span className="font-heading font-bold tabular-nums">{next.number}</span>
                  <span aria-hidden="true">·</span>
                  {next.display_name}
                </p>
              ) : (
                <p className="m-0 text-fg-secondary">{t("queue.triage.nobody")}</p>
              )}
              <Button
                size="lg"
                disabled={!next || callNext.isPending}
                loading={callNext.isPending}
                onClick={() => callNext.mutate()}
              >
                <MegaphoneSimple aria-hidden="true" weight="fill" />
                {t("queue.mine.callNext")}
              </Button>
              {empty && (
                <p className="m-0 text-body-sm text-fg-muted">{t("queue.triage.nobody")}</p>
              )}
            </div>
          )}
          {(callNext.isError || act.isError) && (
            <Alert tone="danger" role="alert">
              {actionError(callNext.error ?? act.error, t("queue.failed"))}
            </Alert>
          )}
        </section>

        <WaitingList waiting={data?.waiting ?? []} loading={mine.isPending} />
      </div>
    </div>
  );
}

function PatientLine({ ticket }: { ticket: TicketRow }) {
  const { t } = useTranslation();
  const serviceName = useServiceNames();
  return (
    <div className="flex flex-wrap items-center gap-5">
      <TicketNumber
        number={ticket.number}
        size="lg"
        stub
        tone={ticket.state === "called" ? "attention" : "brand"}
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <QueueStateBadge state={ticket.state}>
          {ticket.state === "in_service"
            ? t("queue.triage.inTriage")
            : t(`queue.states.${ticket.state}`)}
        </QueueStateBadge>
        <p className="m-0 font-heading text-h1 font-bold tracking-tight break-words">
          {ticket.display_name}
        </p>
        <p className="m-0 text-fg-muted">
          {[
            ticket.age_years !== null ? t("queue.age", { count: ticket.age_years }) : null,
            ticket.sex ? t(`queue.sex.${ticket.sex}`) : null,
            serviceName(ticket.service_id),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}

/** What the patient said, what they feel, and what they must not be given. */
function Story({ ticket }: { ticket: TicketRow }) {
  const { t } = useTranslation();
  return (
    <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-[10rem_1fr]">
      <dt className="text-body-sm text-fg-muted">{t("queue.triage.words")}</dt>
      <dd className="m-0">
        {ticket.reason_text ? (
          <q className="text-fg">{ticket.reason_text}</q>
        ) : (
          <span className="text-fg-muted">{t("queue.triage.noWords")}</span>
        )}
      </dd>
      {ticket.symptoms.length > 0 && (
        <>
          <dt className="text-body-sm text-fg-muted">{t("queue.triage.symptoms")}</dt>
          <dd className="m-0 flex flex-wrap gap-1.5">
            {ticket.symptoms.map((s) => (
              <Badge key={s} tone="neutral">
                {s}
              </Badge>
            ))}
          </dd>
        </>
      )}
      <dt className="text-body-sm text-fg-muted">{t("queue.triage.allergies")}</dt>
      <dd className="m-0">
        {ticket.allergies.length ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-danger">
            <WarningOctagon aria-hidden="true" weight="fill" className="size-4" />
            {ticket.allergies.join(", ")}
          </span>
        ) : (
          <span className="text-fg-muted">{t("queue.triage.noAllergies")}</span>
        )}
      </dd>
    </dl>
  );
}

function Workspace({ ticket, onSent }: { ticket: TicketRow; onSent: (number: string) => void }) {
  const { t } = useTranslation();
  const api = useApi();
  const act = useTicketAction();
  const [urgency, setUrgency] = useState<NurseUrgency>("normal");
  const [priorityClass, setPriorityClass] = useState<PriorityClass>("very_sick");
  const [danger, setDanger] = useState("");
  const [note, setNote] = useState("");
  const [noVitals, setNoVitals] = useState("");
  const [tried, setTried] = useState(false);
  const vitals = useQuery({
    queryKey: clinicalKeys.vitals(ticket.visit_id),
    queryFn: () => api.clinical.vitals(ticket.visit_id),
  });
  const hasVitals = (vitals.data?.results ?? []).some((v) => !v.is_entered_in_error);
  const missing = {
    danger: urgency === "emergency" && !danger.trim(),
    vitals: !hasVitals && !noVitals.trim(),
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (missing.danger || missing.vitals) return;
    act.mutate(
      {
        ticket,
        action: "triage",
        body: {
          urgency,
          note: note.trim(),
          ...(urgency === "priority"
            ? { priority_class: priorityClass, reason_code: "triage" }
            : {}),
          ...(urgency === "emergency" ? { reason_text: danger.trim() } : {}),
          ...(!hasVitals ? { no_vitals_reason: noVitals.trim() } : {}),
        },
      },
      { onSuccess: () => onSent(ticket.number) },
    );
  }

  return (
    <div className="flex flex-col gap-6 rounded-xl bg-surface p-6 shadow-card sm:p-7">
      <PatientLine ticket={ticket} />
      <Flags ticket={ticket} />
      <Story ticket={ticket} />

      <section aria-labelledby="triage-vitals" className="flex flex-col gap-3">
        <h3 id="triage-vitals" className="m-0 font-heading text-h3">
          {t("queue.triage.vitals")}
        </h3>
        <VitalsPanel visitId={ticket.visit_id} />
      </section>

      <form
        noValidate
        onSubmit={submit}
        aria-labelledby="triage-decision"
        className="flex flex-col gap-4 border-t border-border/60 pt-5"
      >
        <h3 id="triage-decision" className="m-0 font-heading text-h3">
          {t("queue.triage.decision")}
        </h3>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-body-sm font-semibold">
            {t("queue.triage.urgency")}
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {URGENCIES.map((value) => (
              <label
                key={value}
                className={cx(
                  "grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-lg border p-3 transition-colors duration-150",
                  urgency === value
                    ? value === "emergency"
                      ? "border-danger bg-danger-bg"
                      : "border-primary bg-brand-subtle"
                    : "border-border hover:bg-subtle/60",
                )}
              >
                <input
                  type="radio"
                  name="urgency"
                  value={value}
                  checked={urgency === value}
                  onChange={() => setUrgency(value)}
                  aria-describedby={`urgency-${value}-hint`}
                  className="row-span-2 mt-1 size-4 accent-[var(--color-primary)]"
                />
                <span className="font-semibold">{t(`queue.triage.urgencies.${value}`)}</span>
                <span id={`urgency-${value}-hint`} className="text-body-sm text-fg-secondary">
                  {t(`queue.triage.urgencyHints.${value}`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {urgency === "priority" && (
          <SelectField
            label={t("queue.triage.why")}
            value={priorityClass}
            onChange={(e) => setPriorityClass(e.target.value as PriorityClass)}
            className="sm:max-w-xs"
          >
            {PRIORITY.map((value) => (
              <option key={value} value={value}>
                {t(`queue.priority.${value}`)}
              </option>
            ))}
          </SelectField>
        )}
        {urgency === "emergency" && (
          <TextField
            label={t("queue.triage.danger")}
            hint={t("queue.triage.dangerHint")}
            value={danger}
            onChange={(e) => setDanger(e.target.value)}
            error={tried && missing.danger ? t("queue.triage.dangerRequired") : undefined}
          />
        )}
        <TextareaField
          label={t("queue.triage.note")}
          hint={t("queue.triage.noteHint")}
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
        />
        {!hasVitals && !vitals.isPending && (
          <TextField
            label={t("queue.triage.noVitals")}
            hint={t("queue.triage.noVitalsHint")}
            value={noVitals}
            maxLength={200}
            onChange={(e) => setNoVitals(e.target.value)}
            error={tried && missing.vitals ? t("queue.triage.noVitalsRequired") : undefined}
          />
        )}
        {act.isError && (
          <Alert tone="danger" role="alert">
            {actionError(act.error, t("queue.failed"))}
          </Alert>
        )}
        <Button
          type="submit"
          size="lg"
          variant={urgency === "emergency" ? "danger" : "primary"}
          loading={act.isPending}
          className="self-start"
        >
          {t("queue.triage.send")}
          <ArrowRight aria-hidden="true" weight="bold" />
        </Button>
      </form>
    </div>
  );
}

function WaitingList({ waiting, loading }: { waiting: TicketRow[]; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="triage-waiting"
      className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card"
    >
      <h2
        id="triage-waiting"
        className="m-0 flex items-center justify-between px-4 pt-4 pb-2 font-heading text-body font-bold"
      >
        {t("queue.triage.waiting")}
        <span className="rounded-full bg-subtle px-2 py-0.5 text-caption font-semibold text-fg-secondary tabular-nums">
          {waiting.length}
        </span>
      </h2>
      {!loading && waiting.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState
            size="inline"
            icon={UsersThree}
            title={t("queue.mine.nobodyTitle")}
            description={t("queue.triage.nobody")}
          />
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {waiting.map((ticket, index) => (
            <li
              key={ticket.id}
              className="flex items-start gap-3 border-t border-border/60 px-4 py-3"
            >
              <TicketNumber
                number={ticket.number}
                size="sm"
                stub
                tone={
                  ticket.flags.includes("emergency")
                    ? "danger"
                    : index === 0
                      ? "attention"
                      : "brand"
                }
                className="shrink-0"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-semibold">{ticket.display_name}</span>
                {ticket.reason_text && (
                  <span className="line-clamp-2 text-body-sm text-fg-secondary">
                    {ticket.reason_text}
                  </span>
                )}
                <Flags ticket={ticket} />
              </span>
              <span className="text-caption text-fg-muted tabular-nums">
                {t("queue.minutes", { count: minutesSince(ticket.arrival_at) })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
