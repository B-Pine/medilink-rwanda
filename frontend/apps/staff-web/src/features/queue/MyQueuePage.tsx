import type { DutyState, TicketRow } from "@medilink/api-client";
import {
  Alert,
  Button,
  cx,
  EmptyState,
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
import { PageHeader } from "../../components/PageHeader";
import { queueKeys, usePollInterval, useQueueSocket } from "./live";
import { LiveBadge } from "./LiveIndicator";
import { actionError, Flags, minutesSince, useServiceNames, useTicketAction } from "./shared";

const DUTY: DutyState[] = ["on_duty", "break", "emergency", "off"];

/**
 * /queue/mine (design 04 §3.2): one big action, Call next (also Space), the current patient, and
 * the waiting list in calling order.
 */
export function MyQueuePage() {
  const { t } = useTranslation();
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
      if (event.code === "Space" && !typing && canCall) {
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

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("queue.mine.title")}
        description={serviceId ? serviceName(serviceId) : undefined}
        badges={<LiveBadge />}
      />

      <section
        aria-labelledby="duty"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="duty" className="sr-only">
          {t("queue.mine.duty")}
        </h2>
        <div role="group" aria-label={t("queue.mine.duty")} className="flex flex-wrap gap-2">
          {DUTY.map((state) => (
            <button
              key={state}
              type="button"
              aria-pressed={duty?.state === state}
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
                "inline-flex min-h-target cursor-pointer items-center gap-2 rounded-md border px-3 font-semibold",
                duty?.state === state
                  ? "border-primary bg-brand-subtle text-on-brand-subtle"
                  : "border-border text-fg-secondary hover:text-fg",
              )}
            >
              {state === "break" && <Coffee aria-hidden="true" />}
              {t(`queue.duty.${state}`)}
            </button>
          ))}
        </div>
        {onDuty && (
          <SelectField
            label={t("queue.mine.room")}
            value={duty?.service_point_id ?? ""}
            onChange={(e) => setDuty.mutate({ state: "on_duty", service_point_id: e.target.value })}
            className="w-48"
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
          <p className="m-0 text-body-sm text-fg-secondary">
            {t("queue.mine.breakUntil", {
              time: new Date(duty.until_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="current" className="flex flex-col gap-4">
          <h2 id="current" className="sr-only">
            {t("queue.mine.current")}
          </h2>
          {current ? (
            <div
              className={cx(
                "flex flex-col gap-5 rounded-lg border-2 p-6",
                current.state === "called"
                  ? "border-warning bg-warning-bg/40"
                  : "border-primary bg-surface",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TicketNumber number={current.number} size="display" />
                <QueueStateBadge state={current.state}>
                  {t(`queue.states.${current.state}`)}
                </QueueStateBadge>
              </div>
              <div>
                <p className="m-0 font-heading text-h2">{current.display_name}</p>
                <p className="m-0 text-fg-secondary">
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
                <div className="mt-2">
                  <Flags ticket={current} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {current.state === "called" ? (
                  <>
                    <Button size="lg" onClick={() => run(current, "start")}>
                      <Play aria-hidden="true" weight="fill" />
                      {t("queue.mine.start")}
                    </Button>
                    <Button variant="secondary" onClick={() => run(current, "recall")}>
                      <SpeakerHigh aria-hidden="true" />
                      {t("queue.mine.recall")}
                    </Button>
                    <Button variant="ghost" onClick={() => run(current, "no-response")}>
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
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
              <Button
                ref={callButton}
                size="lg"
                disabled={!canCall}
                onClick={() => callNext.mutate()}
                aria-keyshortcuts="Space"
                className="min-h-16 px-10 text-h3"
              >
                <MegaphoneSimple aria-hidden="true" weight="fill" className="size-6" />
                {t("queue.mine.callNext")}
              </Button>
              <p className="m-0 text-body-sm text-fg-secondary">
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
          className="flex flex-col gap-3 self-start rounded-lg border border-border bg-surface p-4"
        >
          <h2 id="waiting" className="m-0 flex items-center justify-between font-heading text-h3">
            {t("queue.mine.waiting")}
            <span className="text-body-sm font-normal text-fg-secondary tabular-nums">
              {data?.waiting.length ?? 0}
            </span>
          </h2>
          {data && data.waiting.length === 0 ? (
            <EmptyState
              size="inline"
              icon={UsersThree}
              title={t("queue.mine.nobodyTitle")}
              description={t("queue.mine.nobody")}
            />
          ) : (
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {(data?.waiting ?? []).map((ticket, index) => (
                <li
                  key={ticket.id}
                  className={cx(
                    "flex items-center gap-3 rounded-md px-2 py-2",
                    index === 0 && "bg-brand-subtle",
                  )}
                >
                  <TicketNumber number={ticket.number} size="sm" className="w-16" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">{ticket.display_name}</span>
                    <Flags ticket={ticket} />
                  </span>
                  <span className="text-caption text-fg-secondary tabular-nums">
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
