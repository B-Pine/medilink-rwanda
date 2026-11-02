import { formatTime } from "@medilink/ui/i18n";
import type { DutyState, TicketRow } from "@medilink/api-client";
import {
  Alert,
  Button,
  cx,
  EmptyState,
  ImigongoPattern,
  QueueStateBadge,
  SelectField,
  TicketNumber,
} from "@medilink/ui";
import {
  ArrowRight,
  CheckCircle,
  Coffee,
  Flask,
  MegaphoneSimple,
  Play,
  SpeakerHigh,
  UserMinus,
  UsersThree,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useApi } from "../../app/services";
import { PageHeading } from "../../components/PageHeading";
import { FollowUpAction } from "../bookings";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { LiveBadge } from "./LiveIndicator";
import { actionError, Flags, minutesSince, useServiceNames, useTicketAction } from "./shared";

const DUTY: DutyState[] = ["on_duty", "break", "emergency", "off"];

/**
 * /queue/mine (design 04 §3.2): one big action, Call next (also Space), the current patient, and
 * the waiting list in calling order.
 */
export function MyQueuePage() {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const serviceName = useServiceNames();
  useQueueSocket(true);
  const refetchInterval = usePollInterval();
  const mine = useQuery({
    queryKey: queueKeys.mine,
    queryFn: () => api.queue.mine(),
    refetchInterval,
  });
  const points = useQuery({ queryKey: ["setup", "points"], queryFn: () => api.setup.points() });
  const act = useTicketAction();
  const [empty, setEmpty] = useState(false);
  const callButton = useRef<HTMLButtonElement>(null);

  const data = mine.data;
  const current = data?.current ?? null;
  const duty = data?.duty;
  const serviceId = data?.service_ids[0];
  const onDuty = duty?.state === "on_duty";

  const callNext = useMutation({
    mutationFn: () => api.queue.callNext({ service_id: serviceId!, stage: "consultation" }),
    onSuccess: (ticket) => {
      setEmpty(ticket === null);
      void queryClient.invalidateQueries({ queryKey: queueKeys.all });
    },
  });
  const setDuty = useMutation({
    mutationFn: (body: {
      state: DutyState;
      service_point_id?: string | null;
      until_at?: string | null;
    }) => api.queue.setDuty(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queueKeys.all }),
  });

  const canCall = onDuty && !current && Boolean(serviceId) && !callNext.isPending;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target?.tagName ?? "");
      const dialogOpen = Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));
      if (event.code === "Space" && !typing && !event.repeat && !dialogOpen && canCall) {
        event.preventDefault();
        callNext.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canCall, callNext]);

  const run = (
    ticket: TicketRow,
    action: Parameters<typeof act.mutate>[0]["action"],
    body?: Parameters<typeof act.mutate>[0]["body"],
  ) => act.mutate({ ticket, action, body });

  const next = data?.waiting[0];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <PageHeading title={t("queue.mine.title")}>{t("queue.mine.title")}</PageHeading>
            <LiveBadge />
          </div>
          {serviceId && <p className="m-0 text-fg-muted">{serviceName(serviceId)}</p>}
        </div>

        <section aria-labelledby="duty" className="flex flex-wrap items-center gap-3">
          <h2 id="duty" className="sr-only">
            {t("queue.mine.duty")}
          </h2>
          <div
            role="group"
            aria-label={t("queue.mine.duty")}
            className="inline-flex flex-wrap gap-0.5 rounded-2xl bg-subtle p-1"
          >
            {DUTY.map((state) => {
              const active = duty?.state === state;
              return (
                <button
                  key={state}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setDuty.mutate({
                      state,
                      service_point_id:
                        state === "on_duty"
                          ? (duty?.service_point_id ?? points.data?.results[0]?.id ?? null)
                          : undefined,
                      until_at:
                        state === "break" ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
                    })
                  }
                  className={cx(
                    "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-3 text-body-sm font-semibold",
                    "transition-[background-color,color,box-shadow] duration-150",
                    active ? "bg-surface text-fg shadow-card" : "text-fg-secondary hover:text-fg",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "size-2 rounded-full",
                      !active
                        ? "bg-border-input"
                        : state === "on_duty"
                          ? "bg-success"
                          : state === "emergency"
                            ? "bg-danger"
                            : "bg-attention-solid",
                    )}
                  />
                  {state === "break" && <Coffee aria-hidden="true" />}
                  {t(`queue.duty.${state}`)}
                </button>
              );
            })}
          </div>
          {onDuty && (
            <SelectField
              label={t("queue.mine.room")}
              hideLabel
              value={duty?.service_point_id ?? ""}
              onChange={(e) =>
                setDuty.mutate({ state: "on_duty", service_point_id: e.target.value })
              }
              className="w-44"
            >
              {(points.data?.results ?? [])
                .filter((p) => p.is_active !== false)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </SelectField>
          )}
          {duty?.state === "break" && duty.until_at && (
            <p className="m-0 text-body-sm text-fg-muted">
              {t("queue.mine.breakUntil", {
                time: formatTime(duty.until_at, i18n.resolvedLanguage ?? "rw"),
              })}
            </p>
          )}
        </section>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="current" className="flex flex-col gap-4">
          <h2 id="current" className="sr-only">
            {t("queue.mine.current")}
          </h2>
          {current ? (
            <div
              className={cx(
                "flex flex-col gap-5 rounded-xl p-6 shadow-card sm:p-7",
                current.state === "called" ? "bg-attention-bg" : "bg-surface",
              )}
            >
              <div className="flex flex-wrap items-center gap-5">
                <TicketNumber
                  number={current.number}
                  size="lg"
                  stub
                  tone={current.state === "called" ? "attention" : "brand"}
                />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <QueueStateBadge state={current.state}>
                    {t(`queue.states.${current.state}`)}
                  </QueueStateBadge>
                  <p className="m-0 font-heading text-h1 font-bold tracking-tight break-words">
                    {current.display_name}
                  </p>
                  <p className="m-0 text-fg-muted">
                    {[
                      current.age_years !== null
                        ? t("queue.age", { count: current.age_years })
                        : null,
                      current.sex ? t(`queue.sex.${current.sex}`) : null,
                      current.service_point,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <Flags ticket={current} />
              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
                {current.state === "called" ? (
                  <>
                    <Button size="lg" onClick={() => run(current, "start")}>
                      <Play aria-hidden="true" weight="fill" />
                      {t("queue.mine.start")}
                    </Button>
                    <Button variant="secondary" size="lg" onClick={() => run(current, "recall")}>
                      <SpeakerHigh aria-hidden="true" />
                      {t("queue.mine.recall")}
                    </Button>
                    <Button variant="ghost" size="lg" onClick={() => run(current, "no-response")}>
                      <UserMinus aria-hidden="true" />
                      {t("queue.mine.noResponse")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="lg" onClick={() => run(current, "complete")}>
                      <CheckCircle aria-hidden="true" weight="fill" />
                      {t("queue.mine.complete")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => run(current, "next-stage", { stage: "pharmacy" })}
                    >
                      <ArrowRight aria-hidden="true" />
                      {t("queue.mine.toPharmacy")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => run(current, "next-stage", { stage: "payment" })}
                    >
                      <ArrowRight aria-hidden="true" />
                      {t("queue.mine.toPayment")}
                    </Button>
                    <Button variant="ghost" onClick={() => run(current, "hold")}>
                      <Flask aria-hidden="true" />
                      {t("queue.mine.hold")}
                    </Button>
                    {/* S5b (contract R8, D-4): follow-up on the visit being served */}
                    <FollowUpAction visitId={current.visit_id} name={current.display_name} />
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="relative isolate flex animate-rise flex-col items-center gap-5 overflow-hidden rounded-3xl bg-[linear-gradient(135deg,var(--color-forest)_0%,var(--color-forest-raised)_100%)] px-6 py-14 text-center text-on-forest shadow-raised">
              <div
                aria-hidden="true"
                className="absolute inset-0 -z-10 text-on-forest-accent"
                style={{ maskImage: "radial-gradient(circle at 50% 40%, black, transparent 70%)" }}
              >
                <ImigongoPattern opacity={0.07} />
              </div>
              {next && onDuty && (
                <p className="m-0 flex items-center gap-2 text-body-sm text-on-forest-muted">
                  <span className="font-semibold text-on-forest">{t("queue.mine.nextUp")}</span>
                  <span className="font-heading font-bold tracking-wider text-on-forest-accent tabular-nums">
                    {next.number}
                  </span>
                  <span aria-hidden="true">·</span>
                  {next.display_name}
                </p>
              )}
              <button
                ref={callButton}
                type="button"
                disabled={!canCall}
                onClick={() => callNext.mutate()}
                aria-keyshortcuts="Space"
                className={cx(
                  "inline-flex min-h-16 cursor-pointer items-center gap-3 rounded-full px-10 font-heading text-h2 font-bold",
                  "bg-on-forest-accent text-forest shadow-raised transition-[transform,filter] duration-150",
                  "enabled:hover:brightness-105 enabled:active:scale-[0.97]",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <MegaphoneSimple aria-hidden="true" weight="fill" className="size-7" />
                {t("queue.mine.callNext")}
              </button>
              <p className="m-0 text-body-sm text-on-forest-muted">
                {!onDuty
                  ? t("queue.mine.setOnDuty")
                  : empty
                    ? t("queue.mine.nobody")
                    : t("queue.mine.spaceHint")}
              </p>
            </div>
          )}
          {(callNext.isError || act.isError || setDuty.isError) && (
            <Alert tone="danger" role="alert">
              {actionError(callNext.error ?? act.error ?? setDuty.error, t("queue.failed"))}
            </Alert>
          )}
        </section>

        <section
          aria-labelledby="waiting"
          className="flex flex-col self-start overflow-hidden rounded-2xl bg-surface shadow-card"
        >
          <h2
            id="waiting"
            className="m-0 flex items-center justify-between px-4 pt-4 pb-2 font-heading text-body font-bold"
          >
            {t("queue.mine.waiting")}
            <span className="rounded-full bg-subtle px-2 py-0.5 text-caption font-semibold text-fg-secondary tabular-nums">
              {data?.waiting.length ?? 0}
            </span>
          </h2>
          {data && data.waiting.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState
                size="inline"
                icon={UsersThree}
                title={t("queue.mine.nobodyTitle")}
                description={t("queue.mine.nobody")}
              />
            </div>
          ) : (
            <ol className="m-0 flex list-none flex-col p-0">
              {(data?.waiting ?? []).map((ticket, index) => (
                <li
                  key={ticket.id}
                  className="flex animate-enter items-center gap-3 border-t border-border/60 px-4 py-3 transition-colors duration-200 ease-out-quint hover:bg-subtle/50"
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
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold">{ticket.display_name}</span>
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
      </div>
    </div>
  );
}
