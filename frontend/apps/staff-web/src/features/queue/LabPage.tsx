import {
  isApiError,
  type LabCatalogueItem,
  type LabCatalogueTest,
  type LabFlag,
  type LabOrder,
  type LabVisit,
  type TicketRow,
} from "@medilink/api-client";
import {
  Alert,
  Badge,
  Button,
  ChoiceGroup,
  EmptyState,
  QueueStateBadge,
  SelectField,
  TextField,
  TicketNumber,
} from "@medilink/ui";
import {
  CheckCircle,
  CurrencyCircleDollar,
  Drop,
  IdentificationCard,
  MegaphoneSimple,
  Play,
  SpeakerHigh,
  TestTube,
  UserMinus,
  UsersThree,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import {
  LabFlagBadge,
  labKeys,
  LabResultTable,
  LabStateBadge,
  rangeText,
  useLabTests,
} from "../clinical/LabShared";
import { useWhen } from "../clinical/shared";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { LiveBadge } from "./LiveIndicator";
import { actionError, minutesSince, useServiceNames, useTicketAction } from "./shared";

/** Result choices shown as one row of pills; longer lists keep the drop-down. */
const MAX_CHOICE_PILLS = 6;

const mineKey = [...queueKeys.mine, "lab"] as const;

/** A live flag while the technician types, as the API computes it. */
function flagOf(item: LabCatalogueItem, value: string): LabFlag | null {
  if (!value.trim()) return null;
  if (item.kind === "number") {
    const v = Number(value.replace(",", "."));
    if (!Number.isFinite(v)) return null;
    if (item.low !== null && v < Number(item.low)) return "low";
    if (item.high !== null && v > Number(item.high)) return "high";
    return null;
  }
  return item.normal !== null && value !== item.normal ? "abnormal" : null;
}

/**
 * /lab (upgrade 06 §3, #201): the laboratory technician's station. Call the next patient, check
 * who they are, take the samples, then enter each result; the last result sends the patient back
 * to the doctor. The lab sees the tests, the doctor's request, the patient's identity and whether
 * the visit is paid; never diagnoses, notes or other visits, and never releases a result.
 */
export function LabPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  useQueueSocket(true);
  const refetchInterval = usePollInterval();
  const mine = useQuery({
    queryKey: mineKey,
    queryFn: () => api.queue.mine("lab"),
    refetchInterval,
  });
  const queue = useQuery({
    queryKey: labKeys.queue,
    queryFn: () => api.clinical.lab.queue(),
    refetchInterval: refetchInterval || 30_000,
  });
  const tests = useLabTests();
  const act = useTicketAction();
  const [empty, setEmpty] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const current = mine.data?.current ?? null;
  const next = mine.data?.waiting[0];
  const visits = [
    ...(queue.data?.waiting ?? []),
    ...(queue.data?.in_progress ?? []),
    ...(queue.data?.done_today ?? []),
  ];
  const visitOf = (visitId: string) => visits.find((v) => v.visit_id === visitId);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queueKeys.all });
    void queryClient.invalidateQueries({ queryKey: labKeys.queue });
  };

  const callNext = useMutation({
    mutationFn: () => api.queue.callNext({ service_id: next!.service_id, stage: "lab" }),
    onSuccess: (ticket) => {
      setEmpty(ticket === null);
      setNotice(null);
      refresh();
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <PageHeading title={t("queue.lab.title")}>{t("queue.lab.title")}</PageHeading>
            <LiveBadge />
          </div>
          <p className="m-0 text-fg-muted">{t("queue.lab.lead")}</p>
        </div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="lab-current" className="flex flex-col gap-4">
            <h2 id="lab-current" className="sr-only">
              {t("queue.lab.current")}
            </h2>
            {notice && (
              <Alert tone="success" role="status">
                {notice}
              </Alert>
            )}
            {current?.state === "in_service" ? (
              <Sampling
                ticket={current}
                visit={visitOf(current.visit_id)}
                onDone={(name) => {
                  setNotice(t("queue.lab.samplesDone", { name }));
                  refresh();
                }}
              />
            ) : current ? (
              <div className="flex flex-col gap-5 rounded-xl bg-attention-bg p-6 shadow-card">
                <PatientLine ticket={current} />
                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
                  <Button
                    size="lg"
                    onClick={() => act.mutate({ ticket: current, action: "start" })}
                  >
                    <Play aria-hidden="true" weight="fill" />
                    {t("queue.lab.start")}
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
                  <p className="m-0 text-fg-secondary">{t("queue.lab.nobody")}</p>
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
                {empty && <p className="m-0 text-body-sm text-fg-muted">{t("queue.lab.nobody")}</p>}
              </div>
            )}
            {(callNext.isError || act.isError) && (
              <Alert tone="danger" role="alert">
                {actionError(callNext.error ?? act.error, t("queue.failed"))}
              </Alert>
            )}
          </section>

          <ResultsToEnter
            visits={queue.data?.in_progress ?? []}
            tests={tests.data ?? []}
            loading={queue.isPending}
            onSaved={(message) => {
              setNotice(message);
              refresh();
            }}
          />
        </div>

        <div className="flex flex-col gap-5">
          <WaitingList
            waiting={mine.data?.waiting ?? []}
            loading={mine.isPending}
            visitOf={visitOf}
          />
          <DoneToday visits={queue.data?.done_today ?? []} />
        </div>
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
          {ticket.state === "in_service" ? t("queue.lab.inLab") : t(`queue.states.${ticket.state}`)}
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

/** Who the patient is (checked aloud before the sample) and whether the visit is paid. */
function Identity({ visit }: { visit: LabVisit }) {
  const { t } = useTranslation();
  const when = useWhen();
  const p = visit.patient;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-subtle/60 p-4">
      <h3 className="m-0 flex items-center gap-2 text-body-sm font-semibold">
        <IdentificationCard aria-hidden="true" weight="bold" className="size-icon" />
        {t("queue.lab.identity")}
      </h3>
      <dl className="m-0 grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
        <dt className="text-body-sm text-fg-muted">{t("queue.lab.fullName")}</dt>
        <dd className="m-0 font-semibold">{p.full_name}</dd>
        {p.date_of_birth && (
          <>
            <dt className="text-body-sm text-fg-muted">{t("queue.lab.born")}</dt>
            <dd className="m-0 tabular-nums">{when.date(p.date_of_birth)}</dd>
          </>
        )}
        {p.medilink_number && (
          <>
            <dt className="text-body-sm text-fg-muted">{t("queue.lab.medilinkNumber")}</dt>
            <dd className="m-0 font-mono">{p.medilink_number}</dd>
          </>
        )}
        <dt className="text-body-sm text-fg-muted">{t("queue.lab.payment")}</dt>
        <dd className="m-0">
          <Payment unpaid={visit.unpaid} />
        </dd>
      </dl>
    </div>
  );
}

function Payment({ unpaid }: { unpaid: boolean }) {
  const { t } = useTranslation();
  return unpaid ? (
    <Badge tone="warning" icon={CurrencyCircleDollar}>
      {t("queue.lab.unpaid")}
    </Badge>
  ) : (
    <Badge tone="success" icon={CheckCircle}>
      {t("queue.lab.paid")}
    </Badge>
  );
}

function OrderLine({ order }: { order: LabOrder }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="font-semibold">{order.test_name}</span>
      <span className="text-body-sm text-fg-secondary">
        {[
          order.specimen ? t(`clinical.lab.specimens.${order.specimen}`) : null,
          order.ordered_by_name ? t("queue.lab.orderedBy", { name: order.ordered_by_name }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {order.reason && (
        <span className="text-body-sm">
          <span className="text-fg-muted">{t("queue.lab.request")}</span> {order.reason}
        </span>
      )}
    </div>
  );
}

/** The patient with the technician: confirm identity, take each sample. */
function Sampling({
  ticket,
  visit,
  onDone,
}: {
  ticket: TicketRow;
  visit: LabVisit | undefined;
  onDone: (name: string) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const sample = useMutation({
    mutationFn: (order: LabOrder) => api.clinical.lab.sample(order),
    onSuccess: (done) => {
      const left = (visit?.orders ?? []).filter((o) => o.state === "ordered" && o.id !== done.id);
      if (!left.length) onDone(ticket.display_name);
      else void queryClient.invalidateQueries({ queryKey: labKeys.queue });
    },
  });
  return (
    <div className="flex flex-col gap-6 rounded-xl bg-surface p-6 shadow-card sm:p-7">
      <PatientLine ticket={ticket} />
      {visit ? (
        <>
          <Identity visit={visit} />
          <section aria-labelledby="lab-samples" className="flex flex-col gap-3">
            <h3 id="lab-samples" className="m-0 font-heading text-h3">
              {t("queue.lab.samples")}
            </h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {visit.orders.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-subtle text-on-brand-subtle">
                    <Drop aria-hidden="true" weight="bold" className="size-[1.125rem]" />
                  </span>
                  <OrderLine order={order} />
                  {order.state === "ordered" ? (
                    <Button
                      pill
                      loading={sample.isPending && sample.variables?.id === order.id}
                      onClick={() => sample.mutate(order)}
                      aria-label={`${t("queue.lab.sample")}: ${order.test_name}`}
                    >
                      <CheckCircle aria-hidden="true" weight="bold" />
                      {t("queue.lab.sample")}
                    </Button>
                  ) : (
                    <LabStateBadge state={order.state} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="m-0 text-fg-muted">{t("queue.lab.loadingTests")}</p>
      )}
      {sample.isError && (
        <Alert tone="danger" role="alert">
          {actionError(sample.error, t("queue.failed"))}
        </Alert>
      )}
    </div>
  );
}

/** Samples taken: one result form per test. */
function ResultsToEnter({
  visits,
  tests,
  loading,
  onSaved,
}: {
  visits: LabVisit[];
  tests: LabCatalogueTest[];
  loading: boolean;
  onSaved: (message: string) => void;
}) {
  const { t } = useTranslation();
  const count = visits.reduce(
    (n, v) => n + v.orders.filter((o) => o.state === "sample_taken").length,
    0,
  );
  return (
    <section
      aria-labelledby="lab-results"
      className="flex flex-col gap-4 rounded-xl bg-surface p-6 shadow-card"
    >
      <h2 id="lab-results" className="m-0 flex items-center justify-between font-heading text-h3">
        {t("queue.lab.inProgress")}
        <span className="rounded-full bg-subtle px-2 py-0.5 text-caption font-semibold text-fg-secondary tabular-nums">
          {count}
        </span>
      </h2>
      {!loading && visits.length === 0 ? (
        <p className="m-0 text-fg-muted">{t("queue.lab.inProgressNone")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-5 p-0">
          {visits.map((visit) => (
            <li key={visit.visit_id} className="flex flex-col gap-3">
              <p className="m-0 flex flex-wrap items-center gap-2">
                {visit.ticket && <TicketNumber number={visit.ticket.number} size="sm" stub />}
                <span className="font-semibold">{visit.patient.full_name}</span>
                <Payment unpaid={visit.unpaid} />
              </p>
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {visit.orders.map((order) => (
                  <li key={order.id} className="rounded-xl border border-border/60 p-4">
                    {order.state === "sample_taken" ? (
                      <ResultForm
                        order={order}
                        test={tests.find((x) => x.code === order.test_code)}
                        onSaved={(last) =>
                          onSaved(
                            last
                              ? t("queue.lab.backToDoctor", { name: visit.patient.display_name })
                              : t("queue.lab.saved", { test: order.test_name }),
                          )
                        }
                        last={
                          visit.orders.filter(
                            (o) => o.state === "sample_taken" || o.state === "ordered",
                          ).length === 1
                        }
                      />
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-start gap-3">
                          <OrderLine order={order} />
                          <LabStateBadge state={order.state} />
                        </div>
                        <LabResultTable order={order} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultForm({
  order,
  test,
  last,
  onSaved,
}: {
  order: LabOrder;
  test: LabCatalogueTest | undefined;
  last: boolean;
  onSaved: (last: boolean) => void;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [values, setValues] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () => api.clinical.lab.result(order, { values, comment: comment.trim() }),
    onSuccess: () => onSaved(last),
  });
  if (!test) return <OrderLine order={order} />;
  const serverError = (code: string) =>
    isApiError(save.error) ? save.error.fields[`values.${code}`]?.[0] : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (test.items.every((i) => values[i.code]?.trim())) save.mutate();
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      aria-label={`${t("queue.lab.enter")}: ${order.test_name}`}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-start gap-3">
        <OrderLine order={order} />
        <LabStateBadge state={order.state} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {test.items.map((item) => {
          const value = values[item.code] ?? "";
          const flag = flagOf(item, value);
          const error =
            (tried && !value.trim() ? t("queue.lab.required") : undefined) ??
            serverError(item.code);
          const set = (v: string) => setValues((now) => ({ ...now, [item.code]: v }));
          const label = item.unit ? `${item.label} (${item.unit})` : item.label;
          return (
            <div key={item.code} className="flex flex-col gap-1.5">
              {item.kind === "number" ? (
                <TextField
                  label={label}
                  hint={rangeText(t, item) || undefined}
                  inputMode="decimal"
                  autoComplete="off"
                  value={value}
                  error={error}
                  onChange={(e) => set(e.target.value)}
                />
              ) : item.choices.length <= MAX_CHOICE_PILLS ? (
                // a few results (Negative / Trace / + / ++ / +++): one tap each, no drop-down
                <ChoiceGroup
                  label={label}
                  value={value}
                  error={error}
                  onChange={set}
                  options={item.choices.map((choice) => ({
                    value: choice,
                    label: t(`clinical.lab.choices.${choice}`),
                  }))}
                />
              ) : (
                <SelectField
                  label={label}
                  value={value}
                  error={error}
                  onChange={(e) => set(e.target.value)}
                >
                  <option value="">{t("queue.lab.choose")}</option>
                  {item.choices.map((choice) => (
                    <option key={choice} value={choice}>
                      {t(`clinical.lab.choices.${choice}`)}
                    </option>
                  ))}
                </SelectField>
              )}
              {flag && (
                <span className="self-start">
                  <LabFlagBadge flag={flag} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <TextField
        label={t("queue.lab.comment")}
        value={comment}
        maxLength={500}
        onChange={(e) => setComment(e.target.value)}
      />
      {/* a 400 names the item, shown at its field */}
      {save.isError && !(isApiError(save.error) && save.error.status === 400) && (
        <Alert tone="danger" role="alert">
          {actionError(save.error, t("queue.failed"))}
        </Alert>
      )}
      <Button type="submit" className="self-start" loading={save.isPending}>
        <TestTube aria-hidden="true" weight="bold" />
        {t("queue.lab.save")}
      </Button>
    </form>
  );
}

function WaitingList({
  waiting,
  loading,
  visitOf,
}: {
  waiting: TicketRow[];
  loading: boolean;
  visitOf: (visitId: string) => LabVisit | undefined;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-labelledby="lab-waiting"
      className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card"
    >
      <h2
        id="lab-waiting"
        className="m-0 flex items-center justify-between px-4 pt-4 pb-2 font-heading text-body font-bold"
      >
        {t("queue.lab.waiting")}
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
            description={t("queue.lab.nobody")}
          />
        </div>
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {waiting.map((ticket, index) => {
            const visit = visitOf(ticket.visit_id);
            return (
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
                  {visit && (
                    <span className="text-body-sm text-fg-secondary">
                      {visit.orders.map((o) => o.test_name).join(", ")}
                    </span>
                  )}
                  {visit?.unpaid && (
                    <span className="self-start">
                      <Payment unpaid />
                    </span>
                  )}
                </span>
                <span className="text-caption text-fg-muted tabular-nums">
                  {t("queue.minutes", { count: minutesSince(ticket.arrival_at) })}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function DoneToday({ visits }: { visits: LabVisit[] }) {
  const { t } = useTranslation();
  if (!visits.length) return null;
  return (
    <section
      aria-labelledby="lab-done"
      className="flex flex-col overflow-hidden rounded-2xl bg-surface shadow-card"
    >
      <h2
        id="lab-done"
        className="m-0 flex items-center justify-between px-4 pt-4 pb-2 font-heading text-body font-bold"
      >
        {t("queue.lab.doneToday")}
        <span className="rounded-full bg-subtle px-2 py-0.5 text-caption font-semibold text-fg-secondary tabular-nums">
          {visits.length}
        </span>
      </h2>
      <ul className="m-0 flex list-none flex-col p-0">
        {visits.map((visit) => (
          <li
            key={visit.visit_id}
            className="flex flex-col gap-0.5 border-t border-border/60 px-4 py-3"
          >
            <span className="font-semibold">{visit.patient.full_name}</span>
            <span className="text-body-sm text-fg-secondary">
              {visit.orders.map((o) => o.test_name).join(", ")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
