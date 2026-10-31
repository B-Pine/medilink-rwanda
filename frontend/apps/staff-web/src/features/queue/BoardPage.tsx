import type {
  FacilityPatientDetail,
  PatientSummary,
  PriorityClass,
  QueueGroup,
  TicketRow,
} from "@medilink/api-client";
import { newIdempotencyKey } from "@medilink/api-client";
import {
  Alert,
  Button,
  cx,
  Dialog,
  EmptyState,
  PersonSearch,
  QueueStateBadge,
  SelectField,
  SidePanel,
  SwitchField,
  TextField,
  TicketNumber,
} from "@medilink/ui";
import {
  ArrowsDownUp,
  CalendarCheck,
  ClockCountdown,
  MegaphoneSimple,
  Plus,
  Star,
  UsersThree,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeader } from "../../components/PageHeader";
import { WalkInForm } from "../patients";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { ExpectedList, MissedList } from "./ExpectedList";
import { LiveBadge } from "./LiveIndicator";
import {
  actionError,
  Flags,
  minutesSince,
  ReasonDialog,
  useCan,
  useServiceNames,
  useTicketAction,
} from "./shared";

/** Keyboard shortcut for a new check-in (design 04 §3.1). */
const SHORTCUT_NEW = "N";
const PRIORITIES: PriorityClass[] = ["elderly", "pregnant", "disability", "very_sick"];
const REORDER_REASONS = ["clinical_urgency", "staff_error", "patient_request", "other"];
const LEAVE_REASONS = ["patient_left", "patient_request", "duplicate", "other"];

function useBoard() {
  const api = useApi();
  const refetchInterval = usePollInterval();
  return useQuery({ queryKey: queueKeys.board, queryFn: () => api.queue.board(), refetchInterval });
}

/** /queue for reception (design 04 §3.1): who is on site, in calling order, and what to do next. */
export function BoardPage() {
  const { t } = useTranslation();
  const serviceName = useServiceNames();
  useQueueSocket(true);
  const board = useBoard();
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<TicketRow | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (!typing && !event.ctrlKey && !event.metaKey && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setCheckingIn(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const queues = board.data?.queues ?? [];
  const byService = new Map<string, QueueGroup[]>();
  for (const q of queues) byService.set(q.service_id, [...(byService.get(q.service_id) ?? []), q]);
  const shown = queues.filter((q) => !filter || q.service_id === filter);
  const waitingTotal = queues.reduce((n, q) => n + q.waiting.length, 0);
  const serving = queues.flatMap((q) => [...q.called, ...q.in_service]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("queue.board.title")}
        description={t("queue.board.intro")}
        badges={<LiveBadge />}
        actions={
          <Button onClick={() => setCheckingIn(true)} aria-keyshortcuts="N">
            <Plus aria-hidden="true" weight="bold" />
            {t("queue.board.checkIn")}
            <kbd className="ml-1 rounded-sm border border-on-primary/40 px-1 font-sans text-caption">
              {SHORTCUT_NEW}
            </kbd>
          </Button>
        }
      />

      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t("queue.board.services")}
      >
        <button
          type="button"
          aria-pressed={filter === null}
          onClick={() => setFilter(null)}
          className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-body-sm font-semibold text-fg-secondary hover:text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
        >
          {t("queue.board.allServices")}
          <span className="tabular-nums opacity-80">{waitingTotal}</span>
        </button>
        {[...byService.entries()].map(([serviceId, groups]) => {
          const waiting = groups.reduce((n, g) => n + g.waiting.length, 0);
          return (
            <button
              key={serviceId}
              type="button"
              aria-pressed={filter === serviceId}
              onClick={() => setFilter(serviceId)}
              className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-body-sm font-semibold text-fg-secondary hover:text-fg aria-pressed:border-primary aria-pressed:bg-brand-subtle aria-pressed:text-on-brand-subtle"
            >
              {serviceName(serviceId)}
              <span className="tabular-nums opacity-80">{waiting}</span>
            </button>
          );
        })}
      </div>

      {serving.length > 0 && (
        <section aria-labelledby="now-serving" className="flex flex-col gap-2">
          <h2 id="now-serving" className="m-0 flex items-center gap-2 font-heading text-h3">
            <MegaphoneSimple aria-hidden="true" className="size-5 text-warning" />
            {t("queue.board.nowServing")}
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {serving.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => setOpen(ticket)}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-2 text-left",
                    ticket.state === "called"
                      ? "border-warning/50 bg-warning-bg"
                      : "border-border bg-surface",
                  )}
                >
                  <TicketNumber number={ticket.number} />
                  <span className="flex flex-col">
                    <span className="text-body-sm font-semibold">
                      {ticket.service_point ?? "—"}
                    </span>
                    <span className="text-caption text-fg-secondary">
                      {t(`queue.states.${ticket.state}`)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <section aria-labelledby="expected" className="flex flex-col gap-3 self-start">
          <h2 id="expected" className="m-0 flex items-center gap-2 font-heading text-h3">
            <CalendarCheck aria-hidden="true" className="size-5 text-fg-muted" />
            {t("queue.board.expected")}
          </h2>
          <ExpectedList serviceId={filter} />
          <MissedList serviceId={filter} />
        </section>

        <section aria-labelledby="on-site" className="flex min-w-0 flex-col gap-4">
          <h2 id="on-site" className="m-0 flex items-center gap-2 font-heading text-h3">
            <UsersThree aria-hidden="true" className="size-5 text-fg-muted" />
            {t("queue.board.onSite")}
          </h2>
          {board.isPending && <p className="m-0 text-fg-muted">{t("queue.loading")}</p>}
          {board.isError && <Alert tone="danger">{t("queue.loadFailed")}</Alert>}
          {board.data && shown.length === 0 && (
            <EmptyState
              icon={UsersThree}
              title={t("queue.board.emptyTitle")}
              description={t("queue.board.empty")}
              action={
                <Button onClick={() => setCheckingIn(true)}>{t("queue.board.checkIn")}</Button>
              }
            />
          )}
          {shown.map((group) => (
            <QueueTable
              key={`${group.service_id}-${group.stage}`}
              group={group}
              title={serviceName(group.service_id)}
              onOpen={setOpen}
            />
          ))}
        </section>
      </div>

      {open && (
        <TicketPanel
          ticket={open}
          onClose={() => setOpen(null)}
          services={[...byService.keys()]}
          board={queues}
        />
      )}
      {checkingIn && (
        <CheckInDialog
          onClose={() => setCheckingIn(false)}
          services={board.data ? [...byService.keys()] : []}
        />
      )}
    </div>
  );
}

function QueueTable({
  group,
  title,
  onOpen,
}: {
  group: QueueGroup;
  title: string;
  onOpen: (t: TicketRow) => void;
}) {
  const { t } = useTranslation();
  const est = group.estimate_next;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-subtle px-4 py-2.5">
        <h3 className="m-0 font-heading text-h3">
          {title}{" "}
          <span className="font-normal text-fg-secondary">
            · {t(`queue.stages.${group.stage}`)}
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-4 text-body-sm text-fg-secondary">
          <span className="tabular-nums">
            {t("queue.board.waitingCount", { count: group.waiting.length })}
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <ClockCountdown aria-hidden="true" className="size-4" />
            {est.status
              ? t(`queue.status.${est.status}`)
              : t("queue.board.newArrivalWait", { min: est.min, max: est.max })}
          </span>
        </div>
      </div>
      {group.waiting.length === 0 ? (
        <p className="m-0 px-4 py-4 text-fg-muted">{t("queue.board.nobodyWaiting")}</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{`${title} · ${t(`queue.stages.${group.stage}`)}`}</caption>
          <thead className="text-caption text-fg-muted">
            <tr>
              <th scope="col" className="w-12 px-4 py-2 font-semibold">
                #
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                {t("queue.columns.ticket")}
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                {t("queue.columns.patient")}
              </th>
              <th scope="col" className="hidden px-2 py-2 font-semibold md:table-cell">
                {t("queue.columns.flags")}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                {t("queue.columns.waiting")}
              </th>
            </tr>
          </thead>
          <tbody>
            {group.waiting.map((ticket, index) => (
              <tr key={ticket.id} className="border-t border-border hover:bg-subtle">
                <td className="px-4 py-2.5 text-body-sm text-fg-muted tabular-nums">{index + 1}</td>
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpen(ticket)}
                    className="cursor-pointer text-link underline-offset-2 hover:underline"
                  >
                    <TicketNumber number={ticket.number} size="sm" />
                  </button>
                </td>
                <td className="px-2 py-2.5">
                  <span className="block font-semibold">{ticket.display_name}</span>
                  <span className="text-body-sm text-fg-secondary">
                    {[
                      ticket.age_years !== null
                        ? t("queue.age", { count: ticket.age_years })
                        : null,
                      ticket.sex ? t(`queue.sex.${ticket.sex}`) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </td>
                <td className="hidden px-2 py-2.5 md:table-cell">
                  <Flags ticket={ticket} />
                </td>
                <td className="px-2 py-2.5 pr-4 text-right text-body-sm tabular-nums">
                  {t("queue.minutes", { count: minutesSince(ticket.arrival_at) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TicketPanel({
  ticket,
  onClose,
  services,
  board,
}: {
  ticket: TicketRow;
  onClose: () => void;
  services: string[];
  board: QueueGroup[];
}) {
  const { t } = useTranslation();
  const api = useApi();
  const serviceName = useServiceNames();
  const canOperate = useCan("queue.operate");
  const act = useTicketAction();
  const visit = useQuery({
    queryKey: queueKeys.visit(ticket.visit_id),
    queryFn: () => api.queue.visit(ticket.visit_id),
  });
  const current =
    board
      .flatMap((q) => [...q.waiting, ...q.called, ...q.in_service])
      .find((r) => r.id === ticket.id) ?? ticket;
  const sameQueue =
    board
      .find((q) => q.service_id === current.service_id && q.stage === current.stage)
      ?.waiting.filter((r) => r.id !== current.id) ?? [];
  const [dialog, setDialog] = useState<"priority" | "reorder" | "leave" | "transfer" | null>(null);
  const run = (
    action: Parameters<typeof act.mutate>[0]["action"],
    body?: Parameters<typeof act.mutate>[0]["body"],
  ) => act.mutate({ ticket: current, action, body }, { onSuccess: () => setDialog(null) });
  const waiting = current.state === "waiting";

  return (
    <SidePanel
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${current.number} · ${current.display_name}`}
      closeLabel={t("queue.close")}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <TicketNumber number={current.number} size="lg" />
          <QueueStateBadge state={current.state}>
            {t(`queue.states.${current.state}`)}
          </QueueStateBadge>
          <Flags ticket={current} />
        </div>
        <dl className="m-0 grid grid-cols-2 gap-3 text-body-sm">
          <div>
            <dt className="text-fg-muted">{t("queue.panel.service")}</dt>
            <dd className="m-0 font-semibold">{serviceName(current.service_id)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t("queue.panel.stage")}</dt>
            <dd className="m-0 font-semibold">{t(`queue.stages.${current.stage}`)}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t("queue.panel.position")}</dt>
            <dd className="m-0 font-semibold tabular-nums">
              {waiting ? t("queue.panel.ahead", { count: current.position ?? 0 }) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">{t("queue.panel.arrived")}</dt>
            <dd className="m-0 font-semibold tabular-nums">
              {t("queue.minutesAgo", { count: minutesSince(current.arrival_at) })}
            </dd>
          </div>
        </dl>

        {canOperate && waiting && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setDialog("priority")}>
              <Star aria-hidden="true" />
              {t("queue.panel.priority")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setDialog("reorder")}
              disabled={sameQueue.length === 0}
            >
              <ArrowsDownUp aria-hidden="true" />
              {t("queue.panel.reorder")}
            </Button>
            {services.length > 1 && (
              <Button variant="secondary" onClick={() => setDialog("transfer")}>
                {t("queue.panel.transfer")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => run("step-out", { minutes: 15 })}>
              {t("queue.panel.stepOut")}
            </Button>
            <Button variant="ghost" onClick={() => setDialog("leave")}>
              {t("queue.panel.left")}
            </Button>
          </div>
        )}
        {act.isError && (
          <Alert tone="danger" role="alert">
            {actionError(act.error, t("queue.failed"))}
          </Alert>
        )}

        <section aria-labelledby="timeline" className="flex flex-col gap-2">
          <h3 id="timeline" className="m-0 font-heading text-h3">
            {t("queue.panel.timeline")}
          </h3>
          <ol className="m-0 flex list-none flex-col gap-0 border-l-2 border-border p-0 pl-4">
            {(visit.data?.events ?? []).map((e) => (
              <li key={e.id} className="relative pb-3 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute top-1.5 -left-[1.4rem] size-3 rounded-full border-2 border-surface bg-primary"
                />
                <p className="m-0 font-semibold">
                  {t(`queue.actions.${e.action}`, { defaultValue: e.action })}{" "}
                  <span className="font-normal text-fg-muted">· {e.ticket_number}</span>
                </p>
                <p className="m-0 text-body-sm text-fg-secondary tabular-nums">
                  {new Date(e.occurred_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {e.actor_name && ` · ${e.actor_name}`}
                  {e.reason_code &&
                    ` · ${t(`queue.reasons.${e.reason_code}`, { defaultValue: e.reason_code })}`}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {dialog === "priority" && (
        <ReasonDialog
          title={t("queue.panel.priority")}
          onClose={() => setDialog(null)}
          busy={act.isPending}
          choice={{
            label: t("queue.panel.priorityClass"),
            options: PRIORITIES.map((p) => [p, t(`queue.priority.${p}`)]),
          }}
          reasons={null}
          onSubmit={(choice, reason) =>
            run("priority", { priority_class: choice as PriorityClass, reason_code: reason })
          }
          freeReason
        />
      )}
      {dialog === "reorder" && (
        <ReasonDialog
          title={t("queue.panel.reorder")}
          description={t("queue.panel.reorderHint")}
          onClose={() => setDialog(null)}
          busy={act.isPending}
          choice={{
            label: t("queue.panel.moveBefore"),
            options: sameQueue.map((r) => [r.id, `${r.number} · ${r.display_name}`]),
          }}
          reasons={REORDER_REASONS}
          onSubmit={(choice, reason, text) =>
            run("reorder", { before_ticket_id: choice, reason_code: reason, reason_text: text })
          }
        />
      )}
      {dialog === "transfer" && (
        <ReasonDialog
          title={t("queue.panel.transfer")}
          description={t("queue.panel.transferHint")}
          onClose={() => setDialog(null)}
          busy={act.isPending}
          choice={{
            label: t("queue.panel.service"),
            options: services
              .filter((s) => s !== current.service_id)
              .map((s) => [s, serviceName(s)]),
          }}
          reasons={null}
          onSubmit={(choice) => run("transfer", { service_id: choice })}
        />
      )}
      {dialog === "leave" && (
        <ReasonDialog
          title={t("queue.panel.left")}
          onClose={() => setDialog(null)}
          busy={act.isPending}
          choice={null}
          reasons={LEAVE_REASONS}
          onSubmit={(_c, reason) => run("left", { reason_code: reason })}
          danger
        />
      )}
    </SidePanel>
  );
}

function CheckInDialog({ onClose, services }: { onClose: () => void; services: string[] }) {
  const { t } = useTranslation();
  const api = useApi();
  const serviceName = useServiceNames();
  const queryClient = useQueryClient();
  const catalogue = useQuery({
    queryKey: ["setup", "services"],
    queryFn: () => api.setup.services(),
  });
  const options = (catalogue.data?.results ?? []).filter((s) => s.is_active).map((s) => s.id);
  const serviceIds = options.length ? options : services;
  const [mode, setMode] = useState<"find" | "new">("find");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientSummary[] | null>(null);
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [service, setService] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [priority, setPriority] = useState("");
  const [reason, setReason] = useState("");
  const key = useRef(newIdempotencyKey());
  const search = useMutation({
    mutationFn: (value: string) => api.patients.search({ query: value }),
    onSuccess: (data) => setResults(data.results),
  });
  const checkIn = useMutation({
    mutationFn: () =>
      api.queue.checkIn(
        {
          facility_patient_id: patient!.id,
          service_id: service || serviceIds[0]!,
          source: emergency ? "emergency" : "walk_in",
          priority_class: !emergency && priority ? (priority as PriorityClass) : null,
          priority_reason_code: emergency || priority ? reason : null,
        },
        key.current,
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queueKeys.all }),
  });
  const chosen = (p: FacilityPatientDetail | PatientSummary) =>
    setPatient({ id: p.facility_patient_id, name: p.full_name });

  if (checkIn.data) {
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t("queue.checkIn.done")}
        closeLabel={t("queue.close")}
        footer={<Button onClick={onClose}>{t("queue.checkIn.close")}</Button>}
      >
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="m-0 text-fg-secondary">
            {checkIn.data.created
              ? t("queue.checkIn.ticketFor", { name: patient?.name })
              : t("queue.checkIn.already", { name: patient?.name })}
          </p>
          <TicketNumber
            number={checkIn.data.ticket.number}
            size="display"
            className="text-primary"
          />
          <p className="m-0 text-fg-secondary tabular-nums">
            {t("queue.panel.ahead", { count: checkIn.data.ticket.position ?? 0 })}
          </p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t("queue.checkIn.title")}
      closeLabel={t("queue.close")}
      footer={
        patient ? (
          <>
            <Button variant="secondary" onClick={() => setPatient(null)}>
              {t("queue.checkIn.back")}
            </Button>
            <Button
              disabled={checkIn.isPending || ((emergency || Boolean(priority)) && !reason.trim())}
              onClick={() => checkIn.mutate()}
            >
              {t("queue.checkIn.submit")}
            </Button>
          </>
        ) : undefined
      }
    >
      {!patient ? (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2" role="group" aria-label={t("queue.checkIn.title")}>
            <Button
              variant={mode === "find" ? "primary" : "secondary"}
              aria-pressed={mode === "find"}
              onClick={() => setMode("find")}
            >
              {t("queue.checkIn.find")}
            </Button>
            <Button
              variant={mode === "new" ? "primary" : "secondary"}
              aria-pressed={mode === "new"}
              onClick={() => setMode("new")}
            >
              {t("queue.checkIn.new")}
            </Button>
          </div>
          {mode === "find" ? (
            <>
              <PersonSearch
                value={query}
                onChange={setQuery}
                onSearch={(value) => search.mutate(value)}
                busy={search.isPending}
                labels={{
                  label: t("patients.search.label"),
                  placeholder: t("patients.search.placeholder"),
                  types: {
                    medilink_number: t("patients.search.types.medilink_number"),
                    national_id: t("patients.search.types.national_id"),
                    phone: t("patients.search.types.phone"),
                    file_number: t("patients.search.types.file_number"),
                    name: t("patients.search.types.name"),
                  },
                  resultCount: (count) => t("patients.search.resultCount", { count }),
                }}
              />
              {results && results.length === 0 && (
                <p className="m-0 text-fg-secondary">{t("queue.checkIn.noMatch")}</p>
              )}
              {results && results.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {results.map((r) => (
                    <li key={r.facility_patient_id}>
                      <button
                        type="button"
                        onClick={() => chosen(r)}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-left hover:border-primary hover:bg-brand-subtle"
                      >
                        <span className="flex flex-col">
                          <span className="font-semibold">{r.full_name}</span>
                          <span className="text-body-sm text-fg-secondary">
                            {[
                              r.medilink_number,
                              r.age_years !== null ? t("queue.age", { count: r.age_years }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                        <span className="text-body-sm font-semibold text-link">
                          {t("queue.checkIn.choose")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <WalkInForm onRegistered={chosen} />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-h3 font-semibold">{patient.name}</p>
          <SelectField
            label={t("queue.panel.service")}
            value={service || serviceIds[0] || ""}
            onChange={(e) => setService(e.target.value)}
          >
            {serviceIds.map((s) => (
              <option key={s} value={s}>
                {serviceName(s)}
              </option>
            ))}
          </SelectField>
          <SwitchField
            label={t("queue.checkIn.emergency")}
            hint={t("queue.checkIn.emergencyHint")}
            checked={emergency}
            onCheckedChange={setEmergency}
          />
          {!emergency && (
            <SelectField
              label={t("queue.panel.priorityClass")}
              optional
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="">{t("queue.checkIn.noPriority")}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`queue.priority.${p}`)}
                </option>
              ))}
            </SelectField>
          )}
          {(emergency || priority) && (
            <TextField
              label={t("queue.reason")}
              value={reason}
              maxLength={40}
              onChange={(e) => setReason(e.target.value)}
            />
          )}
          {checkIn.isError && (
            <Alert tone="danger" role="alert">
              {actionError(checkIn.error, t("queue.failed"))}
            </Alert>
          )}
        </div>
      )}
    </Dialog>
  );
}
