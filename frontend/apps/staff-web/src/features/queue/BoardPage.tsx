import { formatTime } from "@medilink/ui/i18n";
import type { PriorityClass, QueueGroup, TicketRow } from "@medilink/api-client";
import { newIdempotencyKey } from "@medilink/api-client";
import {
  Alert,
  Button,
  buttonClassName,
  cx,
  Dialog,
  EmptyState,
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
  Printer,
  ShieldWarning,
  Siren,
  Star,
  UsersThree,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { useApi } from "../../app/services";
import { PhoneBookingPanel, type PhoneBookingMode } from "../bookings";
import { PageHeading } from "../../components/PageHeading";
import { PatientPicker } from "../patients";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { CodeCheckIn } from "./CodeCheckIn";
import { ExpectedList, MissedList, useTodayBookings } from "./ExpectedList";
import { DeskBar, DeskFlow, ServiceFilter, ticketTone } from "./FrontDesk";
import { RemoteList, useConfirmArrival } from "./RemoteList";
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

/** Keyboard shortcuts (design 04 §3.1): N new check-in, / find a patient to check in. */

/** True while a dialog or side panel is open: board shortcuts must not fire behind it. */
const dialogOpen = () => Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));

/**
 * Rows whose ticket changed in the last update (new, or a new version), so the board can fade
 * them in (design 04: a brief emerald-50 highlight that fades over 1.5 s). Nothing is marked on
 * first load.
 */
function useChangedRows(rows: TicketRow[]): Set<string> {
  const seen = useRef<Map<string, number> | null>(null);
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const signature = rows.map((r) => `${r.id}:${r.version}`).join(",");
  useEffect(() => {
    const previous = seen.current;
    seen.current = new Map(rows.map((r) => [r.id, r.version]));
    if (!previous) return;
    const fresh = rows.filter((r) => previous.get(r.id) !== r.version).map((r) => r.id);
    // Every row "changed" at once is a reload (e.g. coming back to the page), not a live update,
    // so it is not highlighted (a rare live update touching every row is not either). With
    // nothing new, clear any highlight whose timer the previous run's cleanup cancelled.
    if (!fresh.length || (fresh.length === rows.length && rows.length > 1)) {
      setChanged((current) => (current.size ? new Set() : current));
      return;
    }
    setChanged(new Set(fresh));
    const timer = setTimeout(() => setChanged(new Set()), 1_500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature covers `rows`
  }, [signature]);
  return changed;
}
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
  const canBook = useCan("queue.operate");
  const [params, setParams] = useSearchParams();
  // Reception Today links here with ?find=1 to open the check-in search at once
  const [checkingIn, setCheckingInState] = useState(() => params.get("find") === "1");
  const setCheckingIn = (value: boolean) => {
    setCheckingInState(value);
    if (!value && params.has("find")) {
      const next = new URLSearchParams(params);
      next.delete("find");
      setParams(next, { replace: true });
    }
  };
  const [booking, setBooking] = useState<PhoneBookingMode | null>(null);
  const bookingMode: PhoneBookingMode | null =
    booking ?? (canBook && params.get("book") === "new" ? { kind: "new" } : null);
  const closeBooking = () => {
    setBooking(null);
    if (params.has("book")) {
      const next = new URLSearchParams(params);
      next.delete("book");
      setParams(next, { replace: true });
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (typing || event.ctrlKey || event.metaKey || event.altKey || dialogOpen()) return;
      // "/" opens the check-in search (the patient search has focus)
      if (event.key === "n" || event.key === "N" || event.key === "/") {
        event.preventDefault();
        setCheckingInState(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const queues = board.data?.queues ?? [];
  const byService = new Map<string, QueueGroup[]>();
  for (const q of queues) byService.set(q.service_id, [...(byService.get(q.service_id) ?? []), q]);
  const shown = queues.filter((q) => !filter || q.service_id === filter);
  const serving = queues.flatMap((q) => [...q.called, ...q.in_service]);
  const changed = useChangedRows(queues.flatMap((q) => q.waiting));
  const bookings = useTodayBookings();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PageHeading title={t("queue.board.title")}>{t("queue.board.title")}</PageHeading>
        <LiveBadge />
      </div>

      <DeskBar
        onFind={() => setCheckingIn(true)}
        onCheckIn={() => setCheckingIn(true)}
        onBookByPhone={canBook ? () => setBooking({ kind: "new" }) : undefined}
      />

      <DeskFlow queues={queues} expected={bookings.data?.results} />

      {byService.size > 1 && (
        <ServiceFilter
          services={[...byService.entries()].map(([id, groups]) => ({
            id,
            waiting: groups.reduce((n, g) => n + g.waiting.length, 0),
          }))}
          value={filter}
          onChange={setFilter}
          serviceName={serviceName}
          label={t("queue.board.services")}
          allLabel={t("queue.board.allServices")}
        />
      )}

      {serving.length > 0 && (
        <section aria-labelledby="now-serving" className="flex flex-col gap-2.5">
          <h2
            id="now-serving"
            className="m-0 flex items-center gap-2 text-caption font-semibold tracking-wide text-fg-muted uppercase"
          >
            <MegaphoneSimple aria-hidden="true" weight="bold" className="size-4 text-attention" />
            {t("queue.board.nowServing")}
          </h2>
          <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
            {serving.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => setOpen(ticket)}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-2xl py-2 pr-4 pl-2 text-left shadow-card",
                    "transition-transform duration-150 active:scale-[0.98]",
                    ticket.state === "called" ? "bg-attention-bg" : "bg-surface",
                  )}
                >
                  <TicketNumber
                    number={ticket.number}
                    stub
                    tone={ticket.state === "called" ? "attention" : "brand"}
                  />
                  <span className="flex flex-col">
                    <span className="text-body-sm font-semibold">
                      {ticket.service_point ?? "—"}
                    </span>
                    <span className="text-caption text-fg-muted">
                      {t(`queue.states.${ticket.state}`)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-5 xl:grid-cols-[21rem_minmax(0,1fr)]">
        <section aria-labelledby="expected" className="flex flex-col gap-3 self-start">
          {canBook && <CodeCheckIn />}
          <h2 id="expected" className="m-0 flex items-center gap-2 font-heading text-h3">
            <CalendarCheck aria-hidden="true" className="size-5 text-fg-muted" />
            {t("queue.board.expected")}
          </h2>
          {/* "I'm here" claims first: those patients are already at the door */}
          <RemoteList queues={queues} serviceId={filter} />
          <ExpectedList
            serviceId={filter}
            onNewTime={(b) => setBooking({ kind: "reschedule", booking: b })}
          />
          <MissedList serviceId={filter} />
        </section>

        <section aria-labelledby="on-site" className="flex min-w-0 flex-col gap-3">
          <h2 id="on-site" className="m-0 flex items-center gap-2 font-heading text-h3">
            <UsersThree aria-hidden="true" className="size-5 text-fg-muted" />
            {t("queue.board.onSite")}
          </h2>
          {board.isPending && (
            <div aria-busy="true" className="flex flex-col gap-3">
              <p className="m-0 text-fg-muted">{t("queue.loading")}</p>
              {[0, 1].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface shadow-card" />
              ))}
            </div>
          )}
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
              changed={changed}
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
      {bookingMode && <PhoneBookingPanel mode={bookingMode} onClose={closeBooking} />}
    </div>
  );
}

function QueueTable({
  group,
  title,
  onOpen,
  changed,
}: {
  group: QueueGroup;
  title: string;
  onOpen: (t: TicketRow) => void;
  changed: Set<string>;
}) {
  const { t } = useTranslation();
  const est = group.estimate_next;
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <h3 className="m-0 font-heading text-body font-bold">
          {title}{" "}
          <span className="font-sans font-normal text-fg-muted">
            · {t(`queue.stages.${group.stage}`)}
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-4 text-body-sm text-fg-muted">
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
          <thead className="text-caption tracking-wide text-fg-muted uppercase">
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
              <tr
                key={ticket.id}
                className={cx(
                  "border-t border-border/60 transition-colors hover:bg-page",
                  // on at once, then fade out over 1.5 s
                  changed.has(ticket.id)
                    ? "bg-brand-subtle"
                    : "transition-colors duration-1500 motion-reduce:transition-none",
                )}
              >
                <td className="px-4 py-2.5 text-body-sm text-fg-muted tabular-nums">{index + 1}</td>
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpen(ticket)}
                    className="cursor-pointer rounded-xl transition-transform duration-150 active:scale-[0.96]"
                  >
                    <TicketNumber number={ticket.number} stub tone={ticketTone(ticket, index)} />
                  </button>
                </td>
                <td className="max-w-[22rem] px-2 py-2.5">
                  <span className="block font-semibold">{ticket.display_name}</span>
                  {(ticket.reason_text || ticket.symptoms.length > 0) && (
                    <span
                      className={cx(
                        "block truncate text-body-sm",
                        ticket.flags.includes("red_flag") ? "text-danger" : "text-fg-secondary",
                      )}
                      title={ticket.reason_text || ticket.symptoms.join(", ")}
                    >
                      “{ticket.reason_text || ticket.symptoms.join(", ")}”
                    </span>
                  )}
                  <span className="text-body-sm text-fg-muted">
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
  const { t, i18n } = useTranslation();
  const api = useApi();
  const serviceName = useServiceNames();
  const canOperate = useCan("queue.operate");
  const act = useTicketAction();
  const confirmArrival = useConfirmArrival();
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
  const [dialog, setDialog] = useState<
    "priority" | "emergency" | "reorder" | "leave" | "transfer" | null
  >(null);
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

        {(current.reason_text || current.symptoms.length > 0) && (
          <section
            aria-labelledby="patient-words"
            className={cx(
              "flex flex-col gap-1.5 rounded-xl p-3",
              current.flags.includes("red_flag") ? "bg-danger-bg" : "bg-subtle",
            )}
          >
            <h3 id="patient-words" className="m-0 text-caption font-semibold text-fg-secondary">
              {t("queue.panel.patientWords")}
            </h3>
            {current.reason_text && <p className="m-0">“{current.reason_text}”</p>}
            {current.symptoms.length > 0 && (
              <p className="m-0 text-body-sm text-fg-secondary">{current.symptoms.join(" · ")}</p>
            )}
          </section>
        )}
        <Link
          to={`/queue/visits/${current.visit_id}/slip`}
          className={buttonClassName({ variant: "secondary", pill: true, className: "self-start" })}
        >
          <Printer aria-hidden="true" />
          {t("queue.print.slip")}
        </Link>
        {visit.data?.follow_up && (
          <Link
            to={`/queue/visits/${current.visit_id}/card`}
            className={buttonClassName({
              variant: "secondary",
              pill: true,
              className: "self-start",
            })}
          >
            <CalendarCheck aria-hidden="true" />
            {t("queue.print.nextCard")}
          </Link>
        )}
        {current.flags.includes("insurance_unverified") && visit.data && (
          <Link
            to={`/patients/${visit.data.facility_patient_id}?tab=insurance`}
            className="flex min-h-target items-center gap-3 rounded-xl bg-attention-bg px-3 py-2.5 text-fg no-underline"
          >
            <ShieldWarning aria-hidden="true" weight="bold" className="size-5 text-attention" />
            <span className="flex-1 text-body-sm font-semibold">
              {t("queue.panel.checkInsurance")}
            </span>
          </Link>
        )}
        {canOperate && waiting && !current.flags.includes("emergency") && (
          <Button
            variant="danger"
            pill
            className="self-start"
            onClick={() => setDialog("emergency")}
          >
            <Siren aria-hidden="true" weight="bold" />
            {t("queue.panel.raiseEmergency")}
          </Button>
        )}
        {canOperate && waiting && current.is_remote && !current.remote_arrival_confirmed_at && (
          <div className="flex flex-col gap-2 rounded-xl bg-info-bg p-3 text-body-sm">
            <p className="m-0">
              {current.remote_arrival_claimed_at
                ? t("queue.panel.remoteClaimed")
                : t("queue.panel.remoteNotArrived")}
            </p>
            <Button
              className="self-start"
              loading={confirmArrival.isPending}
              onClick={() => confirmArrival.mutate(current)}
            >
              {t("queue.board.remoteConfirm")}
            </Button>
            {confirmArrival.isError && (
              <Alert tone="danger" role="alert">
                {actionError(confirmArrival.error, t("queue.board.remoteError"))}
              </Alert>
            )}
          </div>
        )}
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
                  {formatTime(e.occurred_at, i18n.resolvedLanguage ?? "rw")}
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
      {dialog === "emergency" && (
        <ReasonDialog
          title={t("queue.panel.raiseEmergency")}
          description={t("queue.panel.raiseEmergencyHint")}
          onClose={() => setDialog(null)}
          busy={act.isPending}
          choice={null}
          reasons={null}
          onSubmit={(_choice, reason) => run("emergency", { reason_text: reason })}
          freeReason
          danger
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
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [service, setService] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [priority, setPriority] = useState("");
  const [reason, setReason] = useState("");
  const key = useRef(newIdempotencyKey());
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

  if (checkIn.data) {
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title={t("queue.checkIn.done")}
        closeLabel={t("queue.close")}
        footer={
          <>
            <Link
              to={`/queue/visits/${checkIn.data.visit_id}/slip`}
              className={buttonClassName({ variant: "secondary", pill: true })}
            >
              <Printer aria-hidden="true" />
              {t("queue.print.slip")}
            </Link>
            <Button onClick={onClose}>{t("queue.checkIn.close")}</Button>
          </>
        }
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
        <PatientPicker onPicked={setPatient} />
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
